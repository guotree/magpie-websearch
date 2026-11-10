import {
  cacheKey, configCountPolicy, configInt, configStr, makeCache,
  page, requestJSON, requireQuery, resolveEndpoint, resolveResultCount, searchRows, truncateCodePoints,
} from "../core.mjs"

export function createLinkup(options = {}) {
  const ttl = configInt(options, "cacheTTL", "LINKUP_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "LINKUP_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "LINKUP_RESULT_LIMIT", 10, 100)
  const contentChars = configInt(options, "contentChars", "LINKUP_CONTENT_CHARS", 4_000)
  const depth = configStr(options, "depth", "LINKUP_DEPTH", "fast", ["flash", "fast", "standard", "deep"])
  const cache = makeCache(ttl)

  return {
    name: "Linkup (magpie-websearch)",
    keysURL: "https://app.linkup.so",
    async execute({ query, count, key, url }, ctx) {
      key = String(key ?? "").trim()
      if (!key) throw new Error("Linkup needs a key: add one in magpie's Web search settings")
      const q = requireQuery(query, "Linkup")
      const endpoint = resolveEndpoint(url, "https://api.linkup.so/v1/search")
      const body = { q, depth, outputType: "searchResults", maxResults: resolveResultCount(count, countPolicy) }
      const identity = cacheKey(endpoint, body, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body),
        redirect: "error",
      }, ctx, { label: "Linkup", timeout })
      const results = searchRows(json?.results, "Linkup", { ignore: (item) => item?.type === "image" })
        .slice(0, body.maxResults)
        .map((item) => page(item.name, item.url, truncateCodePoints(String(item.content ?? ""), contentChars)))
        .filter(Boolean)
      cache.write(identity, results)
      return results
    },
  }
}
