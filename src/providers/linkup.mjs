import {
  cacheKey, configInt, configStr, list, makeCache, normalizeQuery,
  page, requestJSON, searchEndpoint, sizeFor,
} from "../core.mjs"

export function createLinkup(options = {}) {
  const ttl = configInt(options, "cacheTTL", "LINKUP_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "LINKUP_TIMEOUT", 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", "LINKUP_MAX_RESULTS", 10, 1, 100)
  const contentChars = configInt(options, "contentChars", "LINKUP_CONTENT_CHARS", 4_000)
  const depth = configStr(options, "depth", "LINKUP_DEPTH", "fast", ["flash", "fast", "standard", "deep"])
  const cache = makeCache(ttl)
  const trimContent = (text) => {
    const value = String(text ?? "")
    if (contentChars <= 0 || value.length <= contentChars) return value
    const points = [...value]
    return points.length <= contentChars ? value : points.slice(0, contentChars).join("") + "…"
  }

  return {
    name: "Linkup (magpie-websearch)",
    keysURL: "https://app.linkup.so",
    async execute({ query, count, key, url }, ctx) {
      if (!key) throw new Error("Linkup needs a key: add one in magpie's Web search settings")
      const endpoint = searchEndpoint(url, "https://api.linkup.so/v1/search")
      const body = { q: normalizeQuery(query), depth, outputType: "searchResults", maxResults: sizeFor(count, maxResults, 100) }
      const identity = cacheKey(endpoint, body, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body),
      }, ctx, { label: "Linkup", timeout })
      const results = list(json.results)
        .filter((item) => item && item.url && item.type !== "image")
        .map((item) => page(item.name, item.url, trimContent(item.content)))
      cache.write(identity, results)
      return results
    },
  }
}
