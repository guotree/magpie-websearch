import test from "node:test"
import assert from "node:assert/strict"

import { createQuerit } from "../src/providers/querit.mjs"
import { QUERIT_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const querit = createQuerit()

test("querit: maps results, falls back to sentences, drops URL-less hits", async () => {
  const fake = stubFetch(() => json(QUERIT_CASE.response))
  try {
    const pages = await querit.execute(
      { query: "querit mapping", count: 6, key: "k" },
      context(),
    )
    assert.deepEqual(pages, QUERIT_CASE.expected)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].url, "https://api.querit.ai/v1/search")
    assert.equal(fake.calls[0].init.method, "POST")
    assert.equal(fake.calls[0].init.headers.Authorization, "Bearer k")
    assert.deepEqual(fake.calls[0].body, { query: "querit mapping", count: 6 })
  } finally {
    fake.restore()
  }
})

test("querit: needs a key before it calls the API", async () => {
  const fake = stubFetch(() => json({ results: { result: [] } }))
  try {
    await assert.rejects(
      querit.execute({ query: "querit no key", count: 6, key: "" }, context()),
      /needs a key/,
    )
    assert.equal(fake.calls.length, 0)
  } finally {
    fake.restore()
  }
})

test("querit: reports an envelope error with a numeric search_id", async () => {
  const fake = stubFetch(() =>
    json({
      error_code: 400,
      error_msg: "quota exceeded",
      search_id: 98765,
      results: { result: [] },
    }),
  )
  try {
    await assert.rejects(
      querit.execute({ query: "querit envelope", count: 6, key: "k" }, context()),
      /Querit API error 400: quota exceeded \(search_id 98765\)/,
    )
  } finally {
    fake.restore()
  }
})

test("querit: keeps a string search_id and names a missing error_msg", async () => {
  const fake = stubFetch(() => json({ error_code: 500, search_id: "abc-123" }))
  try {
    await assert.rejects(
      querit.execute({ query: "querit string id", count: 6, key: "k" }, context()),
      /Querit API error 500: unknown error \(search_id abc-123\)/,
    )
  } finally {
    fake.restore()
  }
})

test("querit: reports an HTTP status with the body text", async () => {
  const fake = stubFetch(() => text("invalid api key", 401))
  try {
    await assert.rejects(
      querit.execute({ query: "querit http", count: 6, key: "k" }, context()),
      /Querit API error 401: invalid api key/,
    )
  } finally {
    fake.restore()
  }
})

test("querit: keeps the 429 status and Retry-After", async () => {
  const fake = stubFetch(() => text("slow down", 429, { "Retry-After": "30" }))
  try {
    await assert.rejects(
      querit.execute({ query: "querit rate", count: 6, key: "k" }, context()),
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

test("querit: passes QUERIT_COUNT through when magpie gives no count", async () => {
  const old = process.env.QUERIT_COUNT
  process.env.QUERIT_COUNT = "5000"
  try {
    const unclamped = createQuerit()
    const fake = stubFetch(() => json({ results: { result: [] } }))
    try {
      await unclamped.execute({ query: "querit unclamped", key: "k" }, context())
      assert.equal(fake.calls[0].body.count, 5000)
    } finally {
      fake.restore()
    }
  } finally {
    if (old === undefined) delete process.env.QUERIT_COUNT
    else process.env.QUERIT_COUNT = old
  }
})
