import test from "node:test"
import assert from "node:assert/strict"
import { createTinyfish } from "../src/providers/tinyfish.mjs"
import { TINYFISH_CASE, TINYFISH_MCP_RESPONSE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

test("tinyfish: an empty or whitespace key calls anonymous MCP directly and maps results", async () => {
  const fake = stubFetch(() => json(TINYFISH_MCP_RESPONSE))
  try {
    for (const key of [undefined, "", " \t "]) {
      const api = createTinyfish({ cacheTTL: 0 })
      assert.equal(api.keyOptional, true)
      assert.deepEqual(await api.execute({ query: "  tinyfish   search ", key, count: 6 }, context()), TINYFISH_CASE.expected)
      const call = fake.calls.at(-1)
      assert.equal(call.url, "https://agent.tinyfish.ai/mcp")
      assert.equal(call.init.method, "POST")
      assert.equal(call.init.headers["X-TinyFish-Access-Mode"], "keyless")
      assert.equal(new Headers(call.init.headers).has("X-API-Key"), false)
      assert.equal(new Headers(call.init.headers).has("Authorization"), false)
      assert.deepEqual(call.body, {
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "search", arguments: { query: "tinyfish search", domain_type: "web" } },
      })
    }
    assert.equal(fake.calls.length, 3, "one request per search, without initialization")
  } finally { fake.restore() }
})

test("tinyfish: a key uses REST GET and safely encodes query characters without count or a body", async () => {
  const fake = stubFetch(() => json(TINYFISH_CASE.response))
  try {
    const query = "中文 & C++ #docs ?x=1 / 🐟"
    const api = createTinyfish()
    assert.deepEqual(await api.execute({ query, key: " key ", count: 2 }, context()), TINYFISH_CASE.expected.slice(0, 2))
    const call = fake.calls[0]
    const target = new URL(call.url)
    assert.equal(target.origin + target.pathname, "https://api.search.tinyfish.ai/")
    assert.deepEqual(Object.fromEntries(target.searchParams), { query, domain_type: "web" })
    assert.equal(call.init.method, "GET")
    assert.equal(call.init.headers["X-API-Key"], "key")
    assert.equal(new Headers(call.init.headers).has("X-TinyFish-Access-Mode"), false)
    assert.equal(new Headers(call.init.headers).has("Authorization"), false)
    assert.equal(call.init.body, undefined)
  } finally { fake.restore() }
})

test("tinyfish: structured content takes precedence and JSON text can follow non-JSON text parts", async () => {
  let result = { structuredContent: TINYFISH_CASE.response, content: [{ type: "text", text: "not JSON" }] }
  const fake = stubFetch(() => json({ jsonrpc: "2.0", id: 1, result }))
  try {
    const api = createTinyfish({ cacheTTL: 0 })
    assert.deepEqual(await api.execute({ query: "structured" }, context()), TINYFISH_CASE.expected)
    result = { content: [{ type: "text", text: "progress" }, ...TINYFISH_MCP_RESPONSE.result.content] }
    assert.deepEqual(await api.execute({ query: "text parts" }, context()), TINYFISH_CASE.expected)
  } finally { fake.restore() }
})

test("tinyfish: custom URLs are complete endpoints for either protocol", async () => {
  const fake = stubFetch(({ init }) => json(init.method === "GET" ? TINYFISH_CASE.response : TINYFISH_MCP_RESPONSE))
  try {
    const api = createTinyfish({ cacheTTL: 0 })
    for (const base of ["https://proxy.example", "https://proxy.example/custom/mcp/", "http://127.0.0.1:8000/proxy/v1/search"]) {
      for (const key of ["", "k"]) {
        await api.execute({ query: "custom", key, url: base }, context())
        const target = new URL(fake.calls.at(-1).url)
        target.search = ""
        assert.equal(target.href, new URL(base).href)
      }
    }
    const before = fake.calls.length
    for (const url of ["file:///search", "https://proxy.example/?token=x", "https://proxy.example/#x", "https://u:p@proxy.example", "not a URL"]) {
      await assert.rejects(api.execute({ query: "invalid", url }, context()), TypeError)
    }
    assert.equal(fake.calls.length, before)
  } finally { fake.restore() }
})

test("tinyfish: settings reach both protocols; local count caps follow filtering without pagination", async () => {
  const api = createTinyfish({ maxResults: 2, domainType: "news", location: "CN", language: "zh", includeDomains: "a.example,b.example", excludeDomains: "c.example" })
  const fake = stubFetch(({ init }) => json(init.method === "GET" ? TINYFISH_CASE.response : TINYFISH_MCP_RESPONSE))
  try {
    for (const key of ["", "k"]) {
      const pages = await api.execute({ query: "options", key, count: 6 }, context())
      assert.deepEqual(pages, TINYFISH_CASE.expected.slice(0, 2))
      const call = fake.calls.at(-1)
      const params = key ? Object.fromEntries(new URL(call.url).searchParams) : call.body.params.arguments
      assert.deepEqual(params, {
        query: "options", domain_type: "news", location: "CN", language: "zh",
        include_domains: "a.example,b.example", exclude_domains: "c.example",
      })
    }
    assert.equal(fake.calls.length, 2)
  } finally { fake.restore() }
})

