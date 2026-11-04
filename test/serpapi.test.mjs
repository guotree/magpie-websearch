import test from "node:test"
import assert from "node:assert/strict"
import { inspect } from "node:util"
import { createServer } from "node:http"
import { createSerpapi } from "../src/providers/serpapi.mjs"
import { SERPAPI_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

test("serpapi: requires a non-empty key before fetching", async () => {
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    const api = createSerpapi()
    for (const key of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query: "hello", key }, context()), /SerpApi needs a key/)
    }
    assert.equal(fake.calls.length, 0, "no network request made without a key")
  } finally { fake.restore() }
})

test("serpapi: requires a non-empty query before fetching", async () => {
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    const api = createSerpapi()
    for (const query of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query, key: "test-key" }, context()), /query must not be empty/)
    }
    assert.equal(fake.calls.length, 0, "no network request made with empty query")
  } finally { fake.restore() }
})

test("serpapi: sends GET with engine, output, q and api_key properly URL-encoded", async () => {
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    const api = createSerpapi()
    const query = "中文 & C++ #docs ?x=1 / 🐟"
    const results = await api.execute({ query, key: "secret-key", count: 6 }, context())
    assert.deepEqual(results, SERPAPI_CASE.expected)

    assert.equal(fake.calls.length, 1)
    const call = fake.calls[0]
    assert.equal(call.init.method, "GET")
    assert.equal(call.init.body, undefined)
    assert.equal(call.init.redirect, "error")

    const url = new URL(call.url)
    assert.equal(url.origin + url.pathname, "https://serpapi.com/search")
    assert.equal(url.searchParams.get("engine"), "google")
    assert.equal(url.searchParams.get("output"), "json")
    assert.equal(url.searchParams.get("q"), query)
    assert.equal(url.searchParams.get("api_key"), "secret-key")
    assert.equal(url.searchParams.has("num"), false)
    assert.equal(url.searchParams.has("count"), false)
    assert.equal(url.searchParams.has("location"), false)
    assert.equal(url.searchParams.has("gl"), false)
    assert.equal(url.searchParams.has("hl"), false)
    assert.equal(url.searchParams.has("google_domain"), false)
    assert.equal(url.searchParams.has("safe"), false)
  } finally { fake.restore() }
})

test("serpapi: optional parameters reach searchParams when configured", async () => {
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    const api = createSerpapi({
      location: "Austin, Texas, United States",
      gl: "us",
      hl: "en",
      googleDomain: "google.com",
      safe: "active",
      maxResults: 5,
    })
    await api.execute({ query: "coffee", key: "k", count: 10 }, context())

    const call = fake.calls[0]
    const url = new URL(call.url)
    assert.equal(url.searchParams.get("location"), "Austin, Texas, United States")
    assert.equal(url.searchParams.get("gl"), "us")
    assert.equal(url.searchParams.get("hl"), "en")
    assert.equal(url.searchParams.get("google_domain"), "google.com")
    assert.equal(url.searchParams.get("safe"), "active")
  } finally { fake.restore() }
})

test("serpapi: validates options and query before fetching", async () => {
  for (const options of [
    { maxResults: 0 },
    { maxResults: 11 },
    { safe: "invalid" },
    { timeout: -1 },
    { timeout: 2_147_483_648 },
  ]) {
    assert.throws(() => createSerpapi(options), TypeError)
  }
})

