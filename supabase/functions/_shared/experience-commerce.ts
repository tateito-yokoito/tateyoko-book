// Explicit environment contract. Missing/contradictory settings fail closed.
export function commerceMode(): "test" | "live" {
  const explicit = Deno.env.get("EXPERIENCE_COMMERCE_MODE");
  const legacyTest = Deno.env.get("EXPERIENCE_CONTRACTS_V2_TEST_ONLY") === "true";
  const mode = explicit || (legacyTest ? "test" : "disabled");
  if (!["test", "live"].includes(mode) || (legacyTest && mode !== "test")) throw new Error("Commerce mode disabled or conflicting");
  const url = Deno.env.get("SUPABASE_URL") || "";
  const approved = Deno.env.get("EXPERIENCE_COMMERCE_SUPABASE_URL")
    || (mode === "test" ? Deno.env.get("EXPERIENCE_TEST_SUPABASE_URL") : "");
  if (!approved || url !== approved) throw new Error("Commerce environment URL mismatch");
  const host = new URL(url).hostname;
  if ((mode === "test" && host === "wquxjeqkumossjxehdop.supabase.co")
    || (mode === "live" && host !== "wquxjeqkumossjxehdop.supabase.co")) throw new Error("Commerce project/mode mismatch");
  return mode as "test" | "live";
}
export function requireStripeEnvironment(key: string) {
  const mode = commerceMode();
  if (!new RegExp(`^(sk|rk)_${mode}_`).test(key)) throw new Error("Stripe key/mode mismatch");
  return mode;
}
export function requireEventMode(livemode: boolean) {
  const mode = requireStripeEnvironment(Deno.env.get("STRIPE_SECRET_KEY") || "");
  if (livemode !== (mode === "live")) throw new Error("Stripe event/mode mismatch");
}
export function requireCheckoutEnabled() {
  const mode = commerceMode();
  const enabled = Deno.env.get("EXPERIENCE_CHECKOUT_ENABLED");
  if (enabled !== "true" && !(enabled == null && mode === "test"
    && Deno.env.get("EXPERIENCE_CONTRACTS_V2_TEST_ONLY") === "true")) throw new Error("New checkout is paused");
}
// Compatibility names remain strict TEST guards, never aliases that allow live.
export function requireStripeTestKey(key: string) {
  if (!/^(sk|rk)_test_/.test(key)) throw new Error("Stripe test key required");
}
export function requireExperienceTestEnvironment() {
  if (commerceMode() !== "test") throw new Error("Test environment required");
}

export async function stripeRequest(key: string, path: string, form?: URLSearchParams, idempotencyKey?: string) {
  const mode = requireStripeEnvironment(key);
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: form?.toString()
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Stripe request failed (${response.status})`);
  if (typeof value.livemode === "boolean" && value.livemode !== (mode === "live")) throw new Error("Stripe object/mode mismatch");
  return value;
}

export async function findPaymentConfirmation(key: string, checkout: any) {
  // Session.created is NOT the payment time. Events are also used by the webhook.
  const mode = requireStripeEnvironment(key);
  for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ type, limit: "100", "created[gte]": String(checkout.created) });
      if (cursor) params.set("starting_after", cursor);
      const events = await stripeRequest(key, `events?${params}`);
      const match = events.data.find((event: any) => event.livemode === (mode === "live") && event.data?.object?.id === checkout.id
        && ["paid", "no_payment_required"].includes(event.data.object.payment_status));
      if (match) return new Date(match.created * 1000).toISOString();
      if (!events.has_more || !events.data.length) break;
      cursor = events.data.at(-1).id;
    }
  }
  return null; // Wait for the webhook; never invent a timestamp on a return page.
}

export async function finalizeExperienceCheckout(admin: any, checkout: any, confirmedAt: string, livemode: boolean) {
  requireEventMode(livemode);
  const { data, error } = await admin.rpc("finalize_experience_order", {
    input_order_id: checkout.metadata.order_id, input_checkout_session_id: checkout.id,
    input_customer_id: typeof checkout.customer === "string" ? checkout.customer : "",
    input_payment_intent_id: typeof checkout.payment_intent === "string" ? checkout.payment_intent : "",
    input_payment_status: checkout.payment_status, input_amount_total: Number(checkout.amount_total),
    input_stripe_mode: livemode ? "live" : "test", input_confirmed_at: confirmedAt,
    input_currency: checkout.currency
  });
  if (error) throw error;
  return data;
}

export async function applyRefundObject(admin: any, refund: any, observedAt: string) {
  const mode = requireStripeEnvironment(Deno.env.get("STRIPE_SECRET_KEY") || "");
  // Refund provenance: mode-validated fetch, signed event, and matching DB payment.
  if ((typeof refund.livemode === "boolean" && refund.livemode !== (mode === "live")) || refund.object !== "refund" || refund.currency !== "jpy") throw new Error("Refund mode or currency mismatch");
  const requestId = refund.metadata?.experience_refund_request_id;
  if (!requestId) return false; // An unrelated/manual refund is never guessed to be the guarantee.
  const status = refund.status === "succeeded" ? "succeeded"
    : ["failed", "canceled"].includes(refund.status) ? "failed" : "pending";
  const { error } = await admin.rpc("apply_experience_refund_event", {
    input_request_id: requestId, input_stripe_refund_id: refund.id, input_status: status,
    input_amount: refund.amount, input_observed_at: observedAt,
    input_payment_intent_id: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id
  });
  if (error) throw error;
  return true;
}
