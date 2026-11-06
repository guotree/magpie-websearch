import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { resolveEndpoint } from "../src/core.mjs"
import { context, json, stubFetch } from "./harness.mjs"
import { ANYSEARCH_CASE, BOCHA_CASE, JINA_CASE, KAGI_CASE, KEENABLE_CASE, LINKUP_CASE, METASO_CASE, MOONSHOT_CASE, MOONSHOT_CN_CASE, OLLAMA_CASE, PARALLEL_CASE, PERPLEXITY_CASE, QUERIT_CASE, SERPAPI_CASE, SERPER_CASE, STEPFUN_CASE, TINYFISH_CASE, ZAI_CASE, ZHIPU_CASE } from "./cases.mjs"

const fixtures = { anysearch: ANYSEARCH_CASE, bocha: BOCHA_CASE, jina: JINA_CASE, kagi: KAGI_CASE, keenable: KEENABLE_CASE, linkup: LINKUP_CASE, metaso: METASO_CASE, moonshot: MOONSHOT_CASE, "moonshot-cn": MOONSHOT_CN_CASE, ollama: OLLAMA_CASE, parallel: PARALLEL_CASE, perplexity: PERPLEXITY_CASE, querit: QUERIT_CASE, serpapi: SERPAPI_CASE, serper: SERPER_CASE, stepfun: STEPFUN_CASE, tinyfish: TINYFISH_CASE, zai: ZAI_CASE, zhipu: ZHIPU_CASE }

const resultPaths = {
  anysearch: ["data", "results"], bocha: ["data", "webPages", "value"], jina: ["data"], kagi: ["data", "search"],
  keenable: ["results"], linkup: ["results"], metaso: ["webpages"], moonshot: ["search_results"], "moonshot-cn": ["search_results"],
  ollama: ["results"], parallel: ["results"], perplexity: ["results"], querit: ["results", "result"],
  serpapi: ["organic_results"], serper: ["organic"], stepfun: ["results"], tinyfish: ["results"], zai: ["search_result"], zhipu: ["search_result"],
}

const countFields = {
  anysearch: "max_results", bocha: "count", jina: "num", kagi: "limit", keenable: "max_results", linkup: "maxResults",
  metaso: "size", moonshot: "limit", "moonshot-cn": "limit", ollama: "max_results", perplexity: "max_results",
  querit: "count", stepfun: "n", zai: "count", zhipu: "count",
}

function assertRequestedCount(id, call, count) {
  if (countFields[id]) assert.equal(call.body[countFields[id]], count, `${id}: upstream count`)
  else if (id === "parallel") assert.equal(call.body.advanced_settings.max_results, count)
  else if (id === "serper") assert.equal(call.body.num, 10, "Serper keeps its fixed page size")
  else assert.equal(new URL(call.url).searchParams.has("count"), false, `${id}: no invented upstream count`)
}

function manyResults(id) {
  const response = structuredClone(fixtures[id].response)
  const path = resultPaths[id]
  const parent = path.slice(0, -1).reduce((value, key) => value[key], response)
  const field = path.at(-1)
  const example = parent[field].find((row) => row && (row.url || row.link) && row.type !== "image")
  parent[field] = [{ title: "No URL" }, ...Array.from({ length: 25 }, (_, i) => ({
    ...example,
    ...(example.url ? { url: `https://example.com/${id}/${i}` } : {}),
    ...(example.link ? { link: `https://example.com/${id}/${i}` } : {}),
  }))]
  return response
}

