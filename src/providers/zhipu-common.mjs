import {
  boundDetail, cacheKey, cleanRetryAfter, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, sizeFor,
} from "../core.mjs"

// Some proxies wrap successful responses in a conventional status envelope.
const SUCCESS_CODES = new Set([0, "0", 200, "200"])

function describeFailure(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const message = typeof value.message === "string" ? value.message
      : typeof value.msg === "string" ? value.msg : ""
    const code = typeof value.code === "string" || typeof value.code === "number" ? value.code : undefined
    if (message) return boundDetail(message + (code === undefined ? "" : ` (code ${code})`))
  }
  return boundDetail(typeof value === "string" ? value : JSON.stringify(value))
}

// The two entry modules fix the site. Credentials and caches are never shared
// across factories; only the standalone REST protocol is shared here.
export function createZhipuProvider(meta, options = {}) {
  const { id, name, defaultEndpoint, keysURL, envPrefix, china } = meta
  const label = name.replace(/ \(magpie-websearch\)$/, "")
  const ttl = configInt(options, "cacheTTL", `${envPrefix}CACHE_TTL`, 600_000)
  const timeout = configInt(options, "timeout", `${envPrefix}TIMEOUT`, 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", `${envPrefix}MAX_RESULTS`, 10, 1, 50)
  const contentChars = configInt(options, "contentChars", `${envPrefix}CONTENT_CHARS`, 4_000)
  const recency = configStr(options, "recency", `${envPrefix}RECENCY`, "noLimit", [
    "noLimit", "oneDay", "oneWeek", "oneMonth", "oneYear",
  ])
  let domainFilter = configStr(options, "domainFilter", `${envPrefix}DOMAIN_FILTER`)
  const engine = china ? configStr(options, "engine", `${envPrefix}ENGINE`, "search_std", [
    "search_std", "search_pro", "search_pro_sogou", "search_pro_quark",
  ]) : "search-prime"
  const contentSize = china ? configStr(options, "contentSize", `${envPrefix}CONTENT_SIZE`, "medium", [
    "medium", "high",
  ]) : undefined
  if (!china) {
    for (const field of ["engine", "contentSize"]) {
      if (options[field] !== undefined) {
        console.warn(`[magpie-websearch] ${id}.${field} is only supported by Zhipu; ignoring it`)
      }
    }
  }
  if (engine === "search_pro_quark" && domainFilter) {
    if (options.domainFilter !== undefined) {
      throw new TypeError(`${id}.domainFilter is not supported by search_pro_quark`)
    }
    console.warn(`[magpie-websearch] ${envPrefix}DOMAIN_FILTER is not supported by search_pro_quark; ignoring it`)
    domainFilter = ""
  }
  const cache = makeCache(ttl)

  const trimContent = (value) => {
    const text = typeof value === "string" ? value : ""
    if (contentChars <= 0 || text.length <= contentChars) return text
    const points = [...text]
    return points.length <= contentChars ? text : points.slice(0, contentChars).join("") + "…"
  }

  return {
    name,
    keysURL,
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error(`${label} needs a key: add one in magpie's Web search settings`)
      const q = normalizeQuery(query)
      if (!q) throw new Error(`${label} query must not be empty`)
      if (china && [...q].length > 70) throw new Error("Zhipu query must contain 1–70 characters")

      const endpoint = resolveEndpoint(url, defaultEndpoint)
      const limit = sizeFor(count, maxResults, 50)
      // Sogou accepts tens only. Round up so the upstream size never falls
      // below the local cap. Quark does not document count support.
      const upstreamCount = engine === "search_pro_sogou" ? Math.ceil(limit / 10) * 10 : limit
      const body = {
        search_query: q,
        search_engine: engine,
        ...(china ? { search_intent: false } : {}),
        ...(engine === "search_pro_quark" ? {} : { count: upstreamCount }),
        ...(recency === "noLimit" ? {} : { search_recency_filter: recency }),
        ...(domainFilter ? { search_domain_filter: domainFilter } : {}),
        ...(contentSize === "high" ? { content_size: contentSize } : {}),
      }
      // Include the local limit even when count is omitted (Quark), rounded
      // to the same Sogou bucket, or ignored by upstream filters.
      const identity = cacheKey(endpoint, { site: id, ...body, limit, contentChars }, apiKey)
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
          label,
          timeout,
          retryAfterFromResponse: (response) => cleanRetryAfter(response.headers.get("Retry-After")),
        })
      } catch (error) {
        // Keep the actual HTTP status/retryAfter and bounded diagnostic body.
        // 429 may mean insufficient balance or quota, not just concurrency.
        const hint = error.status === 401
          ? `Check the key's site and product type; use a Standard API Key from ${keysURL}`
          : error.status === 429 ? "Rate limit or search quota exceeded; check account balance and usage" : ""
        if (hint) error.message += (/[.!?]$/.test(error.message) ? " " : ". ") + hint
        throw error
      }

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error(`Invalid ${label} response: expected an object`)
      }
      if (json.error) {
        throw new Error(`${label} API error: ${describeFailure(json.error)}`)
      }
      if (json.code !== undefined && json.code !== null && !SUCCESS_CODES.has(json.code)) {
        throw new Error(`${label} API error: ${describeFailure(json)}`)
      }
      // Requiring an explicit array is a plugin validation policy. Neither
      // site's OpenAPI marks the response property as required.
      if (!Array.isArray(json.search_result)) {
        throw new Error(`Invalid ${label} response: search_result must be an array`)
      }
      const valid = json.search_result.filter((item) => item && typeof item === "object"
        && !Array.isArray(item) && typeof item.link === "string" && item.link.trim())
      if (json.search_result.length > 0 && valid.length === 0) {
        throw new Error(`Invalid ${label} response: no usable search results in payload`)
      }
      const results = valid.slice(0, limit).map((item) => page(
        typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined,
        item.link.trim(),
        trimContent(item.content),
        item.publish_date,
      ))
      cache.write(identity, results)
      return results
    },
  }
}
