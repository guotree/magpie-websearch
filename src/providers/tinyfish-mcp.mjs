// TinyFish's keyless MCP transport: one tools/call without a session or SDK.
// This covers its JSON/SSE replies, not a general MCP client lifecycle.
import { boundDetail, requestResponse } from "../core.mjs"

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

function matching(message, id, label) {
  if (!object(message) || message.id !== id) return undefined
  if (message.jsonrpc !== "2.0") throw new Error(`Invalid ${label} MCP response: expected JSON-RPC 2.0`)
  if (message.error !== undefined) {
    // JSON-RPC codes are not HTTP statuses, even if their text names a quota.
    throw new Error(`${label} MCP error: ${boundDetail(message.error?.message ?? "unknown error")}`)
  }
  if (!object(message.result)) throw new Error(`Invalid ${label} MCP response: missing result`)
  if (message.result.isError === true) {
    throw new Error(`${label} MCP search tool failed`)
  }
  return message.result
}

async function readResult(response, signal, id, label) {
  if (!response.body) throw new Error(`Invalid ${label} MCP response: missing body`)
  const sse = response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let data = []
  let skipLF = false
  const parse = (raw) => {
    let message
    try { message = JSON.parse(raw) } catch {
      throw new Error(`Invalid ${label} MCP response: malformed JSON`)
    }
    return matching(message, id, label)
  }
  const dispatch = () => {
    const raw = data.join("\n")
    data = []
    return raw && raw !== "[DONE]" ? parse(raw) : undefined
  }
  const line = (value) => {
    if (value === "") return dispatch()
    if (value.startsWith("data:")) data.push(value.slice(5).replace(/^ /, ""))
    return undefined
  }
  // Cancel also unblocks readers supplied by compatible services or tests that
  // do not tie their response stream to fetch's AbortSignal.
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      buffer += decoder.decode(value, { stream: !done })
      if (sse) {
        if (skipLF && buffer.length > 0) {
          if (buffer.startsWith("\n")) buffer = buffer.slice(1)
          skipLF = false
        }
        let end
        while ((end = /[\r\n]/.exec(buffer))) {
          // CR itself ends a line. Swallow an optional LF in the next chunk
          // without waiting for it before dispatching a completed event.
          skipLF = end[0] === "\r" && end.index === buffer.length - 1
          const width = buffer.slice(end.index, end.index + 2) === "\r\n" ? 2 : 1
          const result = line(buffer.slice(0, end.index))
          buffer = buffer.slice(end.index + width)
          if (result !== undefined) return result
        }
      }
      if (done) break
    }
    // An SSE event is dispatched only by its terminating blank line. A cut-off
    // stream must not turn an incomplete event into a successful search.
    if (!sse) {
      const result = parse(buffer)
      if (result !== undefined) return result
    }
    throw new Error(`Invalid ${label} MCP response: no matching response before stream ended`)
  } finally {
    signal.removeEventListener("abort", cancel)
    cancel()
    reader.releaseLock()
  }
}

export async function callTinyfishTool(endpoint, name, args, ctx, options = {}) {
  const { label = "search", headers = {} } = options
  const id = 1
  return requestResponse(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  }, ctx, options, (response, signal) => readResult(response, signal, id, label))
}
