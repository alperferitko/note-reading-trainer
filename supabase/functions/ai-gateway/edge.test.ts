import { createAIHttpHandler } from "../_shared/ai/http-handler.mjs";
import { createLocalMockGateway } from "../_shared/ai/local-mock.mjs";

// No network permission, Supabase account or provider credentials required.
Deno.test("Edge Web APIs: reject unauthorized and serve authenticated mock feedback", async () => {
  const handler = createAIHttpHandler({ gateway: createLocalMockGateway(),
    authenticate: async (jwt: string) => jwt === "valid.test.signature" ? { id: "edge-user" } : null });
  const denied = await handler(new Request("http://localhost", { method: "POST" }));
  if (denied.status !== 401) throw new Error("unauthorized request accepted");
  const now = Date.now();
  const records = Array.from({ length: 3 }, (_, index) => ({ id: `r-${index}`, module: "reading", task: "name",
    item: "treble:f4", session: "edge", correct: true, firstAttempt: true, assisted: false,
    timedOut: false, responseMs: 1000, timeLimitMs: null, at: new Date(now - (index + 1) * 1000).toISOString() }));
  const response = await handler(new Request("http://localhost", { method: "POST", headers: {
    authorization: "Bearer valid.test.signature", "content-type": "application/json", "idempotency-key": "edge-test",
  }, body: JSON.stringify({ schemaVersion: "1", task: "practice-feedback", locale: "tr", scope: { module: "reading" }, evidence: { records } }) }));
  if (response.status !== 200 || (await response.json()).mode !== "mock") throw new Error("mock response failed");
});