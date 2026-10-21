import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_ORGANIZER_REGISTRATION_EMAIL,
  planOrganizerRegistration,
  resolveOrganizerRegistrationEmail,
} from "./organizer-registration-core";

test("organizer e-mail falls back to the default address", () => {
  assert.equal(resolveOrganizerRegistrationEmail(null), DEFAULT_ORGANIZER_REGISTRATION_EMAIL);
  assert.equal(resolveOrganizerRegistrationEmail(""), DEFAULT_ORGANIZER_REGISTRATION_EMAIL);
  assert.equal(resolveOrganizerRegistrationEmail("nonsense"), DEFAULT_ORGANIZER_REGISTRATION_EMAIL);
  assert.equal(resolveOrganizerRegistrationEmail(" Klub@Example.CZ "), "klub@example.cz");
});

test("a new edition without registrations gets organizer registration no. 1", () => {
  assert.deepEqual(planOrganizerRegistration([], "klub@example.cz"), { action: "create" });
});

test("existing registration no. 1 is never touched", () => {
  assert.deepEqual(
    planOrganizerRegistration(
      [{ id: 1, email: "someone@example.cz", status: 2 }],
      "klub@example.cz",
    ),
    { action: "exists" },
  );
  assert.deepEqual(
    planOrganizerRegistration([{ id: 1, email: "klub@example.cz", status: 0 }], "klub@example.cz"),
    { action: "exists" },
  );
});

test("no second registration when the e-mail already registered in that year", () => {
  assert.deepEqual(
    planOrganizerRegistration(
      [
        { id: 2, email: "x@example.cz", status: 2 },
        { id: 3, email: "KLUB@example.cz", status: 2 },
      ],
      "klub@example.cz",
    ),
    { action: "has_other", id: 3 },
  );
  // a cancelled registration of the e-mail does not count
  assert.deepEqual(
    planOrganizerRegistration([{ id: 3, email: "klub@example.cz", status: 0 }], "klub@example.cz"),
    { action: "create" },
  );
});
