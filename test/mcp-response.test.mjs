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
