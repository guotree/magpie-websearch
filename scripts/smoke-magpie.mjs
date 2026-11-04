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
  const query = body?.params?.arguments?.query ?? body?.params?.arguments?.search_queries?.[0] ?? body?.search_queries?.[0] ?? body?.q ?? body?.query ?? target.searchParams.get("query")
  if (query === "rate limited") {
    res.writeHead(429, { "Retry-After": body?.q ? "30" : "120" }).end("slow down")
    return
  }
  if (query === "timeout") return
  res.setHeader("Content-Type", "application/json")
  if (target.pathname.startsWith("/tinyfish/")) {
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
  assert.deepEqual(definitions.map((entry) => entry.id).sort(), ["anysearch", "keenable", "linkup", "metaso", "parallel", "querit", "tinyfish"])
  assert.deepEqual(definitions.filter((entry) => entry.keyOptional).map((entry) => entry.id).sort(), ["anysearch", "keenable", "parallel", "tinyfish"])
  await run("plugin", "options", root, JSON.stringify({ enable: ["linkup", "querit"], disable: ["querit"] }))
  assert.deepEqual(await loadedIDs(), ["linkup"])
  await run("plugin", "options", root, JSON.stringify({
    linkup: { depth: "deep", maxResults: 2, cacheTTL: 0, timeout: 500 },
    anysearch: { cacheTTL: 0 }, keenable: { cacheTTL: 0 },
    metaso: { maxResults: 2, cacheTTL: 0, timeout: 500 },
    parallel: { maxResults: 1, mode: "fast", cacheTTL: 0, timeout: 500 },
    tinyfish: { maxResults: 1, language: "zh", cacheTTL: 0, timeout: 500 },
  }))
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
  console.log("✓ magpie loads seven APIs, filters registrations, applies options/custom URLs, handles timeout/429, and runs anonymous search with cooldown and fallback; Parallel and TinyFish support MCP JSON/SSE and keyed REST")
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
