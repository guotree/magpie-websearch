import { envInt, envStr, list, makeCache, page, requestJSON, sizeFor } from "../core.mjs"

// Keenable answers with a flat object: `results` carries ranked hits, `mode`
// echoes the tier that served the call, and there is no failure envelope --
// refusals arrive as plain HTTP statuses.
//
// With a key, a call is metered against the free monthly allowance of 100,000
// requests per organization. Without one, it goes to the `/public` twin and is
// limited per IP instead (1,000 an hour, 10 a second, on a pool shared with
// everyone else on the egress address).
//
//   KEENABLE_CACHE_TTL    ms to reuse a response for the same query (0 disables)
//   KEENABLE_MAX_RESULTS  cap on results, 1-50 (the API's range)
//   KEENABLE_MODE         "pro" for deeper retrieval, "realtime" for speed
//   KEENABLE_TITLE        app name sent as X-Keenable-Title; the keyless
//                         endpoint requires it to attribute traffic (max 256)
//   KEENABLE_TIMEOUT      ms to wait before failing (0 removes the deadline)
const CACHE_TTL = envInt("KEENABLE_CACHE_TTL", 600_000)
const TIMEOUT = envInt("KEENABLE_TIMEOUT", 25_000)
const MAX = 50
const PREFERRED = Math.min(Math.max(envInt("KEENABLE_MAX_RESULTS", 10), 1), MAX)
const MODE = envStr("KEENABLE_MODE")
const TITLE = (envStr("KEENABLE_TITLE") || "magpie-websearch").slice(0, 256)

const SEARCH_URL = "https://api.keenable.ai/v1/search"
const PUBLIC_URL = "https://api.keenable.ai/v1/search/public"
const cache = makeCache(CACHE_TTL)

export const keenable = {
  name: "Keenable",
  keysURL: "https://keenable.ai/",
  keyOptional: true,

  async execute({ query, count, key }, ctx) {
    const cached = cache.read(query)
    if (cached) return cached

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      // Required by the keyless endpoint, where an absent value is a 400. It
      // names the calling application rather than the user, so it rides along
      // with a key too.
      "X-Keenable-Title": TITLE,
    }
    if (key) headers["X-API-Key"] = key

    const messages = key
      ? {
          402:
            "Keenable credits exhausted (HTTP 402): the free monthly allowance of " +
            "100,000 requests is spent. Add a new Keenable key in magpie's Web " +
            "search settings, or wait for the allowance to reset.",
        }
      : {
          429:
            "Keenable rate limited the request (HTTP 429); the keyless pool allows " +
            "1,000 requests an hour and 10 a second per IP. Set a Keenable key in " +
            "magpie's Web search settings to spend your own 100,000-request monthly " +
            "allowance",
        }

    const body = await requestJSON(
      key ? SEARCH_URL : PUBLIC_URL,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: query.trim().replace(/\s+/g, " "),
          max_results: sizeFor(count, PREFERRED, MAX),
          ...(MODE ? { mode: MODE } : {}),
        }),
      },
      ctx,
      { label: "Keenable", timeout: TIMEOUT, messages },
    )

    const results = list(body.results)
      .map((item) => page(item.title, item.url, item.snippet || item.description, item.published_at))
      .filter(Boolean)

    cache.write(query, results)
    return results
  },
}
