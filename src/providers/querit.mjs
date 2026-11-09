import {
  boundDetail, cacheKey, configCountPolicy, configInt, makeCache,
  page, requestJSON, requireQuery, resolveEndpoint, resolveResultCount, searchRows, truncateCodePoints,
} from "../core.mjs"

export function createQuerit(options = {}) {
  const ttl = configInt(options, "cacheTTL", "QUERIT_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "QUERIT_TIMEOUT", 25_000, 0, 2_147_483_647)
  // Querit applies its own upper limit; the configured count is a local cap.
  const countPolicy = configCountPolicy(options, "QUERIT_RESULT_LIMIT", 8, Number.MAX_SAFE_INTEGER, {
    legacyOption: "count", legacyEnv: "QUERIT_COUNT",
  })
  const cache = makeCache(ttl)

  return {
    name: "Querit (magpie-websearch)",
    keysURL: "https://querit.ai",
    async execute({ query, count, key, url }, ctx) {
      key = String(key ?? "").trim()
      if (!key) throw new Error("Querit needs a key: add one in magpie's Web search settings")
      const q = requireQuery(query, "Querit")
      const endpoint = resolveEndpoint(url, "https://api.querit.ai/v1/search")
      const body = { query: q, count: resolveResultCount(count, countPolicy) }
      const identity = cacheKey(endpoint, body, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body),
        redirect: "error",
      }, ctx, { label: "Querit", timeout })
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid Querit response: expected an object")
      }
      if (json.error_code !== undefined && Number(json.error_code) !== 200) {
        const id = typeof json.search_id === "string" || typeof json.search_id === "number" ? String(json.search_id) : "unknown"
        const code = truncateCodePoints(String(json.error_code), 80)
        throw new Error(`Querit API error ${code}: ${boundDetail(json.error_msg ?? "unknown error")} (search_id ${truncateCodePoints(id, 80)})`)
      }
      const results = searchRows(json.results?.result, "Querit")
        .slice(0, body.count)
        .map((item) => page(item.title, item.url,
          item.snippet ?? (Array.isArray(item.sentence) ? item.sentence.join(" ") : ""), item.page_age))
      cache.write(identity, results)
      return results
    },
  }
}
