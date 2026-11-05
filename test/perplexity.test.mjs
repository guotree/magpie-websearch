import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { createPerplexity } from "../src/providers/perplexity.mjs"
import { PERPLEXITY_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const args = { query: "q", key: "k" }

test("perplexity: POST, Bearer key, normalized query, limit, search_type and date fallback", async () => {
  const provider = createPerplexity()
  assert.equal(provider.name, "Perplexity (magpie-websearch)")
  assert.equal(provider.keysURL, "https://console.perplexity.ai/project/keys")
  assert.equal(provider.keyOptional, false)
  const fake = stubFetch(() => json(PERPLEXITY_CASE.response))
  try {
    const results = await provider.execute({ query: "  中文   search\n", count: 6, key: " key " }, context())
    assert.deepEqual(results, PERPLEXITY_CASE.expected)
    const call = fake.calls[0]
    assert.equal(call.url, "https://api.perplexity.ai/search")
    assert.equal(call.init.method, "POST")
    assert.equal(call.init.redirect, "error")
    assert.deepEqual(call.init.headers, {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer key",
    })
    assert.deepEqual(call.body, {
      query: "中文 search",
      max_results: 6,
      search_type: "web",
    })
  } finally { fake.restore() }
})

test("perplexity: empty keys and queries fail before fetch, without an invented query ceiling", async () => {
  const provider = createPerplexity()
  const fake = stubFetch(() => json({ results: [] }))
  try {
    for (const key of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, key }, context()), /needs a key/)
    }
    for (const query of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, query }, context()), /query must not be empty/)
    }
    assert.equal(fake.calls.length, 0)
    const query = "搜".repeat(2000)
    await provider.execute({ ...args, query }, context())
    assert.equal(fake.calls[0].body.query, query)
  } finally { fake.restore() }
})

test("perplexity: searchType, recency, country and language request mapping and count caps", async () => {
  const fake = stubFetch(() => json(PERPLEXITY_CASE.response))
  try {
    const configured = createPerplexity({
      searchType: "fast",
      recency: "week",
      country: " us ",
      language: " EN, zh ,, ",
      maxResults: 3,
      cacheTTL: 0,
    })
    await configured.execute({ ...args, count: 6 }, context())
    assert.deepEqual(fake.calls.at(-1).body, {
      query: "q",
      max_results: 3,
      search_type: "fast",
      search_recency_filter: "week",
      country: "US",
      search_language_filter: ["en", "zh"],
    })

    // Count caps: 1 -> 1, missing -> maxResults (3), 50 with maxResults: 20 -> 20, 6.9 with cap 10 -> 6
    await configured.execute({ ...args, count: 1 }, context())
    assert.equal(fake.calls.at(-1).body.max_results, 1)

    await configured.execute(args, context())
    assert.equal(fake.calls.at(-1).body.max_results, 3)

    const wide = createPerplexity({ maxResults: 20 })
    await wide.execute({ ...args, count: 50 }, context())
    assert.equal(fake.calls.at(-1).body.max_results, 20)

    const defaultProvider = createPerplexity()
    await defaultProvider.execute({ ...args, count: 6.9 }, context())
    assert.equal(fake.calls.at(-1).body.max_results, 6)

    // filter missing URLs before capping
    const capped = await createPerplexity({ maxResults: 1 }).execute(args, context())
    assert.deepEqual(capped, PERPLEXITY_CASE.expected.slice(0, 1))
  } finally { fake.restore() }
})