test("serpapi: environment fallback works and explicit options win", async () => {
  const saved = { ...process.env }
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    process.env.SERPAPI_LOCATION = "Paris, France"
    process.env.SERPAPI_GL = "fr"
    process.env.SERPAPI_HL = "fr"
    process.env.SERPAPI_GOOGLE_DOMAIN = "google.fr"
    process.env.SERPAPI_SAFE = "off"
    process.env.SERPAPI_MAX_RESULTS = "3"

    const first = createSerpapi()
    const second = createSerpapi({ gl: "de", hl: "de", safe: "active", maxResults: 2 })

    await first.execute({ query: "env", key: "k" }, context())
    await second.execute({ query: "env", key: "k" }, context())

    const url1 = new URL(fake.calls[0].url)
    assert.equal(url1.searchParams.get("location"), "Paris, France")
    assert.equal(url1.searchParams.get("gl"), "fr")
    assert.equal(url1.searchParams.get("hl"), "fr")
    assert.equal(url1.searchParams.get("google_domain"), "google.fr")
    assert.equal(url1.searchParams.get("safe"), "off")

    const url2 = new URL(fake.calls[1].url)
    assert.equal(url2.searchParams.get("location"), "Paris, France")
    assert.equal(url2.searchParams.get("gl"), "de")
    assert.equal(url2.searchParams.get("hl"), "de")
    assert.equal(url2.searchParams.get("safe"), "active")
  } finally {
    for (const key of ["SERPAPI_LOCATION", "SERPAPI_GL", "SERPAPI_HL", "SERPAPI_GOOGLE_DOMAIN", "SERPAPI_SAFE", "SERPAPI_MAX_RESULTS"]) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    fake.restore()
  }
})

test("serpapi: custom URLs are used as exact endpoints", async () => {
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    const api = createSerpapi({ cacheTTL: 0 })
    for (const base of ["https://proxy.example", "https://proxy.example/custom/search", "http://127.0.0.1:8000/proxy/v1"]) {
      await api.execute({ query: "custom", key: "k", url: base }, context())
      const target = new URL(fake.calls.at(-1).url)
      target.search = ""
      assert.equal(target.href, new URL(base).href)
    }
    for (const url of ["file:///search", "https://proxy.example/?token=x", "https://proxy.example/#x", "https://u:p@proxy.example", "not a URL"]) {
      await assert.rejects(api.execute({ query: "invalid", key: "k", url }, context()), TypeError)
    }
  } finally { fake.restore() }
})

test("serpapi: local count capping slices results after filtering missing links", async () => {
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    const api = createSerpapi({ maxResults: 10, cacheTTL: 0 })
    const one = await api.execute({ query: "count-test", key: "k", count: 1 }, context())
    assert.equal(one.length, 1)
    assert.equal(one[0].url, "https://example.com/serpapi")

    const two = await api.execute({ query: "count-test", key: "k", count: 2 }, context())
    assert.equal(two.length, 2)
  } finally { fake.restore() }
})

test("serpapi: accepts explicit empty arrays and the official successful empty state", async () => {
  const api = createSerpapi({ cacheTTL: 0 })

  // 1. Explicit empty organic_results array
  let fake = stubFetch(() => json({ search_metadata: { status: "Success" }, organic_results: [] }))
  try {
    assert.deepEqual(await api.execute({ query: "empty 1", key: "k" }, context()), [])
  } finally { fake.restore() }

  // 2. Official empty result shape: Fully empty state with error message
  fake = stubFetch(() => json({
    search_metadata: { status: "Success" },
    search_information: { organic_results_state: "Fully empty" },
    error: "Google hasn't returned any results for this query.",
  }))
  try {
    assert.deepEqual(await api.execute({ query: "empty 2", key: "k" }, context()), [])
  } finally { fake.restore() }

  // A mixed-case empty marker remains valid, including with an explicit array.
  fake = stubFetch(() => json({
    search_metadata: { status: "Success" },
    search_information: { organic_results_state: " FULLY EMPTY " },
    organic_results: [], error: "No results",
  }))
  try {
    assert.deepEqual(await api.execute({ query: "empty 3", key: "k" }, context()), [])
  } finally { fake.restore() }
})

