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

Deno.test("Edge Web APIs: teacher chat and the weekly report key (Web Crypto) work in Deno", async () => {
  const { weeklyReportKey } = await import("../_shared/ai/weekly-key.mjs");
  const handler = createAIHttpHandler({ gateway: createLocalMockGateway(),
    authenticate: async (jwt: string) => jwt === "valid.test.signature" ? { id: "edge-user" } : null });
  const post = (body: unknown, key: string) => handler(new Request("http://localhost", { method: "POST", headers: {
    authorization: "Bearer valid.test.signature", "content-type": "application/json", "idempotency-key": key,
  }, body: JSON.stringify(body) }));
  const chat = await post({ schemaVersion: "1", task: "teacher-chat", locale: "tr", profile: null,
    messages: [{ role: "user", text: "Merhaba, gitar çalmak istiyorum." }] }, "edge-chat");
  if (chat.status !== 200 || (await chat.json()).task !== "teacher-chat") throw new Error("teacher chat failed");
  const today = new Date().toISOString().slice(0, 10);
  const metrics = { sessions: 1, practiceDays: 1, answers: { correct: 3, wrong: 1 }, noteStruggles: [], responseTimeMs: null,
    rhythmTiming: null, pieces: [], previous: null, dataQuality: "thin" };
  const report = { schemaVersion: "1", task: "weekly-report", locale: "en", timezone: "Europe/Istanbul", period: { start: today, end: today }, metrics };
  const key = await weeklyReportKey(report.period, metrics);
  const weekly = await post(report, key);
  if (weekly.status !== 200 || (await weekly.json()).task !== "weekly-report") throw new Error("weekly report failed");
  if ((await post(report, "edge-other-key")).status !== 400) throw new Error("foreign weekly key accepted");
});
Deno.test("Edge Web APIs: score-screen (atob, Web Crypto key, larger body cap) works in Deno", async () => {
  const { screenKey } = await import("../_shared/ai/screen-key.mjs");
  const handler = createAIHttpHandler({ gateway: createLocalMockGateway(),
    authenticate: async (jwt: string) => jwt === "valid.test.signature" ? { id: "edge-user" } : null });
  const bytes = [0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 210000 }, (_, i) => i % 251), 0xff, 0xd9];
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const data = btoa(binary);
  const body = { schemaVersion: "1", task: "score-screen", locale: "en", image: { mime: "image/jpeg", data, width: 768, height: 512 }, pages: 2 };
  const post = (key: string) => handler(new Request("http://localhost", { method: "POST", headers: {
    authorization: "Bearer valid.test.signature", "content-type": "application/json", "idempotency-key": key,
  }, body: JSON.stringify(body) }));
  const response = await post(await screenKey(data));
  if (response.status !== 200 || (await response.json()).result?.verdict !== "score") throw new Error("score screen failed");
  if ((await post("edge-other-key")).status !== 400) throw new Error("foreign screen key accepted");
});
