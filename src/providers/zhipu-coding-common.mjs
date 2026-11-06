import {
  cacheKey, configCountPolicy, configInt, configStr, makeCache, normalizeQuery,
  page, resolveEndpoint, resolveResultCount, truncateCodePoints,
} from "../core.mjs"
import { callSessionMCPTool } from "../mcp/session.mjs"
import { extractMCPResults } from "../mcp/search-results.mjs"

const TOOL_NAMES = ["web_search_prime", "webSearchPrime"]
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

function properties(schema) {
  return object(schema?.properties) ? schema.properties : {}
}

function buildArguments(schema, query, limit, configured) {
  const props = properties(schema)
  const args = { search_query: query }
  if (Object.hasOwn(props, "count")) args.count = limit
  const optional = [
    ["search_recency_filter", configured.recency === "noLimit" ? "" : configured.recency, "recency"],
    ["search_domain_filter", configured.domainFilter, "domainFilter"],
    ["content_size", configured.contentSize, "contentSize"],
  ]
  for (const [wire, value, option] of optional) {
    if (!value) continue
    if (!Object.hasOwn(props, wire)) {
      throw new TypeError(`${configured.id}.${option} is not supported by the MCP server's current input schema`)
    }
    args[wire] = value
  }
  return args
}

export function createZhipuCodingProvider(meta, options = {}) {
  const { id, name, defaultEndpoint, keysURL, envPrefix } = meta
  const label = name.replace(/ \(magpie-websearch\)$/, "")
  const ttl = configInt(options, "cacheTTL", `${envPrefix}CACHE_TTL`, 600_000)
  const timeout = configInt(options, "timeout", `${envPrefix}TIMEOUT`, 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, `${envPrefix}RESULT_LIMIT`, 10)
  const contentChars = configInt(options, "contentChars", `${envPrefix}CONTENT_CHARS`, 4_000)
  const recency = configStr(options, "recency", `${envPrefix}RECENCY`, "noLimit", [
    "noLimit", "oneDay", "oneWeek", "oneMonth", "oneYear",
  ])
  const domainFilter = configStr(options, "domainFilter", `${envPrefix}DOMAIN_FILTER`)
  const contentSize = configStr(options, "contentSize", `${envPrefix}CONTENT_SIZE`, "", ["", "medium", "high"])
  const cache = makeCache(ttl)
  // This is discovery metadata only, never a reusable network session. Hashing
  // prevents raw credentials from becoming Map keys.
  const discoveries = new Map()

  return {
    name,
    keysURL,
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error(`${label} needs a Coding Plan key: add one in magpie's Web search settings`)
      const q = normalizeQuery(query)
      if (!q) throw new Error(`${label} query must not be empty`)
      const endpoint = resolveEndpoint(url, defaultEndpoint)
      const limit = resolveResultCount(count, countPolicy)
      const configured = { id, recency, domainFilter, contentSize }
      const discoveryKey = cacheKey(endpoint, { site: id, discovery: true }, apiKey)
      const known = discoveries.get(discoveryKey)
      if (known) {
        const args = buildArguments(known.schema, q, limit, configured)
        const identity = cacheKey(endpoint, { site: id, toolName: known.toolName, args, limit, contentChars }, apiKey)
        const cached = cache.read(identity)
        if (cached) return cached
      }

      let pendingIdentity
      const response = await callSessionMCPTool({
        endpoint,
        headers: { Authorization: "Bearer " + apiKey },
        toolNames: TOOL_NAMES,
        argumentsForSchema(schema, toolName) {
          const args = buildArguments(schema, q, limit, configured)
          pendingIdentity = cacheKey(endpoint, { site: id, toolName, args, limit, contentChars }, apiKey)
          return args
        },
        ctx,
        timeout,
        label,
      })
      discoveries.set(discoveryKey, { toolName: response.toolName, schema: response.schema })
      if (discoveries.size > 200) discoveries.delete(discoveries.keys().next().value)

      const { results: upstream } = extractMCPResults(response.result, label, {
        arrayKeys: ["results", "search_result"],
        maxJSONDepth: 3,
        decodeStructuredContent: true,
      })
      const valid = upstream.filter((item) => object(item)
        && typeof (item.link ?? item.url) === "string" && (item.link ?? item.url).trim())
      if (upstream.length > 0 && valid.length === 0) {
        throw new Error(`Invalid ${label} MCP search result: no usable search results in payload`)
      }
      const results = valid.slice(0, limit).map((item) => {
        const resultURL = (item.link ?? item.url).trim()
        const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined
        const text = typeof item.content === "string" ? item.content
          : typeof item.snippet === "string" ? item.snippet : ""
        return page(title, resultURL, truncateCodePoints(text, contentChars), item.publish_date)
      })
      cache.write(pendingIdentity, results)
      return results
    },
  }
}
