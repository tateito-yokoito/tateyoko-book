import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!serviceKey || !supabaseUrl) return new Response("Not configured", { status: 503 });
  const authorization = request.headers.get("authorization") || "";
  const callerKey = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!callerKey) {
    return new Response("Unauthorized", { status: 401 });
  }
  // The gateway may provide a different default service key than the legacy
  // key stored in Vault. Authorize the caller by an actual service-role-only
  // database RPC instead of comparing two credential strings.
  const caller = createClient(supabaseUrl, callerKey, {
    global: { headers: { Authorization: authorization } }
  });
  const { data: jobs, error } = await caller.rpc("list_runnable_book_production_jobs", { input_limit: 1 });
  if (error) return new Response("Unauthorized", { status: 401 });
  let dispatched = 0;
  for (const job of jobs || []) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/book-production-worker`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey,
          "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: job.order_id }),
        signal: AbortSignal.timeout(120_000)
      });
      if (response.ok) dispatched += 1;
      else console.error("production sweep worker", job.order_id, response.status);
    } catch (error) { console.error("production sweep dispatch", job.order_id, error); }
  }
  return new Response(JSON.stringify({ success: true, dispatched }), {
    headers: { "Content-Type": "application/json" }
  });
});