test("perplexity: environment variables fall back and explicit options override them", async () => {
  const originalEnv = { ...process.env }
  const warnings = []
  const warn = console.warn
  console.warn = (...values) => warnings.push(values.join(" "))
  const fake = stubFetch(() => json(PERPLEXITY_CASE.response))
  try {
    Object.assign(process.env, {
      PERPLEXITY_SEARCH_TYPE: "fast",
      PERPLEXITY_RECENCY: "week",
      PERPLEXITY_COUNTRY: "us",
      PERPLEXITY_LANGUAGE: "en",
      PERPLEXITY_MAX_RESULTS: "99",
      PERPLEXITY_CONTENT_CHARS: "3",
      PERPLEXITY_CACHE_TTL: "0",
    })
    const envProvider = createPerplexity()
    const envResult = await envProvider.execute(args, context())
    assert.equal(envResult[0].text, "Per…")
    assert.deepEqual(fake.calls[0].body, {
      query: "q",
      max_results: 20,
      search_type: "fast",
      search_recency_filter: "week",
      country: "US",
      search_language_filter: ["en"],
    })
    await envProvider.execute(args, context())
    assert.equal(fake.calls.length, 2, "environment cacheTTL: 0 disables cache")

    // Explicit options override environment
    const explicit = createPerplexity({
      searchType: "web",
      recency: "",
      country: "",
      language: "",
      maxResults: 1,
      contentChars: 0,
      cacheTTL: 600_000,
    })
    const explicitResult = await explicit.execute(args, context())
    assert.equal(explicitResult[0].text, "Perplexity snippet")
    assert.deepEqual(fake.calls.at(-1).body, {
      query: "q",
      max_results: 1,
      search_type: "web",
    })
    await explicit.execute(args, context())
    assert.equal(fake.calls.length, 3, "explicit cacheTTL enables cache")

    // Invalid environment values trigger warnings and fall back to defaults
    Object.assign(process.env, {
      PERPLEXITY_SEARCH_TYPE: "bad",
      PERPLEXITY_RECENCY: "bad",
      PERPLEXITY_COUNTRY: "USA",
      PERPLEXITY_LANGUAGE: "en-US",
      PERPLEXITY_MAX_RESULTS: "invalid",
      PERPLEXITY_CONTENT_CHARS: "-1",
    })
    const fallbackProvider = createPerplexity()
    await fallbackProvider.execute(args, context())
    assert.deepEqual(fake.calls.at(-1).body, {
      query: "q",
      max_results: 10,
      search_type: "web",
    })
    assert.ok(warnings.some((w) => w.includes("PERPLEXITY_SEARCH_TYPE")))
    assert.ok(warnings.some((w) => w.includes("PERPLEXITY_RECENCY")))
    assert.ok(warnings.some((w) => w.includes("PERPLEXITY_COUNTRY")))
    assert.ok(warnings.some((w) => w.includes("PERPLEXITY_LANGUAGE")))
  } finally {
    process.env = originalEnv
    console.warn = warn
    fake.restore()
  }
})

test("perplexity: configuration type validation and language limits", async () => {
  for (const [field, values] of Object.entries({
    searchType: ["people", 123, true],
    recency: ["decade", 123],
    country: ["USA", "12", 123, false],
    language: [
      "en-US",
      ["en"],
      123,
      "en,zh,fr,de,es,it,pt,ru,ja,ko,ar,hi,nl,pl,sv,tr,uk,vi,th,id,fi", // 21 languages
    ],
    maxResults: [0, 21, "6", 1.5],
    timeout: [-1, 2_147_483_648],
    cacheTTL: [-1, "0"],
    contentChars: [-1, "3", null, Number.MAX_SAFE_INTEGER + 1],
  })) {
    for (const value of values) {
      assert.throws(
        () => createPerplexity({ [field]: value }),
        new RegExp(`perplexity\\.${field}`),
        `expected perplexity.${field} rejection for ${JSON.stringify(value)}`,
      )
    }
  }

  // Exactly 20 languages passes
  const twentyLangs = "en,zh,fr,de,es,it,pt,ru,ja,ko,ar,hi,nl,pl,sv,tr,uk,vi,th,id"
  const fake = stubFetch(() => json(PERPLEXITY_CASE.response))
  try {
    const p = createPerplexity({ language: twentyLangs })
    await p.execute(args, context())
    assert.equal(fake.calls[0].body.search_language_filter.length, 20)
  } finally { fake.restore() }
})

