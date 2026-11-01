// Independent of the legacy checkout gate. An unset or unexpected value stays closed.
export function requireCommerceV2CheckoutEnabled(
  env: (name: string) => string | undefined = (name) => Deno.env.get(name),
) {
  if (env("COMMERCE_V2_CHECKOUT_ENABLED") !== "true") {
    throw new Error("Phase 2 checkout is paused");
  }
}
