import test from "node:test"
import assert from "node:assert/strict"
import { cleanRetryAfter, makeCache, requestJSON, requestResponse } from "../src/core.mjs"
import { context, stubFetch, text } from "./harness.mjs"

test("cache expires empty answers early and evicts least recently used entries", () => {
  const original = Date.now
  let now = 1000
  Date.now = () => now
  try {
    const cache = makeCache(60_000, 2)
    cache.write("empty", [])
    cache.write("one", [{ url: "https://one.example" }])
    now += 30_001
    assert.equal(cache.read("empty"), undefined)
    assert.ok(cache.read("one"))
    cache.write("two", [{ url: "https://two.example" }])
    cache.read("one")
    cache.write("three", [{ url: "https://three.example" }])
    assert.equal(cache.read("two"), undefined)
    assert.ok(cache.read("one"))
    now += 30_000
    assert.equal(cache.read("one"), undefined)
  } finally { Date.now = original }
})

test("cleanRetryAfter accepts delay-seconds and valid HTTP-dates, rejecting other values", () => {
  assert.equal(cleanRetryAfter("12"), "12")
  assert.equal(cleanRetryAfter("0"), "0")
  assert.equal(cleanRetryAfter(" 0007 "), "7")
  assert.equal(cleanRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), "Wed, 21 Oct 2026 07:28:00 GMT")
  assert.equal(cleanRetryAfter("wed, 21 oct 2026 07:28:00 gmt"), "Wed, 21 Oct 2026 07:28:00 GMT")
  assert.equal(cleanRetryAfter("Thu, 01 Jan 1970 00:00:00 GMT"), "Thu, 01 Jan 1970 00:00:00 GMT")
  for (const dirty of [
    "Key, 21 Oct 2026 07:28:00 GMT", "Tue, 21 Oct 2026 07:28:00 GMT",
    "Tue, 31 Feb 2026 07:28:00 GMT", "Wed, 21 Oct 2026 25:28:00 GMT",
    "2026-10-21", "Wed, 21 Oct 2026 07:28:00 GMT; private=marker",
  ]) assert.equal(cleanRetryAfter(dirty), undefined)
  assert.equal(cleanRetryAfter(""), undefined)
  assert.equal(cleanRetryAfter("   "), undefined)
  assert.equal(cleanRetryAfter(null), undefined)
  assert.equal(cleanRetryAfter("not a date or number"), undefined)
  assert.equal(cleanRetryAfter("12s"), undefined)
  assert.equal(cleanRetryAfter("-5"), undefined)
})

test("sensitive HTTP refusals never wait for failed or stalled body cleanup", async () => {
  for (const status of [401, 429]) {
    for (const mode of ["stalled", "rejected", "broken"]) {
      let cancelled = false
      const stream = new ReadableStream({
        start(controller) {
          if (mode === "broken") controller.error(new Error("private body failure"))
        },
        cancel() {
          cancelled = true
          return mode === "stalled" ? new Promise(() => {}) : Promise.reject(new Error("private cleanup failure"))
        },
      })
      const fake = stubFetch(() => new Response(stream, {
        status, headers: { "Retry-After": "0007", "X-Private": "private header" },
      }))
      let deadline
      try {
        const outcome = await Promise.race([
          requestResponse("https://example.com", {}, context(), { sensitive: true, timeout: 10 })
            .then(() => "unexpected success", (error) => error),
          new Promise((resolve) => { deadline = setTimeout(() => resolve("cleanup blocked refusal"), 200) }),
        ])
        assert.equal(outcome.status, status, `${mode} cleanup must preserve HTTP ${status}`)
        assert.equal(outcome.retryAfter, "7")
        assert.equal(outcome.cause, undefined)
        assert.deepEqual(Object.keys(outcome).sort(), ["retryAfter", "status"])
        assert.doesNotMatch(String(outcome), /private/)
        if (mode !== "broken") assert.equal(cancelled, true)
      } finally { clearTimeout(deadline); fake.restore() }
    }
  }
})

test("sensitive readers hide body exceptions while default request diagnostics remain available", async () => {
  let fake = stubFetch(() => text("ok"))
  try {
    await assert.rejects(requestResponse("https://example.com", {}, context(), { sensitive: true }, () => {
      throw new Error("private reader exception")
    }), { message: "search response body unavailable" })
  } finally { fake.restore() }
  fake = stubFetch(() => { throw new Error("ordinary network detail") })
  try {
    await assert.rejects(requestJSON("https://example.com", {}, context()), /ordinary network detail/)
  } finally { fake.restore() }
  fake = stubFetch(() => text("ordinary upstream detail", 503))
  try {
    await assert.rejects(requestJSON("https://example.com", {}, context()), (error) => {
      assert.equal(error.status, 503)
      assert.match(error.message, /ordinary upstream detail/)
      return true
    })
  } finally { fake.restore() }
})

test("requestResponse and requestJSON in sensitive mode conceal credentials and details", async () => {
  const SECRET = "secret-key-12345"
  const URL_WITH_SECRET = `https://api.example.com/search?api_key=${SECRET}`

  // 1. Network failure
  const fakeNetwork = stubFetch(() => {
    throw new Error(`fetch failed at ${URL_WITH_SECRET}`)
  })
  try {
    await assert.rejects(
      requestResponse(URL_WITH_SECRET, {}, context(), { label: "TestAPI", sensitive: true }),
      (err) => {
        assert.equal(err.message, "TestAPI request failed")
        assert.doesNotMatch(String(err), new RegExp(SECRET))
        return true
      },
    )
  } finally { fakeNetwork.restore() }

  // 2. HTTP error response with secret in body
  const fakeHttp = stubFetch(() => text(`{"error":"bad key: ${SECRET}"}`, 401, { "Retry-After": "30" }))
  try {
    await assert.rejects(
      requestResponse(URL_WITH_SECRET, {}, context(), { label: "TestAPI", sensitive: true }),
      (err) => {
        assert.equal(err.status, 401)
        assert.equal(err.retryAfter, "30")
        assert.equal(err.message, "TestAPI API error 401: invalid API key")
        assert.doesNotMatch(String(err), new RegExp(SECRET))
        return true
      },
    )
  } finally { fakeHttp.restore() }

  // 3. Malformed JSON with secret in body
  const fakeJson = stubFetch(() => text(`not json with ${SECRET}`, 200))
  try {
    await assert.rejects(
      requestJSON(URL_WITH_SECRET, {}, context(), { label: "TestAPI", sensitive: true }),
      (err) => {
        assert.equal(err.message, "Invalid TestAPI response: malformed JSON")
        assert.doesNotMatch(String(err), new RegExp(SECRET))
        return true
      },
    )
  } finally { fakeJson.restore() }
})
