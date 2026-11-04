import {
  cacheKey, configInt, configStr, list, makeAnonymousCooldown, makeCache, normalizeQuery,
  page, requestJSON, resolveEndpoint, sizeFor,
} from "../core.mjs"

export function createAnysearch(options = {}) {
  const ttl = configInt(options, "cacheTTL", "ANYSEARCH_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "ANYSEARCH_TIMEOUT", 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", "ANYSEARCH_MAX_RESULTS", 10, 1, 10)
  const tag = configStr(options, "tag", "ANYSEARCH_TAG")
  const zone = configStr(options, "zone", "ANYSEARCH_ZONE", "", ["", "cn", "intl"])
  const language = configStr(options, "language", "ANYSEARCH_LANGUAGE")
  const format = configStr(options, "format", "ANYSEARCH_FORMAT", "markdown", ["markdown", "json"])
  const cache = makeCache(ttl)
  const cooldown = makeAnonymousCooldown("AnySearch")

  return {
    name: "AnySearch (magpie-websearch)",
    keysURL: "https://www.anysearch.com/",
    keyOptional: true,
    async execute({ query, count, key = "", url }, ctx) {
      key = key.trim()
      const endpoint = resolveEndpoint(url, "https://api.anysearch.com/v1/search")
      const body = {
        query: normalizeQuery(query),
        max_results: sizeFor(count, maxResults, 10),
        ...(tag ? { tag } : {}),
        ...(zone ? { zone } : {}),
        ...(language ? { language } : {}),
        format,
      }
      const identity = cacheKey(endpoint, body, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await cooldown.run(endpoint, key, () => requestJSON(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json", "Content-Type": "application/json",
          ...(key ? { Authorization: "Bearer " + key } : {}),
        },
        body: JSON.stringify(body),
      }, ctx, {
        label: "AnySearch", timeout,
        messages: {
          402: "AnySearch quota exhausted (HTTP 402). Add a new AnySearch key in magpie's Web search settings, or wait for the quota to reset. The response body is withheld because it may contain credentials.",
        },
      }))
      // Business errors have no reliable HTTP status mapping; keep the vendor's
      // request id, and never invent a key refusal from its free-form message.
      if (Number(json.code) !== 0) {
        throw new Error(`AnySearch API error ${json.code}: ${json.message ?? "unknown error"} (request_id ${json.request_id ?? "unknown"})`)
      }
      const results = list(json.data?.results)
        .filter((item) => item && item.url)
        .map((item) => page(item.title, item.url, item.content ?? item.snippet))
      cache.write(identity, results)
      return results
    },
  }
}
