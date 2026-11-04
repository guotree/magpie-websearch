import { envInt, envStr, list, makeCache, page, requestJSON, sizeFor } from "../core.mjs"

// AnySearch wraps every response in an envelope: code 0 on the happy path,
// code -1 with a human-readable message otherwise. request_id is the only
// handle support has on a request, so it rides along on every failure.
//
// A key is required. AnySearch's anonymous tier is deliberately not wired up:
// the pilot keeps one predictable quota per key instead of a second shared
// pool.
//
//   ANYSEARCH_CACHE_TTL     ms to reuse a response for the same query (0 disables)
//   ANYSEARCH_MAX_RESULTS   cap on results, 1-10 (the API's range)
//   ANYSEARCH_TAG           pin the intent router to a sub-domain, e.g. "code.snippet"
//   ANYSEARCH_ZONE          "cn" or "intl"
//   ANYSEARCH_LANGUAGE      preferred result language, e.g. "zh-CN"
//   ANYSEARCH_FORMAT        "markdown" (default) or "json" for the content field
//   ANYSEARCH_TIMEOUT       ms to wait before failing (0 removes the deadline)
const CACHE_TTL = envInt("ANYSEARCH_CACHE_TTL", 600_000)
const TIMEOUT = envInt("ANYSEARCH_TIMEOUT", 25_000)
const MAX = 10
const PREFERRED = Math.min(Math.max(envInt("ANYSEARCH_MAX_RESULTS", 10), 1), MAX)
const TAG = envStr("ANYSEARCH_TAG")

const ZONE_VALUES = ["cn", "intl"]
const ZONE_RAW = envStr("ANYSEARCH_ZONE")
const ZONE = ZONE_VALUES.includes(ZONE_RAW) ? ZONE_RAW : ""
if (ZONE_RAW !== "" && ZONE === "") {
  console.warn(
    "[websearch] ANYSEARCH_ZONE " +
      JSON.stringify(ZONE_RAW) +
      " is not one of " +
      ZONE_VALUES.join(", ") +
      "; searching every zone instead",
  )
}

const LANGUAGE = envStr("ANYSEARCH_LANGUAGE")
const FORMAT_VALUES = ["markdown", "json"]
const FORMAT_RAW = envStr("ANYSEARCH_FORMAT")
const FORMAT = FORMAT_RAW === "json" ? "json" : "markdown"
if (FORMAT_RAW !== "" && !FORMAT_VALUES.includes(FORMAT_RAW)) {
  console.warn(
    "[websearch] ANYSEARCH_FORMAT " +
      JSON.stringify(FORMAT_RAW) +
      " is not one of " +
      FORMAT_VALUES.join(", ") +
      "; returning markdown instead",
  )
}

const ENDPOINT = "https://api.anysearch.com/v1/search"
const cache = makeCache(CACHE_TTL)

export const anysearch = {
  name: "AnySearch",
  keysURL: "https://www.anysearch.com/",

  async execute({ query, count, key }, ctx) {
    // magpie does not call a key-required API without a key, but keep the
    // failure explicit if that changes.
    if (!key) throw new Error("AnySearch needs a key: add one in magpie's Web search settings")

    const cached = cache.read(query)
    if (cached) return cached

    const body = await requestJSON(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
        },
        body: JSON.stringify({
          query: query.trim().replace(/\s+/g, " "),
          max_results: sizeFor(count, PREFERRED, MAX),
          ...(TAG ? { tag: TAG } : {}),
          ...(ZONE ? { zone: ZONE } : {}),
          ...(LANGUAGE ? { language: LANGUAGE } : {}),
          format: FORMAT,
        }),
      },
      ctx,
      {
        label: "AnySearch",
        timeout: TIMEOUT,
        messages: {
          402:
            "AnySearch quota exhausted (HTTP 402). Add a new AnySearch key in " +
            "magpie's Web search settings, or wait for the quota to reset. The " +
            "response body is withheld because it may contain credentials.",
        },
      },
    )

    // AnySearch reports failures in the envelope too, even on HTTP 200.
    if (Number(body.code) !== 0) {
      throw new Error(
        "AnySearch API error " +
          body.code +
          ": " +
          (body.message ?? "unknown error") +
          " (request_id " +
          (body.request_id ?? "unknown") +
          ")",
      )
    }

    const results = list(body.data?.results)
      .map((item) => page(item.title, item.url, item.content ?? item.snippet))
      .filter(Boolean)

    cache.write(query, results)
    return results
  },
}