test("all APIs follow host count unless an explicit limit or provider maximum applies", async () => {
  const saved = { ...process.env }
  const maxima = { anysearch: 10, ollama: 10, serpapi: 10, serper: 10, jina: 20, moonshot: 20, "moonshot-cn": 20, parallel: 20, perplexity: 20, stepfun: 20 }
  const fake = stubFetch((call) => json(manyResults(new URL(call.url).pathname.slice(1))))
  try {
    for (const id of Object.keys(fixtures)) {
      const env = id.toUpperCase().replaceAll("-", "_") + "_RESULT_LIMIT"
      const field = "resultLimit"
      delete process.env[env]
      const { search } = await WebSearch({}, { enable: [id] })
      const args = { query: "host count", key: "k", url: `https://local.example/${id}` }
      for (const count of [1, 6, 12, 20]) {
        const before = fake.calls.length
        const pages = await search[id].execute({ ...args, query: `host count ${count}`, count }, context())
        assert.equal(pages.length, Math.min(count, maxima[id] ?? 25), `${id}, count=${count}`)
        assert.equal(fake.calls.length, before + 1, "one request, without pagination")
        assertRequestedCount(id, fake.calls.at(-1), Math.min(count, maxima[id] ?? count))
      }
      const fallback = id === "ollama" ? 5 : id === "querit" ? 8 : 10
      assert.equal((await search[id].execute(args, context())).length, fallback, `${id}: missing count keeps its old fallback`)
      process.env[env] = "7"
      const fromEnv = await WebSearch({}, { enable: [id] })
      assert.equal((await fromEnv.search[id].execute({ ...args, count: 20 }, context())).length, 7, `${id}: explicit env cap`)
      assertRequestedCount(id, fake.calls.at(-1), 7)
      const explicit = await WebSearch({}, { enable: [id], [id]: { [field]: 3 } })
      assert.equal((await explicit.search[id].execute({ ...args, count: 20 }, context())).length, 3, `${id}: options override env`)
      assertRequestedCount(id, fake.calls.at(-1), 3)
      await assert.rejects(WebSearch({}, { enable: [id], [id]: { resultLimit: "3" } }), new RegExp(`${id}\\.resultLimit`))
      delete process.env[env]
    }
  } finally { process.env = saved; fake.restore() }
})

test("anonymous MCP follows larger host counts without inventing upstream count parameters", async () => {
  for (const id of ["parallel", "tinyfish"]) {
    const { search } = await WebSearch({}, { enable: [id] })
    const fake = stubFetch(() => json({ jsonrpc: "2.0", id: 1, result: { structuredContent: manyResults(id) } }))
    try {
      for (const count of [20, 6]) {
        assert.equal((await search[id].execute({ query: "anonymous count", count }, context())).length, count)
        const args = fake.calls.at(-1).body.params.arguments
        assert.equal(Object.hasOwn(args, "count"), false)
        assert.equal(Object.hasOwn(args, "max_results"), false)
      }
      assert.equal(fake.calls.length, 2, `${id}: one request per count, no handshake or pagination`)
    } finally { fake.restore() }
  }
})

test("Coding Plan MCP providers follow host counts through a complete session", async () => {
  const saved = { ...process.env }
  const sessions = new Set()
  let sessionNumber = 0
  const fake = stubFetch((call) => {
    if (call.init.method === "DELETE") {
      sessions.delete(call.init.headers["Mcp-Session-Id"])
      return new Response(null, { status: 204 })
    }
    if (call.body.method === "initialize") {
      const session = `contract-${++sessionNumber}`
      sessions.add(session)
      return json({ jsonrpc: "2.0", id: call.body.id, result: { protocolVersion: "2024-11-05" } }, 200, { "Mcp-Session-Id": session })
    }
    assert.ok(sessions.has(call.init.headers["Mcp-Session-Id"]), "session header is returned")
    if (call.body.method === "notifications/initialized") return new Response(null, { status: 202 })
    if (call.body.method === "tools/list") return json({
      jsonrpc: "2.0", id: call.body.id, result: { tools: [{
        name: "web_search_prime", inputSchema: { type: "object", properties: { search_query: {}, count: {} } },
      }] },
    })
    if (call.body.method === "tools/call") return json({
      jsonrpc: "2.0", id: call.body.id, result: { structuredContent: { results: Array.from({ length: 25 }, (_, i) => ({
        title: `Coding ${i}`, link: `https://example.com/coding/${i}`, content: "result",
      })) } },
    })
    throw new Error("unexpected request")
  })
  try {
    for (const id of ["zhipu-coding", "zai-coding"]) {
      const env = id.toUpperCase().replaceAll("-", "_") + "_RESULT_LIMIT"
      delete process.env[env]
      let hooks = await WebSearch({}, { enable: [id], [id]: { cacheTTL: 0 } })
      const args = { query: "coding contract", key: id + "-key", url: `https://local.example/${id}/mcp` }
      for (const count of [1, 6, 12, 20]) {
        const before = fake.calls.length
        const pages = await hooks.search[id].execute({ ...args, query: `coding ${count}`, count }, context())
        assert.equal(pages.length, count)
        assert.equal(fake.calls.length, before + 5, "one complete session per cache miss")
        assert.equal(fake.calls.at(-2).body.params.arguments.count, count)
        assert.equal(fake.calls.at(-2).url, `https://local.example/${id}/mcp`)
      }
      assert.equal((await hooks.search[id].execute(args, context())).length, 10)
      process.env[env] = "7"
      hooks = await WebSearch({}, { enable: [id], [id]: { cacheTTL: 0 } })
      assert.equal((await hooks.search[id].execute({ ...args, count: 20 }, context())).length, 7)
      assert.equal(fake.calls.at(-2).body.params.arguments.count, 7)
      hooks = await WebSearch({}, { enable: [id], [id]: { resultLimit: 3, cacheTTL: 0 } })
      assert.equal((await hooks.search[id].execute({ ...args, count: 20 }, context())).length, 3)
      assert.equal(fake.calls.at(-2).body.params.arguments.count, 3)
      delete process.env[env]
    }
    assert.equal(sessions.size, 0, "all sessions are deleted")
  } finally {
    process.env = saved
    fake.restore()
  }
})

