import { envInt, envStr, list, makeCache, page, requestJSON, sizeFor } from "../core.mjs"

// Keenable answers with a flat object: `results` carries ranked hits, `mode`
// echoes the tier that served the call, and there is no failure envelope --
// refusals arrive as plain HTTP statuses.
//
// A key is required. Keenable's keyless `/public` pool is shared per egress
// IP (1,000 requests an hour and 10 a second), and magpie does not rest an
// empty key after a 429, so every search would hit the shared pool again with
// no cooldown. A keyed account gets 100,000 free requests a month and is the
// only mode this package wires up.
//
//   KEENABLE_CACHE_TTL    ms to reuse a response for the same query (0 disables)
//   KEENABLE_MAX_RESULTS  cap on results, 1-50 (the API's range)
//   KEENABLE_MODE         "pro" for deeper retrieval, "realtime" for speed
//   KEENABLE_TITLE        app name sent as X-Keenable-Title (max 256)
//   KEENABLE_TIMEOUT      ms to wait before failing (0 removes the deadline)
const CACHE_TTL = envInt("KEENABLE_CACHE_TTL", 600_000)
const TIMEOUT = envInt("KEENABLE_TIMEOUT", 25_000)
const MAX = 50
const PREFERRED = Math.min(Math.max(envInt("KEENABLE_MAX_RESULTS", 10), 1), MAX)
const MODE = envStr("KEENABLE_MODE")
const TITLE = (envStr("KEENABLE_TITLE") || "magpie-websearch").slice(0, 256)

const SEARCH_URL = "https://api.keenable.ai/v1/search"
const cache = makeCache(CACHE_TTL)

export const keenable = {
  name: "Keenable",
  keysURL: "https://keenable.ai/",

  async execute({ query, count, key }, ctx) {
    // magpie does not call a key-required API without a key, but keep the
    // failure explicit if that changes.
    if (!key) throw new Error("Keenable needs a key: add one in magpie's Web search settings")

    const cached = cache.read(query)
    if (cached) return cached

    const body = await requestJSON(
      SEARCH_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          // Names the calling application rather than the user. The keyed
          // endpoint ignores it, but it keeps the request attributable.
          "X-Keenable-Title": TITLE,
          "X-API-Key": key,
        },
        body: JSON.stringify({
          query: query.trim().replace(/\s+/g, " "),
          max_results: sizeFor(count, PREFERRED, MAX),
          ...(MODE ? { mode: MODE } : {}),
        }),
      },
      ctx,
      {
        label: "Keenable",
        timeout: TIMEOUT,
        messages: {
          402:
            "Keenable credits exhausted (HTTP 402): the free monthly allowance of " +
            "100,000 requests is spent. Add a new Keenable key in magpie's Web " +
            "search settings, or wait for the allowance to reset.",
        },
      },
    )

    const results = list(body.results)
      .map((item) => page(item.title, item.url, item.snippet || item.description, item.published_at))
      .filter(Boolean)

    cache.write(query, results)
    return results
  },
}
