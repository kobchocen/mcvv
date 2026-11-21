import assert from "node:assert/strict";
import test from "node:test";

import type { SendEmailCommand } from "@aws-sdk/client-sesv2";

process.env.MAIL_PROVIDER = "ses";
process.env.MAIL_FROM = "MCVV <noreply@mcvv.org>";
process.env.AWS_REGION = "eu-central-1";
process.env.AWS_ACCESS_KEY_ID = "test-access-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
process.env.MAIL_ALLOWED_RECIPIENTS = "pavel@example.cz, @test.example.cz";
delete process.env.RESEND_API_KEY;

async function load() {
  const configured = await import("./configured");
  const ses = await import("./ses");
  return { ...configured, ...ses };
}

const mail = (to: string, extra: { replyTo?: string; headers?: Record<string, string> } = {}) => ({
  to,
  subject: "Test",
  html: "<p>x</p>",
  text: "x",
  ...extra,
});

function mockClient(handler: (command: SendEmailCommand) => Promise<{ MessageId?: string }>) {
  const commands: SendEmailCommand[] = [];
  return {
    commands,
    client: {
      send: async (command: SendEmailCommand) => {
        commands.push(command);
        return handler(command);
      },
    },
  };
}

test("MAIL_PROVIDER=ses a přítomné klíče znamenají, že je pošta nakonfigurovaná bez Resendu", async () => {
  const { mailConfigured, mailProvider, sesConfigured, sesMaxPerSecond, sesRegion } = await load();
  assert.equal(mailProvider(), "ses");
  assert.equal(sesConfigured(), true);
  assert.equal(mailConfigured(), true);
  assert.equal(sesRegion(), "eu-central-1");
  assert.equal(sesMaxPerSecond("10"), 10);
  assert.equal(sesMaxPerSecond("99"), 14);
  assert.equal(sesMaxPerSecond("0"), 10);
});

