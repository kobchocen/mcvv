import assert from "node:assert/strict";
import { test } from "node:test";

import { uploadIofXml } from "./client";

/** OFeed se v testech nikdy nevolá – fetch je mock. */
function mockFetch(response: { status: number; body: string }, calls: Request[]) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(url, init));
    return new Response(response.body, { status: response.status });
  }) as typeof fetch;
}

test("upload sends multipart eventId + file with Basic auth", async () => {
  const calls: Request[] = [];
  const result = await uploadIofXml({
    apiUrl: "https://ofeed.invalid",
    eventId: "evt123",
    password: "s3cret-pw",
    xml: "<ResultList/>",
    fetchImpl: mockFetch(
      {
        status: 200,
        body: JSON.stringify({
          message: "OK",
          results: { data: "Iof xml uploaded successfully: MCVV" },
        }),
      },
      calls,
    ),
  });
  assert.deepEqual(result, {
    ok: true,
    status: 200,
    message: "OK: Iof xml uploaded successfully: MCVV",
  });
  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://ofeed.invalid/rest/v1/upload/iof");
  assert.equal(
    request.headers.get("authorization"),
    `Basic ${Buffer.from("evt123:s3cret-pw").toString("base64")}`,
  );
  const form = await request.formData();
  assert.equal(form.get("eventId"), "evt123");
  const file = form.get("file") as File;
  assert.equal(await file.text(), "<ResultList/>");
  assert.equal(file.name, "mcvv-results-iof30.xml");
});

test("errors are reported without the password", async () => {
  const result = await uploadIofXml({
    apiUrl: "https://ofeed.invalid",
    eventId: "evt123",
    password: "s3cret-pw",
    xml: "<x/>",
    fetchImpl: mockFetch({ status: 401, body: '{"message":"Invalid password s3cret-pw"}' }, []),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.message, "Invalid password ***");

  const network = await uploadIofXml({
    apiUrl: "https://ofeed.invalid",
    eventId: "evt123",
    password: "s3cret-pw",
    xml: "<x/>",
    fetchImpl: (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
  });
  assert.deepEqual(network, { ok: false, status: 0, message: "TypeError: fetch failed" });
});
