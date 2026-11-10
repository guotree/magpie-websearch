import {
  boundDetail, cacheKey, cleanRetryAfter, configCountPolicy, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, resolveResultCount, safeResultUrl,
} from "../core.mjs"

function describeKagiError(error) {
  if (Array.isArray(error)) {
    return error.map((e) => describeKagiError(e)).join("; ")
  }
  if (error && typeof error === "object") {
    const parts = []
    if (error.code !== undefined) parts.push(`[code ${error.code}]`)
    if (error.msg || error.message) parts.push(error.msg || error.message)
    if (parts.length) return parts.join(" ")
    return JSON.stringify(error)
  }
  return String(error ?? "")
}

function errorDetailFromBody(raw) {
  try {
    const parsed = JSON.parse(raw)
    if (parsed.error) return describeKagiError(parsed.error)
    return raw
  } catch {
    return raw
  }
}

export function createKagi(options = {}) {
  const ttl = configInt(options, "cacheTTL", "KAGI_CACHE_TTL", 600_000)
  const timeout = configInt(options, "timeout", "KAGI_TIMEOUT", 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "KAGI_RESULT_LIMIT", 10, 1024)
  const lens = configStr(options, "lens", "KAGI_LENS")
  const recency = configStr(options, "recency", "KAGI_RECENCY", "", ["", "day", "week", "month"])
  const region = configStr(options, "region", "KAGI_REGION")

  if (lens && recency) {
    console.warn("[magpie-websearch] kagi.lens overrides kagi.recency; recency is ignored")
  }

  const cache = makeCache(ttl)

  return {
    name: "Kagi (magpie-websearch)",
    keysURL: "https://kagi.com/api/keys",
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error("Kagi needs a key: add one in magpie's Web search settings")
      const q = normalizeQuery(query)
      if (!q) throw new Error("Kagi query must not be empty")

      const endpoint = resolveEndpoint(url, "https://kagi.com/api/v1/search")
      const limit = resolveResultCount(count, countPolicy)
      const body = {
        query: q,
        workflow: "search",
        limit,
      }
      if (lens) {
        body.lens_id = lens
      } else if (recency) {
        body.lens = { time_relative: recency }
      }
      if (region) {
        body.filters = { region }
      }

      const identity = cacheKey(endpoint, body, apiKey)
      const cached = cache.read(identity)
      if (cached) return cached

      const json = await requestJSON(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify(body),
        redirect: "error",
      }, ctx, {
        label: "Kagi",
        timeout,
        retryAfterFromResponse: (res) => cleanRetryAfter(res.headers.get("Retry-After")),
        errorDetailFromBody,
      })

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid Kagi response: expected an object")
      }
      const hasError = json.error !== undefined && json.error !== null && (Array.isArray(json.error) ? json.error.length > 0 : true)
      if (hasError) {
        throw new Error(`Kagi API error: ${boundDetail(describeKagiError(json.error))}`)
      }

      if (!json.data || typeof json.data !== "object" || Array.isArray(json.data)) {
        throw new Error("Invalid Kagi response: data must be an object")
      }

      if (json.data.search === undefined) {
        cache.write(identity, [])
        return []
      }
      if (!Array.isArray(json.data.search)) {
        throw new Error("Invalid Kagi response: data.search must be an array")
      }
      if (json.data.search.length === 0) {
        cache.write(identity, [])
        return []
      }

      const valid = json.data.search.filter((item) => item && typeof item === "object" && !Array.isArray(item) && safeResultUrl(item.url) !== undefined)
      if (valid.length === 0) {
        throw new Error("Invalid Kagi response: no usable search results in payload")
      }

      const results = valid.slice(0, limit).map((item) => {
        const snippet = typeof item.snippet === "string" ? item.snippet : ""
        const age = typeof item.time === "string" && item.time.trim() ? item.time.trim() : undefined
        return page(
          typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined,
          item.url.trim(),
          snippet,
          age,
        )
      }).filter(Boolean)

      cache.write(identity, results)
      return results
    },
  }
}
