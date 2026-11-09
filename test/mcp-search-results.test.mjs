import test from "node:test"
import assert from "node:assert/strict"
import { extractMCPResults } from "../src/mcp/search-results.mjs"

const hit = { title: "Hit", url: "https://example.com" }
const textResult = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] })
const codingPolicy = {
  arrayKeys: ["results", "search_result"], maxJSONDepth: 3, decodeStructuredContent: true,
}

test("MCP search results: default extraction preserves envelopes and accepts bare arrays", () => {
  const payload = { results: [hit], search_id: "provider-metadata", total: 1 }
  assert.deepEqual(extractMCPResults({ structuredContent: payload }, "test"), payload)
  assert.deepEqual(extractMCPResults(textResult(payload), "test"), payload)
  assert.deepEqual(extractMCPResults({ structuredContent: [hit] }, "test"), { results: [hit] })
  assert.deepEqual(extractMCPResults(textResult([hit]), "test"), { results: [hit] })
})

test("MCP search results: custom array keys stay explicit and retain their envelope", () => {
  const payload = { items: [hit], total: 1 }
  const policy = { arrayKeys: ["items"] }
  for (const result of [{ structuredContent: payload }, textResult(payload)]) {
    assert.deepEqual(extractMCPResults(result, "test", policy), payload)
    assert.throws(() => extractMCPResults(result, "test"), /expected results array/)
  }
  for (const result of [{ structuredContent: [hit] }, textResult([hit])]) {
    assert.throws(() => extractMCPResults(result, "test", policy), /expected results array/)
  }
})

test("MCP search results: structured content wins including empty arrays, then text parts in order", () => {
  assert.deepEqual(extractMCPResults({
    structuredContent: { results: [] }, ...textResult([hit]),
  }, "test"), { results: [] })
  assert.deepEqual(extractMCPResults({
    structuredContent: { results: null },
    content: [
      { type: "image", data: "ignored" },
      { type: "text", text: "working..." },
      { type: "text", text: JSON.stringify({ results: [hit] }) },
      { type: "text", text: JSON.stringify({ results: [] }) },
    ],
  }, "test"), { results: [hit] })
})

test("MCP search results: aliases require opt in and normalize without mutating the input", () => {
  for (const payload of [
    { search_result: [hit], total: 1 },
    { results: null, search_result: [hit], total: 1 },
    { results: [], search_result: [hit], total: 1 },
  ]) {
    const snapshot = structuredClone(payload)
    const result = extractMCPResults({ structuredContent: payload }, "test", codingPolicy)
    assert.deepEqual(result.results, Array.isArray(payload.results) ? payload.results : [hit])
    assert.equal(result.total, 1)
    assert.deepEqual(payload, snapshot)
  }
  assert.throws(() => extractMCPResults({ structuredContent: { search_result: [hit] } }, "test"), /expected results array/)
})

test("MCP search results: decoding depth and structured JSON decoding follow the caller policy", () => {
  let encoded = { search_result: [hit] }
  for (let depth = 1; depth <= 4; depth++) {
    encoded = JSON.stringify(encoded)
    for (const result of [
      { structuredContent: encoded },
      { content: [{ type: "text", text: encoded }] },
    ]) {
      if (depth <= 3) assert.deepEqual(extractMCPResults(result, "test", codingPolicy).results, [hit])
      else assert.throws(() => extractMCPResults(result, "test", codingPolicy), /expected results array/)
    }
  }
  assert.throws(() => extractMCPResults({ structuredContent: JSON.stringify({ results: [hit] }) }, "test"), /expected results array/)
  assert.throws(() => extractMCPResults(textResult(JSON.stringify({ results: [hit] })), "test"), /expected results array/)
})

test("MCP search results: malformed payloads fail without HTTP status or reflected payload details", () => {
  for (const result of [
    {}, { structuredContent: {} }, { structuredContent: { results: "not-array" } },
    textResult(null), textResult(42), textResult("ordinary text"),
    { content: [{ type: "text", text: "private malformed payload" }] },
    { content: [{ type: "image", data: "private image" }] },
  ]) {
    assert.throws(() => extractMCPResults(result, "provider-x"), (error) => {
      assert.match(error.message, /Invalid provider-x MCP search result: expected results array/)
      assert.doesNotMatch(error.message, /private/)
      assert.equal(error.status, undefined)
      return true
    })
  }
})

test("MCP search results: bounds every JSON string before decoding by UTF-8 bytes", () => {
  const limit = 10 * 1024 * 1024
  const overhead = Buffer.byteLength(JSON.stringify({ results: [], padding: "" }))
  const exact = JSON.stringify({ results: [], padding: "x".repeat(limit - overhead) })
  assert.equal(Buffer.byteLength(exact), limit)
  assert.deepEqual(extractMCPResults({ content: [{ type: "text", text: exact }] }, "test").results, [])
  const tooLarge = JSON.stringify({ results: [], padding: "中".repeat(Math.floor(limit / 3)) })
  assert.ok(tooLarge.length < limit)
  assert.ok(Buffer.byteLength(tooLarge) > limit)
  for (const result of [
    { structuredContent: tooLarge },
    { content: [{ type: "text", text: exact + " " }] },
    { content: [{ type: "text", text: JSON.stringify(exact) }] },
  ]) {
    assert.throws(() => extractMCPResults(result, "test", codingPolicy), error => {
      assert.match(error.message, /10485760-byte limit/)
      assert.equal(error.status, undefined)
      assert.ok(error.message.length < 100)
      return true
    })
  }
})
