import test from "node:test"
import assert from "node:assert/strict"
import { createMoonshot } from "../src/providers/moonshot.mjs"
import { createMoonshotCN } from "../src/providers/moonshot-cn.mjs"
import { parseMoonshotRetryAfter } from "../src/providers/moonshot-common.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const SITES = [
  {
    id: "moonshot",
    label: "Moonshot",
    name: "Moonshot (magpie-websearch)",
    create: createMoonshot,
    defaultEndpoint: "https://api.moonshot.ai/v1/tools/search",
    keysURL: "https://platform.kimi.ai/console/api-keys",
    envPrefix: "MOONSHOT_",
  },
  {
    id: "moonshot-cn",
    label: "Moonshot CN",
    name: "Moonshot CN (magpie-websearch)",
    create: createMoonshotCN,
    defaultEndpoint: "https://api.moonshot.cn/v1/tools/search",
    keysURL: "https://platform.kimi.com/console/api-keys",
    envPrefix: "MOONSHOT_CN_",
  },
]

for (const site of SITES) {
  const { id, label, name, create, defaultEndpoint, keysURL, envPrefix } = site

  test(`${id}: metadata, keysURL and keyOptional are configured correctly`, () => {
    const provider = create()
    assert.equal(provider.name, name)
    assert.equal(provider.keysURL, keysURL)
    assert.equal(provider.keyOptional, false)
    assert.equal(typeof provider.execute, "function")
  })

  test(`${id}: requires a non-empty key before fetching`, async () => {
    const provider = create()
    let fetched = false
    const fake = stubFetch(() => { fetched = true; return json({ search_results: [] }) })
    try {
      for (const badKey of [undefined, null, "", "   "]) {
        await assert.rejects(
          provider.execute({ query: "test", key: badKey }, context()),
          { message: `${label} needs a key: add one in magpie's Web search settings` },
        )
      }
      assert.equal(fetched, false)
    } finally { fake.restore() }
  })

  test(`${id}: requires a non-empty query before fetching`, async () => {
    const provider = create()
    let fetched = false
    const fake = stubFetch(() => { fetched = true; return json({ search_results: [] }) })
    try {
      for (const badQuery of [undefined, null, "", "   "]) {
        await assert.rejects(
          provider.execute({ query: badQuery, key: "test-key" }, context()),
          { message: `${label} query must not be empty` },
        )
      }
      assert.equal(fetched, false)
    } finally { fake.restore() }
  })

  test(`${id}: sends POST JSON with Bearer token, normalized query, limit and redirect error`, async () => {
    const provider = create()
    const fake = stubFetch(() => json({
      search_results: [
        { url: "https://example.com/item", title: "Item Title", snippet: "Snippet", date: "2026-11-05" },
      ],
    }))
    try {
      const results = await provider.execute({ query: "  hello   moonshot  ", count: 6, key: "my-key" }, context())
      assert.equal(fake.calls.length, 1)
      const call = fake.calls[0]
      assert.equal(call.url, defaultEndpoint)
      assert.equal(call.init.method, "POST")
      assert.equal(call.init.redirect, "error")
      assert.equal(call.init.headers.Authorization, "Bearer my-key")
      assert.equal(call.init.headers.Accept, "application/json")
      assert.equal(call.init.headers["Content-Type"], "application/json")
      assert.deepEqual(call.body, {
        text_query: "hello moonshot",
        limit: 6,
      })
      assert.deepEqual(results, [
        { title: "Item Title", url: "https://example.com/item", text: "Snippet", age: "2026-11-05" },
      ])
    } finally { fake.restore() }
  })

  test(`${id}: limit honors sizeFor(count, maxResults, 20)`, async () => {
    const custom = create({ maxResults: 3 })
    const fake = stubFetch(() => json({ search_results: [] }))
    try {
      // count 6 with maxResults 3 -> 3
      await custom.execute({ query: "q", count: 6, key: "k" }, context())
      assert.equal(fake.calls[0].body.limit, 3)

      // count 50 with maxResults 20 -> 20 (cap is 20)
      const provider20 = create({ maxResults: 20 })
      await provider20.execute({ query: "q", count: 50, key: "k" }, context())
      assert.equal(fake.calls[1].body.limit, 20)

      // count 1 with maxResults 10 -> 1
      const defaultProvider = create()
      await defaultProvider.execute({ query: "q", count: 1, key: "k" }, context())
      assert.equal(fake.calls[2].body.limit, 1)
    } finally { fake.restore() }
  })

  test(`${id}: content snippet vs full mode request body and text selection`, async () => {
    const rawData = {
      search_results: [
        {
          url: "https://example.com/one",
          title: "Title One",
          snippet: "Snippet text",
          text: "  Full article text\nwith indentation and\nmultiple lines  ",
          date: "2026-11-05",
        },
        {
          url: "https://example.com/two",
          title: "Title Two",
          snippet: "Fallback snippet",
          text: "   ",
        },
      ],
    }

    // Default: snippet mode (no include_content in body, prefers snippet even if text exists)
    const snippetProvider = create()
    let fake = stubFetch(() => json(rawData))
    try {
      const results = await snippetProvider.execute({ query: "q", key: "k" }, context())
      assert.equal(fake.calls[0].body.include_content, undefined)
      assert.equal(results[0].text, "Snippet text")
      assert.equal(results[1].text, "Fallback snippet")
    } finally { fake.restore() }

    // Full mode: sends include_content: true, uses raw text preserving indentation, falls back to snippet when text is whitespace
    const fullProvider = create({ content: "full" })
    fake = stubFetch(() => json(rawData))
    try {
      const results = await fullProvider.execute({ query: "q", key: "k" }, context())
      assert.equal(fake.calls[0].body.include_content, true)
      assert.equal(results[0].text, "  Full article text\nwith indentation and\nmultiple lines  ")
      assert.equal(results[1].text, "Fallback snippet")
    } finally { fake.restore() }
  })

  test(`${id}: mapping edge cases - missing title, non-string fields, date whitespace, emoji truncation, contentChars 0`, async () => {
    const emojiStr = "Search 🔍 results with emojis 🚀 and symbols"
    const longText = "A".repeat(100)
    const rawData = {
      search_results: [
        {
          url: "https://example.com/bare",
          title: "   ",
          snippet: null,
          text: { malformed: "object" },
          date: "   ",
        },
        {
          url: "https://example.com/emoji",
          title: "Emoji Item",
          snippet: emojiStr,
        },
        {
          url: "https://example.com/long",
          title: "Long Item",
          snippet: longText,
        },
      ],
    }

    // Truncate at 10 code points
    const cappedProvider = create({ contentChars: 10 })
    let fake = stubFetch(() => json(rawData))
    try {
      const results = await cappedProvider.execute({ query: "q", key: "k" }, context())
      // 1. Missing title falls back to url, null/object snippet/text becomes "", empty date omitted
      assert.equal(results[0].title, "https://example.com/bare")
      assert.equal(results[0].text, "")
      assert.equal(results[0].age, undefined)

      // 2. Emoji truncation preserves surrogate pairs
      const points = [...results[1].text]
      assert.equal(points.at(-1), "…")
      assert.equal(points.length, 11) // 10 code points + 1 ellipsis
      assert.equal(results[1].text, [...emojiStr].slice(0, 10).join("") + "…")

      // 3. Long text capped with ellipsis
      assert.equal(results[2].text, "A".repeat(10) + "…")
    } finally { fake.restore() }

    // contentChars 0 disables truncation
    const unlimitedProvider = create({ contentChars: 0 })
    fake = stubFetch(() => json(rawData))
    try {
      const results = await unlimitedProvider.execute({ query: "q", key: "k" }, context())
      assert.equal(results[2].text, longText)
    } finally { fake.restore() }
  })

  test(`${id}: filtering invalid entries, slicing by limit, and failing when non-empty results are all invalid`, async () => {
    const rawWithInvalid = {
      search_results: [
        { title: "Missing URL", snippet: "dropped" },
        null,
        "string entry",
        123,
        { url: "   ", title: "Whitespace URL" },
        { url: "https://example.com/valid-1", title: "Valid 1", snippet: "s1" },
        { url: "https://example.com/valid-2", title: "Valid 2", snippet: "s2" },
        { url: "https://example.com/valid-3", title: "Valid 3", snippet: "s3" },
      ],
    }

    const provider = create()
    let fake = stubFetch(() => json(rawWithInvalid))
    try {
      const results = await provider.execute({ query: "q", count: 2, key: "k" }, context())
      assert.equal(results.length, 2)
      assert.equal(results[0].url, "https://example.com/valid-1")
      assert.equal(results[1].url, "https://example.com/valid-2")
    } finally { fake.restore() }

    // When raw search_results is non-empty, but all are invalid -> throw structural error, do not cache
    const allInvalid = {
      search_results: [
        { title: "No URL 1" },
        null,
        { url: "" },
      ],
    }
    fake = stubFetch(() => json(allInvalid))
    try {
      await assert.rejects(
        provider.execute({ query: "invalid-all", key: "k" }, context()),
        { message: `Invalid ${label} response: no usable search results in payload` },
      )
    } finally { fake.restore() }
  })

  test(`${id}: response validation - non-object, upstream error, missing/non-array search_results, malformed JSON`, async () => {
    const provider = create()

    // 1. Non-object top-level
    let fake = stubFetch(() => json(["an", "array"]))
    try {
      await assert.rejects(
        provider.execute({ query: "q1", key: "k" }, context()),
        { message: `Invalid ${label} response: expected an object` },
      )
    } finally { fake.restore() }

    // 2. Upstream error string
    fake = stubFetch(() => json({ error: "custom upstream failure" }))
    try {
      await assert.rejects(
        provider.execute({ query: "q2", key: "k" }, context()),
        { message: `${label} API error: custom upstream failure` },
      )
    } finally { fake.restore() }

    // 3. Upstream error object with message
    fake = stubFetch(() => json({ error: { message: "detailed error message", code: "rate_limited" } }))
    try {
      await assert.rejects(
        provider.execute({ query: "q3", key: "k" }, context()),
        { message: `${label} API error: detailed error message` },
      )
    } finally { fake.restore() }

    // 4. Missing search_results
    fake = stubFetch(() => json({ success: true }))
    try {
      await assert.rejects(
        provider.execute({ query: "q4", key: "k" }, context()),
        { message: `Invalid ${label} response: search_results must be an array` },
      )
    } finally { fake.restore() }

    // 5. search_results is null
    fake = stubFetch(() => json({ search_results: null }))
    try {
      await assert.rejects(
        provider.execute({ query: "q5", key: "k" }, context()),
        { message: `Invalid ${label} response: search_results must be an array` },
      )
    } finally { fake.restore() }

    // 6. search_results is object or string
    fake = stubFetch(() => json({ search_results: "not array" }))
    try {
      await assert.rejects(
        provider.execute({ query: "q6", key: "k" }, context()),
        { message: `Invalid ${label} response: search_results must be an array` },
      )
    } finally { fake.restore() }

    // 7. Malformed JSON
    fake = stubFetch(() => text("not a json string at all", 200))
    try {
      await assert.rejects(
        provider.execute({ query: "q7", key: "k" }, context()),
        /Invalid .* response: SyntaxError/,
      )
    } finally { fake.restore() }
  })

  test(`${id}: legitimate empty results cache for at most 30 seconds`, async () => {
    const originalDateNow = Date.now
    let mockNow = 1_000_000
    Date.now = () => mockNow

    const provider = create({ cacheTTL: 600_000 })
    let callCount = 0
    const fake = stubFetch(() => {
      callCount++
      return json({ search_results: [] })
    })

    try {
      const res1 = await provider.execute({ query: "empty query", key: "k" }, context())
      assert.deepEqual(res1, [])
      assert.equal(callCount, 1)

      // Cache hit within 30s
      mockNow += 20_000
      const res2 = await provider.execute({ query: "empty query", key: "k" }, context())
      assert.deepEqual(res2, [])
      assert.equal(callCount, 1)

      // Cache expires after 30s
      mockNow += 10_001
      const res3 = await provider.execute({ query: "empty query", key: "k" }, context())
      assert.deepEqual(res3, [])
      assert.equal(callCount, 2)
    } finally {
      Date.now = originalDateNow
      fake.restore()
    }
  })

  test(`${id}: cache isolation across key, endpoint, count, content, contentChars`, async () => {
    const provider = create()
    const fake = stubFetch(() => json({
      search_results: [{ url: "https://example.com", snippet: "s" }],
    }))
    try {
      const base = { query: "isolated", key: "k1", count: 2, url: "https://custom.example/v1" }
      await provider.execute(base, context())
      // Normalized query reuses cache
      await provider.execute({ ...base, query: "  isolated  " }, context())
      assert.equal(fake.calls.length, 1)

      // Changing key fetches
      await provider.execute({ ...base, key: "k2" }, context())
      assert.equal(fake.calls.length, 2)

      // Changing count (limit) fetches
      await provider.execute({ ...base, count: 5 }, context())
      assert.equal(fake.calls.length, 3)

      // Changing url fetches
      await provider.execute({ ...base, url: "https://other.example/v1" }, context())
      assert.equal(fake.calls.length, 4)
    } finally { fake.restore() }
  })

  test(`${id}: HTTP errors, 401/403 site messages, and status retention`, async () => {
    const provider = create()

    // 401
    let fake = stubFetch(() => text("", 401))
    try {
      await assert.rejects(
        provider.execute({ query: "q", key: "k" }, context()),
        (err) => {
          assert.equal(err.status, 401)
          assert.equal(err.message, `${label} API error 401: invalid API key (check key and site platform)`)
          return true
        },
      )
    } finally { fake.restore() }

    // 403
    fake = stubFetch(() => text("", 403))
    try {
      await assert.rejects(
        provider.execute({ query: "q", key: "k" }, context()),
        (err) => {
          assert.equal(err.status, 403)
          assert.equal(err.message, `${label} API error 403: account not activated or disabled`)
          return true
        },
      )
    } finally { fake.restore() }

    // 400
    fake = stubFetch(() => text("bad request details", 400))
    try {
      await assert.rejects(
        provider.execute({ query: "q", key: "k" }, context()),
        (err) => {
          assert.equal(err.status, 400)
          assert.match(err.message, /bad request details/)
          return true
        },
      )
    } finally { fake.restore() }

    // 500
    fake = stubFetch(() => text("server crashed", 500))
    try {
      await assert.rejects(
        provider.execute({ query: "q", key: "k" }, context()),
        (err) => {
          assert.equal(err.status, 500)
          assert.match(err.message, /server crashed/)
          return true
        },
      )
    } finally { fake.restore() }
  })

  test(`${id}: 429 Retry-After, X-RateLimit-Reset relative calculation, and error status`, async () => {
    const originalDateNow = Date.now
    const mockNow = 1_800_000_000_250
    Date.now = () => mockNow
    try {
      const provider = create()
      const cases = [
        [{ "Retry-After": "42" }, "42"],
        [{ "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" }, "Wed, 21 Oct 2026 07:28:00 GMT"],
        [{ "X-RateLimit-Reset": String(Math.floor(mockNow / 1000) + 15) }, "15"],
        [{ "X-RateLimit-Reset": String(mockNow + 15_001) }, "16"],
        [{ "X-RateLimit-Reset": String(Math.floor(mockNow / 1000) + 86_401) }, undefined],
        [{ "X-RateLimit-Reset": String(mockNow + 86_400_001) }, undefined],
        ...[String(Math.floor(mockNow / 1000) - 5), "invalid-number", "123.45", "-10", "99999999999999999999999"]
          .map((reset) => [{ "X-RateLimit-Reset": reset }, undefined]),
      ]
      // Known HTTP refusals retain the same fields even if reading their body fails.
      for (const brokenBody of [false, true]) {
        for (const [headers, expected] of cases) {
          const fake = stubFetch(() => brokenBody
            ? new Response(new ReadableStream({ start(controller) { controller.error(new Error("stream failure")) } }), { status: 429, headers })
            : text("rate limited", 429, headers))
          try {
            await assert.rejects(provider.execute({ query: "q", key: "k" }, context()), (err) => {
              assert.equal(err.status, 429)
              assert.equal(err.retryAfter, expected)
              assert.equal(Object.hasOwn(err, "retryAfter"), expected !== undefined)
              if (expected === undefined) assert.doesNotMatch(err.message, /retry after/)
              else assert.ok(err.message.includes(`retry after ${expected}`))
              if (brokenBody) assert.match(err.message, /response body unavailable/)
              return true
            })
          } finally { fake.restore() }
        }
      }
    } finally { Date.now = originalDateNow }
  })

  test(`${id}: timeouts and host cancellation abort upstream and do not cache`, async () => {
    const keepAlive = setInterval(() => {}, 1000)
    try {
      // 1. Timeout
      const shortTimeoutProvider = create({ timeout: 10 })
      let fake = stubFetch(({ init }) => new Promise((_, reject) => {
        if (init.signal.aborted) return reject(init.signal.reason)
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
      }))
      try {
        await assert.rejects(
          shortTimeoutProvider.execute({ query: "timeout query", key: "k" }, context()),
          { message: `${label} search timed out after 10ms` },
        )
      } finally { fake.restore() }

      // Subsequent request should not be served from cache
      fake = stubFetch(() => json({ search_results: [{ url: "https://example.com/ok", snippet: "recovered" }] }))
      try {
        const res = await shortTimeoutProvider.execute({ query: "timeout query", key: "k" }, context())
        assert.equal(res[0].url, "https://example.com/ok")
      } finally { fake.restore() }

      // 2. Cancellation
      const cancelProvider = create({ timeout: 25_000 })
      const ac = new AbortController()
      fake = stubFetch(({ init }) => {
        ac.abort()
        return new Promise((_, reject) => {
          if (init.signal.aborted) return reject(init.signal.reason)
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
        })
      })
      try {
        await assert.rejects(
          cancelProvider.execute({ query: "cancel query", key: "k" }, { abort: ac.signal }),
          { message: `${label} search cancelled` },
        )
      } finally { fake.restore() }

      // 3. timeout: 0 preserves host cancellation
      const zeroTimeoutProvider = create({ timeout: 0 })
      const ac2 = new AbortController()
      fake = stubFetch(({ init }) => new Promise((_, reject) => {
        if (init.signal.aborted) return reject(init.signal.reason)
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
      }))
      try {
        const pending = zeroTimeoutProvider.execute({ query: "cancel zero", key: "k" }, { abort: ac2.signal })
        ac2.abort()
        await assert.rejects(
          pending,
          { message: `${label} search cancelled` },
        )
      } finally { fake.restore() }
    } finally {
      clearInterval(keepAlive)
    }
  })

  test(`${id}: configuration parsing, environment fallback and explicit invalid error names`, async () => {
    // Environment fallback
    const origEnv = { ...process.env }
    try {
      process.env[`${envPrefix}CACHE_TTL`] = "12345"
      process.env[`${envPrefix}TIMEOUT`] = "54321"
      process.env[`${envPrefix}MAX_RESULTS`] = "15"
      process.env[`${envPrefix}CONTENT`] = "full"
      process.env[`${envPrefix}CONTENT_CHARS`] = "2500"

      const envProvider = create()
      // Let's verify via execute request body
      const fake = stubFetch(() => json({ search_results: [] }))
      try {
        await envProvider.execute({ query: "env test", key: "k" }, context())
        assert.equal(fake.calls[0].body.limit, 15)
        assert.equal(fake.calls[0].body.include_content, true)
      } finally { fake.restore() }

      // Explicit options override environment
      const explicitProvider = create({
        maxResults: 5,
        content: "snippet",
      })
      const fake2 = stubFetch(() => json({ search_results: [] }))
      try {
        await explicitProvider.execute({ query: "explicit test", key: "k" }, context())
        assert.equal(fake2.calls[0].body.limit, 5)
        assert.equal(fake2.calls[0].body.include_content, undefined)
      } finally { fake2.restore() }
    } finally {
      process.env = origEnv
    }

    // Invalid explicit options throw TypeError naming the field accurately
    assert.throws(
      () => create({ timeout: -1 }),
      new RegExp(`^TypeError: ${id}\\.timeout must be an integer from 0 to 2147483647`),
    )
    assert.throws(
      () => create({ maxResults: 0 }),
      new RegExp(`^TypeError: ${id}\\.maxResults must be an integer from 1 to 20`),
    )
    assert.throws(
      () => create({ maxResults: 21 }),
      new RegExp(`^TypeError: ${id}\\.maxResults must be an integer from 1 to 20`),
    )
    assert.throws(
      () => create({ content: "invalid-mode" }),
      new RegExp(`^TypeError: ${id}\\.content must be one of "snippet", "full"`),
    )
    assert.throws(() => create({ content: 1 }), {
      name: "TypeError", message: `${id}.content must be a string`,
    })
    for (const contentChars of [-1, 1.5, "4000", null, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => create({ contentChars }), {
        name: "TypeError", message: `${id}.contentChars must be an integer from 0 to ${Number.MAX_SAFE_INTEGER}`,
      })
    }
    assert.throws(
      () => create({ cacheTTL: -5 }),
      new RegExp(`^TypeError: ${id}\\.cacheTTL must be an integer`),
    )
  })
}

