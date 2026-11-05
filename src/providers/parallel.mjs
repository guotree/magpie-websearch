import {
  cacheKey, configInt, configStr, makeAnonymousCooldown, makeCache, normalizeQuery,
  page, requestJSON, resolveEndpoint, sizeFor, truncateCodePoints,
} from "../core.mjs"
import { callMCPSearch } from "../mcp.mjs"

function extractText(excerpts) {
  if (!Array.isArray(excerpts)) return ""
  return excerpts.filter((e) => typeof e === "string" && e).join("\n\n")
}

export function createParallel(options = {}) {
  const ttl = configInt(options, "cacheTTL", "PARALLEL_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "PARALLEL_TIMEOUT", 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", "PARALLEL_MAX_RESULTS", 10, 1, 20)
  const contentChars = configInt(options, "contentChars", "PARALLEL_CONTENT_CHARS", 4_000)
  const mode = configStr(options, "mode", "PARALLEL_MODE", "fast", ["turbo", "fast", "basic", "advanced"])
  const cache = makeCache(ttl)
  const cooldown = makeAnonymousCooldown("Parallel")

  return {
    name: "Parallel (magpie-websearch)",
    keysURL: "https://platform.parallel.ai",
    keyOptional: true,
    async execute({ query, count, key = "", url }, ctx) {
      key = key.trim()
      const q = normalizeQuery(query)
      if (!q || [...q].length > 200) {
        throw new Error("Parallel query must contain 1–200 characters")
      }
      if (!key && mode !== "fast") {
        throw new Error(`Parallel ${mode} search needs a key: add one in magpie's Web search settings`)
      }

      const limit = sizeFor(count, maxResults, 20)
      const endpoint = resolveEndpoint(url, key ? "https://api.parallel.ai/v1/search" : "https://mcp.parallel.ai/mcp")

      if (key) {
        const advanced_settings = { max_results: limit }
        if (contentChars > 0) advanced_settings.excerpt_settings = { max_chars_per_result: contentChars }
        const body = {
          objective: q,
          search_queries: [q],
          mode,
          advanced_settings,
        }
        const identity = cacheKey(endpoint, { ...body, contentChars }, key)
        const cached = cache.read(identity)
        if (cached) return cached
        const json = await requestJSON(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": key,
          },
          body: JSON.stringify(body),
        }, ctx, { label: "Parallel", timeout })
        if (!Array.isArray(json?.results)) throw new Error("Invalid Parallel response: expected results array")
        const results = json.results
          .filter((item) => item && item.url)
          .slice(0, limit)
          .map((item) => page(item.title, item.url, truncateCodePoints(extractText(item.excerpts), contentChars), item.publish_date))
        cache.write(identity, results)
        return results
      }

      const identity = cacheKey(endpoint, { mode: "mcp", q, limit, contentChars }, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await cooldown.run(endpoint, key, async () => {
        return callMCPSearch(endpoint, "web_search", {
          objective: q,
          search_queries: [q],
        }, ctx, { label: "Parallel", timeout })
      })
      if (!Array.isArray(json?.results)) throw new Error("Invalid Parallel response: expected results array")
      const results = json.results
        .filter((item) => item && item.url)
        .slice(0, limit)
        .map((item) => page(item.title, item.url, truncateCodePoints(extractText(item.excerpts), contentChars), item.publish_date))
      cache.write(identity, results)
      return results
    },
  }
}
