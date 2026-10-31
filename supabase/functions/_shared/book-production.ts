declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

// Payment completion only starts a durable job; PDF/media processing is not
// part of the payment transaction or webhook response.
export function kickBookProduction(supabaseUrl: string, serviceKey: string, orderId: string) {
  if (Deno.env.get("BOOK_PRODUCTION_V2_ENABLED") !== "true") return;
  const task = fetch(`${supabaseUrl}/functions/v1/book-production-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
      "Content-Type": "application/json" },
    body: JSON.stringify({ orderId })
  }).then(async response => {
    if (!response.ok) console.error("book production worker", orderId, response.status, await response.text());
  }).catch(error => console.error("book production dispatch", orderId, error));
  EdgeRuntime.waitUntil(task);
}