test("moonshot dual-site isolation: keys, endpoints and environment variables never cross", async () => {
  const origEnv = { ...process.env }
  try {
    process.env.MOONSHOT_MAX_RESULTS = "18"
    delete process.env.MOONSHOT_CN_MAX_RESULTS

    const intl = createMoonshot()
    const cn = createMoonshotCN()

    const fake = stubFetch(() => json({ search_results: [] }))
    try {
      await intl.execute({ query: "q", key: "intl-key" }, context())
      await cn.execute({ query: "q", key: "cn-key", count: 6 }, context())

      assert.equal(fake.calls[0].url, "https://api.moonshot.ai/v1/tools/search")
      assert.equal(fake.calls[0].init.headers.Authorization, "Bearer intl-key")
      assert.equal(fake.calls[0].body.limit, 18)

      assert.equal(fake.calls[1].url, "https://api.moonshot.cn/v1/tools/search")
      assert.equal(fake.calls[1].init.headers.Authorization, "Bearer cn-key")
      // Domestic site does NOT read MOONSHOT_MAX_RESULTS, keeps default 10 capped by sizeFor(6, 10, 20) -> 6
      assert.equal(fake.calls[1].body.limit, 6)
    } finally { fake.restore() }
  } finally {
    process.env = origEnv
  }
})

