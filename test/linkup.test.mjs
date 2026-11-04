import test from "node:test"
import assert from "node:assert/strict"

import { linkup } from "../src/providers/linkup.mjs"
import { LINKUP_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

test("linkup: maps results, drops images and URL-less hits", async () => {
  const fake = stubFetch(() => json(LINKUP_CASE.response))
  try {
    const pages = await linkup.execute(
      { query: "linkup mapping", count: 6, key: "k" },
      context(),
    )
    assert.deepEqual(pages, LINKUP_CASE.expected)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].url, "https://api.linkup.so/v1/search")
    assert.equal(fake.calls[0].init.headers.Authorization, "Bearer k")
    assert.equal(fake.calls[0].body.q, "linkup mapping")
    assert.equal(fake.calls[0].body.depth, "fast")
    assert.equal(fake.calls[0].body.outputType, "searchResults")
    assert.equal(fake.calls[0].body.maxResults, 6)
  } finally {
    fake.restore()
  }
})

test("linkup: needs a key before it calls the API", async () => {
  const fake = stubFetch(() => json({ results: [] }))
  try {
    await assert.rejects(
      linkup.execute({ query: "linkup no key", count: 6, key: "" }, context()),
      /needs a key/,
    )
    assert.equal(fake.calls.length, 0)
  } finally {
    fake.restore()
  }
})

test("linkup: cuts content to LINKUP_CONTENT_CHARS", async () => {
  const content = "x".repeat(4001)
  const fake = stubFetch(() =>
    json({ results: [{ name: "Long", url: "https://example.com/long", content }] }),
  )
  try {
    const pages = await linkup.execute(
      { query: "linkup trim", count: 6, key: "k" },
      context(),
    )
    assert.equal(pages[0].text.length, 4001)
    assert.ok(pages[0].text.endsWith("…"))
  } finally {
    fake.restore()
  }
})

test("linkup: keeps the 429 status and Retry-After", async () => {
  const fake = stubFetch(() => text("slow down", 429, { "Retry-After": "30" }))
  try {
    await assert.rejects(
      linkup.execute({ query: "linkup rate", count: 6, key: "k" }, context()),
      (error) => {
        assert.equal(error.status, 429)
        assert.equal(error.retryAfter, "30")
        return true
      },
    )
  } finally {
    fake.restore()
  }
})
