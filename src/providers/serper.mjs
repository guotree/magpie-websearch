import {
  boundDetail, cacheKey, cleanRetryAfter, configCountPolicy, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, resolveResultCount,
} from "../core.mjs"

function describeSerperError(json) {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    if (typeof json.message === "string" && json.message.trim()) return json.message.trim()
    if (json.error !== undefined && json.error !== null) {
      if (typeof json.error === "string" && json.error.trim()) return json.error.trim()
      if (typeof json.error === "object") {
        const msg = json.error.message || json.error.msg
        if (typeof msg === "string" && msg.trim()) return msg.trim()
        return JSON.stringify(json.error)
      }
    }
    return JSON.stringify(json)
  }
  return typeof json === "string" ? json : JSON.stringify(json)
}

function errorDetailFromBody(raw) {
  try {
    const parsed = JSON.parse(raw)
    return describeSerperError(parsed)
  } catch {
    return raw
  }
}

export function createSerper(options = {}) {
  const ttl = configInt(options, "cacheTTL", "SERPER_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "SERPER_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "SERPER_RESULT_LIMIT", 10, 10)
  const gl = configStr(options, "gl", "SERPER_GL")
  const hl = configStr(options, "hl", "SERPER_HL")
  const tbs = configStr(options, "tbs", "SERPER_TBS", "", ["", "qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"])
  const cache = makeCache(ttl)

  return {
    name: "Serper (magpie-websearch)",
    keysURL: "https://serper.dev/",
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error("Serper needs a key: add one in magpie's Web search settings")
      const q = normalizeQuery(query)
      if (!q) throw new Error("Serper query must not be empty")

      const endpoint = resolveEndpoint(url, "https://google.serper.dev/search")
      const limit = resolveResultCount(count, countPolicy)
      const body = {
        q,
        num: 10,
        ...(gl ? { gl } : {}),
        ...(hl ? { hl } : {}),
        ...(tbs ? { tbs } : {}),
      }

      const identity = cacheKey(endpoint, { ...body, limit }, apiKey)
      const cached = cache.read(identity)
      if (cached) return cached

      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify(body),
        redirect: "error",
      }, ctx, {
        label: "Serper",
        timeout,
        retryAfterFromResponse: (res) => cleanRetryAfter(res.headers.get("Retry-After")),
        errorDetailFromBody,
      })

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid Serper response: expected an object")
      }

      const hasMessage = typeof json.message === "string" && json.message.trim().length > 0
      const hasError = json.error !== undefined && json.error !== null && (Array.isArray(json.error) ? json.error.length > 0 : true)
      if (hasMessage || hasError) {
        throw new Error(`Serper API error: ${boundDetail(describeSerperError(json))}`)
      }

      if (json.organic === undefined) {
        const hasRichMedia =
          (json.knowledgeGraph && typeof json.knowledgeGraph === "object" && !Array.isArray(json.knowledgeGraph)) ||
          (json.answerBox && typeof json.answerBox === "object" && !Array.isArray(json.answerBox)) ||
          Array.isArray(json.peopleAlsoAsk) ||
          Array.isArray(json.relatedSearches)

        if (hasRichMedia) {
          cache.write(identity, [])
          return []
        }
        throw new Error("Invalid Serper response: missing organic")
      }

      if (!Array.isArray(json.organic)) {
        throw new Error("Invalid Serper response: organic must be an array")
      }
      if (json.organic.length === 0) {
        cache.write(identity, [])
        return []
      }

      const valid = json.organic.filter((item) => item && typeof item === "object" && !Array.isArray(item) && typeof item.link === "string" && item.link.trim())
      if (valid.length === 0) {
        throw new Error("Invalid Serper response: no usable search results in payload")
      }

      const results = valid.slice(0, limit).map((item) => {
        const snippet = typeof item.snippet === "string" ? item.snippet : ""
        const age = typeof item.date === "string" && item.date.trim() ? item.date.trim() : undefined
        return page(
          typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined,
          item.link.trim(),
          snippet,
          age,
        )
      })

      cache.write(identity, results)
      return results
    },
  }
}
