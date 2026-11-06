import {
  boundDetail, cacheKey, cleanRetryAfter, configCountPolicy, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, resolveResultCount, truncateCodePoints,
} from "../core.mjs"

function parseCountry(options) {
  if (options.country !== undefined) {
    if (typeof options.country !== "string") {
      throw new TypeError("perplexity.country must be empty or a 2-letter country code")
    }
    const country = options.country.trim().toUpperCase()
    if (!country) return ""
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new TypeError("perplexity.country must be empty or a 2-letter country code")
    }
    return country
  }
  const raw = (process.env.PERPLEXITY_COUNTRY ?? "").trim().toUpperCase()
  if (!raw) return ""
  if (!/^[A-Z]{2}$/.test(raw)) {
    console.warn("[magpie-websearch] PERPLEXITY_COUNTRY is invalid; using an empty country filter")
    return ""
  }
  return raw
}

function parseLanguage(options) {
  if (options.language !== undefined) {
    if (typeof options.language !== "string") {
      throw new TypeError("perplexity.language must be empty or a comma-separated list of at most 20 two-letter language codes")
    }
    const items = options.language.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (items.length === 0) return []
    if (items.length > 20 || items.some((code) => !/^[a-z]{2}$/.test(code))) {
      throw new TypeError("perplexity.language must be empty or a comma-separated list of at most 20 two-letter language codes")
    }
    return items
  }
  const raw = process.env.PERPLEXITY_LANGUAGE
  if (raw === undefined || !raw.trim()) return []
  const items = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (items.length === 0) return []
  if (items.length > 20 || items.some((code) => !/^[a-z]{2}$/.test(code))) {
    console.warn("[magpie-websearch] PERPLEXITY_LANGUAGE is invalid; using an empty language filter")
    return []
  }
  return items
}

export function createPerplexity(options = {}) {
  const ttl = configInt(options, "cacheTTL", "PERPLEXITY_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "PERPLEXITY_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "PERPLEXITY_RESULT_LIMIT", 10, 20)
  const searchType = configStr(options, "searchType", "PERPLEXITY_SEARCH_TYPE", "web", ["web", "fast"], "perplexity")
  const recency = configStr(options, "recency", "PERPLEXITY_RECENCY", "", [
    "", "hour", "day", "week", "month", "year",
  ], "perplexity")
  const country = parseCountry(options)
  const languages = parseLanguage(options)
  const contentChars = configInt(options, "contentChars", "PERPLEXITY_CONTENT_CHARS", 4_000)
  const cache = makeCache(ttl)

  return {
    name: "Perplexity (magpie-websearch)",
    keysURL: "https://console.perplexity.ai/project/keys",
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error("Perplexity needs a key: add one in magpie's Web search settings")
      const q = normalizeQuery(query)
      if (!q) throw new Error("Perplexity query must not be empty")

      const endpoint = resolveEndpoint(url, "https://api.perplexity.ai/search")
      const limit = resolveResultCount(count, countPolicy)
      const body = {
        query: q,
        max_results: limit,
        search_type: searchType,
        ...(recency ? { search_recency_filter: recency } : {}),
        ...(country ? { country } : {}),
        ...(languages.length ? { search_language_filter: languages } : {}),
      }

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
        label: "Perplexity",
        timeout,
        retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
      })

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid Perplexity response: expected an object")
      }
      if (json.error) {
        throw new Error(`Perplexity API error: ${boundDetail(typeof json.error === "string" ? json.error : JSON.stringify(json.error))}`)
      }
      if (!Array.isArray(json.results)) {
        throw new Error("Invalid Perplexity response: results must be an array")
      }
      const valid = json.results.filter((item) => item && typeof item === "object"
        && !Array.isArray(item) && typeof item.url === "string" && item.url.trim())
      if (json.results.length > 0 && valid.length === 0) {
        throw new Error("Invalid Perplexity response: no usable search results in payload")
      }
      const results = valid.slice(0, limit).map((item) => {
        const snippet = typeof item.snippet === "string" ? item.snippet : ""
        const text = truncateCodePoints(snippet, contentChars)
        const date = typeof item.date === "string" && item.date.trim() ? item.date.trim() : undefined
        const lastUpdated = typeof item.last_updated === "string" && item.last_updated.trim() ? item.last_updated.trim() : undefined
        return page(
          typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined,
          item.url.trim(),
          text,
          date ?? lastUpdated,
        )
      })
      cache.write(identity, results)
      return results
    },
  }
}
