import { createClient } from "@supabase/supabase-js";
import { deleteAccountWithAudit } from "./audit.mjs";

const CONFIRMATION = "DELETE MY ACCOUNT";
const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const runtime = (globalThis as typeof globalThis & {
  Deno: {
    env: { get(name: string): string | undefined };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}).Deno;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnvironment(name: string) {
  const value = runtime.env.get(name);
  if (!value) throw new Error("account_deletion_failed");
  return value;
}

runtime.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }

  let body: { confirmation?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }
  if (body.confirmation !== CONFIRMATION) {
    return jsonResponse({ error: "invalid_confirmation" }, 400);
  }

  try {
    const supabaseUrl = requiredEnvironment("SUPABASE_URL");
    const publishableKey = requiredEnvironment("SUPABASE_ANON_KEY");
    const serverAdminKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const auditHmacKey = requiredEnvironment("DELETION_AUDIT_HMAC_KEY");

    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serverAdminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "authentication_required" }, 401);
    }

    const result = await deleteAccountWithAudit({
      adminClient,
      user,
      auditSecret: auditHmacKey,
    });
    return jsonResponse(result, 200);
  } catch {
    return jsonResponse({ error: "account_deletion_failed" }, 500);
  }
});
