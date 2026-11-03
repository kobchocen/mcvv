import assert from "node:assert/strict";
import test from "node:test";

process.env.RESEND_API_KEY = "test-key";
process.env.MAIL_FROM = "MCVV <noreply@mcvv.org>";
process.env.MAIL_ALLOWED_RECIPIENTS = "pavel@example.cz, @test.example.cz";

const load = async () => ({
  ...(await import("./resend")),
  ...(await import("@/lib/newsletter/transport")),
});

const mail = (to: string) => ({
  to,
  subject: "Test",
  html: "<p>x</p>",
  text: "x",
  headers: {} as Record<string, string>,
});

test("Q347: recipients outside MAIL_ALLOWED_RECIPIENTS are skipped, never sent", async () => {
  const { postResendEmail } = await load();
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  }) as typeof fetch;
  const skipped = await postResendEmail(mail("runner@example.cz"), { dryRun: false, fetchImpl });
  assert.deepEqual(skipped, { ok: true, providerId: "skipped-allowlist" });
  assert.equal(calls, 0);
  const sent = await postResendEmail(mail("Pavel@example.cz"), { dryRun: false, fetchImpl });
  assert.equal(sent.ok, true);
  assert.equal(calls, 1);
});

test("Q347: newsletter batch sends only allowed recipients, keeps the order", async () => {
  const { sendNewsletterBatch } = await load();
  const realFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: [{ id: "a" }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await sendNewsletterBatch(
      [mail("runner@example.cz"), mail("qa@test.example.cz"), mail("other@x.cz")],
      "key",
      { dryRun: false },
    );
    assert.deepEqual(result, {
      ok: true,
      providerIds: ["skipped-allowlist", "a", "skipped-allowlist"],
    });
    assert.equal(bodies.length, 1);
    assert.deepEqual(
      (bodies[0] as { to: string[] }[]).map((m) => m.to[0]),
      ["qa@test.example.cz"],
    );
    const none = await sendNewsletterBatch([mail("runner@example.cz")], "key2", { dryRun: false });
    assert.deepEqual(none, { ok: true, providerIds: ["skipped-allowlist"] });
    assert.equal(bodies.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
