import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RESEND_API_KEY = "test-key";
process.env.MAIL_FROM = "MCVV <noreply@mcvv.org>";
delete process.env.CONTACT_TO;

test("kontaktní zpráva jde přes Resend na mcvv@mcvv.org s reply-to odesílatele", async () => {
  const { sendContactMessage } = await import("./send");
  const calls: Array<Record<string, string | undefined>> = [];
  const result = await sendContactMessage(
    { name: "Test <b>", email: "a@b.cz", message: "[TEST] kontrola formuláře" },
    { resend: async (input) => (calls.push(input), true) },
  );
  assert.deepEqual(result, { delivered: true });
  assert.equal(calls[0].to, "mcvv@mcvv.org");
  assert.equal(calls[0].replyTo, "a@b.cz");
  assert.match(calls[0].html ?? "", /Test &lt;b&gt;/);
});

test("selhání Resendu se propaguje jako chyba (formulář ukáže chybu)", async () => {
  const { sendContactMessage } = await import("./send");
  await assert.rejects(
    sendContactMessage(
      { name: "X Y", email: "a@b.cz", message: "0123456789" },
      { resend: async () => false },
    ),
  );
});
