import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { createBocha } from "../src/providers/bocha.mjs"
import { BOCHA_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const args = { query: "q", key: "k" }
const payload = (value) => ({ code: 200, data: { webPages: { value } } })

test("bocha: normalized POST, ordinary snippets, Bearer key and original publication date", async () => {
  const provider = createBocha()
  assert.equal(provider.name, "Bocha (magpie-websearch)")
  assert.equal(provider.keysURL, "https://open.bochaai.com/api-keys")
  assert.equal(provider.keyOptional, false)
  const fake = stubFetch(() => json(BOCHA_CASE.response))
  try {
    assert.deepEqual(await provider.execute({ query: "  中文   search\n", count: 6, key: " key " }, context()), BOCHA_CASE.expected)
    const call = fake.calls[0]
    assert.equal(call.url, "https://api.bochaai.com/v1/web-search")
    assert.equal(call.init.method, "POST")
    assert.equal(call.init.redirect, "error")
    assert.deepEqual(call.init.headers, { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer key" })
    assert.deepEqual(call.body, { query: "中文 search", count: 6, summary: false })
  } finally { fake.restore() }
})

test("bocha: missing call credentials and empty queries never fetch or borrow environment keys", async () => {
  const original = { ...process.env }
  const fake = stubFetch(() => json(payload([])))
  try {
    Object.assign(process.env, { BOCHA_API_KEY: "ignored", OSP_BOCHA_API_KEY: "ignored" })
    const provider = createBocha()
    for (const key of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, key }, context()), /Bocha needs a key: add one in magpie's Web search settings/)
    }
    for (const query of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, query }, context()), /Bocha query must not be empty/)
    }
    assert.equal(fake.calls.length, 0)
    const query = "搜".repeat(2000)
    await provider.execute({ ...args, query }, context())
    assert.equal(fake.calls[0].body.query, query)
  } finally { process.env = original; fake.restore() }
})

test("bocha: result caps apply after filtering and freshness is a trimmed opaque string", async () => {
  const fake = stubFetch(() => json(BOCHA_CASE.response))
  try {
    for (const [count, maxResults, expected] of [[6, 3, 3], [99, 50, 50], [undefined, 10, 10], [6.9, 10, 6]]) {
      await createBocha({ maxResults }).execute({ ...args, count }, context())
      assert.equal(fake.calls.at(-1).body.count, expected)
    }
    assert.deepEqual(await createBocha({ maxResults: 1 }).execute(args, context()), BOCHA_CASE.expected.slice(0, 1))
    for (const freshness of ["noLimit", "oneDay", "oneWeek", "oneMonth", "oneYear", "2026-10-01", "2026-10-01..2026-10-31", "vendor-validates-this"]) {
      await createBocha({ freshness: ` ${freshness} ` }).execute(args, context())
      assert.equal(fake.calls.at(-1).body.freshness, freshness)
    }
  } finally { fake.restore() }
})

test("bocha: generated summaries require opt in and blank summaries fall back without stripping text", async () => {
  const rows = ["生成摘要", "", " \n", null, 123, undefined].map((summary, i) => ({
    name: " Title ", url: ` https://example.com/${i} `, snippet: " 摘录\n ", summary,
  }))
  rows.push({ url: "https://example.com/bare", snippet: {}, summary: null })
  const fake = stubFetch(() => json(payload(rows)))
  try {
    for (const summary of [false, true]) {
      const results = await createBocha({ summary }).execute(args, context())
      assert.deepEqual(results.map((r) => r.text), [summary ? "生成摘要" : " 摘录\n ", ...Array(5).fill(" 摘录\n "), ""])
      assert.equal(results[0].title, "Title")
      assert.equal(results[0].url, "https://example.com/0")
      assert.equal(fake.calls.at(-1).body.summary, summary)
    }
  } finally { fake.restore() }
})

test("bocha: dates keep upstream strings with publication before crawl and omit invalid fields", async () => {
  const fake = stubFetch(() => json(payload([
    null, [], 1, "row", { url: 5 }, { url: " " }, { name: "missing" },
    { url: "https://example.com/published", datePublished: " 2025-02-23T08:18:30+08:00 ", dateLastCrawled: "2020-01-01T00:00:00Z" },
    { url: "https://example.com/crawled", datePublished: " ", dateLastCrawled: "2020-01-01T00:00:00Z" },
    { url: "https://example.com/none", name: {}, datePublished: 123, dateLastCrawled: null },
  ])))
  try {
    const results = await createBocha().execute(args, context())
    assert.deepEqual(results.map((r) => r.age), ["2025-02-23T08:18:30+08:00", "2020-01-01T00:00:00Z", undefined])
    assert.equal(Object.hasOwn(results[2], "age"), false)
    assert.equal(results[2].title, results[2].url)
  } finally { fake.restore() }
})

