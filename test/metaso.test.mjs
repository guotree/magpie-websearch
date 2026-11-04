import test from "node:test"
import assert from "node:assert/strict"

import { createMetaso } from "../src/providers/metaso.mjs"
import { METASO_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const metaso = createMetaso()

test("metaso: maps results, drops URL-less hits, and maps date to age", async () => {
  const fake = stubFetch(() => json(METASO_CASE.response))
  try {
    const pages = await metaso.execute(
      { query: "metaso mapping", count: 6, key: "mk-testkey" },
      context(),
    )
    assert.deepEqual(pages, METASO_CASE.expected)
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].url, "https://metaso.cn/api/v1/search")
    assert.equal(fake.calls[0].init.headers.Authorization, "Bearer mk-testkey")
    assert.equal(fake.calls[0].body.q, "metaso mapping")
    assert.equal(fake.calls[0].body.scope, "webpage")
    assert.equal(fake.calls[0].body.concise, true)
    assert.equal(fake.calls[0].body.size, 6)
  } finally {
    fake.restore()
  }
})

test("metaso: needs a key before it calls the API", async () => {
  const fake = stubFetch(() => json({ webpages: [] }))
  try {
    await assert.rejects(
      metaso.execute({ query: "metaso no key", count: 6, key: "" }, context()),
      /needs a key/,
    )
    assert.equal(fake.calls.length, 0)
  } finally {
    fake.restore()
  }
})

test("metaso: cuts content to METASO_CONTENT_CHARS", async () => {
  const snippet = "m".repeat(4001)
  const fake = stubFetch(() =>
    json({ webpages: [{ title: "Long", link: "https://example.com/long", snippet }] }),
  )
  try {
    const pages = await metaso.execute(
      { query: "metaso trim", count: 6, key: "mk-testkey" },
      context(),
    )
    assert.equal(pages[0].text.length, 4001)
    assert.ok(pages[0].text.endsWith("…"))
  } finally {
    fake.restore()
  }
})

test("metaso: keeps the 429 status and Retry-After", async () => {
  const fake = stubFetch(() => text("rate limited", 429, { "Retry-After": "30" }))
  try {
    await assert.rejects(
      metaso.execute({ query: "metaso rate", count: 6, key: "mk-testkey" }, context()),
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

test("metaso: supports fallback to results/papers/documents and url property", async () => {
  const fake = stubFetch(() =>
    json({
      results: [
        { title: "Generic result", url: "https://example.com/result", content: "Content fallback" },
      ],
    }),
  )
  try {
    const pages = await metaso.execute(
      { query: "metaso fallback fields", count: 5, key: "mk-testkey" },
      context(),
    )
    assert.equal(pages.length, 1)
    assert.equal(pages[0].title, "Generic result")
    assert.equal(pages[0].url, "https://example.com/result")
    assert.equal(pages[0].text, "Content fallback")
  } finally {
    fake.restore()
  }
})