test("changing host count never reuses a previously truncated TinyFish result", async () => {
  const { search } = await WebSearch({}, { enable: ["tinyfish"] })
  const fake = stubFetch(() => json(manyResults("tinyfish")))
  const args = { query: "same query", key: "k" }
  try {
    for (const count of [6, 20, 6]) assert.equal((await search.tinyfish.execute({ ...args, count }, context())).length, count)
    assert.equal(fake.calls.length, 2)
    assert.equal(new URL(fake.calls[0].url).searchParams.has("count"), false)
  } finally { fake.restore() }
})

test("custom Base URL uses the exact endpoint as given and validates HTTP(S)", () => {
  for (const [base, want] of [
    ["https://custom.example", "https://custom.example/"],
    ["https://custom.example/proxy", "https://custom.example/proxy"],
    ["https://custom.example/proxy/v1/", "https://custom.example/proxy/v1/"],
    ["http://127.0.0.1:8080/search", "http://127.0.0.1:8080/search"],
    [undefined, "https://default.example/search"],
    ["", "https://default.example/search"],
  ]) assert.equal(resolveEndpoint(base, "https://default.example/search"), want)
  for (const base of ["file:///tmp/search", "https://custom.example?token=x", "https://user@custom.example"]) {
    assert.throws(() => resolveEndpoint(base, "unused"), /Base URL/)
  }
})

for (const [id, fixture] of Object.entries(fixtures)) {
  test(`${id}: routes custom URLs and isolates cache by key, count and endpoint`, async () => {
    const { search } = await WebSearch({}, {})
    const fake = stubFetch(() => json(fixture.response))
    const args = { query: "cache isolation", count: 1, key: "key-a", url: "https://custom.example/proxy/v1" }
    try {
      await search[id].execute(args, context())
      await search[id].execute({ ...args, query: "  cache   isolation  " }, context())
      assert.equal(fake.calls.length, 1, "equivalent request reuses cache")
      await search[id].execute({ ...args, key: "key-b" }, context())
      await search[id].execute({ ...args, count: 6 }, context())
      await search[id].execute({ ...args, url: "https://other.example/v1/search" }, context())
      assert.equal(fake.calls.length, 4)
      const u0 = new URL(fake.calls[0].url)
      const u3 = new URL(fake.calls[3].url)
      assert.equal(u0.origin + u0.pathname, "https://custom.example/proxy/v1")
      assert.equal(u3.origin + u3.pathname, "https://other.example/v1/search")
    } finally { fake.restore() }
  })

  test(`${id}: cacheTTL zero disables caching`, async () => {
    const { search } = await WebSearch({}, { [id]: { cacheTTL: 0 } })
    const fake = stubFetch(() => json(fixture.response))
    try {
      for (let i = 0; i < 2; i++) await search[id].execute({ query: "no cache", key: "k", count: 6 }, context())
      assert.equal(fake.calls.length, 2)
    } finally { fake.restore() }
  })
}

