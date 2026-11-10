import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { MAX_REST_BYTES } from "../src/core.mjs"
import { context, json, stubFetch } from "./harness.mjs"

const specs = [
  ["anysearch", "AnySearch", rows => ({ code: 0, data: { results: rows } })],
  ["keenable", "Keenable", rows => ({ results: rows })],
  ["linkup", "Linkup", rows => ({ results: rows })],
  ["metaso", "Metaso", rows => ({ webpages: rows })],
  ["querit", "Querit", rows => ({ results: { result: rows } })],
  ["parallel", "Parallel", rows => ({ results: rows })],
  ["tinyfish", "TinyFish", rows => ({ results: rows })],
]
const args = { query: "validation", count: 1, key: "dummy-key" }
const create = async (id, options = {}) => (await WebSearch({}, { enable: [id], [id]: options })).search[id]

for (const [id, label, envelope] of specs) {
  test(`${id}: malformed result shapes fail clearly and never cache`, async () => {
    for (const payload of [null, [], {}, envelope(null), envelope({}), envelope("wrong"),
      envelope([null, {}, { url: " " }, { url: 42 }, { url: {} }])]) {
      const provider = await create(id)
      const fake = stubFetch(() => json(payload))
      try {
        for (let i = 0; i < 2; i++) {
          await assert.rejects(provider.execute(args, context()), error => {
            assert.match(error.message, new RegExp(`Invalid ${label} response:`))
            assert.equal(error.status, undefined)
            return true
          })
        }
        assert.equal(fake.calls.length, 2, "malformed results must be retried")
      } finally { fake.restore() }
    }
  })

  test(`${id}: explicit empty results retain short caching and valid rows are capped after filtering`, async () => {
    const original = Date.now
    let now = 1_000
    Date.now = () => now
    let payload = envelope([])
    const fake = stubFetch(() => json(payload))
    try {
      const provider = await create(id, { cacheTTL: 60_000 })
      assert.deepEqual(await provider.execute(args, context()), [])
      now += 29_999
      assert.deepEqual(await provider.execute(args, context()), [])
      assert.equal(fake.calls.length, 1)
      now++
      payload = envelope([null, { url: 42 }, { title: "missing" },
        { title: "valid", name: "valid", url: "https://example.com/valid" },
        { url: "https://example.com/extra" }])
      const pages = await provider.execute(args, context())
      assert.equal(fake.calls.length, 2)
      assert.equal(pages.length, 1)
      assert.equal(pages[0].url, "https://example.com/valid")
      assert.equal(pages[0].title, "valid")
    } finally { Date.now = original; fake.restore() }
  })

  if (["anysearch", "keenable", "linkup", "metaso", "querit"].includes(id)) {
    test(`${id}: blank queries fail before fetch, including after a cacheable success`, async () => {
      const provider = await create(id)
      const fake = stubFetch(() => json(envelope([])))
      try {
        await provider.execute(args, context())
        for (const query of [undefined, null, "", " \n\t "]) {
          await assert.rejects(provider.execute({ ...args, query }, context()), { message: `${label} query must not be empty` })
        }
        assert.equal(fake.calls.length, 1)
      } finally { fake.restore() }
    })
  }

  if (["linkup", "metaso", "querit"].includes(id)) {
    test(`${id}: blank keys never fetch and trimmed keys share request identity`, async () => {
      const provider = await create(id)
      const fake = stubFetch(() => json(envelope([])))
      try {
        for (const key of [undefined, null, "", " \t "]) {
          await assert.rejects(provider.execute({ ...args, key }, context()), /needs a key/)
        }
        assert.equal(fake.calls.length, 0)
        await provider.execute({ ...args, key: " dummy-key " }, context())
        await provider.execute(args, context())
        assert.equal(fake.calls.length, 1)
        assert.equal(fake.calls[0].init.headers.Authorization, "Bearer dummy-key")
      } finally { fake.restore() }
    })
  }
}

test("linkup: explicitly excluded image-only results remain a valid empty answer", async () => {
  const provider = await create("linkup")
  const fake = stubFetch(() => json({ results: [{ type: "image", url: "https://example.com/image.png" }] }))
  try {
    assert.deepEqual(await provider.execute(args, context()), [])
    assert.deepEqual(await provider.execute(args, context()), [])
    assert.equal(fake.calls.length, 1)
  } finally { fake.restore() }
})

