// Shared helpers for the magpie search hook. This package has no runtime
// dependencies: Bun's fetch, AbortSignal and Map cover everything here.

import { createHash } from "node:crypto"

export function optionGroup(options, name) {
  const value = options?.[name]
  if (value === undefined) return {}
  if (value && typeof value === "object" && !Array.isArray(value)) return value
  throw new TypeError(`${name} options must be an object`)
}

function configNamespace(name, env) {
  // Strip the complete option suffix: MOONSHOT_CN_CACHE_TTL -> moonshot-cn.
  const suffix = "_" + name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase()
  if (env.endsWith(suffix) && env.length > suffix.length) {
    return env.slice(0, -suffix.length).toLowerCase().replaceAll("_", "-")
  }
  // Aliased environment fields keep the legacy inference; namespace can override it.
  return env.split("_")[0].toLowerCase()
}

// Explicit options win over environment variables. Invalid explicit
// values fail loading with a useful error instead of silently changing a tier.
// An optional namespace names error fields independently of the environment key.
export function configInt(options, name, env, fallback, min = 0, max = Number.MAX_SAFE_INTEGER, namespace) {
  if (options[name] === undefined) return clamp(envInt(env, fallback), min, max)
  const value = options[name]
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${namespace ?? configNamespace(name, env)}.${name} must be an integer from ${min} to ${max}`)
  }
  return value
}

export function configStr(options, name, env, fallback = "", values, namespace) {
  const explicit = options[name] !== undefined
  const field = `${namespace ?? configNamespace(name, env)}.${name}`
  if (explicit && typeof options[name] !== "string") throw new TypeError(`${field} must be a string`)
  const value = explicit ? options[name].trim() : envStr(env) || fallback
  if (!values || values.includes(value)) return value
  if (explicit) throw new TypeError(`${field} must be one of ${values.map((v) => JSON.stringify(v)).join(", ")}`)
  console.warn(`[magpie-websearch] ${env} is invalid; using ${JSON.stringify(fallback)}`)
  return fallback
}

export function normalizeQuery(query) {
  return String(query ?? "").trim().replace(/\s+/g, " ")
}

// Resolves the search endpoint: if a custom URL is given, validate that it is
// HTTP(S) without credentials, query or fragment, and use it as the exact
// endpoint without heuristic rewriting. When omitted, use defaultEndpoint.
export function resolveEndpoint(customUrl, defaultEndpoint) {
  if (!customUrl?.trim()) return defaultEndpoint
  const url = new URL(customUrl.trim())
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new TypeError("Search Base URL must be HTTP(S), without credentials, query or fragment")
  }
  return url.href
}

// Hash the complete request identity, so keys, endpoints, counts and search
// parameters cannot share results. No raw credential is kept in the cache key.
export function cacheKey(endpoint, body, key) {
  return createHash("sha256").update(JSON.stringify([endpoint, body, key])).digest("hex")
}

export function envInt(name, fallback) {
  const raw = (process.env[name] ?? "").trim()
  if (raw === "") return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

export function envStr(name) {
  return (process.env[name] ?? "").trim()
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// magpie asks for `count` pages (6 today). The configured number is a cap, so
// a user who sets a smaller number keeps it; the API's own maximum still wins.
export function sizeFor(count, preferred, max) {
  const wanted = Number.isFinite(count) && count > 0 ? Math.floor(count) : preferred
  return Math.max(1, Math.min(wanted, preferred, max))
}

// An error body is diagnostic, not content: a WAF or CDN interposing an HTML
// page can make it tens of kilobytes. API refusal bodies are JSON of a few
// hundred characters, so this bound loses nothing. Counted in code points,
// never UTF-16 units, so no surrogate pair is sliced in half.
const ERROR_DETAIL_CHARS = 300

export function boundDetail(detail) {
  const text = String(detail ?? "")
  if (text.length <= ERROR_DETAIL_CHARS) return text
  const points = [...text]
  if (points.length <= ERROR_DETAIL_CHARS) return text
  return points.slice(0, ERROR_DETAIL_CHARS).join("") + "… [truncated]"
}

// `Retry-After` is delay-seconds ("3") or an HTTP-date ("Wed, 21 Oct 2026
// 07:28:00 GMT"); only the seconds form earns its "s".
export function retryHint(retry) {
  const value = retry?.trim()
  if (!value) return ""
  return ", retry after " + value + (/^\d+$/.test(value) ? "s" : "")
}

// magpie reads a thrown error's numeric `status`: 401/402/403/429 rest the key
// it was asked with and try the next; anything else is a terminal failure.
export function apiError(status, message, retryAfter) {
  const error = new Error(message)
  error.status = status
  if (retryAfter) error.retryAfter = retryAfter
  return error
}

// magpie does not rest an empty key. Keep anonymous 429s here, per API instance
// and final endpoint, so the next search can fail over without another fetch.
// Cached results may still be served; keyed requests never enter this cooldown.
export function makeAnonymousCooldown(label) {
  const deadlines = new Map()
  return {
    async run(endpoint, key, request) {
      if (key) return request()
      const now = Date.now()
      const until = deadlines.get(endpoint) ?? 0
      if (until > now) {
        const remaining = String(Math.ceil((until - now) / 1000))
        throw apiError(429, `${label} anonymous search is cooling down, retry after ${remaining}s`, remaining)
      }
      deadlines.delete(endpoint)
      try {
        return await request()
      } catch (error) {
        if (error?.status === 429) {
          const at = Date.now()
          const retry = String(error.retryAfter ?? "").trim()
          const deadline = /^\d+$/.test(retry)
            ? at + Number(retry) * 1000
            : Date.parse(retry)
          const next = Number.isSafeInteger(deadline) && deadline >= at ? deadline : at + 60_000
          // Concurrent failures can extend a cooldown but never shorten it.
          for (const [url, expires] of deadlines) if (expires <= at) deadlines.delete(url)
          deadlines.set(endpoint, Math.max(next, deadlines.get(endpoint) ?? 0))
          if (deadlines.size > 200) deadlines.delete(deadlines.keys().next().value)
        }
        throw error
      }
    },
  }
}

// A hung upstream must not hang the agent. The host's ctx.abort is the real
// deadline; the per-provider timeout is a shorter self-protection.
export function signalFor(ctx, timeout) {
  const base = ctx?.abort ?? new AbortController().signal
  return timeout > 0 ? AbortSignal.any([base, AbortSignal.timeout(timeout)]) : base
}

function timedOut(error, signal, ctx) {
  return (
    error?.name === "TimeoutError" ||
    signal?.reason?.name === "TimeoutError" ||
    ctx?.abort?.aborted === true
  )
}

export function makeCache(ttl, limit = 200) {
  const entries = new Map()
  const key = (query) => String(query ?? "").trim().replace(/\s+/g, " ")

  return {
    read(query) {
      if (ttl <= 0) return undefined
      const k = key(query)
      const hit = entries.get(k)
      if (!hit || Date.now() - hit.at >= hit.ttl) return undefined
      // A hit moves the entry to the tail, so eviction spends the least
      // recently used query rather than whichever one was searched first.
      entries.delete(k)
      entries.set(k, hit)
      return hit.results
    },
    write(query, results) {
      if (ttl <= 0) return
      const k = key(query)
      // A non-empty answer earns the full TTL; an empty one is pinned for a
      // short beat so a transient upstream wobble cannot lock retries out.
      const ttlFor = results.length > 0 ? ttl : Math.min(ttl, 30_000)
      entries.delete(k)
      entries.set(k, { at: Date.now(), ttl: ttlFor, results })
      if (entries.size > limit) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
    },
    clear() {
      entries.clear()
    },
  }
}

// A magpie page: `text` is the snippet/body, `age` is the vendor's own date
// string (magpie does not require it to be parsed). A hit without a URL cannot
// be opened or cited, so it is dropped.
export function page(title, url, text, age) {
  if (!url) return undefined
  const out = {
    title: typeof title === "string" && title ? title : String(url),
    url: String(url),
    text: typeof text === "string" ? text : text == null ? "" : String(text),
  }
  if (typeof age === "string" && age.trim()) out.age = age.trim()
  return out
}

export function cleanRetryAfter(raw) {
  const value = String(raw ?? "").trim()
  if (!value) return undefined
  if (/^\d+$/.test(value)) return value.replace(/^0+(?=\d)/, "")
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/i.test(value)) {
    const parsed = Date.parse(value)
    // Date.parse accepts rolled-over dates and ignores the weekday. A round
    // trip checks both and emits only the canonical HTTP date.
    if (Number.isFinite(parsed)) {
      const canonical = new Date(parsed).toUTCString()
      if (canonical.toLowerCase() === value.toLowerCase()) return canonical
    }
  }
  return undefined
}

// A custom reader shares the HTTP errors and the deadline, including while
// consuming a streaming response. JSON providers keep the default text reader.
export async function requestResponse(input, init, ctx, options = {}, read) {
  const { label = "search", timeout = 25_000, messages = {}, sensitive = false, retryAfterFromResponse } = options
  const signal = signalFor(ctx, timeout)

  const extractRetry = (res) => {
    if (typeof retryAfterFromResponse === "function") {
      return retryAfterFromResponse(res)
    }
    return sensitive ? cleanRetryAfter(res.headers.get("Retry-After")) : res.headers.get("Retry-After")
  }

  let response
  try {
    response = await fetch(input, { ...init, signal })
  } catch (error) {
    if (ctx?.abort?.aborted) throw new Error(`${label} search cancelled`)
    if (timedOut(error, signal, ctx)) {
      throw new Error(`${label} search timed out after ${timeout}ms`)
    }
    if (sensitive) throw new Error(`${label} request failed`)
    throw new Error(`${label} request failed: ${String(error)}`)
  }

  if (!response.ok && sensitive) {
    // Cleanup must not delay a known refusal, even if a transport's cancel
    // promise never settles. Handle rejection without retaining its details.
    try { response.body?.cancel().catch(() => {}) } catch {}
    const retry = extractRetry(response)
    const custom = messages[response.status]
    const defaultMsg = response.status === 400 ? "bad request"
      : response.status === 401 ? "invalid API key"
      : response.status === 403 ? "access denied"
      : response.status === 429 ? "rate limit or search quota exceeded"
      : response.status === 500 ? "server error"
      : response.status === 503 ? "service unavailable"
      : `HTTP ${response.status}`
    let message = custom ?? `${label} API error ${response.status}: ${defaultMsg}`
    if (response.status === 429) message += retryHint(retry)
    throw apiError(response.status, message, retry)
  }

  // A 402 body can carry freshly generated credentials (AnySearch does), so a
  // provider with a custom 402 message has its body withheld, not echoed.
  if (!response.ok && response.status === 402 && messages[402]) {
    throw apiError(402, messages[402], extractRetry(response))
  }

  let raw
  try {
    raw = await (response.ok && read ? read(response, signal) : response.text())
  } catch (error) {
    if (response.status === 429) {
      const retry = extractRetry(response)
      throw apiError(429, `${label} API error 429: response body unavailable${retryHint(retry)}`, retry)
    }
    if (ctx?.abort?.aborted) throw new Error(`${label} search cancelled`)
    if (timedOut(error, signal, ctx)) {
      throw new Error(`${label} search timed out after ${timeout}ms`)
    }
    if (response.ok && read && !sensitive) throw error
    throw new Error(`${label} response body unavailable`)
  }

  if (!response.ok) {
    const retry = extractRetry(response)
    const custom = messages[response.status]
    let message = custom ?? `${label} API error ${response.status}: ${boundDetail(raw)}`
    if (response.status === 429) message += retryHint(retry)
    throw apiError(response.status, message, retry)
  }

  return raw
}

export async function requestJSON(input, init, ctx, options = {}) {
  const raw = await requestResponse(input, init, ctx, options)
  const { label = "search", sensitive = false } = options
  try {
    return JSON.parse(raw)
  } catch (error) {
    if (sensitive) throw new Error(`Invalid ${label} response: malformed JSON`)
    throw new Error(`Invalid ${label} response: ${String(error)}`)
  }
}

export function list(value) {
  return Array.isArray(value) ? value : []
}
