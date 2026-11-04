import test from "node:test"
import assert from "node:assert/strict"
import { callTinyfishTool } from "../src/providers/tinyfish-mcp.mjs"
import { TINYFISH_MCP_RESPONSE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const call = (ctx = context(), timeout = 1000) => callTinyfishTool("https://example.com/mcp", "search", { query: "test" }, ctx, { label: "TinyFish", timeout })

function stream(chunks, onCancel = () => {}) {
  return new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk) },
    cancel: onCancel,
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8" } })
}

test("tinyfish MCP: reads a JSON response and rejects RPC/tool errors without inventing HTTP status", async () => {
  let response = TINYFISH_MCP_RESPONSE
  const fake = stubFetch(() => json(response))
  try {
    assert.deepEqual(await call(), TINYFISH_MCP_RESPONSE.result)
    for (const bad of [
      { jsonrpc: "2.0", id: 1, error: { code: 429, message: "quota: " + "🐟".repeat(500) } },
      { jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "private diagnostic" }] } },
      { jsonrpc: "1.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 1, result: null },
      { jsonrpc: "2.0", id: 2, result: {} },
    ]) {
      response = bad
      await assert.rejects(call(), (e) => {
        assert.equal(e.status, undefined)
        assert.ok([...e.message].length < 400)
        assert.doesNotMatch(e.message, /private diagnostic/)
        return true
      })
    }
  } finally { fake.restore() }
})

test("tinyfish MCP: parses chunked UTF-8 SSE, CRLF/LF/CR, multiline data and ignores notifications", async () => {
  const result = { structuredContent: { results: [{ title: "中文🐟", url: "https://example.com" }] } }
  for (const newline of ["\r\n", "\n", "\r"]) {
    const wire = [
      ": keepalive", "", 'data: {"jsonrpc":"2.0","method":"notifications/progress"}', "",
      'data: {"jsonrpc":"2.0","id":99,"result":{}}', "",
      'event: message', 'id: ignored', 'data: {"jsonrpc":"2.0","id":1,',
      'data: "result":' + JSON.stringify(result) + '}', "", "",
    ].join(newline)
    const bytes = new TextEncoder().encode(wire)
    let cancelled = false
    // Byte-sized chunks split both Unicode code points and CRLF separators.
    const fake = stubFetch(() => stream([...bytes].map((byte) => new Uint8Array([byte])), () => { cancelled = true }))
    try {
      assert.deepEqual(await call(), result)
      assert.equal(cancelled, true, "stop without waiting for the server to close")
    } finally { fake.restore() }
  }
})

test("tinyfish MCP: malformed JSON, incomplete SSE and streams without a matching response fail", async () => {
  for (const raw of [
    "data: nope\n\n", 'data: {"jsonrpc":"2.0","id":1,"result":{}}',
    'data: {"jsonrpc":"2.0","id":2,"result":{}}\n\n', "data: [DONE]\n\n",
  ]) {
    const fake = stubFetch(() => text(raw, 200, { "Content-Type": "text/event-stream" }))
    try { await assert.rejects(call(), /Invalid TinyFish MCP response/) } finally { fake.restore() }
  }
  const fake = stubFetch(() => text("not JSON", 200, { "Content-Type": "application/json" }))
  try { await assert.rejects(call(), /malformed JSON/) } finally { fake.restore() }
})

test("tinyfish MCP: the deadline and host cancellation cover stalled JSON and SSE bodies", async () => {
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (const type of ["application/json", "text/event-stream"]) {
      let cancelled = 0
      const fake = stubFetch(() => new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { "Content-Type": type } }))
      try {
        await assert.rejects(call(context(), 10), /timed out after 10ms/)
        const controller = new AbortController()
        const pending = call({ abort: controller.signal }, 0)
        controller.abort()
        await assert.rejects(pending, /cancelled/)
        assert.equal(cancelled, 2)
      } finally { fake.restore() }
    }
  } finally { clearInterval(keepAlive) }
})