test("metaso: documented aliases and nullish precedence are preserved", async () => {
  const provider = await create("metaso", { cacheTTL: 0 })
  let payload
  const fake = stubFetch(() => json(payload))
  try {
    for (const field of ["webpages", "results", "papers", "documents", "data"]) {
      payload = { [field]: [{ link: "https://example.com/alias", title: field }] }
      assert.equal((await provider.execute(args, context()))[0].title, field)
      payload = { [field]: [] }
      assert.deepEqual(await provider.execute(args, context()), [])
    }
    payload = { webpages: null, results: [{ url: "https://example.com/fallback" }] }
    assert.equal((await provider.execute(args, context()))[0].url, "https://example.com/fallback")
    payload = { webpages: [], results: [{ url: "https://example.com/fallback" }] }
    assert.deepEqual(await provider.execute(args, context()), [])
    payload = { webpages: "malformed", results: [{ url: "https://example.com/fallback" }] }
    await assert.rejects(provider.execute(args, context()), /expected results array/)
  } finally { fake.restore() }
})

test("metaso: an unsafe link falls back to a valid url", async () => {
  const provider = await create("metaso", { cacheTTL: 0 })
  const fake = stubFetch(() => json({ webpages: [
    { title: "fallback", link: "javascript:alert(1)", url: "https://example.com/fallback" },
  ] }))
  try {
    const pages = await provider.execute(args, context())
    assert.deepEqual(pages.map((page) => page.url), ["https://example.com/fallback"])
  } finally { fake.restore() }
})

for (const id of ["parallel", "tinyfish"]) {
  test(`${id}: anonymous MCP rejects unusable nonempty rows without caching`, async () => {
    const provider = await create(id)
    let rows = [{ title: "missing URL" }]
    const fake = stubFetch(() => json({ jsonrpc: "2.0", id: 1, result: { structuredContent: { results: rows } } }))
    const request = { query: "anonymous validation" }
    try {
      for (let i = 0; i < 2; i++) await assert.rejects(provider.execute(request, context()), /no usable search results/)
      assert.equal(fake.calls.length, 2)
      rows = []
      assert.deepEqual(await provider.execute(request, context()), [])
      assert.deepEqual(await provider.execute(request, context()), [])
      assert.equal(fake.calls.length, 3)
    } finally { fake.restore() }
  })
}

for (const [id, payloads] of [
  ["anysearch", [
    { code: -1, message: "🙂".repeat(10_000), request_id: "request" },
    { code: "x".repeat(10_000), message: "failed", request_id: "y".repeat(10_000) },
  ]],
  ["querit", [
    { error_code: 500, error_msg: "🙂".repeat(10_000), search_id: "request" },
    { error_code: "x".repeat(10_000), error_msg: "failed", search_id: "y".repeat(10_000) },
  ]],
  ["moonshot", [{ error: { message: "🙂".repeat(10_000) } }, { error: { detail: "x".repeat(10_000) } }]],
  ["moonshot-cn", [{ error: "x".repeat(10_000) }]],
]) {
  test(`${id}: all dynamic business error fields are bounded and failures never cache`, async () => {
    const provider = await create(id)
    for (const payload of payloads) {
      const fake = stubFetch(() => json(payload))
      try {
        for (let i = 0; i < 2; i++) {
          await assert.rejects(provider.execute(args, context()), error => {
            assert.ok([...error.message].length < 600)
            assert.match(error.message, /truncated|…/)
            assert.equal(error.status, undefined)
            assert.doesNotMatch(error.message, /[\uD800-\uDFFF]/u)
            return true
          })
        }
        assert.equal(fake.calls.length, 2)
      } finally { fake.restore() }
    }
  })
}

test("REST responses over the success byte budget fail without caching", { timeout: 20_000 }, async () => {
  const provider = await create("linkup")
  const chunk = new Uint8Array(1024 * 1024).fill(97)
  const fake = stubFetch(() => {
    let sent = 0
    return new Response(new ReadableStream({
      pull(controller) {
        if (sent >= 17) return controller.close()
        sent++
        controller.enqueue(chunk)
      },
    }), { status: 200, headers: { "content-type": "application/json" } })
  })
  try {
    for (let i = 0; i < 2; i++) {
      await assert.rejects(provider.execute(args, context()), new RegExp(`body exceeds ${MAX_REST_BYTES} bytes`))
    }
    assert.equal(fake.calls.length, 2, "oversized bodies must be retried, not cached")
  } finally { fake.restore() }
})