test("parseMoonshotRetryAfter bounds reset delays and tolerates only plausible integer milliseconds", () => {
  const original = Date.now
  const now = 1_800_000_000_000
  Date.now = () => now
  try {
    for (const [reset, expected] of [
      [undefined, undefined], ["", undefined], ["   ", undefined],
      [String(now / 1000 + 25), "25"], [` 000${now / 1000 + 25} `, "25"],
      [String(now / 1000 + 86_400), "86400"], [String(now / 1000 + 86_401), undefined],
      [String(now / 1000), undefined], [String(now / 1000 - 1), undefined],
      [String(now + 25_000), "25"], [String(now + 25_001), "26"],
      [String(now + 86_400_000), "86400"], [String(now + 86_400_001), undefined],
      [String(now), undefined], [String(now - 1), undefined],
      ["-10", undefined], ["123.45", undefined], ["1.8e9", undefined], ["invalid", undefined],
      ["100000000000", undefined], ["100000000001", undefined],
      [String(Number.MAX_SAFE_INTEGER), undefined], ["9007199254740992", undefined],
    ]) {
      const headers = reset === undefined ? {} : { "X-RateLimit-Reset": reset }
      assert.equal(parseMoonshotRetryAfter(new Response("", { status: 429, headers })), expected, `reset: ${reset}`)
    }
    Date.now = () => now + 250
    for (const [reset, expected] of [[now / 1000 + 1, "1"], [now + 1_251, "2"]]) {
      assert.equal(parseMoonshotRetryAfter(new Response("", {
        status: 429, headers: { "X-RateLimit-Reset": String(reset) },
      })), expected)
    }
  } finally { Date.now = original }
})

test("parseMoonshotRetryAfter preserves standard header priority and non-429 semantics", () => {
  const original = Date.now
  Date.now = () => 1_800_000_000_000
  try {
    const reset = "1800000015"
    for (const [standard, expected] of [
      [" 0007 ", "7"], ["0", "0"], ["90000", "90000"],
      ["Wed, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 GMT"],
      ["invalid", "15"], ["", "15"],
    ]) {
      assert.equal(parseMoonshotRetryAfter(new Response("", {
        status: 429, headers: { "Retry-After": standard, "X-RateLimit-Reset": reset },
      })), expected)
    }
    for (const status of [200, 401, 503]) {
      assert.equal(parseMoonshotRetryAfter(new Response("", {
        status, headers: { "Retry-After": "0007", "X-RateLimit-Reset": reset },
      })), "0007")
      assert.equal(parseMoonshotRetryAfter(new Response("", {
        status, headers: { "X-RateLimit-Reset": reset },
      })), undefined)
    }
  } finally { Date.now = original }
})
