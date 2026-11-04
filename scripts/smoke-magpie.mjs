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
  const body = JSON.parse(raw)
  calls.push({ path: req.url, body, key: req.headers.authorization,
    apiKey: req.headers["x-api-key"], title: req.headers["x-keenable-title"] })
  const query = body.q ?? body.query
  if (query === "rate limited") {
    res.writeHead(429, { "Retry-After": body.q ? "30" : "120" }).end("slow down")
    return
  }
  if (query === "timeout") return
  res.setHeader("Content-Type", "application/json")
  if (req.url.startsWith("/anysearch/")) {
    res.end(JSON.stringify({ code: 0, data: { results: [
      { title: "Anonymous AnySearch", url: "https://example.com/anysearch", snippet: "Anonymous smoke result" },
    ] } }))
  } else if (req.url.startsWith("/keenable/")) {
    res.end(JSON.stringify({ results: [
      { title: "Anonymous Keenable", url: "https://example.com/keenable", snippet: "Anonymous smoke result" },
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
  assert.deepEqual(definitions.map((entry) => entry.id).sort(), ["anysearch", "keenable", "linkup", "querit"])
  assert.deepEqual(definitions.filter((entry) => entry.keyOptional).map((entry) => entry.id).sort(), ["anysearch", "keenable"])
  await run("plugin", "options", root, JSON.stringify({ enable: ["linkup", "querit"], disable: ["querit"] }))
  assert.deepEqual(await loadedIDs(), ["linkup"])
  await run("plugin", "options", root, JSON.stringify({
    linkup: { depth: "deep", maxResults: 2, cacheTTL: 0, timeout: 500 },
    anysearch: { cacheTTL: 0 }, keenable: { cacheTTL: 0 },
  }))
  await run("search", "add", "magpie-websearch:linkup", "smoke-dummy-key", `url=http://127.0.0.1:${upstream.address().port}/proxy/v1`)
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
    await run("search", "add", "magpie-websearch:" + id, `url=http://127.0.0.1:${upstream.address().port}/${id}/v1`)
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
    assert.equal(call.path, `/${id}/v1/search` + (id === "keenable" ? "/public" : ""))
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
  console.log("✓ magpie loads four APIs, filters registrations, applies options/custom URLs, handles timeout/429, and runs anonymous search with cooldown and fallback")
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
