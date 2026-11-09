import test from "node:test"
import assert from "node:assert/strict"
import { readMCPResult } from "../src/mcp/response.mjs"
import { context, json, text } from "./harness.mjs"

test("MCP response: returns method-specific fields without interpreting tool status", async () => {
  // isError has meaning only for tools/call. The shared reader must preserve
  // fields for the caller to interpret, even in an initialization/list result.
  for (const result of [
    { protocolVersion: "2024-11-05", capabilities: {} },
    { tools: [], isError: true },
    { isError: true, content: [{ type: "text", text: "tool diagnostic" }] },
  ]) {
    assert.deepEqual(await readMCPResult(json({ jsonrpc: "2.0", id: 2, result }), context().abort, 2, "test"), result)
  }
})

test("MCP response: matches RPC IDs across SSE notifications and unrelated replies", async () => {
  const response = text([
    'data: {"jsonrpc":"2.0","method":"notifications/progress"}', "",
    'data: {"jsonrpc":"2.0","id":1,"result":{"ignored":true}}', "",
    'data: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}', "", "",
  ].join("\n"), 200, { "Content-Type": "text/event-stream" })
  assert.deepEqual(await readMCPResult(response, context().abort, 2, "test"), { tools: [] })
})

test("MCP response: rejects RPC errors independently of tool status or HTTP status", async () => {
  await assert.rejects(readMCPResult(json({
    jsonrpc: "2.0", id: 2, error: { code: 429, message: "quota" },
  }), context().abort, 2, "test"), (error) => {
    assert.match(error.message, /MCP error: quota/)
    assert.equal(error.status, undefined)
    return true
  })
})

const byteLimit = 10 * 1024 * 1024
const wireWithPadding = (padding) => JSON.stringify({ jsonrpc: "2.0", id: 2, result: { padding } })

test("MCP response: accepts the exact UTF-8 byte budget and rejects one byte more", async () => {
  const overhead = Buffer.byteLength(wireWithPadding(""))
  const points = Math.floor((byteLimit - overhead) / 3)
  const padding = "中".repeat(points) + "x".repeat(byteLimit - overhead - points * 3)
  const raw = wireWithPadding(padding)
  assert.equal(Buffer.byteLength(raw), byteLimit)
  assert.equal((await readMCPResult(text(raw), context().abort, 2, "test")).padding, padding)
  await assert.rejects(readMCPResult(text(raw + " "), context().abort, 2, "test"), (error) => {
    assert.match(error.message, /10485760-byte limit/)
    assert.equal(error.status, undefined)
    assert.ok(error.message.length < 100)
    return true
  })
})

test("MCP response: limits cumulative chunks, SSE lines and notifications and cancels rejected streams", { timeout: 10_000 }, async () => {
  const encoder = new TextEncoder()
  const block = "x".repeat(1024 * 1024)
  for (const [type, chunk] of [
    ["application/json", block],
    ["text/event-stream", "data: " + block],
    ["text/event-stream", "data: " + block + "\n"],
    ["text/event-stream", ":" + block + "\n\n"],
  ]) {
    let cancelled = false
    let chunks = 0
    const response = new Response(new ReadableStream({
      pull(controller) {
        if (chunks++ === 12) controller.close()
        else controller.enqueue(encoder.encode(chunk))
      },
      cancel() { cancelled = true },
    }), { headers: { "Content-Type": type, "Content-Length": "1" } })
    await assert.rejects(readMCPResult(response, context().abort, 2, "test"), /10485760-byte limit/)
    assert.equal(cancelled, true)
    assert.equal(response.body.locked, false)
  }
})
