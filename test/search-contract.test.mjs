import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { searchEndpoint } from "../src/core.mjs"
import { context, json, stubFetch } from "./harness.mjs"
import { ANYSEARCH_CASE, KEENABLE_CASE, LINKUP_CASE, QUERIT_CASE } from "./cases.mjs"

const fixtures = { anysearch: ANYSEARCH_CASE, keenable: KEENABLE_CASE, linkup: LINKUP_CASE, querit: QUERIT_CASE }

test("custom Base URL preserves prefixes and accepts an origin, /v1 or full endpoint", () => {
  for (const [base, want] of [
    ["https://custom.example", "https://custom.example/v1/search"],
    ["https://custom.example/proxy/", "https://custom.example/proxy/v1/search"],
    ["https://custom.example/proxy/v1/", "https://custom.example/proxy/v1/search"],
    ["http://127.0.0.1:8080/search", "http://127.0.0.1:8080/search"],
  ]) assert.equal(searchEndpoint(base, "unused"), want)
  for (const base of ["file:///tmp/search", "https://custom.example?token=x", "https://user@custom.example"]) {
    assert.throws(() => searchEndpoint(base, "unused"), /Base URL/)
  }
})

for (const [id, fixture] of Object.entries(fixtures)) {
  test(`${id}: routes custom URLs and isolates cache by key, count and endpoint`, async () => {
    const { search } = await WebSearch({}, {})
    const fake = stubFetch(() => json(fixture.response))
    const args = { query: "cache isolation", count: 1, key: "key-a", url: "https://custom.example/proxy/v1" }
    try {
      await search[id].execute(args, context())
      await search[id].execute({ ...args, query: "  cache   isolation  " }, context())
      assert.equal(fake.calls.length, 1, "equivalent request reuses cache")
      await search[id].execute({ ...args, key: "key-b" }, context())
      await search[id].execute({ ...args, count: 6 }, context())
      await search[id].execute({ ...args, url: "https://other.example/v1/search" }, context())
      assert.equal(fake.calls.length, 4)
      assert.equal(fake.calls[0].url, "https://custom.example/proxy/v1/search")
      assert.equal(fake.calls[3].url, "https://other.example/v1/search")
      assert.equal(fake.calls[2].body.max_results ?? fake.calls[2].body.maxResults ?? fake.calls[2].body.count, 6)
    } finally { fake.restore() }
  })

  test(`${id}: cacheTTL zero disables caching`, async () => {
    const { search } = await WebSearch({}, { [id]: { cacheTTL: 0 } })
    const fake = stubFetch(() => json(fixture.response))
    try {
      for (let i = 0; i < 2; i++) await search[id].execute({ query: "no cache", key: "k", count: 6 }, context())
      assert.equal(fake.calls.length, 2)
    } finally { fake.restore() }
  })
}

test("provider options reach requests and keep settings and caches separate per plugin instance", async () => {
  const oldDepth = process.env.LINKUP_DEPTH
  process.env.LINKUP_DEPTH = "standard"
  const fake = stubFetch(() => json(LINKUP_CASE.response))
  try {
    const first = await WebSearch({}, { linkup: { depth: "deep", maxResults: 2, contentChars: 3 } })
    const second = await WebSearch({}, {})
    const args = { query: "options", key: "k", count: 6 }
    const pages = await first.search.linkup.execute(args, context())
    await second.search.linkup.execute(args, context())
    assert.equal(fake.calls[0].body.depth, "deep")
    assert.equal(fake.calls[0].body.maxResults, 2)
    assert.ok(pages.every((page) => [...page.text].length <= 4))
    assert.equal(fake.calls[1].body.depth, "standard")
    assert.equal(fake.calls[1].body.maxResults, 6)
  } finally {
    fake.restore()
    if (oldDepth === undefined) delete process.env.LINKUP_DEPTH
    else process.env.LINKUP_DEPTH = oldDepth
  }
})

test("AnySearch, Keenable and Querit options reach their request fields", async () => {
  const { search } = await WebSearch({}, {
    anysearch: { tag: "code.snippet", zone: "cn", language: "zh-CN", format: "json", maxResults: 2 },
    keenable: { mode: "realtime", title: "Example", maxResults: 3 },
    querit: { count: 4 },
  })
  const fake = stubFetch((call) => json(call.url.includes("anysearch") ? ANYSEARCH_CASE.response
    : call.url.includes("keenable") ? KEENABLE_CASE.response : QUERIT_CASE.response))
  try {
    for (const id of ["anysearch", "keenable", "querit"]) {
      await search[id].execute({ query: "options", key: "k", count: 6 }, context())
    }
    assert.deepEqual(fake.calls[0].body, {
      query: "options", max_results: 2, tag: "code.snippet", zone: "cn", language: "zh-CN", format: "json",
    })
    assert.equal(fake.calls[1].body.mode, "realtime")
    assert.equal(fake.calls[1].body.max_results, 3)
    assert.equal(fake.calls[1].init.headers["X-Keenable-Title"], "Example")
    assert.equal(fake.calls[2].body.count, 4)
  } finally { fake.restore() }
})

test("identically configured plugin instances keep separate caches", async () => {
  const first = await WebSearch({}, {})
  const second = await WebSearch({}, {})
  const fake = stubFetch(() => json(LINKUP_CASE.response))
  try {
    const args = { query: "instance cache", key: "k", count: 6 }
    await first.search.linkup.execute(args, context())
    await second.search.linkup.execute(args, context())
    assert.equal(fake.calls.length, 2)
  } finally { fake.restore() }
})

test("invalid provider options fail loading and disabled providers are not initialized", async () => {
  for (const options of [
    { linkup: { depth: "invalid" } }, { querit: { count: 0 } },
    { anysearch: { maxResults: "2" } }, { keenable: [] }, { linkup: { timeout: -1 } },
    { linkup: { timeout: 2_147_483_648 } },
  ]) await assert.rejects(WebSearch({}, options), TypeError)
  const { search } = await WebSearch({}, { disable: ["linkup"], linkup: { depth: "invalid" } })
  assert.equal(search.linkup, undefined)
})

test("timeouts and host cancellation abort the upstream request", async () => {
  // Keep an event-loop handle: AbortSignal.timeout itself does not keep Node alive.
  const keepAlive = setInterval(() => {}, 1000)
  const fake = stubFetch(({ init }) => new Promise((_, reject) => {
    if (init.signal.aborted) return reject(init.signal.reason)
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
  }))
  try {
    const { search } = await WebSearch({}, { linkup: { timeout: 10, cacheTTL: 0 } })
    await assert.rejects(search.linkup.execute({ query: "timeout", key: "k" }, context()), /timed out/)
    const controller = new AbortController()
    const unlimited = await WebSearch({}, { linkup: { timeout: 0 } })
    const pending = unlimited.search.linkup.execute({ query: "cancel", key: "k" }, { abort: controller.signal })
    controller.abort()
    await assert.rejects(pending, /cancelled/)
    assert.equal(fake.calls[1].init.signal.aborted, true)
  } finally { clearInterval(keepAlive); fake.restore() }
})