test("perplexity: snippet bounds code points and preserves original whitespace", async () => {
  const whitespaceSnippet = " \n  Leading and trailing whitespace  \n\t"
  const longSnippet = "🙂".repeat(5000)
  const fake = stubFetch(() => json({
    results: [
      { url: "https://example.com/ws", snippet: whitespaceSnippet },
      { url: "https://example.com/long", snippet: longSnippet },
      { url: "https://example.com/empty", snippet: "" },
      { url: "https://example.com/non-string", snippet: null },
      { url: "https://example.com/numeric", snippet: 123 },
    ],
  }))
  try {
    const defaultProvider = createPerplexity()
    const results = await defaultProvider.execute(args, context())
    assert.equal(results[0].text, whitespaceSnippet, "original whitespace must not be stripped")
    assert.equal(results[1].text, "🙂".repeat(4000) + "…", "default 4000 code points truncation")
    assert.equal(results[2].text, "")
    assert.equal(results[3].text, "")
    assert.equal(results[4].text, "")

    const fullProvider = createPerplexity({ contentChars: 0 })
    const fullResults = await fullProvider.execute(args, context())
    assert.equal(fullResults[1].text, longSnippet, "contentChars: 0 preserves full text")

    const shortProvider = createPerplexity({ contentChars: 3 })
    const shortResults = await shortProvider.execute(args, context())
    assert.equal(shortResults[1].text, "🙂🙂🙂…", "contentChars: 3 bounds to 3 code points")
  } finally { fake.restore() }
})

test("perplexity: date and last_updated fallback logic without server_time adoption", async () => {
  const fake = stubFetch(() => json({
    server_time: "2026-11-05T00:00:00Z",
    results: [
      { url: "https://example.com/both", date: "2026-10-01", last_updated: "2026-10-15" },
      { url: "https://example.com/date-empty", date: "", last_updated: " 2026-10-18 " },
      { url: "https://example.com/date-whitespace", date: "   \n\t  ", last_updated: "2026-10-18" },
      { url: "https://example.com/date-nonstring", date: 12345, last_updated: "2026-10-18" },
      { url: "https://example.com/date-null", date: null, last_updated: "2026-10-18" },
      { url: "https://example.com/neither", date: null, last_updated: null },
      { url: "https://example.com/neither-empty", date: " ", last_updated: "" },
    ],
  }))
  try {
    const results = await createPerplexity().execute(args, context())
    assert.equal(results[0].age, "2026-10-01", "both present prefers date")
    assert.equal(results[1].age, "2026-10-18", "date empty falls back to last_updated")
    assert.equal(results[2].age, "2026-10-18", "date whitespace falls back to last_updated")
    assert.equal(results[3].age, "2026-10-18", "date non-string falls back to last_updated")
    assert.equal(results[4].age, "2026-10-18", "date null falls back to last_updated")
    assert.equal(results[5].age, undefined, "neither valid omits age")
    assert.equal(results[6].age, undefined, "server_time is not borrowed")
  } finally { fake.restore() }
})

test("perplexity: malformed rows dropped and usable results required", async () => {
  const fake = stubFetch(() => json({
    results: [
      null, 123, [], "string", { url: 42 }, { url: "" }, { url: "   " },
      { title: "No URL", snippet: "text" },
      { title: "First Valid", url: "https://example.com/first", snippet: "one" },
      { title: "Second Valid", url: "https://example.com/second", snippet: "two" },
    ],
  }))
  try {
    const capped = await createPerplexity({ maxResults: 1 }).execute(args, context())
    assert.deepEqual(capped, [
      { title: "First Valid", url: "https://example.com/first", text: "one" },
    ])
  } finally { fake.restore() }

  // Non-empty array with all invalid rows throws no usable results
  for (const results of [
    [null, 42],
    [{ url: "" }, { url: "  " }, { title: "Only Title" }],
  ]) {
    const badRows = stubFetch(() => badRows.calls.length === 1 ? json({ results }) : json(PERPLEXITY_CASE.response))
    try {
      const provider = createPerplexity()
      await assert.rejects(
        provider.execute(args, context()),
        /no usable search results in payload/,
      )
      // Subsequent search succeeds and is not blocked by cache
      assert.deepEqual(await provider.execute(args, context()), PERPLEXITY_CASE.expected)
      assert.equal(badRows.calls.length, 2)
    } finally { badRows.restore() }
  }
})