test("serpapi: detects upstream failures and unexpected statuses", async () => {
  const api = createSerpapi({ cacheTTL: 0 })

  // Status is Error
  let fake = stubFetch(() => json({ search_metadata: { status: "Error" }, error: "Proxy timeout" }))
  try {
    await assert.rejects(api.execute({ query: "fail", key: "k" }, context()), /SerpApi search failed/)
  } finally { fake.restore() }

  // Status is Processing / Queued
  fake = stubFetch(() => json({ search_metadata: { status: "Processing" } }))
  try {
    await assert.rejects(api.execute({ query: "progress", key: "k" }, context()), /SerpApi search in progress/)
  } finally { fake.restore() }

  // Malformed organic_results type
  fake = stubFetch(() => json({ organic_results: "not an array" }))
  try {
    await assert.rejects(api.execute({ query: "bad array", key: "k" }, context()), /expected organic_results array/)
  } finally { fake.restore() }

  // Missing organic_results with unexplained error
  fake = stubFetch(() => json({ error: "Something broke" }))
  try {
    await assert.rejects(api.execute({ query: "unexplained", key: "k" }, context()), /SerpApi search failed/)
  } finally { fake.restore() }

  // Missing organic_results and no metadata
  fake = stubFetch(() => json({ other_field: 123 }))
  try {
    await assert.rejects(api.execute({ query: "missing", key: "k" }, context()), /missing organic_results/)
  } finally { fake.restore() }
})

test("serpapi: HTTP refusals retain numeric status and valid Retry-After", async () => {
  for (const [status, retry] of [
    [400, undefined],
    [401, undefined],
    [403, undefined],
    [429, "60"],
    [429, "Wed, 21 Oct 2026 07:28:00 GMT"],
    [500, undefined],
    [503, undefined],
  ]) {
    const fake = stubFetch(() => text("upstream refusal body", status, retry ? { "Retry-After": retry } : {}))
    try {
      const api = createSerpapi({ cacheTTL: 0 })
      await assert.rejects(api.execute({ query: "refusal", key: "k" }, context()), (err) => {
        assert.equal(err.status, status)
        if (retry) assert.equal(err.retryAfter, retry)
        return true
      })
    } finally { fake.restore() }
  }
})

