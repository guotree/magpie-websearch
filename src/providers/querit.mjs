import { envInt, list, makeCache, page, requestJSON } from "../core.mjs"

// Querit returns { error_code, error_msg, search_id, results: { result: [...] } }.
// Every field on a hit is optional; a missing snippet means the sentence-level
// matches are the only body text available.
//
// A key is required.
//
//   QUERIT_CACHE_TTL  ms to reuse a response for the same query (0 disables)
//   QUERIT_COUNT      cap on results; Querit's own limit applies (no local clamp)
//   QUERIT_TIMEOUT    ms to wait before failing (0 removes the deadline)
const CACHE_TTL = envInt("QUERIT_CACHE_TTL", 600_000)
const TIMEOUT = envInt("QUERIT_TIMEOUT", 25_000)
const PREFERRED = envInt("QUERIT_COUNT", 8)

const ENDPOINT = "https://api.querit.ai/v1/search"
const cache = makeCache(CACHE_TTL)

// search_id is documented as both a string and an integer, so read it loosely
// rather than letting a strict decode reject an otherwise good response.
function searchIdOf(json) {
  const value = json?.search_id
  return typeof value === "string" || typeof value === "number" ? String(value) : "unknown"
}

// magpie asks for 6 pages, so QUERIT_COUNT acts as a cap rather than a value
// that overrides the host. With no count (a direct unit call), the knob is
// passed through as it is: Querit applies its own limit.
function countFor(count) {
  const wanted = Number.isFinite(count) && count > 0 ? Math.floor(count) : PREFERRED
  return Math.max(1, Math.min(wanted, PREFERRED))
}

export const querit = {
  name: "Querit",
  keysURL: "https://querit.ai",

  async execute({ query, count, key }, ctx) {
    // magpie does not call a key-required API without a key, but keep the
    // failure explicit if that changes.
    if (!key) throw new Error("Querit needs a key: add one in magpie's Web search settings")

    const cached = cache.read(query)
    if (cached) return cached

    const json = await requestJSON(
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
          count: countFor(count),
        }),
      },
      ctx,
      { label: "Querit", timeout: TIMEOUT },
    )

    // Querit reports failures in the body too, even on an HTTP 200. search_id
    // is what support needs to trace the request.
    if (json.error_code !== undefined && Number(json.error_code) !== 200) {
      throw new Error(
        "Querit API error " +
          json.error_code +
          ": " +
          (json.error_msg ?? "unknown error") +
          " (search_id " +
          searchIdOf(json) +
          ")",
      )
    }

    const results = list(json.results?.result)
      .filter((item) => item && item.url)
      .map((item) =>
        page(
          item.title,
          item.url,
          item.snippet ?? (Array.isArray(item.sentence) ? item.sentence.join(" ") : ""),
          item.page_age,
        ),
      )
      .filter(Boolean)

    cache.write(query, results)
    return results
  },
}
