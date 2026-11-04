import test from "node:test"
import assert from "node:assert/strict"

import { createKeenable } from "../src/providers/keenable.mjs"
import { KEENABLE_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const keenable = createKeenable()

test("keenable: maps results with a key", async () => {
  const fake = stubFetch(() => json(KEENABLE_CASE.response))
  try {
    const pages = await keenable.execute(
      { query: "keenable mapping", count: 6, key: "k" },
      context(),
    )
    assert.deepEqual(pages, KEENABLE_CASE.expected)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].url, "https://api.keenable.ai/v1/search")
    assert.equal(fake.calls[0].init.headers["X-API-Key"], "k")
    assert.equal(fake.calls[0].init.headers["X-Keenable-Title"], "magpie-websearch")
    assert.equal(fake.calls[0].body.max_results, 6)
  } finally {
    fake.restore()
  }
})

test("keenable: anonymous search uses the public endpoint and application title", async () => {
  const fake = stubFetch(() => json(KEENABLE_CASE.response))
  try {
    const pages = await keenable.execute({ query: "keenable no key", count: 6, key: "" }, context())
    assert.deepEqual(pages, KEENABLE_CASE.expected)
    assert.equal(keenable.keyOptional, true)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].url, "https://api.keenable.ai/v1/search/public")
    assert.equal(fake.calls[0].init.headers["X-Keenable-Title"], "magpie-websearch")
    assert.equal(new Headers(fake.calls[0].init.headers).has("X-API-Key"), false)
    assert.equal(new Headers(fake.calls[0].init.headers).has("Authorization"), false)
  } finally {
    fake.restore()
  }
})

test("keenable: a 402 is credits exhausted", async () => {
  const fake = stubFetch(() => text("no credits", 402))
  try {
    await assert.rejects(
      keenable.execute({ query: "keenable credits", count: 6, key: "k" }, context()),
      (error) => {
        assert.equal(error.status, 402)
        assert.match(error.message, /credits exhausted/)
        return true
      },
    )
  } finally {
    fake.restore()
  }
})

test("keenable: keeps the 429 status and Retry-After", async () => {
  const fake = stubFetch(() => text("slow down", 429, { "Retry-After": "30" }))
  try {
    await assert.rejects(
      keenable.execute({ query: "keenable rate", count: 6, key: "k" }, context()),
      (error) => {
        assert.equal(error.status, 429)
        assert.equal(error.retryAfter, "30")
        assert.match(error.message, /retry after 30s/)
        return true
      },
    )
  } finally {
    fake.restore()
  }
})
