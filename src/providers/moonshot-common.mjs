import {
  cacheKey, cleanRetryAfter, configInt, configStr, makeCache,
  normalizeQuery, page, requestJSON, resolveEndpoint, sizeFor, truncateCodePoints,
} from "../core.mjs"

// Local sanity limit for the reset header, not an upstream quota guarantee.
const MAX_RESET_DELAY_SECONDS = 86_400

export function parseMoonshotRetryAfter(response) {
  if (response.status !== 429) {
    return response.headers.get("Retry-After") ?? undefined
  }
  const standard = cleanRetryAfter(response.headers.get("Retry-After"))
  if (standard !== undefined) return standard

  const raw = response.headers.get("X-RateLimit-Reset")
  if (!raw) return undefined
  const trimmed = String(raw).trim()
  if (!/^\d+$/.test(trimmed)) return undefined

  const reset = Number(trimmed)
  if (!Number.isSafeInteger(reset)) return undefined

  const nowSec = Date.now() / 1000
  const secondsDelay = Math.ceil(reset - nowSec)
  if (secondsDelay >= 1 && secondsDelay <= MAX_RESET_DELAY_SECONDS) return String(secondsDelay)

  // Official resets use seconds. Tolerate proxy milliseconds only in the same window.
  if (reset > 1e11) {
    const millisecondsDelay = Math.ceil(reset / 1000 - nowSec)
    if (millisecondsDelay >= 1 && millisecondsDelay <= MAX_RESET_DELAY_SECONDS) return String(millisecondsDelay)
  }
  return undefined
}

export function createMoonshotProvider(meta, options = {}) {
  const { id, name, defaultEndpoint, keysURL, envPrefix } = meta
  const displayLabel = name.replace(/ \(magpie-websearch\)$/, "")

  const ttl = configInt(options, "cacheTTL", `${envPrefix}CACHE_TTL`, 600_000, 0, Number.MAX_SAFE_INTEGER)
  const timeout = configInt(options, "timeout", `${envPrefix}TIMEOUT`, 25_000, 0, 2_147_483_647)
  const maxResults = configInt(options, "maxResults", `${envPrefix}MAX_RESULTS`, 10, 1, 20)
  const content = configStr(options, "content", `${envPrefix}CONTENT`, "snippet", ["snippet", "full"])
  const contentChars = configInt(options, "contentChars", `${envPrefix}CONTENT_CHARS`, 4_000, 0, Number.MAX_SAFE_INTEGER)

  const cache = makeCache(ttl)

  return {
    name,
    keysURL,
    keyOptional: false,
    async execute({ query, count, key, url }, ctx) {
      const apiKey = String(key ?? "").trim()
      if (!apiKey) {
        throw new Error(`${displayLabel} needs a key: add one in magpie's Web search settings`)
      }

      const q = normalizeQuery(query)
      if (!q) {
        throw new Error(`${displayLabel} query must not be empty`)
      }

      const endpoint = resolveEndpoint(url, defaultEndpoint)
      const limit = sizeFor(count, maxResults, 20)
      const body = {
        text_query: q,
        limit,
        ...(content === "full" ? { include_content: true } : {}),
      }

      const identity = cacheKey(endpoint, {
        site: id,
        ...body,
        content,
        contentChars,
      }, apiKey)

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
        label: displayLabel,
        timeout,
        messages: {
          401: `${displayLabel} API error 401: invalid API key (check key and site platform)`,
          403: `${displayLabel} API error 403: account not activated or disabled`,
        },
        retryAfterFromResponse: parseMoonshotRetryAfter,
      })

      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error(`Invalid ${displayLabel} response: expected an object`)
      }
      if (json.error) {
        const detail = typeof json.error === "object"
          ? (json.error.message ?? JSON.stringify(json.error))
          : String(json.error)
        throw new Error(`${displayLabel} API error: ${detail}`)
      }
      if (!Array.isArray(json.search_results)) {
        throw new Error(`Invalid ${displayLabel} response: search_results must be an array`)
      }

      const rawResults = json.search_results
      const validItems = []
      for (const item of rawResults) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          if (typeof item.url === "string" && item.url.trim()) {
            validItems.push(item)
          }
        }
      }

      if (rawResults.length > 0 && validItems.length === 0) {
        throw new Error(`Invalid ${displayLabel} response: no usable search results in payload`)
      }

      const sliced = validItems.slice(0, limit)
      const results = sliced.map((item) => {
        const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : undefined
        const snippet = typeof item.snippet === "string" ? item.snippet : ""
        const text = typeof item.text === "string" ? item.text : ""
        const chosen = content === "full" && text.trim() ? text : snippet
        const selectedText = truncateCodePoints(chosen, contentChars)
        const date = typeof item.date === "string" && item.date.trim() ? item.date.trim() : undefined
        return page(title, item.url.trim(), selectedText, date)
      })

      cache.write(identity, results)
      return results
    },
  }
}