test("tinyfish: research papers require a key at execution time, without anonymous fallback", async () => {
  const api = createTinyfish({ domainType: "research_paper" })
  const fake = stubFetch(() => json(TINYFISH_CASE.response))
  try {
    await assert.rejects(api.execute({ query: "paper" }, context()), /research_paper.*needs a key/)
    assert.equal(fake.calls.length, 0)
    await api.execute({ query: "paper", key: "k" }, context())
    assert.equal(new URL(fake.calls[0].url).searchParams.get("domain_type"), "research_paper")
  } finally { fake.restore() }
})

test("tinyfish: validates options and query length before fetching", async () => {
  for (const options of [{ maxResults: 0 }, { timeout: 2_147_483_648 }, { language: 1 }, { domainType: "images" }]) {
    assert.throws(() => createTinyfish(options), TypeError)
  }
  const fake = stubFetch(() => json(TINYFISH_MCP_RESPONSE))
  try {
    const api = createTinyfish()
    for (const query of [" ", "x".repeat(2001)]) await assert.rejects(api.execute({ query }, context()), /1–2000/)
    assert.equal(fake.calls.length, 0)
  } finally { fake.restore() }
})

test("tinyfish: environment fallback is captured per instance and explicit options win", async () => {
  const saved = { ...process.env }
  const fake = stubFetch(() => json(TINYFISH_CASE.response))
  try {
    process.env.TINYFISH_DOMAIN_TYPE = "news"
    process.env.TINYFISH_LANGUAGE = "fr"
    process.env.TINYFISH_LOCATION = "FR"
    process.env.TINYFISH_MAX_RESULTS = "1"
    const first = createTinyfish()
    const second = createTinyfish({ domainType: "web", language: "zh", location: "", maxResults: 2 })
    process.env.TINYFISH_LANGUAGE = "en"
    assert.equal((await first.execute({ query: "env", key: "k" }, context())).length, 1)
    assert.equal((await second.execute({ query: "env", key: "k" }, context())).length, 2)
    assert.equal(new URL(fake.calls[0].url).searchParams.get("language"), "fr")
    assert.equal(new URL(fake.calls[0].url).searchParams.get("location"), "FR")
    assert.equal(new URL(fake.calls[1].url).searchParams.get("language"), "zh")
    assert.equal(new URL(fake.calls[1].url).searchParams.has("location"), false)
  } finally {
    for (const name of ["TINYFISH_DOMAIN_TYPE", "TINYFISH_LANGUAGE", "TINYFISH_LOCATION", "TINYFISH_MAX_RESULTS"]) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    fake.restore()
  }
})

test("tinyfish: malformed search payloads fail without caching; explicit empty results are accepted", async () => {
  let response
  const api = createTinyfish()
  const fake = stubFetch(() => json(response))
  try {
    for (const key of ["", "k"]) {
      for (const bad of [null, {}, { results: null }, { results: {} }]) {
        response = key ? bad : { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(bad) }] } }
        await assert.rejects(api.execute({ query: "bad", key }, context()), /expected results array/)
      }
      response = key ? { results: [] } : { jsonrpc: "2.0", id: 1, result: { structuredContent: { results: [] } } }
      assert.deepEqual(await api.execute({ query: "bad", key }, context()), [])
    }
    assert.equal(fake.calls.length, 10)
  } finally { fake.restore() }
})

test("tinyfish: separate instances own settings and caches, and anonymous counts are isolated", async () => {
  const first = createTinyfish()
  const second = createTinyfish()
  const third = createTinyfish({ language: "ja", maxResults: 1 })
  const fake = stubFetch(() => json(TINYFISH_MCP_RESPONSE))
  try {
    const args = { query: "instance cache", count: 1 }
    assert.equal((await first.execute(args, context())).length, 1)
    assert.equal((await first.execute({ ...args, query: "  instance   cache  " }, context())).length, 1)
    assert.equal(fake.calls.length, 1)
    assert.equal((await first.execute({ ...args, count: 6 }, context())).length, 3)
    assert.equal((await second.execute(args, context())).length, 1)
    assert.equal((await third.execute({ ...args, count: 6 }, context())).length, 1)
    assert.equal(fake.calls.length, 4)
    assert.equal(fake.calls[0].body.params.arguments.language, undefined)
    assert.equal(fake.calls[3].body.params.arguments.language, "ja")
  } finally { fake.restore() }
})

test("tinyfish: HTTP refusals retain numeric status and never switch a configured key to MCP", async () => {
  for (const status of [400, 401, 402, 403, 404, 429, 500, 503]) {
    const fake = stubFetch(() => text("upstream refusal", status, { "Retry-After": "30" }))
    try {
      await assert.rejects(createTinyfish().execute({ query: "refusal", key: "invalid" }, context()), (e) => {
        assert.equal(e.status, status)
        if (status === 429) assert.equal(e.retryAfter, "30")
        return true
      })
      assert.equal(fake.calls.length, 1)
      assert.equal(fake.calls[0].init.method, "GET")
    } finally { fake.restore() }
  }
})
