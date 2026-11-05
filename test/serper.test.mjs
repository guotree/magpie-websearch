import test from "node:test"
import assert from "node:assert/strict"
import { createSerper } from "../src/providers/serper.mjs"
import { SERPER_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const SERPER_FIXTURE = SERPER_CASE.response
test("serper: requires a non-empty key before fetching", async () => {
  const fake = stubFetch(() => json(SERPER_FIXTURE))
  try {
    const api = createSerper()
    for (const key of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query: "hello", key }, context()), /Serper needs a key/)
    }
    assert.equal(fake.calls.length, 0, "no network request made without a key")
  } finally { fake.restore() }
})

test("serper: environment credentials cannot substitute for missing parameter key", async () => {
  const prevEnv = { ...process.env }
  process.env.SERPER_API_KEY = "env-key"
  process.env.OSP_SERPER_API_KEY = "env-key"
  const fake = stubFetch(() => json(SERPER_FIXTURE))
  try {
    const api = createSerper()
    await assert.rejects(api.execute({ query: "hello", key: "" }, context()), /Serper needs a key/)
    assert.equal(fake.calls.length, 0)
  } finally {
    process.env = prevEnv
    fake.restore()
  }
})

test("serper: requires a non-empty query before fetching", async () => {
  const fake = stubFetch(() => json(SERPER_FIXTURE))
  try {
    const api = createSerper()
    for (const query of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query, key: "test-key" }, context()), /Serper query must not be empty/)
    }
    assert.equal(fake.calls.length, 0, "no network request made with empty query")
  } finally { fake.restore() }
})

test("serper: normalizes query, trims key, sets fixed wire num: 10, X-API-KEY header and limits locally", async () => {
  const fake = stubFetch(() => json(SERPER_FIXTURE))
  try {
    const api = createSerper()
    const results = await api.execute({
      query: "  中文   search\n",
      key: " key ",
      count: 6,
    }, context())

    assert.equal(fake.calls.length, 1)
    const call = fake.calls[0]
    assert.equal(call.init.method, "POST")
    assert.equal(call.init.headers["X-API-KEY"], "key")
    assert.equal(call.init.headers.Authorization, undefined, "does not use Bearer auth")
    assert.equal(call.init.headers["Content-Type"], "application/json")
    assert.equal(call.init.headers.Accept, "application/json")
    assert.deepEqual(call.body, { q: "中文 search", num: 10 })

    assert.deepEqual(results, SERPER_CASE.expected)
  } finally { fake.restore() }
})

test("serper: optional options gl, hl, tbs reach wire body without URL searchParams", async () => {
  const fake = stubFetch(() => json(SERPER_FIXTURE))
  try {
    const api = createSerper({ gl: "cn", hl: "zh-cn", tbs: "qdr:w" })
    await api.execute({ query: "tech", key: "k", count: 1 }, context())

    assert.equal(fake.calls.length, 1)
    const call = fake.calls[0]
    const parsedUrl = new URL(call.url)
    assert.equal(parsedUrl.search, "", "URL has no query parameters")
    assert.deepEqual(call.body, {
      q: "tech",
      num: 10,
      gl: "cn",
      hl: "zh-cn",
      tbs: "qdr:w",
    })
  } finally { fake.restore() }
})

test("serper: caches by identity including local limit despite fixed wire num", async () => {
  let count = 0
  const fake = stubFetch(() => {
    count++
    return json(SERPER_FIXTURE)
  })
  try {
    const api = createSerper()
    await api.execute({ query: "same", key: "k", count: 1 }, context())
    assert.equal(count, 1)

    // Same count -> hits cache
    await api.execute({ query: "same", key: "k", count: 1 }, context())
    assert.equal(count, 1)

    // Different count -> cache miss, re-fetches
    await api.execute({ query: "same", key: "k", count: 2 }, context())
    assert.equal(count, 2)
  } finally { fake.restore() }
})

test("serper: handles rich-media fallback, missing organic error, and error precedence", async () => {
  let payload = {}
  const fake = stubFetch(() => json(payload))
  try {
    const api = createSerper()

    // Non-object
    payload = "not an object"
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /expected an object/)

    // Error / message precedence over organic: []
    payload = { message: "Unauthorized", organic: [] }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /Serper API error: Unauthorized/)

    payload = { error: "Invalid API key" }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /Serper API error: Invalid API key/)

    // Rich media without organic returns []
    payload = { knowledgeGraph: { title: "Only graph" } }
    assert.deepEqual(await api.execute({ query: "kg", key: "k" }, context()), [])

    payload = { answerBox: { snippet: "Direct answer" } }
    assert.deepEqual(await api.execute({ query: "ab", key: "k" }, context()), [])

    payload = { peopleAlsoAsk: [{ question: "Why?" }] }
    assert.deepEqual(await api.execute({ query: "paa", key: "k" }, context()), [])

    payload = { relatedSearches: [{ query: "Other" }] }
    assert.deepEqual(await api.execute({ query: "rs", key: "k" }, context()), [])

    // Empty object or missing organic without rich media
    payload = {}
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /missing organic/)

    // organic not an array
    payload = { organic: null }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /organic must be an array/)

    // organic: []
    payload = { organic: [] }
    assert.deepEqual(await api.execute({ query: "empty", key: "k" }, context()), [])

    // organic with no valid links
    payload = { organic: [{ title: "no link" }] }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /no usable search results in payload/)
  } finally { fake.restore() }
})

test("serper: caches results by identity and expires empty results after 30s", async () => {
  let count = 0
  const fake = stubFetch(() => {
    count++
    return json({ organic: [] })
  })
  const originalNow = Date.now
  let currentNow = 1_000_000
  Date.now = () => currentNow
  try {
    const api = createSerper({ cacheTTL: 600_000 })
    await api.execute({ query: "empty", key: "k", count: 5 }, context())
    assert.equal(count, 1)

    // Cached
    await api.execute({ query: "empty", key: "k", count: 5 }, context())
    assert.equal(count, 1)

    // Advance 30001 ms -> empty cache expires
    currentNow += 30_001
    await api.execute({ query: "empty", key: "k", count: 5 }, context())
    assert.equal(count, 2)
  } finally {
    Date.now = originalNow
    fake.restore()
  }
})

test("serper: respects HTTP error status codes and Retry-After header", async () => {
  const fake = stubFetch(() => text("rate limited", 429, { "Retry-After": "0007" }))
  try {
    const api = createSerper()
    await assert.rejects(api.execute({ query: "rate", key: "k" }, context()), (err) => {
      assert.equal(err.status, 429)
      assert.equal(err.retryAfter, "7")
      return true
    })
  } finally { fake.restore() }
})

test("serper: options validation throws TypeError on invalid types", () => {
  assert.throws(() => createSerper({ tbs: "qdr:z" }), /serper\.tbs must be one of/)
  assert.throws(() => createSerper({ maxResults: 11 }), /serper\.maxResults must be an integer from 1 to 10/)
})
