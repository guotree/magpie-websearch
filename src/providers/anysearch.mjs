import {
  boundDetail, cacheKey, configCountPolicy, configInt, configStr, makeAnonymousCooldown, makeCache,
  page, requestJSON, requireQuery, resolveEndpoint, resolveResultCount, searchRows, truncateCodePoints,
} from "../core.mjs"

export function createAnysearch(options = {}) {
  const ttl = configInt(options, "cacheTTL", "ANYSEARCH_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "ANYSEARCH_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "ANYSEARCH_RESULT_LIMIT", 10, 10)
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
      const q = requireQuery(query, "AnySearch")
      const endpoint = resolveEndpoint(url, "https://api.anysearch.com/v1/search")
      const body = {
        query: q,
        max_results: resolveResultCount(count, countPolicy),
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
        redirect: "error",
      }, ctx, {
        label: "AnySearch", timeout,
        messages: {
          402: "AnySearch quota exhausted (HTTP 402). Add a new AnySearch key in magpie's Web search settings, or wait for the quota to reset. The response body is withheld because it may contain credentials.",
        },
      }))
      // Business errors have no reliable HTTP status mapping; keep the vendor's
      // request id, and never invent a key refusal from its free-form message.
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid AnySearch response: expected an object")
      }
      if (json.code === undefined) throw new Error("Invalid AnySearch response: missing code")
      if (Number(json.code) !== 0) {
        const code = truncateCodePoints(String(json.code), 80)
        const id = truncateCodePoints(String(json.request_id ?? "unknown"), 80)
        throw new Error(`AnySearch API error ${code}: ${boundDetail(json.message ?? "unknown error")} (request_id ${id})`)
      }
      const results = searchRows(json.data?.results, "AnySearch")
        .slice(0, body.max_results)
        .map((item) => page(item.title, item.url, item.content ?? item.snippet))
      cache.write(identity, results)
      return results
    },
  }
}
