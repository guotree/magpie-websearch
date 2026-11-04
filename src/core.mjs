// Shared helpers for the magpie search hook. This package has no runtime
// dependencies: Bun's fetch, AbortSignal and Map cover everything here.

export function envInt(name, fallback) {
  const raw = (process.env[name] ?? "").trim()
  if (raw === "") return fallback
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

export function envStr(name) {
  return (process.env[name] ?? "").trim()
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// magpie asks for `count` pages (6 today). The environment knob is a cap, so
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

export async function requestJSON(input, init, ctx, options = {}) {
  const { label = "search", timeout = 25_000, messages = {} } = options
  const signal = signalFor(ctx, timeout)

  let response
  try {
    response = await fetch(input, { ...init, signal })
  } catch (error) {
    if (timedOut(error, signal, ctx)) {
      throw new Error(`${label} search timed out after ${timeout}ms`)
    }
    throw new Error(`${label} request failed: ${String(error)}`)
  }

  // A 402 body can carry freshly generated credentials (AnySearch does), so a
  // provider with a custom 402 message has its body withheld, not echoed.
  if (!response.ok && response.status === 402 && messages[402]) {
    throw apiError(402, messages[402], response.headers.get("Retry-After"))
  }

  let raw
  try {
    raw = await response.text()
  } catch (error) {
    if (timedOut(error, signal, ctx)) {
      throw new Error(`${label} search timed out after ${timeout}ms`)
    }
    throw new Error(`${label} response body unavailable`)
  }

  if (!response.ok) {
    const retry = response.headers.get("Retry-After")
    const custom = messages[response.status]
    let message = custom ?? `${label} API error ${response.status}: ${boundDetail(raw)}`
    if (response.status === 429) message += retryHint(retry)
    throw apiError(response.status, message, retry)
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid ${label} response: ${String(error)}`)
  }
}

export function list(value) {
  return Array.isArray(value) ? value : []
}
