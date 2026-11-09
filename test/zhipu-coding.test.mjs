import test from "node:test"
import assert from "node:assert/strict"
import { createZaiCoding } from "../src/providers/zai-coding.mjs"
import { createZhipuCoding } from "../src/providers/zhipu-coding.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const schema = {
  type: "object",
  properties: {
    search_query: { type: "string" }, count: { type: "integer" },
    search_recency_filter: { type: "string" }, search_domain_filter: { type: "string" },
    content_size: { type: "string" },
  },
}
const rows = [
  { title: "No URL", content: "drop" },
  { title: "First", link: "https://example.com/1", content: "中文🐟abcdef", publish_date: "2026-11-06" },
  { title: "", url: "https://example.com/2", snippet: "second" },
]

function codingFake({ toolName = "web_search_prime", inputSchema = schema, result, onCall, status } = {}) {
  return stubFetch((call) => {
    if (call.init.method === "DELETE") return new Response(null, { status: 204 })
    if (call.body.method === "initialize") {
      return json({ jsonrpc: "2.0", id: call.body.id, result: { protocolVersion: "2024-11-05" } }, 200, { "Mcp-Session-Id": "session-secret" })
    }
    if (call.body.method === "notifications/initialized") return new Response(null, { status: 202 })
    if (call.body.method === "tools/list") {
      return json({ jsonrpc: "2.0", id: call.body.id, result: { tools: [{ name: toolName, inputSchema }] } })
    }
    if (call.body.method === "tools/call") {
      onCall?.(call)
      if (status) return text("private refusal", status, { "Retry-After": "0007" })
      return json({ jsonrpc: "2.0", id: call.body.id, result: result ?? { content: [{ type: "text", text: JSON.stringify(rows) }] } })
    }
    throw new Error("unexpected request")
  })
}

test("coding providers: metadata and domestic/international defaults stay independent", async () => {
  const cn = createZhipuCoding()
  const intl = createZaiCoding()
  assert.equal(cn.name, "Zhipu Coding Plan (magpie-websearch)")
  assert.equal(intl.name, "Z.ai Coding Plan (magpie-websearch)")
  assert.equal(cn.keyOptional, false)
  assert.equal(intl.keyOptional, false)
  assert.match(cn.keysURL, /bigmodel\.cn/)
  assert.match(intl.keysURL, /z\.ai/)

  for (const [provider, expected] of [
    [cn, "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp"],
    [intl, "https://api.z.ai/api/mcp/web_search_prime/mcp"],
  ]) {
    const fake = codingFake()
    try {
      await provider.execute({ query: "default", count: 1, key: " site-key " }, context())
      assert.equal(fake.calls[0].url, expected)
      assert.equal(fake.calls.every((call) => call.init.headers.Authorization === "Bearer site-key"), true)
    } finally { fake.restore() }
  }
})

test("coding providers: normalize input, discover the preferred tool, map/filter/cap and cache", async () => {
  const provider = createZhipuCoding({ contentChars: 4 })
  const fake = codingFake({ onCall(call) {
    assert.deepEqual(call.body.params.arguments, { search_query: "hello 世界", count: 2 })
    assert.equal(call.body.params.name, "web_search_prime")
  } })
  try {
    const request = { query: "  hello   世界 ", count: 2, key: "key", url: "https://custom.example/mcp" }
    const pages = await provider.execute(request, context())
    assert.deepEqual(pages, [
      { title: "First", url: "https://example.com/1", text: "中文🐟a…", age: "2026-11-06" },
      { title: "https://example.com/2", url: "https://example.com/2", text: "seco…" },
    ])
    assert.equal(fake.calls.length, 5)
    assert.deepEqual(await provider.execute(request, context()), pages)
    assert.equal(fake.calls.length, 5, "result cache avoids a second MCP session")
  } finally { fake.restore() }
})

