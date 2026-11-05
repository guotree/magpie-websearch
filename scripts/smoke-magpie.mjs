// Real host smoke test, with dummy keys and a local upstream only. All magpie
// configuration, account discovery and gateway traffic stay in this sandbox.
import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { setTimeout as delay } from "node:timers/promises"

const exec = promisify(execFile)
const project = dirname(dirname(fileURLToPath(import.meta.url)))
const root = resolve(process.env.MAGPIE_PLUGIN_DIR || project)
const tempRoot = process.env.MAGPIE_SMOKE_ROOT || tmpdir()
await mkdir(tempRoot, { recursive: true })
const sandbox = await mkdtemp(join(tempRoot, "magpie-websearch-"))
const binary = process.env.MAGPIE_BIN || "magpie"
const env = {
  ...process.env,
  HOME: sandbox, USERPROFILE: sandbox,
  XDG_CONFIG_HOME: join(sandbox, "config"), XDG_CACHE_HOME: join(sandbox, "cache"),
  XDG_DATA_HOME: join(sandbox, "data"), XDG_STATE_HOME: join(sandbox, "state"),
  APPDATA: join(sandbox, "appdata"), LOCALAPPDATA: join(sandbox, "localappdata"),
  MAGPIE_NO_ACCOUNTS: "1", MAGPIE_PLUGIN_MARKET: "off",
}
delete env.MAGPIE_GATEWAY
const calls = []
const sockets = new Set()
const upstream = createServer(async (req, res) => {
  let raw = ""
  for await (const chunk of req) raw += chunk
  const target = new URL(req.url, "http://localhost")
  const body = raw ? JSON.parse(raw) : undefined
  calls.push({ path: req.url, method: req.method, body, key: req.headers.authorization,
    apiKey: req.headers["x-api-key"], title: req.headers["x-keenable-title"],
    accessMode: req.headers["x-tinyfish-access-mode"] })
  const query = body?.search_query ?? body?.text_query ?? body?.params?.arguments?.query ?? body?.params?.arguments?.search_queries?.[0] ?? body?.search_queries?.[0] ?? body?.q ?? body?.query ?? target.searchParams.get("query") ?? target.searchParams.get("q")
  if (query === "rate limited") {
    res.writeHead(429, { "Retry-After": body?.q ? "30" : "120" }).end("slow down")
    return
  }
  if (query === "timeout") return
  res.setHeader("Content-Type", "application/json")
  if (target.pathname.startsWith("/bocha/") || target.pathname.startsWith("/ollama/")) {
    const id = target.pathname.startsWith("/bocha/") ? "bocha" : "ollama"
    if (query === `${id} refusal` || req.headers.authorization === `Bearer ${id}-resting-dummy-key`) {
      res.writeHead(429, { "Retry-After": "0007" })
      res.end(JSON.stringify({ code: 429, msg: "Search quota refused", log_id: `${id}-trace` }))
    } else if (req.headers.authorization === `Bearer ${id}-interrupted-dummy-key`) {
      res.writeHead(401)
      res.flushHeaders()
      res.write('{"error":')
      setTimeout(() => res.destroy(), 30)
    } else if (id === "bocha" && query === "bocha business error") {
      res.end(JSON.stringify({ code: "403", msg: "balance", log_id: "bocha-business-trace" }))
    } else if (query === `${id} empty`) {
      res.end(JSON.stringify(id === "bocha" ? { code: 200, data: { webPages: { value: [] } } } : { results: [] }))
    } else if (query === `${id} malformed`) {
      res.end(JSON.stringify(id === "bocha" ? { code: 200, data: { webPages: { value: null } } } : { results: null }))
    } else {
      res.end(JSON.stringify(id === "bocha" ? { code: 200, data: { webPages: { value: [
        { name: "Missing URL", snippet: "Drop before applying cap" },
        { name: "Bocha smoke page", url: "https://example.com/bocha", snippet: "Bocha snippet result", summary: "Bocha generated summary", datePublished: "2025-02-23T08:18:30+08:00", dateLastCrawled: "2020-01-01T00:00:00Z" },
        { url: "https://example.com/bocha-extra", snippet: "Must be capped" },
      ] } } } : { results: [
        { title: "Missing URL", content: "Drop before applying cap" },
        { title: "Ollama smoke page", url: "https://example.com/ollama", content: "ABCDEFGHIJK" },
        { url: "https://example.com/ollama-extra", content: "Must be capped" },
      ] }))
    }
  } else if (target.pathname.startsWith("/perplexity/")) {
    if (query === "perplexity refusal" || req.headers.authorization === "Bearer perplexity-resting-dummy-key") {
      res.writeHead(429, { "Retry-After": "0007" })
      res.end(JSON.stringify({ error: { message: "Search rate limit reached. ".repeat(20), type: "rate_limit_exceeded" } }))
    } else if (req.headers.authorization === "Bearer perplexity-interrupted-dummy-key") {
      res.writeHead(401)
      res.flushHeaders()
      res.write('{"error":')
      setTimeout(() => res.destroy(), 30)
    } else if (query === "perplexity empty") {
      res.end(JSON.stringify({ results: [] }))
    } else if (query === "perplexity malformed") {
      res.end(JSON.stringify({ results: null }))
    } else {
      res.end(JSON.stringify({
        id: "smoke-perplexity",
        server_time: "2026-11-05T00:00:00Z",
        results: [
          { title: "Missing URL", snippet: "Drop before applying cap" },
          { title: "Perplexity smoke page", url: "https://example.com/perplexity", snippet: "Perplexity snippet result", date: "2026-10-01", last_updated: "2026-10-15" },
          { url: "https://example.com/perplexity-extra", snippet: "Must be capped" },
        ],
      }))
    }
  } else if (target.pathname.startsWith("/stepfun/")) {
    if (query === "stepfun refusal" || req.headers.authorization === "Bearer stepfun-resting-dummy-key") {
      res.writeHead(429, { "Retry-After": "0007" })
      res.end(JSON.stringify({ error: { message: "Project Credit limit reached. ".repeat(20), type: "project_credit_limit_exceeded" } }))
    } else if (req.headers.authorization === "Bearer stepfun-interrupted-dummy-key") {
      // Deliver the refusal headers, then interrupt its body. Rotation must
      // still see HTTP 401 instead of a generic response-read error.
      res.writeHead(401)
      res.flushHeaders()
      res.write('{"error":')
      setTimeout(() => res.destroy(), 30)
    } else if (query === "stepfun moderation") {
      res.writeHead(451).end(JSON.stringify({ error: { message: "Content review refused" } }))
    } else if (query === "stepfun empty") {
      res.end(JSON.stringify({ results: [] }))
    } else if (query === "stepfun malformed") {
      res.end(JSON.stringify({ results: null }))
    } else {
      res.end(JSON.stringify({ query, category: body.category ?? "", results: [
        { title: "Missing URL", snippet: "Drop before applying cap" },
        { title: "StepFun smoke page", url: "https://example.com/stepfun", snippet: "StepFun snippet result", content: "Detailed StepFun full text", time: "2026-03-20T00:00:00" },
        { url: "https://example.com/stepfun-extra", snippet: "Must be capped" },
      ] }))
    }
  } else if (target.pathname.startsWith("/zhipu/") || target.pathname.startsWith("/zai/")) {
    const id = target.pathname.startsWith("/zhipu/") ? "zhipu" : "zai"
    if (query === `${id} refusal` || req.headers.authorization === `Bearer ${id}-resting-dummy-key`) {
      res.writeHead(429, { "Retry-After": "0007" })
      res.end(JSON.stringify({ error: { code: "1113", message: "search balance exhausted" } }))
    } else if (query === `${id} empty`) {
      res.end(JSON.stringify({ search_result: [] }))
    } else if (query === `${id} business error`) {
      res.end(JSON.stringify({ code: 1703, message: "no valid data", search_result: [] }))
    } else {
      res.end(JSON.stringify({ search_result: [
        { title: "Missing link", content: "Drop before applying cap" },
        { title: `${id} smoke page`, link: `https://example.com/${id}`, content: `${id} snippet result`, publish_date: "2025-05-23" },
        { title: "Over the local cap", link: `https://example.com/${id}-extra`, content: "Must be capped" },
      ] }))
    }
  } else if (target.pathname.startsWith("/moonshot/") || target.pathname.startsWith("/moonshot-cn/")) {
    const isCN = target.pathname.startsWith("/moonshot-cn/")
    const tag = isCN ? "Moonshot CN" : "Moonshot"
    if ((!isCN && ["moonshot refusal", "moonshot milliseconds", "moonshot oversized reset"].includes(query)) || req.headers.authorization === "Bearer moonshot-resting-dummy-key") {
      const reset = query === "moonshot milliseconds" ? Date.now() + 12_000
        : query === "moonshot oversized reset" ? Math.floor(Date.now() / 1000) + 172_800
        : Math.floor(Date.now() / 1000) + 12
      res.writeHead(429, { "X-RateLimit-Reset": String(reset) })
      res.end("rate limit reached")
    } else if (query === "moonshot empty") {
      res.end(JSON.stringify({ search_results: [] }))
    } else {
      res.end(JSON.stringify({
        search_results: [
          {
            title: `${tag} smoke page`,
            url: `https://example.com/${isCN ? "moonshot-cn" : "moonshot"}`,
            snippet: `${tag} snippet result`,
            text: `Detailed ${tag} full text`,
            date: "Nov 5, 2026",
          },
          {
            title: "Over the local cap",
            url: `https://example.com/${isCN ? "moonshot-cn" : "moonshot"}-extra`,
            snippet: "Must be capped",
          },
        ],
      }))
    }
  } else if (target.pathname.startsWith("/serpapi/")) {
    if (query === "serpapi private refusal" || target.searchParams.get("api_key") === "serpapi-resting-dummy-key") {
      // Echo the request and leave the body open: a known 429 must return
      // immediately without consuming or exposing the credential-bearing body.
      res.writeHead(429, { "Retry-After": "0007", "X-Private": "private header" })
      res.write(req.url)
    } else if (query === "serpapi private status") {
      res.end(JSON.stringify({ search_metadata: { status: req.url } }))
    } else if (query === "serpapi private JSON") {
      res.end("invalid JSON: " + req.url)
    } else if (query === "serpapi private error") {
      res.end(JSON.stringify({ error: req.url, organic_results: [{ link: "https://example.com/invalid" }] }))
    } else if (query === "serpapi empty") {
      res.end(JSON.stringify({
        search_metadata: { status: "Success" },
        search_information: { organic_results_state: "Fully empty" },
        error: "Google hasn't returned any results for this query.",
      }))
    } else {
      res.end(JSON.stringify({
        search_metadata: { status: "Success" },
        organic_results: [
          { title: "SerpApi smoke page", link: "https://example.com/serpapi", snippet: "Local SerpApi result", date: "Nov 4, 2026" },
          { title: "Over the local cap", link: "https://example.com/serpapi-extra", snippet: "Must be capped" },
        ],
      }))
    }
  } else if (target.pathname.startsWith("/tinyfish/")) {
    const result = { query, total_results: 2, page: 0, results: [
      { title: "TinyFish smoke page", url: "https://example.com/tinyfish", snippet: "Local TinyFish result", date: "Nov 4, 2026" },
      { title: "Over the local cap", url: "https://example.com/tinyfish-extra", snippet: "Must be capped" },
    ] }
    if (req.method === "GET") res.end(JSON.stringify(result))
    else {
      const rpc = { jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } }
      if (query === "tinyfish sse") {
        res.setHeader("Content-Type", "text/event-stream")
        res.end("data: " + JSON.stringify(rpc) + "\n\n")
      } else res.end(JSON.stringify(rpc))
    }
  } else if (target.pathname.startsWith("/parallel/")) {
    const result = { search_id: "parallel_smoke", results: [
      { title: "Parallel smoke page", url: "https://example.com/parallel", excerpts: ["Local Parallel result"], publish_date: "2026-11-04" },
      { title: "Over the local cap", url: "https://example.com/parallel-extra", excerpts: ["Must be capped"] },
    ], session_id: "parallel_sess" }
    if (req.method === "POST" && req.headers["x-api-key"]) res.end(JSON.stringify(result))
    else {
      const rpc = { jsonrpc: "2.0", id: body.id, result: { structuredContent: result } }
      if (query === "parallel sse") {
        res.setHeader("Content-Type", "text/event-stream")
        res.end("data: " + JSON.stringify(rpc) + "\n\n")
      } else res.end(JSON.stringify(rpc))
    }
  } else if (req.url.startsWith("/anysearch/")) {
    res.end(JSON.stringify({ code: 0, data: { results: [
      { title: "Anonymous AnySearch", url: "https://example.com/anysearch", snippet: "Anonymous smoke result" },
    ] } }))
  } else if (req.url.startsWith("/keenable/")) {
    res.end(JSON.stringify({ results: [
      { title: "Anonymous Keenable", url: "https://example.com/keenable", snippet: "Anonymous smoke result" },
    ] }))
  } else if (req.url.startsWith("/metaso/")) {
    res.end(JSON.stringify({ credits: 1, total: 1, webpages: [
      { title: "Metaso smoke page", link: "https://example.com/metaso", snippet: "Local Metaso result" },
    ] }))
  } else {
    res.end(JSON.stringify({ results: [{ name: "Smoke page", url: "https://example.com/smoke", content: "Local smoke result" }] }))
  }
})
upstream.on("connection", (socket) => {
  sockets.add(socket)
  socket.on("close", () => sockets.delete(socket))
})
const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject)
  server.listen(0, "127.0.0.1", resolve)
})
const run = async (...args) => {
  const { stdout } = await exec(binary, args, { cwd: root, env, timeout: 120_000, maxBuffer: 2 << 20 })
  return stdout.trim()
}
const loadedSearches = async () => {
  const state = JSON.parse(await run("plugin", "--json"))
  const plugin = state.loaded.find((entry) => entry.spec === root)
  assert.ok(plugin, "plugin was loaded")
  assert.ok(!plugin.error, plugin.error)
  return plugin.searches
}
const loadedIDs = async () => (await loadedSearches()).map((entry) => entry.id).sort()
let gateway
let gatewayLog = ""
try {
  console.log(await run("--version"))
  await listen(upstream)
  const reservation = createServer()
  await listen(reservation)
  env.MAGPIE_ADDR = `127.0.0.1:${reservation.address().port}`
  await new Promise((resolve) => reservation.close(resolve))
  console.log("Loading the plugin in an isolated magpie configuration…")
  await run("plugin", "add", root)
  const definitions = await loadedSearches()
  assert.deepEqual(definitions.map((entry) => entry.id).sort(), ["anysearch", "bocha", "keenable", "linkup", "metaso", "moonshot", "moonshot-cn", "ollama", "parallel", "perplexity", "querit", "serpapi", "stepfun", "tinyfish", "zai", "zhipu"])
  assert.deepEqual(definitions.filter((entry) => entry.keyOptional).map((entry) => entry.id).sort(), ["anysearch", "keenable", "parallel", "tinyfish"])
  await run("plugin", "options", root, JSON.stringify({ enable: ["moonshot", "moonshot-cn"], disable: ["moonshot-cn"] }))
  assert.deepEqual(await loadedIDs(), ["moonshot"])
  await run("plugin", "options", root, JSON.stringify({ enable: ["zhipu", "zai"], disable: ["zai"] }))
  assert.deepEqual(await loadedIDs(), ["zhipu"])
  await run("plugin", "options", root, JSON.stringify({ enable: ["zai"] }))
  assert.deepEqual(await loadedIDs(), ["zai"])
  await run("plugin", "options", root, JSON.stringify({ enable: ["stepfun"], stepfun: { category: "research" } }))
  assert.deepEqual(await loadedIDs(), ["stepfun"])
  await run("plugin", "options", root, JSON.stringify({ disable: ["stepfun"], stepfun: { category: "invalid" } }))
  assert.ok(!(await loadedIDs()).includes("stepfun"), "disabled StepFun options are not initialized")
  await run("plugin", "options", root, JSON.stringify({ enable: ["perplexity"], perplexity: { searchType: "fast" } }))
  assert.deepEqual(await loadedIDs(), ["perplexity"])
  await run("plugin", "options", root, JSON.stringify({ disable: ["perplexity"], perplexity: { searchType: "people" } }))
  assert.ok(!(await loadedIDs()).includes("perplexity"), "disabled Perplexity options are not initialized")
  for (const [id, invalid] of [["bocha", { summary: "true" }], ["ollama", { contentChars: -1 }]]) {
    await run("plugin", "options", root, JSON.stringify({ enable: [id] }))
    assert.deepEqual(await loadedIDs(), [id])
    await run("plugin", "options", root, JSON.stringify({ disable: [id], [id]: invalid }))
    assert.ok(!(await loadedIDs()).includes(id), `disabled ${id} options are not initialized`)
  }
  await run("plugin", "options", root, JSON.stringify({ enable: ["linkup", "querit"], disable: ["querit"] }))
  assert.deepEqual(await loadedIDs(), ["linkup"])
  const options = {
    linkup: { depth: "deep", maxResults: 2, cacheTTL: 0, timeout: 500 },
    anysearch: { cacheTTL: 0 }, keenable: { cacheTTL: 0 },
    bocha: { maxResults: 1, cacheTTL: 0, timeout: 500 },
    metaso: { maxResults: 2, cacheTTL: 0, timeout: 500 },
    moonshot: { maxResults: 1, content: "snippet", cacheTTL: 0, timeout: 500 },
    "moonshot-cn": { maxResults: 1, content: "full", contentChars: 2000, cacheTTL: 0, timeout: 500 },
    ollama: { maxResults: 1, contentChars: 8, cacheTTL: 0, timeout: 500 },
    parallel: { maxResults: 1, mode: "fast", cacheTTL: 0, timeout: 500 },
    perplexity: { searchType: "fast", recency: "week", country: "US", language: "en,zh", maxResults: 1, contentChars: 2000, cacheTTL: 0, timeout: 500 },
    serpapi: { maxResults: 1, hl: "en", gl: "us", cacheTTL: 0, timeout: 500 },
    stepfun: { maxResults: 1, category: "research", content: "full", contentChars: 2000, cacheTTL: 0, timeout: 500 },
    tinyfish: { maxResults: 1, language: "zh", cacheTTL: 0, timeout: 500 },
    zhipu: { engine: "search_pro_sogou", contentSize: "high", recency: "oneWeek", maxResults: 1, cacheTTL: 0, timeout: 500 },
    zai: { maxResults: 1, cacheTTL: 0, timeout: 500 },
  }
  await run("plugin", "options", root, JSON.stringify(options))
  await run("search", "add", "magpie-websearch:linkup", "smoke-dummy-key", `url=http://127.0.0.1:${upstream.address().port}/proxy/v1/search`)
  gateway = spawn(binary, ["serve"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] })
  gateway.on("error", (error) => { gatewayLog += String(error) })
  for (const stream of [gateway.stdout, gateway.stderr]) {
    stream.on("data", (chunk) => { gatewayLog = (gatewayLog + chunk).slice(-8000) })
  }
  const base = `http://${env.MAGPIE_ADDR}`
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (gateway.exitCode !== null) throw new Error(gatewayLog)
    try { await fetch(base, { signal: AbortSignal.timeout(500) }); ready = true; break } catch {}
    await delay(100)
  }
  assert.ok(ready, "isolated gateway started")
  console.log("Checking a search, timeout and key refusal against a local upstream…")
  const search = (query) => run("tool", "web_search", query, "--json")
  const output = await search("smoke query")
  assert.match(output, /example\.com\/smoke/)
  assert.equal(calls[0].path, "/proxy/v1/search")
  assert.equal(calls[0].body.depth, "deep")
  assert.equal(calls[0].body.maxResults, 2)
  assert.equal(calls[0].key, "Bearer smoke-dummy-key")
  // The CLI may report a tool error as JSON or as a failed exit status.
  const failure = async (query) => {
    try { return await search(query) } catch (error) { return `${error.stdout}\n${error.stderr}` }
  }
  assert.match(await failure("timeout"), /timed out|no answer|failed|error/i)
  assert.match(await failure("rate limited"), /429|slow down|rate.limit|error/i)
  // The gateway's refusal carries Retry-After; a separate CLI process cannot
  // inspect its in-memory cooldown table.
  assert.match(gatewayLog, /429: slow down, retry after 30s/)
  console.log("Checking keyless registration, anonymous requests, cooldown and fallback…")
  await run("search", "off", "magpie-websearch:linkup")
  for (const id of ["anysearch", "keenable"]) {
    await run("search", "add", "magpie-websearch:" + id, `url=http://127.0.0.1:${upstream.address().port}/${id}/search`)
    await run("search", "off", "magpie-websearch:" + id)
  }
  const listing = await run("search")
  assert.equal((listing.match(/no key/g) || []).length, 2)
  assert.doesNotMatch(listing, /needs its key/)
  for (const id of ["anysearch", "keenable"]) {
    await run("search", "on", "magpie-websearch:" + id)
    const result = await search("anonymous " + id)
    assert.ok(result.includes("https://example.com/" + id), result)
    const call = calls.at(-1)
    assert.equal(call.path, `/${id}/search`)
    assert.equal(call.key, undefined)
    assert.equal(call.apiKey, undefined)
    if (id === "keenable") assert.equal(call.title, "magpie-websearch")
    assert.match(await failure("rate limited"), /429|slow down|error/i)
    const before = calls.length
    assert.match(await failure("cooldown " + id), /cooling down/)
    assert.equal(calls.length, before, "anonymous cooldown prevents another upstream request")
    await run("search", "on", "magpie-websearch:linkup")
    await run("search", "move", "magpie-websearch:" + id, "1")
    assert.match(await search("fallback " + id), /example\.com\/smoke/)
    assert.equal(calls.length, before + 1)
    assert.equal(calls.at(-1).path, "/proxy/v1/search")
    await run("search", "off", "magpie-websearch:linkup")
    await run("search", "off", "magpie-websearch:" + id)
  }
  console.log("Checking TinyFish anonymous MCP (JSON/SSE), REST, local caps and fallback…")
  const tinyfishURL = `http://127.0.0.1:${upstream.address().port}/tinyfish`
  await run("search", "add", "magpie-websearch:tinyfish", `url=${tinyfishURL}/mcp`)
  await run("search", "move", "magpie-websearch:tinyfish", "1")
  for (const query of ["tinyfish anonymous", "tinyfish sse"]) {
    const result = await search(query)
    assert.match(result, /example\.com\/tinyfish/)
    assert.doesNotMatch(result, /tinyfish-extra/)
    const call = calls.at(-1)
    assert.equal(call.path, "/tinyfish/mcp")
    assert.equal(call.method, "POST")
    assert.equal(call.body.method, "tools/call")
    assert.equal(call.body.params.name, "search")
    assert.equal(call.body.params.arguments.language, "zh")
    assert.equal(call.accessMode, "keyless")
    assert.equal(call.apiKey, undefined)
    assert.equal(call.key, undefined)
  }
  assert.match(await failure("timeout"), /timed out|no answer|failed|error/i)
  assert.match(await failure("rate limited"), /429|slow down|error/i)
  const before = calls.length
  assert.match(await failure("tinyfish cooldown"), /cooling down/)
  assert.equal(calls.length, before)
  await run("search", "on", "magpie-websearch:linkup")
  assert.match(await search("tinyfish fallback"), /example\.com\/smoke/)
  assert.equal(calls.length, before + 1)
  await run("search", "off", "magpie-websearch:linkup")
  // Re-add to switch modes, just as users do to clear a saved key.
  await run("search", "rm", "magpie-websearch:tinyfish")
  await run("search", "add", "magpie-websearch:tinyfish", "tinyfish-dummy-key", `url=${tinyfishURL}/search`)
  const keyed = await search("tinyfish keyed & 中文")
  assert.match(keyed, /example\.com\/tinyfish/)
  assert.doesNotMatch(keyed, /tinyfish-extra/)
  const keyedCall = calls.at(-1)
  const keyedTarget = new URL(keyedCall.path, "http://localhost")
  assert.equal(keyedTarget.pathname, "/tinyfish/search")
  assert.equal(keyedTarget.searchParams.get("query"), "tinyfish keyed & 中文")
  assert.equal(keyedTarget.searchParams.get("language"), "zh")
  assert.equal(keyedCall.method, "GET")
  assert.equal(keyedCall.body, undefined)
  assert.equal(keyedCall.apiKey, "tinyfish-dummy-key")
  assert.equal(keyedCall.accessMode, undefined)
  assert.equal(keyedCall.key, undefined)
  const beforeRefusal = calls.length
  assert.match(await failure("rate limited"), /429|slow down|error/i)
  assert.equal(calls.length, beforeRefusal + 1, "a refused REST key never falls back to MCP")
  await run("search", "rm", "magpie-websearch:tinyfish")
  console.log("Checking Parallel anonymous MCP (JSON/SSE), REST, local caps and fallback…")
  const parallelURL = `http://127.0.0.1:${upstream.address().port}/parallel`
  await run("search", "add", "magpie-websearch:parallel", `url=${parallelURL}/mcp`)
  await run("search", "move", "magpie-websearch:parallel", "1")
  for (const query of ["parallel anonymous", "parallel sse"]) {
    const result = await search(query)
    assert.match(result, /example\.com\/parallel/)
    assert.doesNotMatch(result, /parallel-extra/)
    const call = calls.at(-1)
    assert.equal(call.path, "/parallel/mcp")
    assert.equal(call.method, "POST")
    assert.equal(call.body.method, "tools/call")
    assert.equal(call.body.params.name, "web_search")
    assert.equal(call.body.params.arguments.objective, query)
    assert.deepEqual(call.body.params.arguments.search_queries, [query])
    assert.equal(call.apiKey, undefined)
    assert.equal(call.key, undefined)
  }
  assert.match(await failure("timeout"), /timed out|no answer|failed|error/i)
  assert.match(await failure("rate limited"), /429|slow down|error/i)
  const beforeParallel = calls.length
  assert.match(await failure("parallel cooldown"), /cooling down/)
  assert.equal(calls.length, beforeParallel)
  await run("search", "on", "magpie-websearch:linkup")
  assert.match(await search("parallel fallback"), /example\.com\/smoke/)
  assert.equal(calls.length, beforeParallel + 1)
  await run("search", "off", "magpie-websearch:linkup")
  // Re-add to switch modes, just as users do to clear a saved key.
  await run("search", "rm", "magpie-websearch:parallel")
  await run("search", "add", "magpie-websearch:parallel", "parallel-dummy-key", `url=${parallelURL}/search`)
  const keyedParallel = await search("parallel keyed")
  assert.match(keyedParallel, /example\.com\/parallel/)
  assert.doesNotMatch(keyedParallel, /parallel-extra/)
  const keyedParallelCall = calls.at(-1)
  assert.equal(keyedParallelCall.path, "/parallel/search")
  assert.equal(keyedParallelCall.method, "POST")
  assert.equal(keyedParallelCall.apiKey, "parallel-dummy-key")
  assert.equal(keyedParallelCall.body.mode, "fast")
  assert.equal(keyedParallelCall.body.objective, "parallel keyed")
  assert.deepEqual(keyedParallelCall.body.search_queries, ["parallel keyed"])
  assert.equal(keyedParallelCall.body.advanced_settings.max_results, 1)
  assert.equal(keyedParallelCall.key, undefined)
  const beforeParallelRefusal = calls.length
  assert.match(await failure("rate limited"), /429|slow down|error/i)
  assert.equal(calls.length, beforeParallelRefusal + 1, "a refused REST key never falls back to MCP")
  await run("search", "rm", "magpie-websearch:parallel")
  console.log("Checking Metaso search, key handling, and options…")
  const metasoURL = `http://127.0.0.1:${upstream.address().port}/metaso`
  await run("search", "add", "magpie-websearch:metaso", "metaso-dummy-key", `url=${metasoURL}/search`)
  await run("search", "move", "magpie-websearch:metaso", "1")
  const metasoResult = await search("metaso smoke query")
  assert.match(metasoResult, /example\.com\/metaso/)
  const metasoCall = calls.at(-1)
  assert.equal(metasoCall.path, "/metaso/search")
  assert.equal(metasoCall.method, "POST")
  assert.equal(metasoCall.key, "Bearer metaso-dummy-key")
  assert.equal(metasoCall.body.q, "metaso smoke query")
  assert.equal(metasoCall.body.scope, "webpage")
  assert.equal(metasoCall.body.size, 2)
  await run("search", "rm", "magpie-websearch:metaso")
  console.log("Checking SerpApi URL auth, empty results, timeout, refusal fallback, and private errors…")
  const serpapiURL = `http://127.0.0.1:${upstream.address().port}/serpapi`
  await run("search", "add", "magpie-websearch:serpapi", "serpapi-dummy-key", `url=${serpapiURL}/search`)
  await run("search", "move", "magpie-websearch:serpapi", "1")
  const serpapiResult = await search("serpapi smoke query")
  assert.match(serpapiResult, /example\.com\/serpapi/)
  assert.doesNotMatch(serpapiResult, /serpapi-extra/)
  const serpapiCall = calls.at(-1)
  assert.equal(serpapiCall.method, "GET")
  const serpapiTarget = new URL(serpapiCall.path, "http://localhost")
  assert.equal(serpapiTarget.pathname, "/serpapi/search")
  assert.equal(serpapiTarget.searchParams.get("engine"), "google")
  assert.equal(serpapiTarget.searchParams.get("output"), "json")
  assert.equal(serpapiTarget.searchParams.get("q"), "serpapi smoke query")
  assert.equal(serpapiTarget.searchParams.get("api_key"), "serpapi-dummy-key")
  assert.equal(serpapiTarget.searchParams.get("hl"), "en")
  assert.equal(serpapiTarget.searchParams.get("gl"), "us")
  assert.match(await failure("serpapi empty"), /found nothing/)
  assert.match(await failure("timeout"), /SerpApi search timed out after 500ms/)
  const assertPrivate = (output, query) => {
    for (const marker of ["serpapi-dummy-key", "serpapi-fallback-dummy-key",
      "serpapi-resting-dummy-key", "serpapi-good-dummy-key", query,
      encodeURIComponent(query), new URLSearchParams({ q: query }).toString().slice(2), "api_key="]) {
      assert.equal((output + gatewayLog).includes(marker), false, "host errors must not expose SerpApi request data")
    }
  }
  for (const [query, expected] of [
    ["serpapi private status", /unexpected search status/],
    ["serpapi private JSON", /malformed JSON/],
    ["serpapi private error", /SerpApi search failed/],
  ]) {
    const output = await failure(query)
    assert.match(output, expected)
    assertPrivate(output, query)
  }
  const refused = await failure("serpapi private refusal")
  assert.match(refused, /429/)
  assert.match(gatewayLog, /SerpApi API error 429: rate limit or search quota exceeded, retry after 7s/)
  assertPrivate(refused, "serpapi private refusal")
  await run("search", "rm", "magpie-websearch:serpapi")
  await run("search", "add", "magpie-websearch:serpapi", "serpapi-fallback-dummy-key", `url=${serpapiURL}/search`)
  await run("search", "move", "magpie-websearch:serpapi", "1")
  await run("search", "on", "magpie-websearch:linkup")
  const beforeSerpapiFallback = calls.length
  const fallback = await search("serpapi private refusal")
  assert.match(fallback, /example\.com\/smoke/)
  assert.equal(calls.length, beforeSerpapiFallback + 2)
  assert.ok(calls.at(-2).path.startsWith("/serpapi/search?"))
  assert.equal(calls.at(-1).path, "/proxy/v1/search")
  assertPrivate(fallback, "serpapi private refusal")
  await run("search", "rm", "magpie-websearch:serpapi")
  // magpie defers resting keys behind healthy keys of the same API; it does
  // not disable a singleton. Fixed order proves the rest changes preference.
  await run("search", "add", "magpie-websearch:serpapi",
    "serpapi-resting-dummy-key,serpapi-good-dummy-key", `url=${serpapiURL}/search`, "pick=order")
  await run("search", "move", "magpie-websearch:serpapi", "1")
  const beforeRotation = calls.length
  assert.match(await search("serpapi key rotation"), /example\.com\/serpapi/)
  assert.equal(calls.length, beforeRotation + 2)
  assert.equal(new URL(calls.at(-2).path, "http://localhost").searchParams.get("api_key"), "serpapi-resting-dummy-key")
  assert.equal(new URL(calls.at(-1).path, "http://localhost").searchParams.get("api_key"), "serpapi-good-dummy-key")
  const beforeRested = calls.length
  const preferred = await search("serpapi resting preference")
  assert.match(preferred, /example\.com\/serpapi/)
  assert.equal(calls.length, beforeRested + 1, "a resting key must follow the healthy key even in fixed order")
  assert.equal(new URL(calls.at(-1).path, "http://localhost").searchParams.get("api_key"), "serpapi-good-dummy-key")
  assertPrivate(preferred, "serpapi resting preference")
  await run("search", "rm", "magpie-websearch:serpapi")
  await run("search", "off", "magpie-websearch:linkup")
  console.log("Checking Moonshot dual-site Basic search, limit, snippet/full text, 429 reset, rotation, and isolation…")
  const moonshotURL = `http://127.0.0.1:${upstream.address().port}/moonshot/search`
  const moonshotCNURL = `http://127.0.0.1:${upstream.address().port}/moonshot-cn/search`

  // 1. Moonshot international site: snippet mode, limit, Bearer auth
  await run("search", "add", "magpie-websearch:moonshot", "moonshot-dummy-key", `url=${moonshotURL}`)
  await run("search", "move", "magpie-websearch:moonshot", "1")
  const moonshotResult = await search("moonshot smoke query")
  assert.match(moonshotResult, /example\.com\/moonshot/)
  assert.doesNotMatch(moonshotResult, /moonshot-extra/)
  const moonshotCall = calls.at(-1)
  assert.equal(moonshotCall.path, "/moonshot/search")
  assert.equal(moonshotCall.method, "POST")
  assert.equal(moonshotCall.key, "Bearer moonshot-dummy-key")
  assert.equal(moonshotCall.body.text_query, "moonshot smoke query")
  assert.equal(moonshotCall.body.limit, 1)
  assert.equal(moonshotCall.body.include_content, undefined)
  assert.match(moonshotResult, /Moonshot snippet result/)
  assert.doesNotMatch(moonshotResult, /Detailed Moonshot full text/)

  // 2. Empty results and timeout
  assert.match(await failure("moonshot empty"), /found nothing/)
  assert.match(await failure("timeout"), /Moonshot search timed out after 500ms/)

  // 3. 429 refusal with X-RateLimit-Reset and fallback to another configured search (linkup)
  const moonshotRefused = await failure("moonshot refusal")
  assert.match(moonshotRefused, /429/)
  await delay(50)
  assert.match(gatewayLog, /Moonshot API error 429: rate limit reached, retry after 1[12]s/)
  const millisecondsRefused = await failure("moonshot milliseconds")
  assert.match(millisecondsRefused, /Moonshot API error 429: rate limit reached, retry after 1[12]s/)
  const oversizedRefused = await failure("moonshot oversized reset")
  assert.match(oversizedRefused, /Moonshot API error 429: rate limit reached/)
  assert.doesNotMatch(oversizedRefused, /retry after/)
  await run("search", "rm", "magpie-websearch:moonshot")
  await run("search", "add", "magpie-websearch:moonshot", "moonshot-fallback-dummy-key", `url=${moonshotURL}`)
  await run("search", "move", "magpie-websearch:moonshot", "1")
  await run("search", "on", "magpie-websearch:linkup")
  for (const query of ["moonshot refusal", "moonshot oversized reset"]) {
    const beforeMoonshotFallback = calls.length
    const moonshotFallbackResult = await search(query)
    assert.match(moonshotFallbackResult, /example\.com\/smoke/)
    assert.equal(calls.length, beforeMoonshotFallback + 2)
    assert.equal(calls.at(-2).path, "/moonshot/search")
    assert.equal(calls.at(-1).path, "/proxy/v1/search")
  }
  await run("search", "off", "magpie-websearch:linkup")
  await run("search", "rm", "magpie-websearch:moonshot")

  // 4. Moonshot key rotation with resting key
  await run("search", "add", "magpie-websearch:moonshot",
    "moonshot-resting-dummy-key,moonshot-good-dummy-key", `url=${moonshotURL}`, "pick=order")
  await run("search", "move", "magpie-websearch:moonshot", "1")
  const beforeMoonshotRotation = calls.length
  assert.match(await search("moonshot key rotation"), /example\.com\/moonshot/)
  assert.equal(calls.length, beforeMoonshotRotation + 2)
  assert.equal(calls.at(-2).key, "Bearer moonshot-resting-dummy-key")
  assert.equal(calls.at(-1).key, "Bearer moonshot-good-dummy-key")
  const beforeMoonshotRested = calls.length
  const moonshotPreferred = await search("moonshot resting preference")
  assert.match(moonshotPreferred, /example\.com\/moonshot/)
  assert.equal(calls.length, beforeMoonshotRested + 1, "a resting key must follow the healthy key even in fixed order")
  assert.equal(calls.at(-1).key, "Bearer moonshot-good-dummy-key")
  await run("search", "rm", "magpie-websearch:moonshot")

  // 5. Moonshot CN: full text mode, include_content: true, domestic credentials
  await run("search", "add", "magpie-websearch:moonshot-cn", "moonshot-cn-dummy-key", `url=${moonshotCNURL}`)
  await run("search", "move", "magpie-websearch:moonshot-cn", "1")
  const moonshotCNResult = await search("moonshot cn smoke query")
  assert.match(moonshotCNResult, /example\.com\/moonshot-cn/)
  assert.doesNotMatch(moonshotCNResult, /moonshot-cn-extra/)
  const moonshotCNCall = calls.at(-1)
  assert.equal(moonshotCNCall.path, "/moonshot-cn/search")
  assert.equal(moonshotCNCall.method, "POST")
  assert.equal(moonshotCNCall.key, "Bearer moonshot-cn-dummy-key")
  assert.equal(moonshotCNCall.body.text_query, "moonshot cn smoke query")
  assert.equal(moonshotCNCall.body.limit, 1)
  assert.equal(moonshotCNCall.body.include_content, true)
  assert.match(moonshotCNResult, /Detailed Moonshot CN full text/)

  // 6. Dual-site isolation: refusal on moonshot does not accidentally switch to moonshot-cn with same key
  await run("search", "add", "magpie-websearch:moonshot", "moonshot-only-key", `url=${moonshotURL}`)
  await run("search", "move", "magpie-websearch:moonshot", "1")
  await run("search", "move", "magpie-websearch:moonshot-cn", "2")
  const beforeCrossSite = calls.length
  const crossSiteResult = await search("moonshot refusal")
  assert.match(crossSiteResult, /example\.com\/moonshot-cn/)
  assert.equal(calls.length, beforeCrossSite + 2)
  assert.equal(calls.at(-2).path, "/moonshot/search")
  assert.equal(calls.at(-2).key, "Bearer moonshot-only-key")
  assert.equal(calls.at(-1).path, "/moonshot-cn/search")
  assert.equal(calls.at(-1).key, "Bearer moonshot-cn-dummy-key")
  await run("search", "rm", "magpie-websearch:moonshot")
  await run("search", "rm", "magpie-websearch:moonshot-cn")
  console.log("Checking Zhipu/Z.ai REST, engine sizing, business errors, timeout, key rotation and separate credentials…")
  for (const id of ["zhipu", "zai"]) {
    const searchURL = `http://127.0.0.1:${upstream.address().port}/${id}/search`
    await run("search", "add", `magpie-websearch:${id}`, `${id}-dummy-key`, `url=${searchURL}`)
    await run("search", "move", `magpie-websearch:${id}`, "1")
    const result = await search(`${id} smoke 中文`)
    assert.ok(result.includes(`https://example.com/${id}`), result)
    assert.ok(!result.includes(`${id}-extra`), result)
    assert.ok(result.includes(`${id} snippet result`), result)
    const call = calls.at(-1)
    assert.equal(call.path, `/${id}/search`)
    assert.equal(call.method, "POST")
    assert.equal(call.key, `Bearer ${id}-dummy-key`)
    assert.deepEqual(call.body, {
      search_query: `${id} smoke 中文`,
      search_engine: id === "zhipu" ? "search_pro_sogou" : "search-prime",
      ...(id === "zhipu" ? { search_intent: false, count: 10, content_size: "high", search_recency_filter: "oneWeek" } : { count: 1 }),
    })
    assert.match(await failure(`${id} empty`), /found nothing/)
    assert.match(await failure(`${id} business error`), /1703.*|no valid data/)
    assert.match(await failure("timeout"), /search timed out after 500ms/)
    if (id === "zhipu") {
      const beforeLongQuery = calls.length
      assert.match(await failure("搜".repeat(71)), /1–70 characters/)
      assert.equal(calls.length, beforeLongQuery, "reject a long cn query without sending or truncating it")
    }
    const refusal = await failure(`${id} refusal`)
    assert.match(refusal, /429/)
    assert.match(refusal, /retry after 7s/)
    assert.match(refusal, /search balance exhausted/)
    await run("search", "rm", `magpie-websearch:${id}`)
    await run("search", "add", `magpie-websearch:${id}`,
      `${id}-resting-dummy-key,${id}-good-dummy-key`, `url=${searchURL}`, "pick=order")
    await run("search", "move", `magpie-websearch:${id}`, "1")
    const beforeRotation = calls.length
    assert.ok((await search(`${id} rotation`)).includes(`https://example.com/${id}`))
    assert.equal(calls.length, beforeRotation + 2)
    assert.equal(calls.at(-2).key, `Bearer ${id}-resting-dummy-key`)
    assert.equal(calls.at(-1).key, `Bearer ${id}-good-dummy-key`)
    const beforeRest = calls.length
    await search(`${id} healthy preference`)
    assert.equal(calls.length, beforeRest + 1)
    assert.equal(calls.at(-1).key, `Bearer ${id}-good-dummy-key`)
    await run("search", "rm", `magpie-websearch:${id}`)
  }
  await run("search", "add", "magpie-websearch:zhipu", "cn-only-dummy-key", `url=http://127.0.0.1:${upstream.address().port}/zhipu/search`)
  await run("search", "add", "magpie-websearch:zai", "intl-only-dummy-key", `url=http://127.0.0.1:${upstream.address().port}/zai/search`)
  await run("search", "move", "magpie-websearch:zhipu", "1")
  await run("search", "move", "magpie-websearch:zai", "2")
  const beforeZhipuFallback = calls.length
  assert.match(await search("zhipu refusal"), /example\.com\/zai/)
  assert.equal(calls.length, beforeZhipuFallback + 2)
  assert.equal(calls.at(-2).path, "/zhipu/search")
  assert.equal(calls.at(-2).key, "Bearer cn-only-dummy-key")
  assert.equal(calls.at(-1).path, "/zai/search")
  assert.equal(calls.at(-1).key, "Bearer intl-only-dummy-key")
  await run("search", "rm", "magpie-websearch:zhipu")
  await run("search", "rm", "magpie-websearch:zai")
  console.log("Checking StepFun domestic REST, category, full text, moderation, Credit refusal and rotation…")
  const stepfunURL = `http://127.0.0.1:${upstream.address().port}/stepfun/proxy/search`
  await run("search", "add", "magpie-websearch:stepfun", "stepfun-dummy-key", `url=${stepfunURL}`)
  await run("search", "move", "magpie-websearch:stepfun", "1")
  const stepfunResult = await search("stepfun smoke 中文")
  assert.match(stepfunResult, /example\.com\/stepfun/)
  assert.doesNotMatch(stepfunResult, /stepfun-extra/)
  assert.match(stepfunResult, /Detailed StepFun full text/)
  const stepfunCall = calls.at(-1)
  assert.equal(stepfunCall.path, "/stepfun/proxy/search")
  assert.equal(stepfunCall.method, "POST")
  assert.equal(stepfunCall.key, "Bearer stepfun-dummy-key")
  assert.deepEqual(stepfunCall.body, { query: "stepfun smoke 中文", n: 1, category: "research" })
  assert.match(await failure("stepfun empty"), /found nothing/)
  assert.match(await failure("stepfun malformed"), /results must be an array/)
  assert.match(await failure("stepfun moderation"), /451.*|failed moderation/)
  assert.match(await failure("timeout"), /StepFun search timed out after 500ms/)
  const stepfunRefused = await failure("stepfun refusal")
  assert.match(stepfunRefused, /429/)
  assert.match(stepfunRefused, /project_credit_limit_exceeded/)
  assert.match(stepfunRefused, /retry after 7s/)
  await run("search", "on", "magpie-websearch:linkup")
  const beforeStepfunFallback = calls.length
  assert.match(await search("stepfun refusal"), /example\.com\/smoke/)
  assert.equal(calls.length, beforeStepfunFallback + 2)
  assert.equal(calls.at(-2).path, "/stepfun/proxy/search")
  assert.equal(calls.at(-1).path, "/proxy/v1/search")
  await run("search", "off", "magpie-websearch:linkup")
  await run("search", "rm", "magpie-websearch:stepfun")
  for (const refusedKey of ["stepfun-resting-dummy-key", "stepfun-interrupted-dummy-key"]) {
    await run("search", "add", "magpie-websearch:stepfun",
      `${refusedKey},stepfun-good-dummy-key`, `url=${stepfunURL}`, "pick=order")
    await run("search", "move", "magpie-websearch:stepfun", "1")
    const beforeStepfunRotation = calls.length
    assert.match(await search("stepfun rotation " + refusedKey), /example\.com\/stepfun/)
    assert.equal(calls.length, beforeStepfunRotation + 2)
    assert.equal(calls.at(-2).key, "Bearer " + refusedKey)
    assert.equal(calls.at(-1).key, "Bearer stepfun-good-dummy-key")
    const beforeStepfunRest = calls.length
    await search("stepfun healthy preference " + refusedKey)
    assert.equal(calls.length, beforeStepfunRest + 1)
    assert.equal(calls.at(-1).key, "Bearer stepfun-good-dummy-key")
    await run("search", "rm", "magpie-websearch:stepfun")
  }
  console.log("Checking Perplexity REST, fast mode, filters, rotation and fallback…")
  const perplexityURL = `http://127.0.0.1:${upstream.address().port}/perplexity/proxy/search`
  await run("search", "add", "magpie-websearch:perplexity", "perplexity-dummy-key", `url=${perplexityURL}`)
  await run("search", "move", "magpie-websearch:perplexity", "1")
  const perplexityResult = await search("perplexity smoke 中文")
  assert.match(perplexityResult, /example\.com\/perplexity/)
  assert.doesNotMatch(perplexityResult, /perplexity-extra/)
  assert.match(perplexityResult, /Perplexity snippet result/)
  const perplexityCall = calls.at(-1)
  assert.equal(perplexityCall.path, "/perplexity/proxy/search")
  assert.equal(perplexityCall.method, "POST")
  assert.equal(perplexityCall.key, "Bearer perplexity-dummy-key")
  assert.deepEqual(perplexityCall.body, {
    query: "perplexity smoke 中文",
    max_results: 1,
    search_type: "fast",
    search_recency_filter: "week",
    country: "US",
    search_language_filter: ["en", "zh"],
  })
  assert.match(await failure("perplexity empty"), /found nothing/)
  assert.match(await failure("perplexity malformed"), /results must be an array/)
  assert.match(await failure("timeout"), /Perplexity search timed out after 500ms/)
  const perplexityRefused = await failure("perplexity refusal")
  assert.match(perplexityRefused, /429/)
  assert.match(perplexityRefused, /retry after 7s/)
  await run("search", "on", "magpie-websearch:linkup")
  const beforePerplexityFallback = calls.length
  assert.match(await search("perplexity refusal"), /example\.com\/smoke/)
  assert.equal(calls.length, beforePerplexityFallback + 2)
  assert.equal(calls.at(-2).path, "/perplexity/proxy/search")
  assert.equal(calls.at(-1).path, "/proxy/v1/search")
  await run("search", "off", "magpie-websearch:linkup")
  await run("search", "rm", "magpie-websearch:perplexity")
  for (const refusedKey of ["perplexity-resting-dummy-key", "perplexity-interrupted-dummy-key"]) {
    await run("search", "add", "magpie-websearch:perplexity",
      `${refusedKey},perplexity-good-dummy-key`, `url=${perplexityURL}`, "pick=order")
    await run("search", "move", "magpie-websearch:perplexity", "1")
    const beforePerplexityRotation = calls.length
    assert.match(await search("perplexity rotation " + refusedKey), /example\.com\/perplexity/)
    assert.equal(calls.length, beforePerplexityRotation + 2)
    assert.equal(calls.at(-2).key, "Bearer " + refusedKey)
    assert.equal(calls.at(-1).key, "Bearer perplexity-good-dummy-key")
    const beforePerplexityRest = calls.length
    await search("perplexity healthy preference " + refusedKey)
    assert.equal(calls.length, beforePerplexityRest + 1)
    assert.equal(calls.at(-1).key, "Bearer perplexity-good-dummy-key")
    await run("search", "rm", "magpie-websearch:perplexity")
  }
  console.log("Checking Bocha/Ollama exact endpoints, text selection, refusals, fallback and key rotation…")
  for (const id of ["bocha", "ollama"]) {
    const label = id === "bocha" ? "Bocha" : "Ollama"
    const searchURL = `http://127.0.0.1:${upstream.address().port}/${id}/proxy/search`
    await run("search", "add", `magpie-websearch:${id}`, `${id}-dummy-key`, `url=${searchURL}`)
    await run("search", "move", `magpie-websearch:${id}`, "1")
    const before = calls.length
    const result = await search(`${id} smoke 中文`)
    assert.ok(result.includes(`https://example.com/${id}`), result)
    assert.ok(!result.includes(`${id}-extra`), result)
    assert.ok(result.includes(id === "bocha" ? "Bocha snippet result" : "ABCDEFGH…"), result)
    if (id === "bocha") {
      assert.doesNotMatch(result, /Bocha generated summary/)
    }
    assert.equal(calls.length, before + 1)
    const call = calls.at(-1)
    assert.equal(call.path, `/${id}/proxy/search`)
    assert.equal(call.method, "POST")
    assert.equal(call.key, `Bearer ${id}-dummy-key`)
    assert.deepEqual(call.body, id === "bocha"
      ? { query: `${id} smoke 中文`, count: 1, summary: false }
      : { query: `${id} smoke 中文`, max_results: 1 })
    assert.match(await failure(`${id} empty`), /found nothing/)
    const malformed = await failure(`${id} malformed`)
    assert.ok(malformed.includes(`Invalid ${label} response: ${id === "bocha" ? "webPages.value" : "results"} must be an array`), malformed)
    assert.ok((await failure("timeout")).includes(`${label} search timed out after 500ms`))
    if (id === "bocha") {
      const business = await failure("bocha business error")
      assert.match(business, /code 403/)
      assert.match(business, /log_id bocha-business-trace/)
      assert.match(business, /balance/)
      assert.doesNotMatch(business, /found nothing/)
    }
    const refusal = await failure(`${id} refusal`)
    assert.match(refusal, /429/)
    assert.match(refusal, /retry after 7s/)
    await run("search", "on", "magpie-websearch:linkup")
    const beforeFallback = calls.length
    assert.match(await search(`${id} refusal`), /example\.com\/smoke/)
    assert.equal(calls.length, beforeFallback + 2)
    assert.equal(calls.at(-2).path, `/${id}/proxy/search`)
    assert.equal(calls.at(-2).key, `Bearer ${id}-dummy-key`)
    assert.equal(calls.at(-1).path, "/proxy/v1/search")
    assert.equal(calls.at(-1).key, "Bearer smoke-dummy-key")
    await run("search", "off", "magpie-websearch:linkup")
    await run("search", "rm", `magpie-websearch:${id}`)
    for (const refusedKey of [`${id}-resting-dummy-key`, `${id}-interrupted-dummy-key`]) {
      await run("search", "add", `magpie-websearch:${id}`, `${refusedKey},${id}-good-dummy-key`, `url=${searchURL}`, "pick=order")
      await run("search", "move", `magpie-websearch:${id}`, "1")
      const beforeRotation = calls.length
      assert.ok((await search(`${id} rotation ${refusedKey}`)).includes(`https://example.com/${id}`))
      assert.equal(calls.length, beforeRotation + 2)
      assert.equal(calls.at(-2).path, `/${id}/proxy/search`)
      assert.equal(calls.at(-1).path, `/${id}/proxy/search`)
      assert.equal(calls.at(-2).key, "Bearer " + refusedKey)
      assert.equal(calls.at(-1).key, `Bearer ${id}-good-dummy-key`)
      const beforeRest = calls.length
      await search(`${id} healthy preference ${refusedKey}`)
      assert.equal(calls.length, beforeRest + 1)
      assert.equal(calls.at(-1).key, `Bearer ${id}-good-dummy-key`)
      await run("search", "rm", `magpie-websearch:${id}`)
    }
  }
  console.log("Checking explicit Bocha generated summary and freshness after complete options reload…")
  await run("plugin", "options", root, JSON.stringify({ ...options, bocha: { ...options.bocha, summary: true, freshness: "oneWeek" } }))
  assert.deepEqual(await loadedIDs(), definitions.map((entry) => entry.id).sort())
  await run("search", "add", "magpie-websearch:bocha", "bocha-summary-dummy-key", `url=http://127.0.0.1:${upstream.address().port}/bocha/proxy/search`)
  await run("search", "move", "magpie-websearch:bocha", "1")
  const beforeSummary = calls.length
  const summaryResult = await search("bocha explicit generated summary smoke")
  assert.match(summaryResult, /Bocha generated summary/)
  assert.doesNotMatch(summaryResult, /Bocha snippet result/)
  assert.equal(calls.length, beforeSummary + 1)
  assert.deepEqual(calls.at(-1).body, { query: "bocha explicit generated summary smoke", count: 1, summary: true, freshness: "oneWeek" })
  assert.equal(calls.at(-1).key, "Bearer bocha-summary-dummy-key")
  await run("search", "rm", "magpie-websearch:bocha")
  console.log("✓ magpie loads sixteen APIs; registration, options, custom URLs, timeouts, errors, anonymous cooldown, keyed rotation and fallback pass; Bocha summary/freshness and Ollama content limits pass")
} catch (error) {
  console.error(gatewayLog)
  throw error
} finally {
  if (gateway?.pid && gateway.exitCode === null) {
    if (process.platform === "win32") await exec("taskkill", ["/PID", String(gateway.pid), "/T", "/F"]).catch(() => {})
    else {
      gateway.kill("SIGTERM")
      await new Promise((resolve) => gateway.once("exit", resolve))
    }
  }
  for (const socket of sockets) socket.destroy()
  await new Promise((resolve) => upstream.close(resolve))
  await rm(sandbox, { recursive: true, force: true, maxRetries: 3 })
}