test("bocha: malformed envelopes fail clearly and errors never cache", async () => {
  const cases = [
    [null, "expected an object"], [[], "expected an object"], [1, "expected an object"],
    [{}, "data must be an object"], [{ data: null }, "data must be an object"], [{ data: [] }, "data must be an object"],
    [{ data: { webPages: [] } }, "webPages.value must be an array"],
    [{ data: { webPages: { value: null } } }, "webPages.value must be an array"],
    [payload([null, {}, { url: " " }]), "no usable search results in payload"],
    [{ code: "403", msg: "balance", log_id: "trace" }, "[code 403] [log_id trace] balance"],
    [{ code: 200, log_id: "trace", error: "business failure" }, "[code 200] [log_id trace] business failure"],
    [{ error: { message: "business failure" } }, "business failure"],
  ]
  for (const [response, expected] of cases) {
    const provider = createBocha()
    const fake = stubFetch(() => fake.calls.length === 1 ? json(response) : json(BOCHA_CASE.response))
    try {
      await assert.rejects(provider.execute(args, context()), (error) => {
        assert.ok(error.message.includes(expected), error.message)
        assert.equal(error.status, undefined)
        return true
      })
      assert.deepEqual(await provider.execute(args, context()), BOCHA_CASE.expected)
      assert.equal(fake.calls.length, 2)
    } finally { fake.restore() }
  }
  const fake = stubFetch(() => text("broken JSON", 200))
  try { await assert.rejects(createBocha().execute(args, context()), /Invalid Bocha response/) }
  finally { fake.restore() }
})

test("bocha: valid empty envelopes get at most thirty seconds of caching", async () => {
  const original = Date.now
  let now = 1_800_000_000_000
  Date.now = () => now
  try {
    for (const response of [{ code: 200, data: {} }, { code: "200", data: { webPages: null } }, payload([])]) {
      const provider = createBocha()
      const fake = stubFetch(() => json(response))
      try {
        assert.deepEqual(await provider.execute(args, context()), [])
        assert.deepEqual(await provider.execute(args, context()), [])
        assert.equal(fake.calls.length, 1)
        now += 30_001
        await provider.execute(args, context())
        assert.equal(fake.calls.length, 2)
      } finally { fake.restore() }
    }
  } finally { Date.now = original }
})

test("bocha: HTTP refusals retain status, identifiers, bounded messages and account hints", async () => {
  for (const status of [401, 402, 403, 429, 502]) {
    for (const response of [{ code: "upstream", log_id: "trace", message: "message " + "😀".repeat(500), msg: "unused" }, "<html>" + "x".repeat(2000)]) {
      const fake = stubFetch(() => typeof response === "string" ? text(response, status) : json(response, status))
      try {
        await assert.rejects(createBocha().execute(args, context()), (error) => {
          assert.equal(error.status, status)
          assert.match(error.message, /\[truncated\]/)
          assert.ok([...error.message].length < 550)
          if (typeof response === "object") assert.match(error.message, /\[code upstream\] \[log_id trace\] message/)
          if (status === 401) assert.match(error.message, /Check the API key at https:\/\/open.bochaai.com\/api-keys/)
          if (status === 403) assert.match(error.message, /Check account access and balance at https:\/\/open.bochaai.com\/overview/)
          return true
        })
      } finally { fake.restore() }
    }
  }
  const fake = stubFetch(() => new Response(new ReadableStream({ start(c) { c.error(new Error("interrupted")) } }), { status: 401 }))
  try {
    await assert.rejects(createBocha().execute(args, context()), (error) => {
      assert.equal(error.status, 401)
      assert.match(error.message, /response body unavailable.*Check the API key/)
      return true
    })
  } finally { fake.restore() }
})

test("bocha: extracts short code and log identifiers before diagnostic truncation", async () => {
  for (const status of [200, 403]) {
    const fake = stubFetch(() => json({ code: "c".repeat(200), log_id: "l".repeat(200), message: " ", msg: "fallback " + "x".repeat(1000) }, status))
    try {
      await assert.rejects(createBocha().execute(args, context()), (error) => {
        assert.ok(error.message.includes(`[code ${"c".repeat(80)}…] [log_id ${"l".repeat(80)}…] fallback`))
        assert.equal(error.status, status === 200 ? undefined : status)
        return true
      })
    } finally { fake.restore() }
  }
})

