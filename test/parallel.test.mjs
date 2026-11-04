import test from "node:test"
import assert from "node:assert/strict"
import { createParallel } from "../src/providers/parallel.mjs"
import { PARALLEL_CASE, PARALLEL_MCP_RESPONSE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

test("parallel: an empty or whitespace key calls anonymous MCP directly and maps results", async () => {
  const fake = stubFetch(() => json(PARALLEL_MCP_RESPONSE))
  try {
    for (const key of [undefined, "", " \t "]) {
      const api = createParallel({ cacheTTL: 0 })
      assert.equal(api.keyOptional, true)
      assert.deepEqual(await api.execute({ query: "  parallel   search ", key, count: 6 }, context()), PARALLEL_CASE.expected)
      const call = fake.calls.at(-1)
      assert.equal(call.url, "https://mcp.parallel.ai/mcp")
      assert.equal(call.init.method, "POST")
      assert.equal(new Headers(call.init.headers).has("x-api-key"), false)
      assert.equal(new Headers(call.init.headers).has("Authorization"), false)
      assert.equal(new Headers(call.init.headers).has("X-TinyFish-Access-Mode"), false)
      assert.deepEqual(call.body, {
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "web_search", arguments: { objective: "parallel search", search_queries: ["parallel search"] } },
      })
    }
    assert.equal(fake.calls.length, 3, "one request per search, without initialization")
  } finally { fake.restore() }
})

test("parallel: a key uses GA REST POST with x-api-key and nested advanced_settings", async () => {
  const fake = stubFetch(() => json(PARALLEL_CASE.response))
  try {
    const query = "Parallel AI search"
    const api = createParallel()
    assert.deepEqual(await api.execute({ query, key: " key ", count: 2 }, context()), PARALLEL_CASE.expected.slice(0, 2))
    const call = fake.calls[0]
    assert.equal(call.url, "https://api.parallel.ai/v1/search")
    assert.equal(call.init.method, "POST")
    assert.equal(call.init.headers["x-api-key"], "key")
    assert.equal(new Headers(call.init.headers).has("Authorization"), false)
    assert.deepEqual(call.body, {
      objective: query,
      search_queries: [query],
      mode: "fast",
      advanced_settings: {
        max_results: 2,
        excerpt_settings: { max_chars_per_result: 4000 },
      },
    })
  } finally { fake.restore() }
})

test("parallel: structured content takes precedence and JSON text can follow non-JSON text parts in MCP", async () => {
  let result = { structuredContent: PARALLEL_CASE.response, content: [{ type: "text", text: "not JSON" }] }
  const fake = stubFetch(() => json({ jsonrpc: "2.0", id: 1, result }))
  try {
    const api = createParallel({ cacheTTL: 0 })
    assert.deepEqual(await api.execute({ query: "structured" }, context()), PARALLEL_CASE.expected)
    result = { content: [{ type: "text", text: "progress" }, { type: "text", text: JSON.stringify(PARALLEL_CASE.response) }] }
    assert.deepEqual(await api.execute({ query: "text parts" }, context()), PARALLEL_CASE.expected)
  } finally { fake.restore() }
})

test("parallel: cuts content to contentChars and contentChars 0 keeps all returned text", async () => {
  const longExcerpt = "p".repeat(4001)
  const response = {
    results: [
      { url: "https://example.com/trimmed", title: "Trimmed", excerpts: [longExcerpt] },
      { url: "https://example.com/multi", title: "Multi", excerpts: ["part 1", "part 2"] },
    ],
  }
  const fake = stubFetch(() => json(response))
  try {
    const defaultApi = createParallel({ cacheTTL: 0 })
    const trimmed = await defaultApi.execute({ query: "trim test", key: "k" }, context())
    assert.equal(trimmed[0].text.length, 4001)
    assert.ok(trimmed[0].text.endsWith("…"))
    assert.equal(trimmed[1].text, "part 1\n\npart 2")

    const keepAll = createParallel({ contentChars: 0, cacheTTL: 0 })
    const full = await keepAll.execute({ query: "full test", key: "k" }, context())
    assert.equal(full[0].text.length, 4001)
    assert.equal(full[0].text, longExcerpt)
    // contentChars: 0 omits excerpt_settings from upstream request
    assert.equal(fake.calls[1].body.advanced_settings.excerpt_settings, undefined)
  } finally { fake.restore() }
})

test("parallel: validates query length (1–200 code points) before fetching", async () => {
  const fake = stubFetch(() => json(PARALLEL_CASE.response))
  try {
    const api = createParallel()
    for (const query of ["", "   ", "x".repeat(201)]) {
      await assert.rejects(api.execute({ query, key: "k" }, context()), /1–200/)
    }
    assert.equal(fake.calls.length, 0)
    // 200 code points succeeds (including multibyte emoji/Chinese)
    const valid200 = "🔍".repeat(100) + "测试".repeat(50)
    assert.equal([...valid200].length, 200)
    await api.execute({ query: valid200, key: "k" }, context())
    assert.equal(fake.calls.length, 1)
  } finally { fake.restore() }
})

test("parallel: anonymous MCP requires mode fast; other modes fail before fetching", async () => {
  const fake = stubFetch(() => json(PARALLEL_CASE.response))
  try {
    for (const mode of ["turbo", "basic", "advanced"]) {
      const before = fake.calls.length
      const api = createParallel({ mode })
      await assert.rejects(api.execute({ query: "mode test" }, context()), (err) => {
        assert.match(err.message, new RegExp(`Parallel ${mode} search needs a key`))
        return true
      })
      assert.equal(fake.calls.length, before)
      // With a key, the same instance uses that mode on REST
      await api.execute({ query: "mode test", key: "k" }, context())
      assert.equal(fake.calls.at(-1).body.mode, mode)
    }
  } finally { fake.restore() }
})

