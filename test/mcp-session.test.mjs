import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { callSessionMCPTool } from "../src/mcp/session.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const endpoint = "https://example.com/mcp"
const args = {
  endpoint,
  headers: { Authorization: "Bearer secret-key" },
  toolNames: ["web_search_prime", "webSearchPrime"],
  argumentsForSchema: () => ({ search_query: "test" }),
  ctx: context(),
  timeout: 1_000,
  label: "Coding",
}

function lifecycle({ protocolVersion = "2024-11-05", sessionID = "private-session", tools, toolResult, callResponse } = {}) {
  const available = tools ?? [{ name: "web_search_prime", inputSchema: { type: "object", properties: { search_query: { type: "string" } } } }]
  return stubFetch((call) => {
    if (call.init.method === "DELETE") return new Response(null, { status: 204 })
    if (call.body.method === "initialize") {
      return json({ jsonrpc: "2.0", id: call.body.id, result: { protocolVersion, capabilities: {}, serverInfo: { name: "fake", version: "1" } } }, 200, { "Mcp-Session-Id": sessionID })
    }
    if (call.body.method === "notifications/initialized") return new Response(null, { status: 202 })
    if (call.body.method === "tools/list") return json({ jsonrpc: "2.0", id: call.body.id, result: { tools: available } })
    if (call.body.method === "tools/call") {
      if (callResponse) return callResponse(call)
      return json({ jsonrpc: "2.0", id: call.body.id, result: toolResult ?? { structuredContent: { results: [] } } })
    }
    throw new Error("unexpected request")
  })
}

test("session MCP: performs the lifecycle with negotiated headers, IDs and cleanup", async () => {
  const fake = lifecycle()
  try {
    const response = await callSessionMCPTool(args)
    assert.equal(response.toolName, "web_search_prime")
    const packageJSON = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    assert.deepEqual(fake.calls[0].body.params.clientInfo, {
      name: "magpie-websearch", version: packageJSON.version,
    })
    assert.deepEqual(fake.calls.map((call) => call.init.method === "DELETE" ? "DELETE" : call.body.method), [
      "initialize", "notifications/initialized", "tools/list", "tools/call", "DELETE",
    ])
    assert.deepEqual(fake.calls.slice(0, 4).map((call) => call.body.id), [1, undefined, 2, 3])
    assert.equal(fake.calls[0].init.headers["Mcp-Session-Id"], undefined)
    assert.equal(fake.calls[1].init.headers["Mcp-Session-Id"], "private-session")
    assert.equal(fake.calls[2].init.headers["MCP-Protocol-Version"], "2024-11-05")
    assert.equal(fake.calls[3].body.params.name, "web_search_prime")
    assert.deepEqual(fake.calls[3].body.params.arguments, { search_query: "test" })
    assert.equal(fake.calls.every((call) => call.init.redirect === "error"), true)
  } finally { fake.restore() }
})

test("session MCP: accepts SSE with chunked UTF-8 and ignores preceding notifications", async () => {
  const result = { content: [{ type: "text", text: JSON.stringify([{ title: "中文🐟", link: "https://example.com" }]) }] }
  const fake = lifecycle({
    callResponse(call) {
      const wire = [
        'data: {"jsonrpc":"2.0","method":"notifications/progress"}', "",
        `data: ${JSON.stringify({ jsonrpc: "2.0", id: call.body.id, result })}`, "", "",
      ].join("\r\n")
      const bytes = new TextEncoder().encode(wire)
      return new Response(new ReadableStream({
        start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() },
      }), { headers: { "Content-Type": "text/event-stream" } })
    },
  })
  try {
    assert.deepEqual((await callSessionMCPTool(args)).result, result)
  } finally { fake.restore() }
})

