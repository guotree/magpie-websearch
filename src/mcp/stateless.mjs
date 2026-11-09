// A single tools/call over HTTP JSON or SSE, without initialization or a
// session. Authentication is supplied independently through optional headers.
import { requestResponse } from "../core.mjs"
import { readMCPResult } from "./response.mjs"
import { extractMCPResults } from "./search-results.mjs"

export async function callMCPTool(endpoint, name, args, ctx, options = {}) {
  const { label = "search", headers = {} } = options
  const id = 1
  const result = await requestResponse(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    redirect: "error",
  }, ctx, options, (response, signal) => readMCPResult(response, signal, id, label))
  if (result.isError === true) throw new Error(`${label} MCP search tool failed`)
  return result
}

// Compose the stateless call with search extraction; session providers can use
// the same extractor directly without depending on this calling strategy.
export async function callMCPSearch(endpoint, name, args, ctx, options = {}) {
  const { label = "search", timeout, headers, arrayKey = "results" } = options
  const toolResult = await callMCPTool(endpoint, name, args, ctx, { label, timeout, headers })
  return extractMCPResults(toolResult, label, { arrayKeys: [arrayKey] })
}