test("buildSendEmailInput nastaví From, Reply-To a hlavičky List-Unsubscribe", async () => {
  const { buildSendEmailInput } = await load();
  const input = buildSendEmailInput(
    mail("pavel@example.cz", {
      replyTo: "navstevnik@example.cz",
      headers: {
        "List-Unsubscribe": "<https://mcvv.org/api/newsletter/unsubscribe?token=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
    "MCVV <noreply@mcvv.org>",
  );
  assert.equal(input.FromEmailAddress, "MCVV <noreply@mcvv.org>");
  assert.deepEqual(input.Destination?.ToAddresses, ["pavel@example.cz"]);
  assert.deepEqual(input.ReplyToAddresses, ["navstevnik@example.cz"]);
  assert.deepEqual(input.Content?.Simple?.Headers, [
    { Name: "List-Unsubscribe", Value: "<https://mcvv.org/api/newsletter/unsubscribe?token=abc>" },
    { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
  ]);
  assert.equal(input.Content?.Simple?.Subject?.Data, "Test");
  assert.equal(input.Content?.Simple?.Body?.Html?.Data, "<p>x</p>");
  assert.equal(input.Content?.Simple?.Body?.Text?.Data, "x");
  assert.equal(input.Content?.Raw, undefined);
});

test("postSesEmail: allowlist přeskočí cizí adresu a klienta nevolá", async () => {
  let calls = 0;
  const { client } = mockClient(async () => {
    calls += 1;
    return { MessageId: "should-not-run" };
  });
  const { postSesEmail } = await load();
  const skipped = await postSesEmail(mail("runner@example.cz"), {
    dryRun: false,
    client,
    rateLimit: async () => undefined,
  });
  assert.deepEqual(skipped, { ok: true, providerId: "skipped-allowlist" });
  assert.equal(calls, 0);
});

test("postSesEmail: dry-run nevolá SES", async () => {
  let calls = 0;
  const { client } = mockClient(async () => {
    calls += 1;
    return { MessageId: "nope" };
  });
  const { postSesEmail } = await load();
  const result = await postSesEmail(mail("pavel@example.cz"), {
    dryRun: true,
    client,
    rateLimit: async () => undefined,
  });
  assert.deepEqual(result, { ok: true, providerId: "dry-run" });
  assert.equal(calls, 0);
});

test("postSesEmail: úspěch vrací SES MessageId i delší než 64 znaků", async () => {
  const messageId = "0100018f3c2a4b5c-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-000000-extra-suffix";
  const { postSesEmail } = await load();
  const { client, commands } = mockClient(async () => ({ MessageId: messageId }));
  const result = await postSesEmail(mail("Pavel@example.cz"), {
    dryRun: false,
    client,
    rateLimit: async () => undefined,
  });
  assert.deepEqual(result, { ok: true, providerId: messageId });
  assert.equal(messageId.length > 64, true);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0]?.input.Destination?.ToAddresses, ["Pavel@example.cz"]);
});

test("classifySesFailure: throttling je retryable, denní kvóta je quota, pauza je trvalá", async () => {
  const { classifySesFailure } = await load();
  assert.equal(
    classifySesFailure({
      name: "TooManyRequestsException",
      message: "Rate exceeded",
      $metadata: { httpStatusCode: 429 },
    }).kind,
    "retryable",
  );
  assert.equal(
    classifySesFailure({
      name: "ServiceUnavailable",
      message: "down",
      $metadata: { httpStatusCode: 503 },
    }).kind,
    "retryable",
  );
  assert.equal(
    classifySesFailure({
      name: "MailFromDomainNotVerifiedException",
      message: "not verified",
      $metadata: { httpStatusCode: 400 },
    }).kind,
    "permanent",
  );
  const quota = classifySesFailure({
    name: "LimitExceededException",
    message: "Daily sending quota exceeded",
    $metadata: { httpStatusCode: 400 },
  });
  assert.equal(quota.ok, false);
  if (!quota.ok) assert.equal(quota.kind, "quota");
  const paused = classifySesFailure({
    name: "AccountSendingPausedException",
    message: "AccountSendingPaused",
    $metadata: { httpStatusCode: 400 },
  });
  assert.equal(paused.ok, false);
  if (!paused.ok) assert.equal(paused.kind, "permanent");
});

test("postSesEmail: chyba SES se klasifikuje a nepadá na Resend", async () => {
  const { postSesEmail } = await load();
  const { client } = mockClient(async () => {
    const error = Object.assign(new Error("Rate exceeded"), {
      name: "TooManyRequestsException",
      $metadata: { httpStatusCode: 429 },
    });
    throw error;
  });
  const result = await postSesEmail(mail("pavel@example.cz"), {
    dryRun: false,
    client,
    rateLimit: async () => undefined,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.kind, "retryable");
    assert.match(result.error, /SES 429/);
  }
});

test("createMinIntervalLimiter dodržuje rozestup pod 14/s", async () => {
  const { createMinIntervalLimiter } = await load();
  const sleeps: number[] = [];
  const acquire = createMinIntervalLimiter(10, {
    now: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  await acquire();
  await acquire();
  await acquire();
  assert.deepEqual(sleeps, [100, 200]);
});

test("sendSesBatch: po částečném úspěchu označí odeslané a zbytek nechá k opakování", async () => {
  const { sendSesBatch } = await load();
  let calls = 0;
  const { client } = mockClient(async () => {
    calls += 1;
    if (calls === 2) {
      throw Object.assign(new Error("Rate exceeded"), {
        name: "TooManyRequestsException",
        $metadata: { httpStatusCode: 429 },
      });
    }
    return { MessageId: `id-${calls}` };
  });
  const result = await sendSesBatch(
    [mail("pavel@example.cz"), mail("qa@test.example.cz"), mail("pavel@example.cz")],
    { dryRun: false, client, rateLimit: async () => undefined },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.deepEqual(result.sentProviderIds, ["id-1", undefined, undefined]);
  }
  assert.equal(calls, 2);
});

test("sendSesBatch: trvalá chyba u jednoho adresáta nepřeruší zbytek", async () => {
  const { sendSesBatch } = await load();
  let calls = 0;
  const { client } = mockClient(async () => {
    calls += 1;
    if (calls === 1) {
      throw Object.assign(new Error("Message rejected"), {
        name: "MessageRejected",
        $metadata: { httpStatusCode: 400 },
      });
    }
    return { MessageId: `id-${calls}` };
  });
  const result = await sendSesBatch([mail("pavel@example.cz"), mail("qa@test.example.cz")], {
    dryRun: false,
    client,
    rateLimit: async () => undefined,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, false);
    assert.deepEqual(result.sentProviderIds, [undefined, "id-2"]);
  }
  assert.equal(calls, 2);
});
