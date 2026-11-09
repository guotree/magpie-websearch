// Shared JSON/SSE response decoding for both MCP calling strategies. This
// module owns JSON-RPC framing only; callers interpret method-specific results.
import { boundDetail } from "../core.mjs"
import { MAX_MCP_BYTES, mcpSizeError } from "./limits.mjs"

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

function matching(message, id, label) {
  if (!object(message) || message.id !== id) return undefined
  if (message.jsonrpc !== "2.0") throw new Error(`Invalid ${label} MCP response: expected JSON-RPC 2.0`)
  if (message.error !== undefined) {
    // JSON-RPC codes are not HTTP statuses, even if their text names a quota.
    throw new Error(`${label} MCP error: ${boundDetail(message.error?.message ?? "unknown error")}`)
  }
  if (!object(message.result)) throw new Error(`Invalid ${label} MCP response: missing result`)
  return message.result
}

export async function readMCPResult(response, signal, id, label) {
  if (!response.body) throw new Error(`Invalid ${label} MCP response: missing body`)
  const sse = response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let data = []
  let skipLF = false
  let receivedBytes = 0
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
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      receivedBytes += value?.byteLength ?? 0
      if (receivedBytes > MAX_MCP_BYTES) throw mcpSizeError(label)
      buffer += decoder.decode(value, { stream: !done })
      if (sse) {
        if (skipLF && buffer.length > 0) {
          if (buffer.startsWith("\n")) buffer = buffer.slice(1)
          skipLF = false
        }
        let end
        while ((end = /[\r\n]/.exec(buffer))) {
          skipLF = end[0] === "\r" && end.index === buffer.length - 1
          const width = buffer.slice(end.index, end.index + 2) === "\r\n" ? 2 : 1
          const result = line(buffer.slice(0, end.index))
          buffer = buffer.slice(end.index + width)
          if (result !== undefined) return result
        }
      }
      if (done) break
    }
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