test("parallel: custom URLs use the exact endpoint as given for either mode", async () => {
  const fake = stubFetch(({ init }) => json(init.method === "POST" && init.headers?.["x-api-key"] ? PARALLEL_CASE.response : PARALLEL_MCP_RESPONSE))
  try {
    const api = createParallel({ cacheTTL: 0 })
    // REST uses exact custom endpoint
    await api.execute({ query: "custom", key: "k", url: "https://proxy.example/custom/search" }, context())
    assert.equal(fake.calls[0].url, "https://proxy.example/custom/search")

    // Anonymous MCP uses exact custom endpoint
    await api.execute({ query: "custom", key: "", url: "https://proxy.example/custom/mcp" }, context())
    assert.equal(fake.calls[1].url, "https://proxy.example/custom/mcp")

    const before = fake.calls.length
    for (const bad of ["file:///search", "https://proxy.example/?token=x", "https://proxy.example/#x", "https://u:p@proxy.example", "not a URL"]) {
      await assert.rejects(api.execute({ query: "invalid", key: "k", url: bad }, context()), TypeError)
      await assert.rejects(api.execute({ query: "invalid", key: "", url: bad }, context()), TypeError)
    }
    assert.equal(fake.calls.length, before)
  } finally { fake.restore() }
})

test("parallel: validates options and respects environment fallback", async () => {
  for (const options of [{ maxResults: 0 }, { maxResults: 21 }, { timeout: -1 }, { timeout: 2_147_483_648 }, { mode: "unknown" }]) {
    assert.throws(() => createParallel(options), TypeError)
  }
  const saved = { ...process.env }
  const fake = stubFetch(() => json(PARALLEL_CASE.response))
  try {
    process.env.PARALLEL_MODE = "basic"
    process.env.PARALLEL_MAX_RESULTS = "5"
    process.env.PARALLEL_CONTENT_CHARS = "500"
    const first = createParallel()
    const second = createParallel({ mode: "turbo", maxResults: 3, contentChars: 200 })
    await first.execute({ query: "env test", key: "k" }, context())
    await second.execute({ query: "env test", key: "k" }, context())
    assert.equal(fake.calls[0].body.mode, "basic")
    assert.equal(fake.calls[0].body.advanced_settings.max_results, 5)
    assert.equal(fake.calls[0].body.advanced_settings.excerpt_settings.max_chars_per_result, 500)
    assert.equal(fake.calls[1].body.mode, "turbo")
    assert.equal(fake.calls[1].body.advanced_settings.max_results, 3)
    assert.equal(fake.calls[1].body.advanced_settings.excerpt_settings.max_chars_per_result, 200)
  } finally {
    for (const name of ["PARALLEL_MODE", "PARALLEL_MAX_RESULTS", "PARALLEL_CONTENT_CHARS"]) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    fake.restore()
  }
})

test("parallel: malformed search payloads fail without caching; empty results are accepted", async () => {
  let response
  const api = createParallel()
  const fake = stubFetch(() => json(response))
  try {
    for (const key of ["", "k"]) {
      for (const bad of [null, {}, { results: null }, { results: {} }]) {
        response = key ? bad : { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(bad) }] } }
        await assert.rejects(api.execute({ query: "bad", key }, context()), /expected results array/)
      }
      response = key ? { results: [] } : { jsonrpc: "2.0", id: 1, result: { structuredContent: { results: [] } } }
      assert.deepEqual(await api.execute({ query: "empty", key }, context()), [])
    }
    assert.equal(fake.calls.length, 10)
  } finally { fake.restore() }
})

test("parallel: separate instances own settings and caches, and anonymous counts are isolated", async () => {
  const first = createParallel()
  const second = createParallel()
  const third = createParallel({ maxResults: 1 })
  const fake = stubFetch(() => json(PARALLEL_MCP_RESPONSE))
  try {
    const args = { query: "instance cache", count: 1 }
    assert.equal((await first.execute(args, context())).length, 1)
    assert.equal((await first.execute({ ...args, query: "  instance   cache  " }, context())).length, 1)
    assert.equal(fake.calls.length, 1)
    assert.equal((await first.execute({ ...args, count: 6 }, context())).length, 3)
    assert.equal((await second.execute(args, context())).length, 1)
    assert.equal((await third.execute({ ...args, count: 6 }, context())).length, 1)
    assert.equal(fake.calls.length, 4)
  } finally { fake.restore() }
})

test("parallel: HTTP refusals retain numeric status and never switch a configured key to MCP", async () => {
  for (const status of [400, 401, 402, 403, 404, 422, 429, 500, 503]) {
    const fake = stubFetch(() => text("upstream refusal", status, { "Retry-After": "30" }))
    try {
      await assert.rejects(createParallel().execute({ query: "refusal", key: "invalid" }, context()), (e) => {
        assert.equal(e.status, status)
        if (status === 429) assert.equal(e.retryAfter, "30")
        return true
      })
      assert.equal(fake.calls.length, 1)
      assert.equal(fake.calls[0].url, "https://api.parallel.ai/v1/search")
      assert.equal(fake.calls[0].init.method, "POST")
    } finally { fake.restore() }
  }
})
