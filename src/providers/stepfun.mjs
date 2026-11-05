import {
  boundDetail, cacheKey, cleanRetryAfter, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, sizeFor, truncateCodePoints,
} from "../core.mjs"

function describeFailure(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // Keep short machine identifiers before the message so truncation cannot
    // discard the distinction between rate limits and project/member caps.
    const tags = [value.type, value.code]
      .filter((tag) => typeof tag === "string" || typeof tag === "number")
      .map((tag) => truncateCodePoints(String(tag).trim(), 80))
      .filter(Boolean)
    const message = typeof value.message === "string" ? value.message : ""
    if (tags.length || message) return (tags.length ? `[${tags.join(", ")}] ` : "") + message
  }
  return typeof value === "string" ? value : JSON.stringify(value)
}

function errorDetailFromBody(raw) {
  try {
    const body = JSON.parse(raw)
    return describeFailure(body?.error ?? body)
  } catch {
    return raw
  }
}

// Standalone China REST search. Step Plan MCP is a separate protocol/channel.
export function createStepfun(options = {}) {
  const ttl = configInt(options, "cacheTTL", "STEPFUN_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "STEPFUN_TIMEOUT", 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", "STEPFUN_MAX_RESULTS", 10, 1, 20)
  const category = configStr(options, "category", "STEPFUN_CATEGORY", "", [
    "", "programming", "research", "gov", "business",
  ])
  const content = configStr(options, "content", "STEPFUN_CONTENT", "snippet", ["snippet", "full"])
  const contentChars = configInt(options, "contentChars", "STEPFUN_CONTENT_CHARS", 4_000)
  const cache = makeCache(ttl)

  return {
    name: "StepFun (magpie-websearch)",
    keysURL: "https://platform.stepfun.com/interface-key",
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error("StepFun needs a key: add one in magpie's Web search settings")
      const q = normalizeQuery(query)
      if (!q) throw new Error("StepFun query must not be empty")

      const endpoint = resolveEndpoint(url, "https://api.stepfun.com/v1/search")
      const limit = sizeFor(count, maxResults, 20)
      const body = { query: q, n: limit, ...(category ? { category } : {}) }
      // Content selection is local: the API documents no include_content switch.
      const identity = cacheKey(endpoint, { ...body, content, contentChars }, apiKey)
      const cached = cache.read(identity)
      if (cached) return cached

      let json
      try {
        json = await requestJSON(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify(body),
          redirect: "error",
        }, ctx, {
          label: "StepFun",
          timeout,
          messages: {
            402: "StepFun API error 402: insufficient balance or organization Credit; top up at https://platform.stepfun.com",
          },
          retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
          errorDetailFromBody,
        })
      } catch (error) {
        const hint = error.status === 401
          ? "Check the API key and account access on https://platform.stepfun.com/interface-key"
          : error.status === 429
            ? "Rate limit or Credit quota exceeded; check account, project and member limits"
            : error.status === 451 ? "Query or result content failed moderation; try rephrasing the query" : ""
        if (hint) error.message += (/[.!?]$/.test(error.message) ? " " : ". ") + hint
        throw error
      }

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid StepFun response: expected an object")
      }
      if (json.error) {
        throw new Error(`StepFun API error: ${boundDetail(describeFailure(json.error))}`)
      }
      // Explicit arrays distinguish valid empty searches from malformed payloads.
      if (!Array.isArray(json.results)) {
        throw new Error("Invalid StepFun response: results must be an array")
      }
      const valid = json.results.filter((item) => item && typeof item === "object"
        && !Array.isArray(item) && typeof item.url === "string" && item.url.trim())
      if (json.results.length > 0 && valid.length === 0) {
        throw new Error("Invalid StepFun response: no usable search results in payload")
      }
      const results = valid.slice(0, limit).map((item) => {
        const snippet = typeof item.snippet === "string" ? item.snippet : ""
        const full = typeof item.content === "string" ? item.content : ""
        const preferred = content === "full" ? full : snippet
        const fallback = content === "full" ? snippet : full
        return page(
          typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined,
          item.url.trim(),
          truncateCodePoints(preferred.trim() ? preferred : fallback, contentChars),
          // Preserve the index-time string; it is not a publication timestamp.
          item.time,
        )
      })
      cache.write(identity, results)
      return results
    },
  }
}
