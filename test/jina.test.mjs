import test from "node:test"
import assert from "node:assert/strict"
import { createJina } from "../src/providers/jina.mjs"
import { JINA_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const JINA_FIXTURE = JINA_CASE.response

test("jina: requires a non-empty key before fetching", async () => {
  const fake = stubFetch(() => json(JINA_FIXTURE))
  try {
    const api = createJina()
    for (const key of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query: "hello", key }, context()), /Jina needs a key/)
    }
    assert.equal(fake.calls.length, 0, "no network request made without a key")
  } finally { fake.restore() }
})

test("jina: environment credentials cannot substitute for missing parameter key", async () => {
  const prevEnv = { ...process.env }
  process.env.JINA_API_KEY = "env-key"
  process.env.OSP_JINA_API_KEY = "env-key"
  const fake = stubFetch(() => json(JINA_FIXTURE))
  try {
    const api = createJina()
    await assert.rejects(api.execute({ query: "hello", key: "" }, context()), /Jina needs a key/)
    assert.equal(fake.calls.length, 0)
  } finally {
    process.env = prevEnv
    fake.restore()
  }
})

test("jina: requires a non-empty query before fetching", async () => {
  const fake = stubFetch(() => json(JINA_FIXTURE))
  try {
    const api = createJina()
    for (const query of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query, key: "test-key" }, context()), /Jina query must not be empty/)
    }
    assert.equal(fake.calls.length, 0, "no network request made with empty query")
  } finally { fake.restore() }
})

test("jina: normalizes query, trims key, sets wire num and default snippet headers", async () => {
  const fake = stubFetch(() => json(JINA_FIXTURE))
  try {
    const api = createJina()
    const results = await api.execute({
      query: "  中文   search\n",
      key: " key ",
      count: 6,
    }, context())

    assert.equal(fake.calls.length, 1)
    const call = fake.calls[0]
    assert.equal(call.init.method, "POST")
    assert.equal(call.init.headers.Authorization, "Bearer key")
    assert.equal(call.init.headers["Content-Type"], "application/json")
    assert.equal(call.init.headers.Accept, "application/json")
    assert.equal(call.init.headers["X-Respond-With"], "no-content")
    assert.deepEqual(call.body, { q: "中文 search", num: 6 })

    assert.deepEqual(results, JINA_CASE.expected)
  } finally { fake.restore() }
})

test("jina: optional options gl, hl, location reach request body", async () => {
  const fake = stubFetch(() => json(JINA_FIXTURE))
  try {
    const api = createJina({ gl: "us", hl: "en", location: "Tokyo", maxResults: 15 })
    await api.execute({ query: "tech", key: "k", count: 12 }, context())

    assert.equal(fake.calls.length, 1)
    const call = fake.calls[0]
    assert.deepEqual(call.body, {
      q: "tech",
      num: 12,
      gl: "us",
      hl: "en",
      location: "Tokyo",
    })
  } finally { fake.restore() }
})

test("jina: filters invalid entries first, then applies limit, fallback URL for blank title", async () => {
  const customFixture = {
    code: 200,
    status: 20000,
    data: [
      { title: "No link", description: "dropped" },
      { title: "  ", url: " https://example.com/first ", description: "first desc" },
      { title: "Second", url: "https://example.com/second", description: "second desc" },
    ],
  }
  const fake = stubFetch(() => json(customFixture))
  try {
    const api = createJina({ maxResults: 1 })
    const results = await api.execute({ query: "filter", key: "k", count: 1 }, context())

    assert.equal(results.length, 1)
    assert.equal(results[0].title, "https://example.com/first")
    assert.equal(results[0].url, "https://example.com/first")
    assert.equal(results[0].text, "first desc")
  } finally { fake.restore() }
})

