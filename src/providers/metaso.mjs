import {
  cacheKey, configCountPolicy, configInt, configStr, list, makeCache, normalizeQuery,
  page, requestJSON, resolveEndpoint, resolveResultCount, truncateCodePoints,
} from "../core.mjs"

export function createMetaso(options = {}) {
  const ttl = configInt(options, "cacheTTL", "METASO_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "METASO_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "METASO_RESULT_LIMIT", 10, 50)
  const contentChars = configInt(options, "contentChars", "METASO_CONTENT_CHARS", 4_000)
  const scope = configStr(options, "scope", "METASO_SCOPE", "webpage", [
    "webpage", "document", "paper", "image", "video", "podcast",
  ])
  const cache = makeCache(ttl)

  return {
    name: "Metaso (magpie-websearch)",
    keysURL: "https://metaso.cn/search-api/api-keys",
    async execute({ query, count, key, url }, ctx) {
      if (!key) throw new Error("Metaso needs a key: add one in magpie's Web search settings")
      const endpoint = resolveEndpoint(url, "https://metaso.cn/api/v1/search")
      const limit = resolveResultCount(count, countPolicy)
      const body = {
        q: normalizeQuery(query),
        scope,
        size: limit,
        concise: true,
      }
      const identity = cacheKey(endpoint, body, key)
      const cached = cache.read(identity)
      if (cached) return cached

      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
        },
        body: JSON.stringify(body),
      }, ctx, { label: "Metaso", timeout })

      const raw = list(json.webpages ?? json.results ?? json.papers ?? json.documents ?? json.data)
      const results = raw
        .filter((item) => item && (item.link || item.url))
        .slice(0, limit)
        .map((item) => page(item.title, item.link || item.url,
          truncateCodePoints(String(item.snippet ?? item.content ?? ""), contentChars), item.date))

      cache.write(identity, results)
      return results
    },
  }
}
