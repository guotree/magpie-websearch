import { envInt, envStr, list, makeCache, page, requestJSON, sizeFor } from "../core.mjs"

// Linkup returns { results: [...] } with no body-level error envelope: failures
// are HTTP status codes only. Text and image results share one list; image
// entries carry no content, so they are dropped on the way out.
//
// `content` is a query-relevant excerpt, not the page. Depth buys recall and
// latency, not text: the depths returned the same excerpt lengths when
// measured.
//
//   LINKUP_CACHE_TTL     ms to reuse a response for the same query (0 disables)
//   LINKUP_DEPTH         "flash", "fast" (default), "standard" or "deep"
//   LINKUP_MAX_RESULTS   cap on results, 1-100 (the API answers with at most 20)
//   LINKUP_CONTENT_CHARS code points kept from each excerpt (0 keeps all)
//   LINKUP_TIMEOUT       ms to wait before failing (0 removes the deadline)
const CACHE_TTL = envInt("LINKUP_CACHE_TTL", 600_000)
const TIMEOUT = envInt("LINKUP_TIMEOUT", 25_000)
const MAX = 100
const PREFERRED = Math.min(Math.max(envInt("LINKUP_MAX_RESULTS", 10), 1), MAX)
const CONTENT_CHARS = envInt("LINKUP_CONTENT_CHARS", 4_000)

const DEPTH_VALUES = ["flash", "fast", "standard", "deep"]
const DEPTH_RAW = envStr("LINKUP_DEPTH")
const DEPTH = DEPTH_VALUES.includes(DEPTH_RAW) ? DEPTH_RAW : "fast"
if (DEPTH_RAW !== "" && !DEPTH_VALUES.includes(DEPTH_RAW)) {
  console.warn(
    "[websearch] LINKUP_DEPTH " +
      JSON.stringify(DEPTH_RAW) +
      " is not one of " +
      DEPTH_VALUES.join(", ") +
      "; searching at the default depth instead",
  )
}

const ENDPOINT = "https://api.linkup.so/v1/search"
const cache = makeCache(CACHE_TTL)

// Counted in code points, never UTF-16 units, so no surrogate pair is sliced
// in half. The trailing ellipsis tells the model the excerpt was clipped.
function trimContent(text) {
  if (CONTENT_CHARS <= 0 || text.length <= CONTENT_CHARS) return text
  const points = [...text]
  if (points.length <= CONTENT_CHARS) return text
  return points.slice(0, CONTENT_CHARS).join("") + "…"
}

export const linkup = {
  name: "Linkup",
  keysURL: "https://app.linkup.so",

  async execute({ query, count, key }, ctx) {
    // magpie does not call a key-required API without a key, but keep the
    // failure explicit if that changes.
    if (!key) throw new Error("Linkup needs a key: add one in magpie's Web search settings")

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
          q: query.trim().replace(/\s+/g, " "),
          depth: DEPTH,
          // The leanest outputType, and the only one this contract can carry:
          // `sourcedAnswer` adds an AI answer on top of source snippets that
          // are the same text `results[].content` already holds.
          outputType: "searchResults",
          maxResults: sizeFor(count, PREFERRED, MAX),
        }),
      },
      ctx,
      { label: "Linkup", timeout: TIMEOUT },
    )

    const results = list(body.results)
      .flatMap((item) =>
        item.url && item.type !== "image"
          ? [page(item.name, item.url, trimContent(item.content ?? ""))]
          : [],
      )
      .filter(Boolean)

    cache.write(query, results)
    return results
  },
}
