// Search payload extraction, independent of HTTP and session lifecycle.
// Return the envelope (including provider metadata), normalizing an accepted
// alias to the first array key. Providers still own row validation and mapping.
export function extractMCPResults(result, label, {
  arrayKeys = ["results"],
  maxJSONDepth = 1,
  decodeStructuredContent = false,
} = {}) {
  const primaryKey = arrayKeys[0]
  const extract = (value, depth) => {
    let decoded = value
    for (let i = 0; i < depth && typeof decoded === "string"; i++) {
      try { decoded = JSON.parse(decoded) } catch { return undefined }
    }
    // Preserve the original custom-key policy: bare arrays represent results.
    if (Array.isArray(decoded)) return primaryKey === "results" ? { results: decoded } : undefined
    if (decoded === null || typeof decoded !== "object") return undefined
    for (const key of arrayKeys) {
      if (Array.isArray(decoded[key])) {
        return key === primaryKey ? decoded : { ...decoded, [primaryKey]: decoded[key] }
      }
    }
    return undefined
  }

  const structured = extract(result?.structuredContent, decodeStructuredContent ? maxJSONDepth : 0)
  if (structured) return structured
  for (const part of Array.isArray(result?.content) ? result.content : []) {
    if (part?.type !== "text" || typeof part.text !== "string") continue
    const parsed = extract(part.text, maxJSONDepth)
    if (parsed) return parsed
  }
  throw new Error(`Invalid ${label} MCP search result: expected results array`)
}