test("provider options reach requests and keep settings and caches separate per plugin instance", async () => {
  const oldDepth = process.env.LINKUP_DEPTH
  process.env.LINKUP_DEPTH = "standard"
  const fake = stubFetch(() => json(LINKUP_CASE.response))
  try {
    const first = await WebSearch({}, { linkup: { depth: "deep", maxResults: 2, contentChars: 3 } })
    const second = await WebSearch({}, {})
    const args = { query: "options", key: "k", count: 6 }
    const pages = await first.search.linkup.execute(args, context())
    await second.search.linkup.execute(args, context())
    assert.equal(fake.calls[0].body.depth, "deep")
    assert.equal(fake.calls[0].body.maxResults, 2)
    assert.ok(pages.every((page) => [...page.text].length <= 4))
    assert.equal(fake.calls[1].body.depth, "standard")
    assert.equal(fake.calls[1].body.maxResults, 6)
  } finally {
    fake.restore()
    if (oldDepth === undefined) delete process.env.LINKUP_DEPTH
    else process.env.LINKUP_DEPTH = oldDepth
  }
})

test("AnySearch, Keenable, Metaso and Querit options reach their request fields", async () => {
  const { search } = await WebSearch({}, {
    anysearch: { tag: "code.snippet", zone: "cn", language: "zh-CN", format: "json", maxResults: 2 },
    keenable: { mode: "realtime", title: "Example", maxResults: 3 },
    metaso: { scope: "paper", maxResults: 5 },
    querit: { count: 4 },
  })
  const fake = stubFetch((call) => json(call.url.includes("anysearch") ? ANYSEARCH_CASE.response
    : call.url.includes("keenable") ? KEENABLE_CASE.response
    : call.url.includes("metaso") ? METASO_CASE.response : QUERIT_CASE.response))
  try {
    for (const id of ["anysearch", "keenable", "metaso", "querit"]) {
      await search[id].execute({ query: "options", key: "k", count: 6 }, context())
    }
    assert.deepEqual(fake.calls[0].body, {
      query: "options", max_results: 2, tag: "code.snippet", zone: "cn", language: "zh-CN", format: "json",
    })
    assert.equal(fake.calls[1].body.mode, "realtime")
    assert.equal(fake.calls[1].body.max_results, 3)
    assert.equal(fake.calls[1].init.headers["X-Keenable-Title"], "Example")
    assert.equal(fake.calls[2].body.scope, "paper")
    assert.equal(fake.calls[2].body.size, 5)
    assert.equal(fake.calls[3].body.count, 4)
  } finally { fake.restore() }
})

test("identically configured plugin instances keep separate caches", async () => {
  const first = await WebSearch({}, {})
  const second = await WebSearch({}, {})
  const fake = stubFetch(() => json(LINKUP_CASE.response))
  try {
    const args = { query: "instance cache", key: "k", count: 6 }
    await first.search.linkup.execute(args, context())
    await second.search.linkup.execute(args, context())
    assert.equal(fake.calls.length, 2)
  } finally { fake.restore() }
})