test("serpapi: anti-leak protection prevents credentials from appearing in errors or properties", async () => {
  const SECRET_KEY = "fake-private-key/+&?中文"
  const QUERY_MARKER = "private-query-marker/+&?中文"
  const api = createSerpapi({ cacheTTL: 0 })

  const assertNoLeak = (err) => {
    const representations = [String(err), err.message, err.stack, JSON.stringify(err),
      inspect(Object.getOwnPropertyDescriptors(err), { showHidden: true, depth: null })]
    for (const marker of [SECRET_KEY, QUERY_MARKER]) {
      for (const value of [marker, encodeURIComponent(marker), new URLSearchParams({ v: marker }).toString().slice(2)]) {
        for (const representation of representations) {
          assert.equal(representation.includes(value), false, "error must not retain request secrets")
        }
      }
    }
    assert.equal(err.cause, undefined)
    assert.equal(err.request, undefined)
    assert.equal(err.response, undefined)
  }

  // 1. Network failure
  let fake = stubFetch((call) => {
    const error = new Error(`Connection reset while requesting ${call.url}`, {
      cause: { privateKey: SECRET_KEY, query: QUERY_MARKER },
    })
    Object.defineProperty(error, "privateRequest", { value: call.url })
    throw error
  })
  try {
    await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
      assertNoLeak(err)
      assert.equal(err.message, "SerpApi request failed")
      return true
    })
  } finally { fake.restore() }

  // Unknown or malformed status values must never be echoed into an error.
  for (const status of [SECRET_KEY, QUERY_MARKER, encodeURIComponent(SECRET_KEY),
    encodeURIComponent(QUERY_MARKER), null, false, 0, "", { key: SECRET_KEY }]) {
    fake = stubFetch(() => json({ search_metadata: { status }, organic_results: [] }))
    try {
      await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
        assertNoLeak(err)
        assert.equal(err.message, "Invalid SerpApi response: unexpected search status")
        return true
      })
    } finally { fake.restore() }
  }

  for (const status of [400, 403, 500, 503]) {
    fake = stubFetch((call) => text(call.url + SECRET_KEY + QUERY_MARKER, status, {
      "X-Private": encodeURIComponent(SECRET_KEY),
    }))
    try {
      await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
        assertNoLeak(err)
        assert.equal(err.status, status)
        return true
      })
    } finally { fake.restore() }
  }

  for (const payload of [
    { organic_results: encodeURIComponent(SECRET_KEY) },
    { search_metadata: QUERY_MARKER },
    { error: SECRET_KEY + QUERY_MARKER, organic_results: [] },
  ]) {
    fake = stubFetch(() => json(payload))
    try {
      await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
        assertNoLeak(err)
        return true
      })
    } finally { fake.restore() }
  }

  // 2. HTTP error body echoes the key at the start of the response
  fake = stubFetch(() => text(`{"error":"Key ${SECRET_KEY} is invalid or expired"}`, 401))
  try {
    await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
      assertNoLeak(err)
      assert.equal(err.status, 401)
      assert.equal(err.message, "SerpApi API error 401: invalid API key")
      return true
    })
  } finally { fake.restore() }

  // 3. HTTP 429 quota exhaustion with secret in response
  fake = stubFetch(() => text(`{"error":"Account with key ${SECRET_KEY} has run out of searches"}`, 429, { "Retry-After": "15" }))
  try {
    await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
      assertNoLeak(err)
      assert.equal(err.status, 429)
      assert.equal(err.retryAfter, "15")
      assert.match(err.message, /SerpApi API error 429/)
      return true
    })
  } finally { fake.restore() }

  // 4. Invalid JSON with secret inside
  fake = stubFetch(() => text(`<html>Bad gateway with ${SECRET_KEY}</html>`, 200))
  try {
    await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
      assertNoLeak(err)
      assert.equal(err.message, "Invalid SerpApi response: malformed JSON")
      return true
    })
  } finally { fake.restore() }

  // 5. Upstream business error with secret inside
  fake = stubFetch(() => json({ search_metadata: { status: "Error" }, error: `Search with ${SECRET_KEY} failed` }))
  try {
    await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
      assertNoLeak(err)
      assert.equal(err.message, "SerpApi search failed")
      return true
    })
  } finally { fake.restore() }

  // 6. Suspicious / dirty Retry-After is dropped and not echoed
  fake = stubFetch(() => text("rate limited", 429, { "Retry-After": `30; secret=${encodeURIComponent(SECRET_KEY)}` }))
  try {
    await assert.rejects(api.execute({ query: QUERY_MARKER, key: SECRET_KEY }, context()), (err) => {
      assertNoLeak(err)
      assert.equal(err.status, 429)
      assert.equal(err.retryAfter, undefined)
      return true
    })
  } finally { fake.restore() }
})

test("serpapi: cache isolates entries by key, endpoint, count and query", async () => {
  const fake = stubFetch(() => json(SERPAPI_CASE.response))
  try {
    const api = createSerpapi()
    const args = { query: "isolate", key: "key-1", count: 1, url: "https://proxy.example/v1" }

    await api.execute(args, context())
    await api.execute({ ...args, query: "  isolate  " }, context())
    assert.equal(fake.calls.length, 1, "exact same normalized query reuses cache")

    await api.execute({ ...args, key: "key-2" }, context())
    assert.equal(fake.calls.length, 2, "different key misses cache")

    await api.execute({ ...args, count: 6 }, context())
    assert.equal(fake.calls.length, 3, "different count/limit misses cache")

    await api.execute({ ...args, url: "https://proxy.example/v2" }, context())
    assert.equal(fake.calls.length, 4, "different endpoint misses cache")
  } finally { fake.restore() }
})

test("serpapi: timeouts and host cancellation abort the request", async () => {
  const keepAlive = setInterval(() => {}, 1000)
  const fake = stubFetch(({ init }) => new Promise((_, reject) => {
    if (init.signal.aborted) return reject(init.signal.reason)
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
  }))
  try {
    const api = createSerpapi({ timeout: 10, cacheTTL: 0 })
    await assert.rejects(api.execute({ query: "timeout", key: "k" }, context()), /timed out/)

    const controller = new AbortController()
    const unlimited = createSerpapi({ timeout: 0, cacheTTL: 0 })
    const pending = unlimited.execute({ query: "cancel", key: "k" }, { abort: controller.signal })
    controller.abort()
    await assert.rejects(pending, /cancelled/)
    assert.equal(fake.calls[1].init.signal.aborted, true)
  } finally { clearInterval(keepAlive); fake.restore() }
})

