import {
  cacheKey, configCountPolicy, configInt, configStr, makeAnonymousCooldown, makeCache,
  page, requestJSON, requireQuery, resolveEndpoint, resolveResultCount, searchRows,
} from "../core.mjs"

export function createKeenable(options = {}) {
  const ttl = configInt(options, "cacheTTL", "KEENABLE_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "KEENABLE_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "KEENABLE_RESULT_LIMIT", 10, 50)
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
      const q = requireQuery(query, "Keenable")
      const endpoint = resolveEndpoint(url, key ? "https://api.keenable.ai/v1/search" : "https://api.keenable.ai/v1/search/public")
      const body = { query: q, max_results: resolveResultCount(count, countPolicy), ...(mode ? { mode } : {}) }
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
        redirect: "error",
      }, ctx, {
        label: "Keenable", timeout,
        messages: key ? {
          402: "Keenable credits exhausted (HTTP 402). Check your account balance, add credits or wait for your allowance to reset.",
        } : {},
      }))
      const results = searchRows(json?.results, "Keenable")
        .slice(0, body.max_results)
        .map((item) => page(item.title, item.url, item.snippet || item.description, item.published_at))
        .filter(Boolean)
      cache.write(identity, results)
      return results
    },
  }
}
