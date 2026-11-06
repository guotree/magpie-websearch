import {
  cacheKey, configCountPolicy, configInt, configStr, makeCache, normalizeQuery,
  page, requestJSON, resolveEndpoint, resolveResultCount,
} from "../core.mjs"

export function createSerpapi(options = {}) {
  const ttl = configInt(options, "cacheTTL", "SERPAPI_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "SERPAPI_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "SERPAPI_RESULT_LIMIT", 10, 10)
  const location = configStr(options, "location", "SERPAPI_LOCATION")
  const gl = configStr(options, "gl", "SERPAPI_GL")
  const hl = configStr(options, "hl", "SERPAPI_HL")
  const googleDomain = configStr(options, "googleDomain", "SERPAPI_GOOGLE_DOMAIN")
  const safe = configStr(options, "safe", "SERPAPI_SAFE", "", ["", "active", "off"])
  const cache = makeCache(ttl)

  return {
    name: "SerpApi (magpie-websearch)",
    keysURL: "https://serpapi.com/manage-api-key",
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) {
        throw new Error("SerpApi needs a key: add one in magpie's Web search settings")
      }
      const q = normalizeQuery(query)
      if (!q) {
        throw new Error("SerpApi query must not be empty")
      }

      const endpoint = resolveEndpoint(url, "https://serpapi.com/search")
      const limit = resolveResultCount(count, countPolicy)
      const identity = cacheKey(endpoint, {
        engine: "google",
        output: "json",
        q,
        limit,
        ...(location ? { location } : {}),
        ...(gl ? { gl } : {}),
        ...(hl ? { hl } : {}),
        ...(googleDomain ? { google_domain: googleDomain } : {}),
        ...(safe ? { safe } : {}),
      }, apiKey)

      const cached = cache.read(identity)
      if (cached) return cached

      const target = new URL(endpoint)
      target.searchParams.set("engine", "google")
      target.searchParams.set("output", "json")
      target.searchParams.set("q", q)
      target.searchParams.set("api_key", apiKey)
      if (location) target.searchParams.set("location", location)
      if (gl) target.searchParams.set("gl", gl)
      if (hl) target.searchParams.set("hl", hl)
      if (googleDomain) target.searchParams.set("google_domain", googleDomain)
      if (safe) target.searchParams.set("safe", safe)

      const json = await requestJSON(target.href, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
      }, ctx, { label: "SerpApi", timeout, sensitive: true })

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid SerpApi response: expected JSON object")
      }

      if (json.search_metadata !== undefined && (!json.search_metadata ||
        typeof json.search_metadata !== "object" || Array.isArray(json.search_metadata))) {
        throw new Error("Invalid SerpApi response: expected search_metadata object")
      }
      const status = json.search_metadata?.status
      if (status === "Error") {
        throw new Error("SerpApi search failed")
      }
      if (status === "Processing" || status === "Queued") {
        throw new Error("SerpApi search in progress")
      }
      if (status !== undefined && status !== "Success") {
        throw new Error("Invalid SerpApi response: unexpected search status")
      }

      if (json.organic_results !== undefined && !Array.isArray(json.organic_results)) {
        throw new Error("Invalid SerpApi response: expected organic_results array")
      }
      const state = json.search_information?.organic_results_state
      const empty = status === "Success" && typeof state === "string" &&
        state.trim().toLowerCase() === "fully empty" &&
        (json.organic_results === undefined || json.organic_results.length === 0)
      // SerpApi uses an error string for a successful, explicitly empty SERP.
      // Any other error must take precedence over results and remain uncached.
      if (json.error !== undefined && (!empty || typeof json.error !== "string")) {
        throw new Error("SerpApi search failed")
      }

      if (Array.isArray(json.organic_results)) {
        const results = json.organic_results
          .filter((item) => item && typeof item.link === "string" && item.link.trim())
          .slice(0, limit)
          .map((item) => page(item.title, item.link,
            typeof item.snippet === "string" ? item.snippet : "", item.date))
        cache.write(identity, results)
        return results
      }

      if (empty) {
        const results = []
        cache.write(identity, results)
        return results
      }

      throw new Error("Invalid SerpApi response: missing organic_results")
    },
  }
}