test("coding providers: accept camelCase tool names, structured content and double-encoded text", async () => {
  for (const [result, expected] of [
    [{ structuredContent: { search_result: rows } }, 2],
    [{ content: [{ type: "text", text: JSON.stringify(JSON.stringify({ results: rows })) }] }, 2],
    [{ structuredContent: JSON.stringify(JSON.stringify(JSON.stringify({ search_result: rows }))) }, 2],
    [{ content: [{ type: "text", text: JSON.stringify(JSON.stringify(JSON.stringify({ search_result: rows }))) }] }, 2],
  ]) {
    const provider = createZaiCoding({ cacheTTL: 0 })
    const fake = codingFake({ toolName: "webSearchPrime", result })
    try {
      const pages = await provider.execute({ query: "parse", count: 2, key: "key" }, context())
      assert.equal(pages.length, expected)
      assert.equal(fake.calls.find((call) => call.body?.method === "tools/call").body.params.name, "webSearchPrime")
    } finally { fake.restore() }
  }
})

test("coding providers: schema controls count and configured optional fields", async () => {
  const provider = createZhipuCoding({
    recency: "oneWeek", domainFilter: "example.com", contentSize: "high", resultLimit: 2, cacheTTL: 0,
  })
  let fake = codingFake({ onCall(call) {
    assert.deepEqual(call.body.params.arguments, {
      search_query: "filters", count: 2, search_recency_filter: "oneWeek",
      search_domain_filter: "example.com", content_size: "high",
    })
  } })
  try { assert.equal((await provider.execute({ query: "filters", count: 20, key: "key" }, context())).length, 2) } finally { fake.restore() }

  const noCount = createZaiCoding({ cacheTTL: 0 })
  fake = codingFake({ inputSchema: { type: "object", properties: { search_query: { type: "string" } } }, onCall(call) {
    assert.deepEqual(call.body.params.arguments, { search_query: "local cap" })
  } })
  try { assert.equal((await noCount.execute({ query: "local cap", count: 1, key: "key" }, context())).length, 1) } finally { fake.restore() }

  const unsupported = createZhipuCoding({ domainFilter: "example.com", cacheTTL: 0 })
  fake = codingFake({ inputSchema: { type: "object", properties: { search_query: {} } } })
  try {
    await assert.rejects(unsupported.execute({ query: "unsupported", key: "key" }, context()), /zhipu-coding\.domainFilter.*not supported/)
    assert.equal(fake.calls.some((call) => call.body?.method === "tools/call"), false)
  } finally { fake.restore() }
})

test("coding providers: missing credentials, blank queries and absent tools never call search", async () => {
  for (const [request, pattern] of [
    [{ query: "test", key: " " }, /needs a Coding Plan key/],
    [{ query: "  ", key: "key" }, /must not be empty/],
  ]) {
    const fake = stubFetch(() => { throw new Error("must not fetch") })
    try {
      await assert.rejects(createZhipuCoding().execute(request, context()), pattern)
      assert.equal(fake.calls.length, 0)
    } finally { fake.restore() }
  }
  const fake = codingFake({ toolName: "webReader" })
  try {
    await assert.rejects(createZhipuCoding().execute({ query: "test", key: "key" }, context()), /did not publish/)
    assert.equal(fake.calls.some((call) => call.body?.method === "tools/call"), false)
  } finally { fake.restore() }
})

test("coding providers: malformed payloads do not cache and HTTP refusals retain status", async () => {
  const provider = createZhipuCoding()
  let fake = codingFake({ result: { content: [{ type: "text", text: "not-json" }] } })
  try {
    for (let i = 0; i < 2; i++) {
      await assert.rejects(provider.execute({ query: "bad", key: "key" }, context()), /expected results array/)
    }
    assert.equal(fake.calls.filter((call) => call.body?.method === "tools/call").length, 2)
  } finally { fake.restore() }

  fake = codingFake({ status: 429 })
  try {
    await assert.rejects(provider.execute({ query: "refused", key: "key" }, context()), (error) => {
      assert.equal(error.status, 429)
      assert.equal(error.retryAfter, "7")
      assert.doesNotMatch(error.message, /private refusal|key|session-secret/)
      return true
    })
  } finally { fake.restore() }
})

