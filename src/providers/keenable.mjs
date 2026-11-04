import {
  cacheKey, configInt, configStr, list, makeAnonymousCooldown, makeCache, normalizeQuery,
  page, requestJSON, resolveEndpoint, sizeFor,
} from "../core.mjs"

export function createKeenable(options = {}) {
  const ttl = configInt(options, "cacheTTL", "KEENABLE_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "KEENABLE_TIMEOUT", 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", "KEENABLE_MAX_RESULTS", 10, 1, 50)
  const mode = configStr(options, "mode", "KEENABLE_MODE", "", ["", "pro", "realtime"])
  const title = (configStr(options, "title", "KEENABLE_TITLE", "magpie-websearch") || "magpie-websearch").slice(0, 256)
  const cache = makeCache(ttl)
  const cooldown = makeAnonymousCooldown("Keenable")

  return {
    name: "Keenable (magpie-websearch)",
    keysURL: "https://keenable.ai/",
    keyOptional: true,
    async execute({ query, count, key = "", url }, ctx) {
      key = key.trim()
      const endpoint = resolveEndpoint(url, key ? "https://api.keenable.ai/v1/search" : "https://api.keenable.ai/v1/search/public")
      const body = { query: normalizeQuery(query), max_results: sizeFor(count, maxResults, 50), ...(mode ? { mode } : {}) }
      const identity = cacheKey(endpoint, body, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await cooldown.run(endpoint, key, () => requestJSON(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json", "Content-Type": "application/json", "X-Keenable-Title": title,
          ...(key ? { "X-API-Key": key } : {}),
        },
        body: JSON.stringify(body),
      }, ctx, {
        label: "Keenable", timeout,
        messages: key ? {
          402: "Keenable credits exhausted (HTTP 402). Check your account balance, add credits or wait for your allowance to reset.",
        } : {},
      }))
      const results = list(json.results)
        .filter((item) => item && item.url)
        .map((item) => page(item.title, item.url, item.snippet || item.description, item.published_at))
      cache.write(identity, results)
      return results
    },
  }
}
