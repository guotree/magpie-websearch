import test from "node:test"
import assert from "node:assert/strict"
import { createAnysearch } from "../src/providers/anysearch.mjs"
import { createKeenable } from "../src/providers/keenable.mjs"
import { ANYSEARCH_CASE, KEENABLE_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const providers = [
  ["anysearch", createAnysearch, ANYSEARCH_CASE],
  ["keenable", createKeenable, KEENABLE_CASE],
]

for (const [id, create, fixture] of providers) {
  test(`${id}: anonymous cooldown respects seconds, isolates endpoints, and lets keyed requests through`, async () => {
    const original = Date.now
    let now = Date.UTC(2026, 10, 4)
    Date.now = () => now
    const api = create({ cacheTTL: 0 })
    const fake = stubFetch(() => fake.calls.length === 1
      ? text("slow down", 429, { "Retry-After": "120" }) : json(fixture.response))
    const args = { query: "limited", count: 6, key: "", url: "https://custom.example/proxy/v1" }
    try {
      await assert.rejects(api.execute(args, context()), (e) => e.status === 429 && e.retryAfter === "120")
      now += 1000
      await assert.rejects(api.execute({ ...args, query: "another query" }, context()),
        (e) => e.status === 429 && e.retryAfter === "119" && /cooling down/.test(e.message))
      assert.equal(fake.calls.length, 1)
      await api.execute({ ...args, key: "keyed" }, context())
      await assert.rejects(api.execute(args, context()), /cooling down/)
      assert.equal(fake.calls.length, 2, "keyed success does not reset anonymous cooldown")
      await api.execute({ ...args, url: "https://other.example/v1/search" }, context())
      assert.equal(fake.calls.length, 3)
      now += 119_000
      await api.execute(args, context())
      assert.equal(fake.calls.length, 4, "anonymous requests resume at expiry")
    } finally { Date.now = original; fake.restore() }
  })

  test(`${id}: HTTP-date Retry-After and a missing or invalid header have predictable cooldowns`, async () => {
    const original = Date.now
    const start = Date.UTC(2026, 10, 4)
    let now = start
    Date.now = () => now
    try {
      for (const retry of [new Date(start + 90_000).toUTCString(), undefined, "invalid", "999999999999999999999999"]) {
        now = start
        const api = create({ cacheTTL: 0 })
        const seconds = retry?.endsWith("GMT") ? 90 : 60
        const fake = stubFetch(() => fake.calls.length === 1
          ? text("limited", 429, retry ? { "Retry-After": retry } : {}) : json(fixture.response))
        try {
          await assert.rejects(api.execute({ query: "first" }, context()), (e) => e.status === 429)
          await assert.rejects(api.execute({ query: "next" }, context()),
            (e) => e.status === 429 && e.retryAfter === String(seconds))
          assert.equal(fake.calls.length, 1)
          now += seconds * 1000
          await api.execute({ query: "resumed" }, context())
          assert.equal(fake.calls.length, 2)
        } finally { fake.restore() }
      }
    } finally { Date.now = original }
  })

  test(`${id}: anonymous cached results remain usable during cooldown and never cross to a key`, async () => {
    const api = create()
    const fake = stubFetch(({ body }) => (body.query ?? body.q) === "limited"
      ? text("limited", 429, { "Retry-After": "120" }) : json(fixture.response))
    try {
      const pages = await api.execute({ query: "cached" }, context())
      await assert.rejects(api.execute({ query: "limited" }, context()), (e) => e.status === 429)
      assert.deepEqual(await api.execute({ query: "cached" }, context()), pages)
      assert.equal(fake.calls.length, 2)
      await api.execute({ query: "cached", key: "keyed" }, context())
      assert.equal(fake.calls.length, 3)
    } finally { fake.restore() }
  })

  test(`${id}: invalid configured keys never fall back to anonymous`, async () => {
    const api = create({ cacheTTL: 0 })
    const fake = stubFetch(() => text("invalid key", 401))
    try {
      await assert.rejects(api.execute({ query: "auth", key: "invalid" }, context()), (e) => e.status === 401)
      assert.equal(fake.calls.length, 1)
      assert.ok(!fake.calls[0].url.endsWith("/public"))
    } finally { fake.restore() }
  })

  test(`${id}: a broken 429 response body still starts anonymous cooldown`, async () => {
    const api = create({ cacheTTL: 0 })
    const fake = stubFetch(() => new Response(new ReadableStream({
      start(controller) { controller.error(new Error("broken body")) },
    }), { status: 429, headers: { "Retry-After": "120" } }))
    try {
      await assert.rejects(api.execute({ query: "broken" }, context()),
        (e) => e.status === 429 && e.retryAfter === "120")
      await assert.rejects(api.execute({ query: "next" }, context()), /cooling down/)
      assert.equal(fake.calls.length, 1)
    } finally { fake.restore() }
  })
}

test("keenable: custom public endpoints follow the current authentication mode", async () => {
  const api = createKeenable({ cacheTTL: 0 })
  const fake = stubFetch(() => json(KEENABLE_CASE.response))
  try {
    for (const base of ["https://custom.example/proxy", "https://custom.example/proxy/v1/",
      "https://custom.example/proxy/v1/search", "https://custom.example/proxy/v1/search/public/"]) {
      await api.execute({ query: "custom", key: " ", url: base }, context())
      assert.equal(fake.calls.at(-1).url, "https://custom.example/proxy/v1/search/public")
      assert.equal(new Headers(fake.calls.at(-1).init.headers).has("X-API-Key"), false)
      await api.execute({ query: "custom", key: "k", url: base }, context())
      assert.equal(fake.calls.at(-1).url, "https://custom.example/proxy/v1/search")
      assert.equal(fake.calls.at(-1).init.headers["X-API-Key"], "k")
    }
  } finally { fake.restore() }
})

test("anysearch: anonymous 402 responses also withhold credentials", async () => {
  const api = createAnysearch({ cacheTTL: 0 })
  const fake = stubFetch(() => text("sensitive quota response", 402))
  try {
    await assert.rejects(api.execute({ query: "quota" }, context()), (e) => {
      assert.equal(e.status, 402)
      assert.doesNotMatch(e.message, /sensitive quota response/)
      return true
    })
  } finally { fake.restore() }
})