test("invalid provider options fail loading and disabled providers are not initialized", async () => {
  for (const options of [
    { linkup: { depth: "invalid" } }, { querit: { count: 0 } },
    { anysearch: { maxResults: "2" } }, { keenable: [] }, { linkup: { timeout: -1 } },
    { linkup: { timeout: 2_147_483_648 } },
    { tinyfish: { domainType: "invalid" } }, { tinyfish: { maxResults: 0 } },
    { parallel: { mode: "invalid" } }, { parallel: { maxResults: 0 } }, { parallel: { maxResults: 21 } },
    { serpapi: { safe: "invalid" } }, { serpapi: { maxResults: 0 } }, { serpapi: { maxResults: 11 } },
    { moonshot: { maxResults: 0 } }, { moonshot: { maxResults: 21 } }, { moonshot: { content: "invalid" } },
    { "moonshot-cn": { maxResults: 0 } }, { "moonshot-cn": { maxResults: 21 } }, { "moonshot-cn": { content: "invalid" } },
    { stepfun: { maxResults: 0 } }, { stepfun: { maxResults: 21 } },
    { stepfun: { content: "invalid" } }, { stepfun: { category: "news" } },
    { perplexity: { searchType: "people" } }, { perplexity: { recency: "decade" } },
    { perplexity: { country: "USA" } }, { perplexity: { language: "en-US" } },
    { perplexity: { maxResults: 0 } }, { perplexity: { maxResults: 21 } },
    { bocha: { summary: "true" } }, { bocha: { freshness: 1 } }, { bocha: { maxResults: 51 } },
    { ollama: { maxResults: 0 } }, { ollama: { maxResults: 11 } }, { ollama: { contentChars: -1 } },
    { jina: { content: "invalid" } }, { jina: { maxResults: 21 } },
    { kagi: { recency: "year" } }, { kagi: { maxResults: 1025 } },
    { serper: { tbs: "qdr:z" } }, { serper: { maxResults: 11 } },
    { "zhipu-coding": { resultLimit: 0 } }, { "zhipu-coding": { contentSize: "full" } },
    { "zai-coding": { timeout: -1 } }, { "zai-coding": { domainFilter: [] } },
  ]) await assert.rejects(WebSearch({}, options), TypeError)
  const { search } = await WebSearch({}, { disable: ["linkup"], linkup: { depth: "invalid" } })
  assert.equal(search.linkup, undefined)
  const disabled = await WebSearch({}, { disable: ["tinyfish"], tinyfish: { domainType: "invalid" } })
  assert.equal(disabled.search.tinyfish, undefined)
  const disabledParallel = await WebSearch({}, { disable: ["parallel"], parallel: { mode: "invalid" } })
  assert.equal(disabledParallel.search.parallel, undefined)
  const disabledSerpapi = await WebSearch({}, { disable: ["serpapi"], serpapi: { safe: "invalid" } })
  assert.equal(disabledSerpapi.search.serpapi, undefined)
  const disabledMoonshot = await WebSearch({}, { disable: ["moonshot"], moonshot: { maxResults: 0 } })
  assert.equal(disabledMoonshot.search.moonshot, undefined)
  const disabledMoonshotCN = await WebSearch({}, { disable: ["moonshot-cn"], "moonshot-cn": { maxResults: 0 } })
  assert.equal(disabledMoonshotCN.search["moonshot-cn"], undefined)
  const disabledStepfun = await WebSearch({}, { disable: ["stepfun"], stepfun: { category: "news" } })
  assert.equal(disabledStepfun.search.stepfun, undefined)
  const disabledPerplexity = await WebSearch({}, { disable: ["perplexity"], perplexity: { searchType: "people" } })
  assert.equal(disabledPerplexity.search.perplexity, undefined)
  const disabledBocha = await WebSearch({}, { disable: ["bocha"], bocha: { summary: "true" } })
  assert.equal(disabledBocha.search.bocha, undefined)
  const disabledOllama = await WebSearch({}, { disable: ["ollama"], ollama: { contentChars: -1 } })
  assert.equal(disabledOllama.search.ollama, undefined)
  const disabledJina = await WebSearch({}, { disable: ["jina"], jina: { content: "invalid" } })
  assert.equal(disabledJina.search.jina, undefined)
  const disabledKagi = await WebSearch({}, { disable: ["kagi"], kagi: { recency: "year" } })
  assert.equal(disabledKagi.search.kagi, undefined)
  const disabledSerper = await WebSearch({}, { disable: ["serper"], serper: { tbs: "qdr:z" } })
  assert.equal(disabledSerper.search.serper, undefined)
  const disabledZhipuCoding = await WebSearch({}, { disable: ["zhipu-coding"], "zhipu-coding": { contentSize: "full" } })
  assert.equal(disabledZhipuCoding.search["zhipu-coding"], undefined)
  const disabledZaiCoding = await WebSearch({}, { disable: ["zai-coding"], "zai-coding": { timeout: -1 } })
  assert.equal(disabledZaiCoding.search["zai-coding"], undefined)
})

test("timeouts and host cancellation abort the upstream request", async () => {
  // Keep an event-loop handle: AbortSignal.timeout itself does not keep Node alive.
  const keepAlive = setInterval(() => {}, 1000)
  const fake = stubFetch(({ init }) => new Promise((_, reject) => {
    if (init.signal.aborted) return reject(init.signal.reason)
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
  }))
  try {
    const { search } = await WebSearch({}, { linkup: { timeout: 10, cacheTTL: 0 } })
    await assert.rejects(search.linkup.execute({ query: "timeout", key: "k" }, context()), /timed out/)
    const controller = new AbortController()
    const unlimited = await WebSearch({}, { linkup: { timeout: 0 } })
    const pending = unlimited.search.linkup.execute({ query: "cancel", key: "k" }, { abort: controller.signal })
    controller.abort()
    await assert.rejects(pending, /cancelled/)
    assert.equal(fake.calls[1].init.signal.aborted, true)
  } finally { clearInterval(keepAlive); fake.restore() }
})