test("bocha: standard Retry-After normalization includes zero and interrupted refusals", async () => {
  for (const [header, expected] of [["0007", "7"], ["0", "0"], ["Wed, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 GMT"], ["bad", undefined], ["-1", undefined], ["1.5", undefined], [undefined, undefined]]) {
    for (const broken of [false, true]) {
      const headers = header === undefined ? {} : { "Retry-After": header }
      const fake = stubFetch(() => broken ? new Response(new ReadableStream({ start(c) { c.error(new Error("interrupted")) } }), { status: 429, headers }) : json({ code: 429, msg: "slow", log_id: "trace" }, 429, headers))
      try {
        await assert.rejects(createBocha().execute(args, context()), (error) => {
          assert.equal(error.status, 429)
          assert.equal(error.retryAfter, expected)
          if (expected === undefined) assert.doesNotMatch(error.message, /retry after/)
          else assert.ok(error.message.includes(`retry after ${expected}`))
          return true
        })
      } finally { fake.restore() }
    }
  }
})

test("bocha: identical instances and different summary selections never share cached results", async () => {
  const fake = stubFetch(() => json(BOCHA_CASE.response))
  try {
    for (const summary of [true, false, false]) {
      const { search } = await WebSearch({}, { enable: ["bocha"], bocha: { summary } })
      const result = await search.bocha.execute(args, context())
      assert.equal(result[0].text, summary ? "Bocha generated summary" : "Bocha snippet")
      await search.bocha.execute({ ...args, query: " q\n" }, context())
    }
    assert.equal(fake.calls.length, 3)
  } finally { fake.restore() }
})

test("bocha: explicit options validate fields and override clamped or invalid environment values", async () => {
  for (const [field, values] of Object.entries({ maxResults: [0, 51, "6", 1.5], timeout: [-1, 2_147_483_648], cacheTTL: [-1, null], freshness: [1, null], summary: ["true", 1, null] })) {
    for (const value of values) assert.throws(() => createBocha({ [field]: value }), { name: "TypeError", message: new RegExp(`bocha\\.${field}`) })
  }
  const original = { ...process.env }
  const warn = console.warn
  const warnings = []
  console.warn = (...values) => warnings.push(values.join(" "))
  const fake = stubFetch(() => json(BOCHA_CASE.response))
  try {
    Object.assign(process.env, { BOCHA_RESULT_LIMIT: "99", BOCHA_FRESHNESS: "oneWeek", BOCHA_SUMMARY: " true ", BOCHA_CACHE_TTL: "0" })
    const env = createBocha()
    await env.execute(args, context())
    await env.execute(args, context())
    assert.equal(fake.calls.length, 2)
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", count: 50, summary: true, freshness: "oneWeek" })
    const explicit = createBocha({ resultLimit: 1, freshness: "", summary: false, cacheTTL: 600_000, timeout: 0 })
    assert.deepEqual(await explicit.execute(args, context()), BOCHA_CASE.expected.slice(0, 1))
    await explicit.execute(args, context())
    assert.equal(fake.calls.length, 3)
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", count: 1, summary: false })
    for (const summary of ["false", "", "TRUE"]) {
      Object.assign(process.env, { BOCHA_RESULT_LIMIT: "bad", BOCHA_SUMMARY: summary, BOCHA_TIMEOUT: "invalid" })
      await createBocha().execute(args, context())
      assert.deepEqual(fake.calls.at(-1).body, { query: "q", count: 10, summary: false, freshness: "oneWeek" })
    }
    assert.deepEqual(warnings, ["[magpie-websearch] BOCHA_SUMMARY is invalid; using false"])
  } finally { process.env = original; console.warn = warn; fake.restore() }
})

test("bocha: timeout and host abort cover both fetch and successful response consumption", async () => {
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (const phase of ["fetch", "body"]) {
      for (const timeout of [10, 0]) {
        const controller = new AbortController()
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
          const pending = createBocha({ timeout, cacheTTL: 0 }).execute(args, { abort: controller.signal })
          if (timeout === 0) { await reading; controller.abort() }
          await assert.rejects(pending, timeout === 0 ? /cancelled/ : /timed out after 10ms/)
          assert.equal(fake.calls[0].init.signal.aborted, true)
        } finally { fake.restore() }
      }
    }
  } finally { clearInterval(keepAlive) }
})