test("coding providers: valid empty results cache but unusable nonempty payloads fail", async () => {
  const empty = createZhipuCoding()
  let fake = codingFake({ result: { structuredContent: { results: [] } } })
  try {
    const request = { query: "empty", key: "key" }
    assert.deepEqual(await empty.execute(request, context()), [])
    assert.deepEqual(await empty.execute(request, context()), [])
    assert.equal(fake.calls.filter((call) => call.body?.method === "tools/call").length, 1)
  } finally { fake.restore() }

  const unusable = createZaiCoding()
  fake = codingFake({ result: { structuredContent: { results: [{ title: "missing URL" }] } } })
  try {
    await assert.rejects(unusable.execute({ query: "unusable", key: "key" }, context()), /no usable search results/)
  } finally { fake.restore() }
})

test("coding providers: oversized MCP responses cancel, clean up sessions and never cache", { timeout: 10_000 }, async () => {
  for (const create of [createZhipuCoding, createZaiCoding]) {
    const provider = create()
    const fake = codingFake()
    const original = globalThis.fetch
    let cancelled = 0
    const block = new TextEncoder().encode("private ".repeat(128 * 1024))
    globalThis.fetch = async (input, init) => {
      const response = await original(input, init)
      if (JSON.parse(init.body ?? "null")?.method !== "tools/call") return response
      let chunks = 0
      return new Response(new ReadableStream({
        pull(controller) {
          // Leave queued data after the limit so this checks cancellation of
          // an open stream, rather than a stream that already closed itself.
          if (chunks++ === 12) controller.close()
          else controller.enqueue(block)
        },
        cancel() { cancelled++ },
      }))
    }
    try {
      for (let i = 0; i < 2; i++) {
        await assert.rejects(provider.execute({ query: "oversized", key: "key" }, context()), error => {
          assert.match(error.message, /10485760-byte limit/)
          assert.doesNotMatch(error.message, /private|session-secret/)
          assert.equal(error.status, undefined)
          return true
        })
      }
      assert.equal(cancelled, 2)
      assert.equal(fake.calls.filter(call => call.body?.method === "tools/call").length, 2)
      assert.equal(fake.calls.filter(call => call.init.method === "DELETE").length, 2)
    } finally { globalThis.fetch = original; fake.restore() }
  }
})

test("coding providers: cache identity isolates key, endpoint, count, parameters and site", async () => {
  const cn = createZhipuCoding()
  const intl = createZaiCoding()
  const fake = codingFake()
  try {
    const base = { query: "identity", count: 1, key: "a", url: "https://custom.example/mcp" }
    await cn.execute(base, context())
    await cn.execute({ ...base, key: "b" }, context())
    await cn.execute({ ...base, count: 2 }, context())
    await cn.execute({ ...base, url: "https://other.example/mcp" }, context())
    await intl.execute(base, context())
    assert.equal(fake.calls.filter((call) => call.body?.method === "tools/call").length, 5)
  } finally { fake.restore() }
})

test("coding providers: validate multi-part configuration names and disabled providers stay lazy", async () => {
  for (const [factory, field, value, pattern] of [
    [createZhipuCoding, "resultLimit", 0, /zhipu-coding\.resultLimit/],
    [createZaiCoding, "timeout", -1, /zai-coding\.timeout/],
    [createZhipuCoding, "cacheTTL", -1, /zhipu-coding\.cacheTTL/],
    [createZaiCoding, "contentChars", -1, /zai-coding\.contentChars/],
    [createZhipuCoding, "recency", "invalid", /zhipu-coding\.recency/],
    [createZaiCoding, "domainFilter", [], /zai-coding\.domainFilter/],
    [createZhipuCoding, "contentSize", "full", /zhipu-coding\.contentSize/],
  ]) assert.throws(() => factory({ [field]: value }), pattern)
})