test("serpapi: conflicting errors and malformed results fail without entering the cache", async () => {
  const success = { status: "Success" }
  const empty = { organic_results_state: "Fully empty" }
  const hit = [{ link: "https://example.com/result" }]
  for (const payload of [
    null, [], "invalid", {},
    { error: "refused", organic_results: hit },
    { error: "refused", organic_results: [] },
    { search_metadata: success, error: "refused" },
    { search_metadata: success, error: "refused", organic_results: hit },
    { search_metadata: success, error: "refused", search_information: empty, organic_results: hit },
    { search_metadata: success, organic_results: null },
    { search_metadata: success, search_information: empty, organic_results: null },
    { search_metadata: success, organic_results: {} },
    { search_metadata: success, answer_box: { answer: "42" } },
    { search_metadata: success },
    { search_information: empty, error: "refused" },
    { search_information: empty },
    { search_metadata: null, organic_results: hit },
    { search_metadata: [], organic_results: hit },
    { search_metadata: { status: "Error" }, organic_results: hit },
    { search_metadata: { status: "Queued" }, organic_results: hit },
    { search_metadata: success, search_information: empty, error: { message: "invalid error type" } },
  ]) {
    const fake = stubFetch(() => json(payload))
    try {
      const api = createSerpapi()
      for (let i = 0; i < 2; i++) {
        await assert.rejects(api.execute({ query: "same query", key: "fake-key" }, context()), /SerpApi/)
      }
      assert.equal(fake.calls.length, 2, "invalid responses must be retried rather than cached")
    } finally { fake.restore() }
  }
})

test("serpapi: filters invalid links before capping and ignores malformed optional snippets", async () => {
  const fake = stubFetch(() => json({ organic_results: [
    null, { link: " " }, { link: 7 }, { title: "missing link" },
    { link: "https://example.com/first", snippet: { private: "not text" }, date: 2026 },
    { link: "https://example.com/second", snippet: "excerpt", date: "2 days ago" },
    { link: "https://example.com/third" },
  ] }))
  try {
    const pages = await createSerpapi({ maxResults: 2 }).execute({ query: "filter", count: 6, key: "k" }, context())
    assert.deepEqual(pages, [
      { title: "https://example.com/first", url: "https://example.com/first", text: "" },
      { title: "https://example.com/second", url: "https://example.com/second", text: "excerpt", age: "2 days ago" },
    ])
  } finally { fake.restore() }
})

test("serpapi: real HTTP bodies respect cancellation and timeout, and redirects never reach the destination", async () => {
  const calls = []
  const sockets = new Set()
  let bodyReady
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname
    calls.push(path)
    if (path === "/redirect") {
      res.writeHead(302, { Location: "/destination?api_key=fake-key" }).end()
      return
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.write("{")
    if (path === "/cancel") bodyReady()
  })
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await assert.rejects(createSerpapi({ timeout: 50 }).execute({
      query: "body timeout", key: "fake-key", url: base + "/stall",
    }, context()), /timed out/)
    const controller = new AbortController()
    const ready = new Promise((resolve) => { bodyReady = resolve })
    const pending = createSerpapi({ timeout: 1000 }).execute({
      query: "body cancellation", key: "fake-key", url: base + "/cancel",
    }, { abort: controller.signal })
    const rejected = assert.rejects(pending, /cancelled/)
    await ready
    controller.abort()
    await rejected
    await assert.rejects(createSerpapi().execute({
      query: "redirect", key: "fake-key", url: base + "/redirect",
    }, context()), { message: "SerpApi request failed" })
    assert.equal(calls.includes("/destination"), false)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
})
