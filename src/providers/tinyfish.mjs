import {
  cacheKey, configInt, configStr, makeAnonymousCooldown, makeCache, normalizeQuery,
  page, requestJSON, sizeFor,
} from "../core.mjs"
import { callTinyfishTool } from "./tinyfish-mcp.mjs"

function endpointFor(base, key) {
  const url = new URL(base?.trim() || (key ? "https://api.search.tinyfish.ai/" : "https://agent.tinyfish.ai/mcp"))
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new TypeError("Search Base URL must be HTTP(S), without credentials, query or fragment")
  }
  // A custom URL is the complete endpoint for the current mode; append no path.
  return url.href
}

function searchResult(result) {
  if (Array.isArray(result?.structuredContent?.results)) return result.structuredContent
  for (const part of Array.isArray(result?.content) ? result.content : []) {
    if (part?.type !== "text" || typeof part.text !== "string") continue
    let json
    try { json = JSON.parse(part.text) } catch { continue }
    if (Array.isArray(json?.results)) return json
  }
  throw new Error("Invalid TinyFish MCP search result: expected results array")
}

export function createTinyfish(options = {}) {
  const ttl = configInt(options, "cacheTTL", "TINYFISH_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "TINYFISH_TIMEOUT", 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", "TINYFISH_MAX_RESULTS", 10, 1)
  const domainType = configStr(options, "domainType", "TINYFISH_DOMAIN_TYPE", "web", ["web", "news", "research_paper"])
  const params = { domain_type: domainType }
  for (const [name, field, env] of [
    ["location", "location", "TINYFISH_LOCATION"], ["language", "language", "TINYFISH_LANGUAGE"],
    ["includeDomains", "include_domains", "TINYFISH_INCLUDE_DOMAINS"],
    ["excludeDomains", "exclude_domains", "TINYFISH_EXCLUDE_DOMAINS"],
  ]) {
    const value = configStr(options, name, env)
    if (value) params[field] = value
  }
  const cache = makeCache(ttl)
  const cooldown = makeAnonymousCooldown("TinyFish")

  return {
    name: "TinyFish (magpie-websearch)",
    keysURL: "https://agent.tinyfish.ai/api-keys",
    keyOptional: true,
    async execute({ query, count, key = "", url }, ctx) {
      key = key.trim()
      if (!key && domainType === "research_paper") {
        throw new Error("TinyFish research_paper search needs a key: add one in magpie's Web search settings")
      }
      const endpoint = endpointFor(url, key)
      const args = { query: normalizeQuery(query), ...params }
      if (!args.query || [...args.query].length > 2000) throw new Error("TinyFish query must contain 1–2000 characters")
      // TinyFish has no count parameter. Keep the local cap in cache identity.
      const limit = sizeFor(count, maxResults, maxResults)
      const identity = cacheKey(endpoint, { mode: key ? "rest" : "mcp", ...args, limit }, key)
      const cached = cache.read(identity)
      if (cached) return cached
      const json = await cooldown.run(endpoint, key, async () => {
        if (!key) return searchResult(await callTinyfishTool(endpoint, "search", args, ctx, {
          label: "TinyFish", timeout, headers: { "X-TinyFish-Access-Mode": "keyless" },
        }))
        const target = new URL(endpoint)
        target.search = new URLSearchParams(args).toString()
        return requestJSON(target.href, {
          method: "GET", headers: { Accept: "application/json", "X-API-Key": key },
        }, ctx, { label: "TinyFish", timeout })
      })
      if (!Array.isArray(json?.results)) throw new Error("Invalid TinyFish response: expected results array")
      const results = json.results.filter((item) => item && item.url)
        .slice(0, limit).map((item) => page(item.title, item.url, item.snippet, item.date))
      cache.write(identity, results)
      return results
    },
  }
}
