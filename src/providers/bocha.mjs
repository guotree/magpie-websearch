import {
  boundDetail, cacheKey, cleanRetryAfter, configCountPolicy, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, resolveResultCount, safeResultUrl, truncateCodePoints,
} from "../core.mjs"

function parseSummary(options) {
  if (options.summary !== undefined) {
    if (typeof options.summary !== "boolean") throw new TypeError("bocha.summary must be a boolean")
    return options.summary
  }
  const raw = (process.env.BOCHA_SUMMARY ?? "").trim()
  if (!raw || raw === "false") return false
  if (raw === "true") return true
  console.warn("[magpie-websearch] BOCHA_SUMMARY is invalid; using false")
  return false
}

function describeFailure(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const tags = []
    if (typeof value.code === "string" || typeof value.code === "number") {
      tags.push(`[code ${truncateCodePoints(String(value.code), 80)}]`)
    }
    if (typeof value.log_id === "string" && value.log_id.trim()) {
      tags.push(`[log_id ${truncateCodePoints(value.log_id.trim(), 80)}]`)
    }
    const message = [value.message, value.msg].find((text) => typeof text === "string" && text.trim())
    if (tags.length || message) return [...tags, ...(message ? [message] : [])].join(" ")
  }
  return typeof value === "string" ? value : JSON.stringify(value)
}

function errorDetailFromBody(raw) {
  try { return describeFailure(JSON.parse(raw)) }
  catch { return raw }
}

export function createBocha(options = {}) {
  const ttl = configInt(options, "cacheTTL", "BOCHA_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "BOCHA_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "BOCHA_RESULT_LIMIT", 10, 50)
  const freshness = configStr(options, "freshness", "BOCHA_FRESHNESS")
  const summary = parseSummary(options)
  const cache = makeCache(ttl)

  return {
    name: "Bocha (magpie-websearch)",
    keysURL: "https://open.bochaai.com/api-keys",
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error("Bocha needs a key: add one in magpie's Web search settings")
      const q = normalizeQuery(query)
      if (!q) throw new Error("Bocha query must not be empty")
      const endpoint = resolveEndpoint(url, "https://api.bochaai.com/v1/web-search")
      const limit = resolveResultCount(count, countPolicy)
      const body = { query: q, count: limit, summary, ...(freshness ? { freshness } : {}) }
      const identity = cacheKey(endpoint, body, apiKey)
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
          label: "Bocha", timeout,
          retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
          errorDetailFromBody,
        })
      } catch (error) {
        const hint = error.status === 401
          ? "Check the API key at https://open.bochaai.com/api-keys"
          : error.status === 403 ? "Check account access and balance at https://open.bochaai.com/overview" : ""
        if (hint) error.message += (/[.!?]$/.test(error.message) ? " " : ". ") + hint
        throw error
      }

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid Bocha response: expected an object")
      }
      if (json.code !== undefined && json.code !== 200 && json.code !== "200") {
        throw new Error(`Bocha API error: ${boundDetail(describeFailure(json))}`)
      }
      if (json.error) {
        throw new Error(`Bocha API error: ${boundDetail(describeFailure({
          code: json.code, log_id: json.log_id,
          message: typeof json.error === "string" ? json.error : JSON.stringify(json.error),
        }))}`)
      }
      if (!json.data || typeof json.data !== "object" || Array.isArray(json.data)) {
        throw new Error("Invalid Bocha response: data must be an object")
      }
      const webPages = json.data.webPages
      if (webPages == null) {
        cache.write(identity, [])
        return []
      }
      if (typeof webPages !== "object" || Array.isArray(webPages) || !Array.isArray(webPages.value)) {
        throw new Error("Invalid Bocha response: webPages.value must be an array")
      }
      const valid = webPages.value.filter((item) => item && typeof item === "object"
        && !Array.isArray(item) && safeResultUrl(item.url) !== undefined)
      if (webPages.value.length > 0 && valid.length === 0) {
        throw new Error("Invalid Bocha response: no usable search results in payload")
      }
      const results = valid.slice(0, limit).map((item) => {
        const snippet = typeof item.snippet === "string" ? item.snippet : ""
        const text = summary && typeof item.summary === "string" && item.summary.trim() ? item.summary : snippet
        const published = typeof item.datePublished === "string" && item.datePublished.trim() ? item.datePublished : undefined
        return page(
          typeof item.name === "string" && item.name.trim() ? item.name.trim() : undefined,
          item.url.trim(), text,
          published ?? (typeof item.dateLastCrawled === "string" ? item.dateLastCrawled : undefined),
        )
      }).filter(Boolean)
      cache.write(identity, results)
      return results
    },
  }
}