test("perplexity: malformed responses and business failures fail without status or caching", async () => {
  for (const response of [
    null, [], 1, {}, { results: null }, { results: {} }, { results: "bad" },
    { error: { message: "quota exceeded", type: "rate_limit" }, results: [] },
    { error: "upstream refusal", results: [] },
  ]) {
    const provider = createPerplexity()
    const fake = stubFetch(() => fake.calls.length === 1 ? json(response) : json(PERPLEXITY_CASE.response))
    try {
      await assert.rejects(provider.execute(args, context()), (error) => {
        assert.match(error.message, /Invalid Perplexity response|Perplexity API error/)
        assert.equal(error.status, undefined)
        return true
      })
      assert.deepEqual(await provider.execute(args, context()), PERPLEXITY_CASE.expected)
      assert.equal(fake.calls.length, 2)
    } finally { fake.restore() }
  }

  const brokenJSON = stubFetch(() => text("broken JSON", 200))
  try {
    await assert.rejects(createPerplexity().execute(args, context()), /Invalid Perplexity response/)
  } finally { brokenJSON.restore() }

  // { results: [] } is valid empty search and returns []
  const emptySearch = stubFetch(() => json({ results: [] }))
  try {
    const emptyResult = await createPerplexity().execute(args, context())
    assert.deepEqual(emptyResult, [])
  } finally { emptySearch.restore() }
})

