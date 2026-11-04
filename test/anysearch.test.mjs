import test from "node:test"
import assert from "node:assert/strict"

import { anysearch } from "../src/providers/anysearch.mjs"
import { ANYSEARCH_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

test("anysearch: maps data.results, prefers content, drops URL-less hits", async () => {
  const fake = stubFetch(() => json(ANYSEARCH_CASE.response))
  try {
    const pages = await anysearch.execute(
      { query: "anysearch mapping", count: 6, key: "k" },
      context(),
    )
    assert.deepEqual(pages, ANYSEARCH_CASE.expected)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].url, "https://api.anysearch.com/v1/search")
    assert.equal(fake.calls[0].init.method, "POST")
    assert.equal(fake.calls[0].init.headers.Authorization, "Bearer k")
    assert.equal(fake.calls[0].body.max_results, 6)
    assert.equal(fake.calls[0].body.format, "markdown")
  } finally {
    fake.restore()
  }
})

test("anysearch: needs a key before it calls the API", async () => {
  const fake = stubFetch(() => json({ code: 0, data: { results: [] } }))
  try {
    await assert.rejects(
      anysearch.execute({ query: "anysearch no key", count: 6, key: "" }, context()),
      /needs a key/,
    )
    assert.equal(fake.calls.length, 0)
  } finally {
    fake.restore()
  }
})

test("anysearch: withholds a 402 body", async () => {
  const fake = stubFetch(() => text("secret-key-material", 402))
  try {
    await assert.rejects(
      anysearch.execute({ query: "anysearch quota", count: 6, key: "k" }, context()),
      (error) => {
        assert.equal(error.status, 402)
        assert.match(error.message, /quota exhausted/)
        assert.doesNotMatch(error.message, /secret-key-material/)
        return true
      },
    )
  } finally {
    fake.restore()
  }
})

test("anysearch: reports an envelope error with its request id", async () => {
  const fake = stubFetch(() => json({ code: -1, message: "bad query", request_id: "req-1" }))
  try {
    await assert.rejects(
      anysearch.execute({ query: "anysearch envelope", count: 6, key: "k" }, context()),
      /AnySearch API error -1: bad query \(request_id req-1\)/,
    )
  } finally {
    fake.restore()
  }
})

test("anysearch: keeps the 429 status and Retry-After", async () => {
  const fake = stubFetch(() => text("slow down", 429, { "Retry-After": "30" }))
  try {
    await assert.rejects(
      anysearch.execute({ query: "anysearch rate", count: 6, key: "k" }, context()),
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
