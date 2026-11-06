import {
  boundDetail, cacheKey, cleanRetryAfter, configCountPolicy, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, resolveResultCount, truncateCodePoints,
} from "../core.mjs"

function describeJinaError(json) {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    if (typeof json.readableMessage === "string" && json.readableMessage.trim()) return json.readableMessage.trim()
    if (typeof json.message === "string" && json.message.trim()) return json.message.trim()
    if (json.error !== undefined && json.error !== null) {
      if (typeof json.error === "string" && json.error.trim()) return json.error.trim()
      if (typeof json.error === "object") {
        const msg = json.error.message || json.error.readableMessage
        if (typeof msg === "string" && msg.trim()) return msg.trim()
        return JSON.stringify(json.error)
      }
    }
    return JSON.stringify(json)
  }
  return typeof json === "string" ? json : JSON.stringify(json)
}

function errorDetailFromBody(raw) {
  try { return describeJinaError(JSON.parse(raw)) }
  catch { return raw }
}

export function createJina(options = {}) {
  const ttl = configInt(options, "cacheTTL", "JINA_CACHE_TTL", 600_000)
  const content = configStr(options, "content", "JINA_CONTENT", "snippet", ["snippet", "full"])
  const timeout = configInt(options, "timeout", "JINA_TIMEOUT", content === "full" ? 60_000 : 25_000, 0, 2_147_483_647)
  const countPolicy = configCountPolicy(options, "JINA_RESULT_LIMIT", 10, 20)
  const contentChars = configInt(options, "contentChars", "JINA_CONTENT_CHARS", 4_000, 0, Number.MAX_SAFE_INTEGER)
  const gl = configStr(options, "gl", "JINA_GL")
  const hl = configStr(options, "hl", "JINA_HL")
  const location = configStr(options, "location", "JINA_LOCATION")
  const cache = makeCache(ttl)

  return {
    name: "Jina (magpie-websearch)",
    keysURL: "https://jina.ai/?sui=apikey",
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) throw new Error("Jina needs a key: add one in magpie's Web search settings")
      const q = normalizeQuery(query)
      if (!q) throw new Error("Jina query must not be empty")

      const endpoint = resolveEndpoint(url, "https://s.jina.ai/search")
      const limit = resolveResultCount(count, countPolicy)
      const body = {
        q,
        num: limit,
        ...(gl ? { gl } : {}),
        ...(hl ? { hl } : {}),
        ...(location ? { location } : {}),
      }
      const identity = cacheKey(endpoint, { ...body, content, contentChars }, apiKey)
      const cached = cache.read(identity)
      if (cached) return cached

      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      }
      if (content === "snippet") {
        headers["X-Respond-With"] = "no-content"
      }

      const json = await requestJSON(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
      }, ctx, {
        label: "Jina",
        timeout,
        retryAfterFromResponse: (res) => cleanRetryAfter(res.headers.get("Retry-After")),
        errorDetailFromBody,
      })

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Invalid Jina response: expected an object")
      }
      const codeBad = json.code !== undefined && json.code !== 200
      const statusBad = json.status !== undefined && json.status !== 20000
      const hasError = json.error !== undefined && json.error !== null && json.error !== "" && (Array.isArray(json.error) ? json.error.length > 0 : true)
      if (codeBad || statusBad || hasError) {
        throw new Error(`Jina API error: ${boundDetail(describeJinaError(json))}`)
      }

      if (!Array.isArray(json.data)) {
        throw new Error("Invalid Jina response: data must be an array")
      }
      if (json.data.length === 0) {
        cache.write(identity, [])
        return []
      }

      const valid = json.data.filter((item) => item && typeof item === "object" && !Array.isArray(item) && typeof item.url === "string" && item.url.trim())
      if (valid.length === 0) {
        throw new Error("Invalid Jina response: no usable search results in payload")
      }

      const results = valid.slice(0, limit).map((item) => {
        let text = ""
        if (content === "full") {
          text = typeof item.content === "string" && item.content.trim()
            ? item.content
            : (typeof item.description === "string" ? item.description : "")
        } else {
          text = typeof item.description === "string" ? item.description : ""
        }
        const truncated = truncateCodePoints(text, contentChars)
        const published = typeof item.publishedTime === "string" && item.publishedTime.trim() ? item.publishedTime.trim() : undefined
        return page(
          typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined,
          item.url.trim(),
          truncated,
          published,
        )
      })

      cache.write(identity, results)
      return results
    },
  }
}