test("perplexity: HTTP failures retain status, bounded diagnostics and Retry-After", async () => {
  for (const status of [400, 401, 402, 403, 422, 429, 500]) {
    const provider = createPerplexity()
    const fake = stubFetch(() => fake.calls.length === 1
      ? json({ detail: "upstream detail " + "🙂".repeat(500) }, status)
      : json(PERPLEXITY_CASE.response))
    try {
      await assert.rejects(provider.execute(args, context()), (error) => {
        assert.equal(error.status, status)
        assert.match(error.message, /Perplexity API error \d+:/)
        assert.match(error.message, /upstream detail/)
        assert.ok([...error.message].length < 650, "diagnostics are bounded")
        return true
      })
      assert.deepEqual(await provider.execute(args, context()), PERPLEXITY_CASE.expected, "HTTP errors never cache")
    } finally { fake.restore() }
  }

  // Interrupted 401 and 429 bodies retain status
  for (const status of [401, 429]) {
    const fake = stubFetch(() => new Response(new ReadableStream({
      start(controller) { controller.error(new Error("interrupted stream")) },
    }), { status }))
    try {
      await assert.rejects(createPerplexity().execute(args, context()), (error) => {
        assert.equal(error.status, status)
        assert.match(error.message, /response body unavailable/)
        return true
      })
    } finally { fake.restore() }
  }

  // Retry-After normalization on 429
  for (const [header, expected] of [
    ["0007", "7"],
    ["0", "0"],
    ["Wed, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["bad", undefined],
    ["-1", undefined],
    ["1.5", undefined],
    [undefined, undefined],
  ]) {
    for (const broken of [false, true]) {
      const headers = header === undefined ? {} : { "Retry-After": header }
      const fake = stubFetch(() => broken
        ? new Response(new ReadableStream({
          start(controller) { controller.error(new Error("broken body")) },
        }), { status: 429, headers })
        : json({ detail: "rate limit" }, 429, headers))
      try {
        await assert.rejects(createPerplexity().execute(args, context()), (error) => {
          assert.equal(error.status, 429)
          assert.equal(error.retryAfter, expected)
          if (expected === undefined) {
            assert.doesNotMatch(error.message, /retry after/)
          } else {
            assert.ok(error.message.includes(`retry after ${expected}`))
          }
          return true
        })
      } finally { fake.restore() }
    }
  }
})

test("perplexity: cache expiration and query/key/endpoint/option isolation", async () => {
  const originalNow = Date.now
  let now = 1_800_000_000_000
  Date.now = () => now
  try {
    // 600_000ms TTL for hits and 30_000ms for empty arrays
    for (const [response, ttl] of [[PERPLEXITY_CASE.response, 600_000], [{ results: [] }, 30_000]]) {
      const provider = createPerplexity()
      const fake = stubFetch(() => json(response))
      try {
        await provider.execute(args, context())
        now += ttl - 1
        await provider.execute(args, context())
        assert.equal(fake.calls.length, 1)
        now += 2
        await provider.execute(args, context())
        assert.equal(fake.calls.length, 2)
      } finally { fake.restore() }
    }

    // Short TTL (1000ms) caps empty array at min(1000, 30000) = 1000ms
    const shortTtlProvider = createPerplexity({ cacheTTL: 1000 })
    const fakeShort = stubFetch(() => json({ results: [] }))
    try {
      await shortTtlProvider.execute(args, context())
      now += 999
      await shortTtlProvider.execute(args, context())
      assert.equal(fakeShort.calls.length, 1)
      now += 2
      await shortTtlProvider.execute(args, context())
      assert.equal(fakeShort.calls.length, 2)
    } finally { fakeShort.restore() }

    // Cache isolation: different keys, endpoints, options
    const fakeIso = stubFetch(() => json(PERPLEXITY_CASE.response))
    try {
      const p1 = createPerplexity({ searchType: "web" })
      const p2 = createPerplexity({ searchType: "fast" })
      await p1.execute(args, context())
      await p2.execute(args, context())
      assert.equal(fakeIso.calls.length, 2, "different searchType isolates cache")

      // Different key
      await p1.execute({ ...args, key: "another-key" }, context())
      assert.equal(fakeIso.calls.length, 3, "different key isolates cache")

      // Different endpoint
      await p1.execute({ ...args, url: "https://custom.endpoint.com" }, context())
      assert.equal(fakeIso.calls.length, 4, "different endpoint isolates cache")

      // Same query again on p1 hits cache
      await p1.execute(args, context())
      assert.equal(fakeIso.calls.length, 4)
    } finally { fakeIso.restore() }
  } finally {
    Date.now = originalNow
  }
})

test("perplexity: timeout and host abort cover fetch and body consumption without caching", async () => {
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (const phase of ["fetch", "body"]) {
      for (const timeout of [10, 0]) {
        const controller = new AbortController()
        const provider = createPerplexity({ timeout })
        let started
        const reading = new Promise((resolve) => { started = resolve })
        const fake = stubFetch(({ init }) => {
          const wait = () => {
            const pending = new Promise((_, reject) => {
              if (init.signal.aborted) return reject(init.signal.reason)
              init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
            })
            started()
            return pending
          }
          return phase === "fetch" ? wait() : { ok: true, text: wait }
        })
        try {
          const pending = provider.execute(args, { abort: controller.signal })
          if (timeout === 0) { await reading; controller.abort() }
          await assert.rejects(pending, timeout === 0 ? /cancelled/ : /timed out after 10ms/)
          assert.equal(fake.calls[0].init.signal.aborted, true)
        } finally { fake.restore() }
        const recovered = stubFetch(() => json(PERPLEXITY_CASE.response))
        try { assert.deepEqual(await provider.execute(args, context()), PERPLEXITY_CASE.expected) }
        finally { recovered.restore() }
      }
    }
  } finally { clearInterval(keepAlive) }
})

test("perplexity: plugin instances isolate searchType, recency, country, language and caches", async () => {
  const fake = stubFetch(() => json(PERPLEXITY_CASE.response))
  try {
    const first = await WebSearch({}, {
      enable: ["perplexity"],
      perplexity: { searchType: "fast", recency: "month", country: "US", language: "en", contentChars: 3 },
    })
    const second = await WebSearch({}, { enable: ["perplexity"] })
    assert.deepEqual(Object.keys(first.search), ["perplexity"])
    const result = await first.search.perplexity.execute(args, context())
    assert.equal(result[0].text, "Per…")
    assert.deepEqual(fake.calls[0].body, {
      query: "q",
      max_results: 10,
      search_type: "fast",
      search_recency_filter: "month",
      country: "US",
      search_language_filter: ["en"],
    })
    assert.deepEqual(await second.search.perplexity.execute(args, context()), PERPLEXITY_CASE.expected)
    assert.equal(fake.calls.at(-1).body.search_type, "web")
    assert.equal(fake.calls.at(-1).body.search_recency_filter, undefined)
    assert.equal(fake.calls.length, 2)
  } finally { fake.restore() }
})
