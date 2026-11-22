import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isQuestionStatus,
  normalizeReply,
  parseQuestionFilter,
  QUESTION_LOCALES,
  questionAdminUrl,
  questionLocale,
  renderQuestionReply,
  REPLY_MAX,
  statusAfterReply,
  statusesFor,
} from "./questions-core";

test("stavy a filtr seznamu: výchozí otevřené (nové + zodpovězené)", () => {
  assert.ok(isQuestionStatus("new"));
  assert.ok(isQuestionStatus("closed"));
  assert.ok(!isQuestionStatus("open"));
  assert.deepEqual(parseQuestionFilter({}), { status: "open", q: "" });
  assert.deepEqual(parseQuestionFilter({ stav: "closed", q: "  novak " }), {
    status: "closed",
    q: "novak",
  });
  assert.equal(parseQuestionFilter({ stav: "nonsense" }).status, "open");
  assert.deepEqual(statusesFor("open"), ["new", "answered"]);
  assert.deepEqual(statusesFor("all"), ["new", "answered", "closed"]);
  assert.deepEqual(statusesFor("answered"), ["answered"]);
  assert.equal(statusAfterReply(), "answered");
});

test("odpověď: ořez, konce řádků, délka, řídicí znaky", () => {
  assert.equal(normalizeReply("  Dobrý den\r\n\r\nano.  "), "Dobrý den\n\nano.");
  assert.equal(normalizeReply("   "), null);
  assert.equal(normalizeReply(42), null);
  assert.equal(normalizeReply("x".repeat(REPLY_MAX)), "x".repeat(REPLY_MAX));
  assert.equal(normalizeReply("x".repeat(REPLY_MAX + 1)), null);
  assert.equal(normalizeReply("a\u0007b"), null);
});

test("jazyk dotazu, jinak cs", () => {
  for (const l of QUESTION_LOCALES) assert.equal(questionLocale(l), l);
  assert.equal(questionLocale("sk"), "cs");
  assert.equal(questionLocale(undefined), "cs");
});

test("e-mail s odpovědí: oslovení, text, citace dotazu, escapování, jazyk", () => {
  const question = { name: "Jan <Novák>", message: "Kdy je start?\nDěkuji", locale: "cs" };
  const r = renderQuestionReply({
    question,
    body: "Start je v 10:00.\n\nS pozdravem MCVV",
    site: "https://mcvv.org",
  });
  assert.equal(r.subject, "Odpověď na váš dotaz – MCVV");
  assert.match(r.text, /Dobrý den, Jan <Novák>,/);
  assert.match(r.text, /Start je v 10:00\./);
  assert.match(r.text, /> Kdy je start\?\n> Děkuji/);
  assert.ok(r.html.includes("Jan &lt;Novák&gt;"));
  assert.ok(!r.html.includes("<Novák>"));
  const subjects = new Set(
    QUESTION_LOCALES.map(
      (locale) =>
        renderQuestionReply({ question: { ...question, locale }, body: "x", site: "s" }).subject,
    ),
  );
  assert.equal(subjects.size, 5);
  assert.match(
    renderQuestionReply({ question: { ...question, locale: "xx" }, body: "x", site: "s" }).subject,
    /Odpověď/,
  );
});

test("odkaz do administrace", () => {
  assert.equal(
    questionAdminUrl("https://mcvv.org/", 5),
    "https://mcvv.org/cs/admin/zpravy/dotazy/5",
  );
});
