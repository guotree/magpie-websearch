// Local defensive budget, not an upstream service limit. The transport counts
// all bytes it reads, including SSE framing/notifications; extraction checks
// each JSON string again before decoding it.
export const MAX_MCP_BYTES = 10 * 1024 * 1024

export function mcpSizeError(label) {
  return new Error(`Invalid ${label} MCP payload: exceeds ${MAX_MCP_BYTES}-byte limit`)
}
