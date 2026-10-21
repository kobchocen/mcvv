import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ENTRY_CHANGES_NOTIFY_KEY,
  MESSAGES_ENABLED_KEY,
  MESSAGES_NOTIFY_ORGANIZER_KEY,
  MESSAGES_NOTIFY_USER_KEY,
  messageSettingsFromRows,
  ORGANIZER_EMAIL_KEY,
  parseEmail,
  resolveOrganizerEmail,
} from "./messages-core";

test("výchozí nastavení: zprávy zapnuté, e-mailová upozornění vypnutá", () => {
  assert.deepEqual(messageSettingsFromRows([]), {
    enabled: true,
    notifyOrganizer: false,
    notifyUser: false,
    notifyChanges: false,
    organizerEmail: "",
  });
});

test("uložené hodnoty", () => {
  assert.deepEqual(
    messageSettingsFromRows([
      { key: MESSAGES_ENABLED_KEY, text: "0" },
      { key: MESSAGES_NOTIFY_ORGANIZER_KEY, text: "1" },
      { key: MESSAGES_NOTIFY_USER_KEY, text: "1" },
      { key: ORGANIZER_EMAIL_KEY, text: " Info@MCVV.org " },
      { key: ENTRY_CHANGES_NOTIFY_KEY, text: "1" },
    ]),
    {
      enabled: false,
      notifyOrganizer: true,
      notifyUser: true,
      notifyChanges: true,
      organizerEmail: "info@mcvv.org",
    },
  );
});

test("pořadatelský e-mail: nastavení → CONTACT_TO → mcvv@mcvv.org", () => {
  assert.equal(resolveOrganizerEmail("info@mcvv.org", "env@mcvv.org"), "info@mcvv.org");
  assert.equal(resolveOrganizerEmail("", "env@mcvv.org"), "env@mcvv.org");
  assert.equal(resolveOrganizerEmail("nesmysl", "env@mcvv.org"), "env@mcvv.org");
  assert.equal(resolveOrganizerEmail(null, undefined), "mcvv@mcvv.org");
});

test("e-mail s CR/LF nebo více adresami je neplatný", () => {
  assert.equal(parseEmail("a@b.cz\nBcc: x@y.cz"), null);
  assert.equal(parseEmail("a@b.cz, c@d.cz"), null);
});