test("jina: full mode omits no-content header, prefers content over description, and respects contentChars", async () => {
  const emojiContent = "\u{1F600}".repeat(4) // 4 smiley faces
  const customFixture = {
    code: 200,
    status: 20000,
    data: [
      {
        title: "Emoji",
        url: "https://example.com/emoji",
        description: "fallback desc",
        content: emojiContent,
        publishedTime: "2026-10-02",
      },
      {
        title: "Blank content",
        url: "https://example.com/blank",
        description: "fallback desc 2",
        content: "   ",
      },
    ],
  }
  const fake = stubFetch(() => json(customFixture))
  try {
    const apiCut = createJina({ content: "full", contentChars: 3 })
    const resultsCut = await apiCut.execute({ query: "emoji", key: "k" }, context())

    assert.equal(fake.calls.length, 1)
    const callCut = fake.calls[0]
    assert.equal(callCut.init.headers["X-Respond-With"], undefined, "no-content header omitted in full mode")
    assert.equal(resultsCut[0].text, "\u{1F600}\u{1F600}\u{1F600}…", "truncated to 3 code points")
    assert.equal(resultsCut[1].text, "fal…", "blank content falls back to description and is truncated")

    const apiFullNoCut = createJina({ content: "full", contentChars: 0 })
    const resultsNoCut = await apiFullNoCut.execute({ query: "emoji-nocut", key: "k" }, context())
    assert.equal(resultsNoCut[1].text, "fallback desc 2", "blank content falls back to description without truncation")

    const apiFull = createJina({ content: "full", contentChars: 0 })
    const resultsFull = await apiFull.execute({ query: "emoji-full", key: "k" }, context())
    assert.equal(resultsFull[0].text, emojiContent, "contentChars 0 preserves full content")
  } finally { fake.restore() }
})

test("jina: validates response structure and business status codes", async () => {
  let payload = {}
  const fake = stubFetch(() => json(payload))
  try {
    const api = createJina()

    // Non-object
    payload = "not an object"
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /expected an object/)

    // code !== 200
    payload = { code: 402, status: 40203, message: "insufficient balance", data: [] }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), (err) => {
      assert.match(err.message, /Jina API error: insufficient balance/)
      assert.equal(err.status, undefined, "business error does not set error.status")
      return true
    })

    // status !== 20000
    payload = { status: 50000, readableMessage: "upstream error", data: [] }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /Jina API error: upstream error/)

    // error field present
    payload = { error: { message: "account locked" }, data: [] }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /Jina API error: account locked/)

    // data: null
    payload = { code: 200, status: 20000, data: null }
    await assert.rejects(api.execute({ query: "test", key: "k" }, context()), /data must be an array/)

    // data: []
    payload = { code: 200, status: 20000, data: [] }
    const emptyResults = await api.execute({ query: "empty", key: "k" }, context())
    assert.deepEqual(emptyResults, [])

    // non-empty data without valid links
    payload = { code: 200, status: 20000, data: [{ title: "no link" }] }
    await assert.rejects(api.execute({ query: "invalid-links", key: "k" }, context()), /no usable search results in payload/)
  } finally { fake.restore() }
})

test("jina: caches results by identity and expires empty results after 30s", async () => {
  let count = 0
  const fake = stubFetch(() => {
    count++
    return json({ code: 200, status: 20000, data: [] })
  })
  const originalNow = Date.now
  let currentNow = 1_000_000
  Date.now = () => currentNow
  try {
    const api = createJina({ cacheTTL: 600_000 })
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

test("jina: respects HTTP error status codes and Retry-After header", async () => {
  const fake = stubFetch(() => text("rate limited", 429, { "Retry-After": "0007" }))
  try {
    const api = createJina()
    await assert.rejects(api.execute({ query: "rate", key: "k" }, context()), (err) => {
      assert.equal(err.status, 429)
      assert.equal(err.retryAfter, "7")
      return true
    })
  } finally { fake.restore() }
})

test("jina: options validation throws TypeError on invalid types", () => {
  assert.throws(() => createJina({ content: "invalid" }), /jina\.content must be one of/)
  assert.throws(() => createJina({ maxResults: 25 }), /jina\.maxResults must be an integer from 1 to 20/)
  assert.throws(() => createJina({ contentChars: -1 }), /jina\.contentChars must be an integer/)
})
