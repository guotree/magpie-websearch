import {
  cacheKey, configInt, list, makeCache, normalizeQuery,
  page, requestJSON, resolveEndpoint, sizeFor,
} from "../core.mjs"

export function createQuerit(options = {}) {
  const ttl = configInt(options, "cacheTTL", "QUERIT_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "QUERIT_TIMEOUT", 25_000, 0, 2_147_483_647)
  // Querit applies its own upper limit; the configured count is a local cap.
  const countCap = configInt(options, "count", "QUERIT_COUNT", 8, 1)
  const cache = makeCache(ttl)

  return {
    name: "Querit (magpie-websearch)",
    keysURL: "https://querit.ai",
    async execute({ query, count, key, url }, ctx) {
      if (!key) throw new Error("Querit needs a key: add one in magpie's Web search settings")
      const endpoint = resolveEndpoint(url, "https://api.querit.ai/v1/search")
      const body = { query: normalizeQuery(query), count: sizeFor(count, countCap, countCap) }
      const identity = cacheKey(endpoint, body, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body),
      }, ctx, { label: "Querit", timeout })
      if (json.error_code !== undefined && Number(json.error_code) !== 200) {
        const id = typeof json.search_id === "string" || typeof json.search_id === "number" ? String(json.search_id) : "unknown"
        throw new Error(`Querit API error ${json.error_code}: ${json.error_msg ?? "unknown error"} (search_id ${id})`)
      }
      const results = list(json.results?.result)
        .filter((item) => item && item.url)
        .map((item) => page(item.title, item.url,
          item.snippet ?? (Array.isArray(item.sentence) ? item.sentence.join(" ") : ""), item.page_age))
      cache.write(identity, results)
      return results
    },
  }
}
