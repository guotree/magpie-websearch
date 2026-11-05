import test from "node:test"
import assert from "node:assert/strict"
import { createKagi } from "../src/providers/kagi.mjs"
import { KAGI_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const KAGI_FIXTURE = KAGI_CASE.response

test("kagi: requires a non-empty key before fetching", async () => {
  const fake = stubFetch(() => json(KAGI_FIXTURE))
  try {
    const api = createKagi()
    for (const key of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query: "hello", key }, context()), /Kagi needs a key/)
    }
    assert.equal(fake.calls.length, 0, "no network request made without a key")
  } finally { fake.restore() }
})

test("kagi: environment credentials cannot substitute for missing parameter key", async () => {
  const prevEnv = { ...process.env }
  process.env.KAGI_API_KEY = "env-key"
  process.env.OSP_KAGI_API_KEY = "env-key"
  const fake = stubFetch(() => json(KAGI_FIXTURE))
  try {
    const api = createKagi()
    await assert.rejects(api.execute({ query: "hello", key: "" }, context()), /Kagi needs a key/)
    assert.equal(fake.calls.length, 0)
  } finally {
    process.env = prevEnv
    fake.restore()
  }
})

test("kagi: requires a non-empty query before fetching", async () => {
  const fake = stubFetch(() => json(KAGI_FIXTURE))
  try {
    const api = createKagi()
    for (const query of [undefined, "", "   ", null]) {
      await assert.rejects(api.execute({ query, key: "test-key" }, context()), /Kagi query must not be empty/)
    }
    assert.equal(fake.calls.length, 0, "no network request made with empty query")
  } finally { fake.restore() }
})

test("kagi: normalizes query, trims key, sets workflow, limit and Bearer authorization", async () => {
  const fake = stubFetch(() => json(KAGI_FIXTURE))
  try {
    const api = createKagi()
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
    assert.deepEqual(call.body, { query: "中文 search", workflow: "search", limit: 6 })

    assert.deepEqual(results, KAGI_CASE.expected)
  } finally { fake.restore() }
})

test("kagi: lens takes priority over recency with warning, region passes through in filters", async () => {
  const fake = stubFetch(() => json(KAGI_FIXTURE))
  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args.join(" "))
  try {
    const api = createKagi({
      lens: "programming",
      recency: "week",
      region: "cn",
    })

    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /kagi\.lens overrides kagi\.recency/)

    await api.execute({ query: "code", key: "k" }, context())
    assert.equal(fake.calls.length, 1)
    const call = fake.calls[0]
    assert.deepEqual(call.body, {
      query: "code",
      workflow: "search",
      limit: 10,
      lens_id: "programming",
      filters: { region: "cn" },
    })

    // Resetting lens to empty string allows recency to take effect
    const apiNoLens = createKagi({
      lens: "",
      recency: "week",
      region: "cn",
    })
    await apiNoLens.execute({ query: "code2", key: "k" }, context())
    assert.equal(fake.calls.length, 2)
    const call2 = fake.calls[1]
    assert.deepEqual(call2.body, {
      query: "code2",
      workflow: "search",
      limit: 10,
      lens: { time_relative: "week" },
      filters: { region: "cn" },
    })
  } finally {
    console.warn = originalWarn
    fake.restore()
  }
})

test("kagi: filters invalid entries first, then applies limit, fallback URL for blank title", async () => {
  const customFixture = {
    data: {
      search: [
        { title: "No link", snippet: "dropped" },
        { title: "  ", url: " https://example.com/first ", snippet: "first desc" },
        { title: "Second", url: "https://example.com/second", snippet: "second desc" },
      ],
    },
  }
  const fake = stubFetch(() => json(customFixture))
  try {
    const api = createKagi({ maxResults: 1 })
    const results = await api.execute({ query: "filter", key: "k", count: 1 }, context())

    assert.equal(results.length, 1)
    assert.equal(results[0].title, "https://example.com/first")
    assert.equal(results[0].url, "https://example.com/first")
    assert.equal(results[0].text, "first desc")
  } finally { fake.restore() }
})

test("kagi: validates data and search collections, returns empty array for other collections only", async () => {
  let payload = {}
  const fake = stubFetch(() => json(payload))
  try {
    const api = createKagi()
    // Non-object
    payload = "not an object"
    await assert.rejects(api.execute({ query: "test-non-object", key: "k" }, context()), /expected an object/)

    // data missing / not object
    payload = { data: null }
    await assert.rejects(api.execute({ query: "test-data-null", key: "k" }, context()), /data must be an object/)

    // data.search null or not array
    payload = { data: { search: null } }
    await assert.rejects(api.execute({ query: "test-search-null", key: "k" }, context()), /data\.search must be an array/)

    // data without search (only news/other collections) returns []
    payload = { data: { news: [{ url: "https://example.com/news" }] } }
    const newsOnly = await api.execute({ query: "test-news-only", key: "k" }, context())
    assert.deepEqual(newsOnly, [])

    // empty error array is not treated as error
    payload = { error: [], data: { search: [] } }
    const emptyOk = await api.execute({ query: "test-empty-ok", key: "k" }, context())
    assert.deepEqual(emptyOk, [])

    // non-empty error throws Kagi API error
    payload = { error: [{ code: 101, msg: "bad token" }] }
    await assert.rejects(api.execute({ query: "test-error-code", key: "k" }, context()), (err) => {
      assert.match(err.message, /Kagi API error: \[code 101\] bad token/)
      assert.equal(err.status, undefined)
      return true
    })

    // search with no valid links
    payload = { data: { search: [{ title: "no link" }] } }
    await assert.rejects(api.execute({ query: "test-no-valid-links", key: "k" }, context()), /no usable search results in payload/)
  } finally { fake.restore() }
})

test("kagi: caches results by identity and expires empty results after 30s", async () => {
  let count = 0
  const fake = stubFetch(() => {
    count++
    return json({ data: { search: [] } })
  })
  const originalNow = Date.now
  let currentNow = 1_000_000
  Date.now = () => currentNow
  try {
    const api = createKagi({ cacheTTL: 600_000 })
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

test("kagi: respects HTTP error status codes and Retry-After header", async () => {
  const fake = stubFetch(() => text("rate limited", 429, { "Retry-After": "0007" }))
  try {
    const api = createKagi()
    await assert.rejects(api.execute({ query: "rate", key: "k" }, context()), (err) => {
      assert.equal(err.status, 429)
      assert.equal(err.retryAfter, "7")
      return true
    })
  } finally { fake.restore() }
})

test("kagi: options validation throws TypeError on invalid types", () => {
  assert.throws(() => createKagi({ recency: "year" }), /kagi\.recency must be one of/)
  assert.throws(() => createKagi({ maxResults: 1025 }), /kagi\.maxResults must be an integer from 1 to 1024/)
})
