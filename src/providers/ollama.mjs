import {
  boundDetail, cacheKey, cleanRetryAfter, configCountPolicy, configInt, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, resolveResultCount, truncateCodePoints,
} from "../core.mjs"

export function createOllama(options = {}) {
  const ttl = configInt(options, "cacheTTL", "OLLAMA_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "OLLAMA_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "OLLAMA_RESULT_LIMIT", 5, 10)
  const contentChars = configInt(options, "contentChars", "OLLAMA_CONTENT_CHARS", 2_000)
  const cache = makeCache(ttl)

  return {
    name: "Ollama (magpie-websearch)",
    keysURL: "https://ollama.com/settings/keys",
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error("Ollama needs a key: add one in magpie's Web search settings")
      const q = normalizeQuery(query)
      if (!q) throw new Error("Ollama query must not be empty")
      const endpoint = resolveEndpoint(url, "https://ollama.com/api/web_search")
      const limit = resolveResultCount(count, countPolicy)
      const body = { query: q, max_results: limit }
      const identity = cacheKey(endpoint, { ...body, contentChars }, apiKey)
      const cached = cache.read(identity)
      if (cached) return cached

      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify(body),
        redirect: "error",
      }, ctx, {
        label: "Ollama", timeout,
        retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
      })
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid Ollama response: expected an object")
      }
      if (json.error) {
        throw new Error(`Ollama API error: ${boundDetail(typeof json.error === "string" ? json.error : JSON.stringify(json.error))}`)
      }
      if (!Array.isArray(json.results)) {
        throw new Error("Invalid Ollama response: results must be an array")
      }
      const valid = json.results.filter((item) => item && typeof item === "object"
        && !Array.isArray(item) && typeof item.url === "string" && item.url.trim())
      if (json.results.length > 0 && valid.length === 0) {
        throw new Error("Invalid Ollama response: no usable search results in payload")
      }
      const results = valid.slice(0, limit).map((item) => page(
        typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined,
        item.url.trim(),
        truncateCodePoints(typeof item.content === "string" ? item.content : "", contentChars),
      ))
      cache.write(identity, results)
      return results
    },
  }
}