test("session MCP: rejects missing sessions, unknown versions, missing tools and RPC/tool errors", async () => {
  let fake = stubFetch((call) => json({ jsonrpc: "2.0", id: call.body.id, result: { protocolVersion: "2024-11-05" } }))
  try { await assert.rejects(callSessionMCPTool(args), /missing session ID/) } finally { fake.restore() }

  fake = lifecycle({ sessionID: "bad session" })
  try { await assert.rejects(callSessionMCPTool(args), /invalid session ID/) } finally { fake.restore() }

  fake = lifecycle({ protocolVersion: "2099-01-01" })
  try { await assert.rejects(callSessionMCPTool(args), /unsupported protocol version/) } finally { fake.restore() }

  fake = lifecycle({ tools: [{ name: "webReader", inputSchema: {} }] })
  try {
    await assert.rejects(callSessionMCPTool(args), /did not publish.*webReader/i)
    assert.equal(fake.calls.some((call) => call.body?.method === "tools/call"), false)
  } finally { fake.restore() }

  for (const rpc of [
    { error: { code: -32603, message: "secret-key private-session private failure" } },
    { result: { isError: true, content: [{ type: "text", text: "private tool detail" }] } },
  ]) {
    fake = lifecycle({ callResponse: (call) => json({ jsonrpc: "2.0", id: call.body.id, ...rpc }) })
    try {
      await assert.rejects(callSessionMCPTool(args), (error) => {
        assert.equal(error.status, undefined)
        assert.doesNotMatch(error.message, /secret-key|private-session|private tool detail/)
        return true
      })
    } finally { fake.restore() }
  }
})

test("session MCP: retains HTTP status and Retry-After without exposing bodies or credentials", async () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    const fake = lifecycle({
      callResponse: () => text(`secret-key private-session private response`, status, { "Retry-After": "0007" }),
    })
    try {
      await assert.rejects(callSessionMCPTool(args), (error) => {
        assert.equal(error.status, status)
        assert.doesNotMatch(error.message, /secret-key|private-session|private response/)
        if (status === 429) assert.equal(error.retryAfter, "7")
        return true
      })
    } finally { fake.restore() }
  }
})

test("session MCP: malformed responses fail clearly and DELETE failures never replace the result", async () => {
  let fake = lifecycle({ callResponse: () => text("not json", 200, { "Content-Type": "application/json" }) })
  try { await assert.rejects(callSessionMCPTool(args), /malformed JSON/) } finally { fake.restore() }

  fake = lifecycle()
  const original = globalThis.fetch
  // Wrap the installed stub so only DELETE is refused.
  globalThis.fetch = async (input, init) => init.method === "DELETE"
    ? text("method not allowed", 405)
    : original(input, init)
  try { assert.equal((await callSessionMCPTool(args)).toolName, "web_search_prime") } finally {
    globalThis.fetch = original
    fake.restore()
  }
})

test("session MCP: one total timeout and host cancellation cover every stage", async () => {
  const keepAlive = setInterval(() => {}, 1_000)
  let fake
  try {
    for (const stalled of ["initialize", "notifications/initialized", "tools/list", "tools/call"]) {
      fake = stubFetch((call) => {
        if (call.init.method === "DELETE") return new Response(null, { status: 204 })
        if (call.body.method === stalled) return new Promise((_, reject) => {
          call.init.signal.addEventListener("abort", () => reject(call.init.signal.reason), { once: true })
        })
        if (call.body.method === "initialize") {
          return json({ jsonrpc: "2.0", id: call.body.id, result: { protocolVersion: "2024-11-05" } }, 200, { "Mcp-Session-Id": "private-session" })
        }
        if (call.body.method === "notifications/initialized") return new Response(null, { status: 202 })
        if (call.body.method === "tools/list") return json({ jsonrpc: "2.0", id: call.body.id, result: { tools: [{ name: "web_search_prime", inputSchema: {} }] } })
        return json({ jsonrpc: "2.0", id: call.body.id, result: { structuredContent: { results: [] } } })
      })
      await assert.rejects(callSessionMCPTool({ ...args, timeout: 10 }), /timed out after 10ms/)
      fake.restore()
    }

    const controller = new AbortController()
    fake = lifecycle({ callResponse: (call) => new Promise((_, reject) => {
      call.init.signal.addEventListener("abort", () => reject(call.init.signal.reason), { once: true })
    }) })
    const pending = callSessionMCPTool({ ...args, timeout: 0, ctx: { abort: controller.signal } })
    controller.abort()
    await assert.rejects(pending, /cancelled/)
  } finally {
    clearInterval(keepAlive)
    fake?.restore()
  }
})
