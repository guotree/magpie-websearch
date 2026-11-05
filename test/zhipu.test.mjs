import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { createZhipu } from "../src/providers/zhipu.mjs"
import { createZai } from "../src/providers/zai.mjs"
import { ZHIPU_CASE, ZAI_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const sites = [
  { id: "zhipu", label: "Zhipu", create: createZhipu, fixture: ZHIPU_CASE, prefix: "ZHIPU_", endpoint: "https://open.bigmodel.cn/api/paas/v4/web_search", engine: "search_std" },
  { id: "zai", label: "Z.ai", create: createZai, fixture: ZAI_CASE, prefix: "ZAI_", endpoint: "https://api.z.ai/api/paas/v4/web_search", engine: "search-prime" },
]
const hits = { search_result: Array.from({ length: 50 }, (_, n) => ({ link: `https://example.com/${n}`, content: `hit ${n}` })) }

for (const { id, label, create, fixture, prefix, endpoint, engine } of sites) {
  test(`${id}: standalone request, metadata and fixture mapping`, async () => {
    const provider = create()
    assert.equal(provider.name, `${label} (magpie-websearch)`)
    assert.equal(provider.keyOptional, false)
    assert.match(provider.keysURL, /^https:\/\//)
    const fake = stubFetch(() => json(fixture.response))
    try {
      const result = await provider.execute({ query: "  中文  search  ", key: " key ", count: 6 }, context())
      assert.deepEqual(result, fixture.expected)
      const call = fake.calls[0]
      assert.equal(call.url, endpoint)
      assert.equal(call.init.method, "POST")
      assert.equal(call.init.redirect, "error")
      assert.equal(call.init.headers.Authorization, "Bearer key")
      assert.equal(call.init.headers["Content-Type"], "application/json")
      assert.deepEqual(call.body, {
        search_query: "中文 search", search_engine: engine,
        ...(id === "zhipu" ? { search_intent: false } : {}), count: 6,
      })
    } finally { fake.restore() }
  })

  test(`${id}: missing credentials and blank queries cannot fetch or reuse a cached answer`, async () => {
    const provider = create()
    const fake = stubFetch(() => json(fixture.response))
    try {
      await provider.execute({ query: "q", key: "k" }, context())
      for (const key of [undefined, null, "", "  "]) {
        await assert.rejects(provider.execute({ query: "q", key }, context()), /needs a key/)
      }
      for (const query of [undefined, null, "", " \n "]) {
        await assert.rejects(provider.execute({ query, key: "k" }, context()), /query must not be empty/)
      }
      assert.equal(fake.calls.length, 1)
    } finally { fake.restore() }
  })

  test(`${id}: cap requested results and filter before slicing; tolerate bad optional fields`, async () => {
    const fake = stubFetch(() => json({ search_result: [
      null, 7, [], { link: 42 }, { link: "  " },
      { link: " https://example.com/a ", title: " ", content: { bad: true }, publish_date: 2026 },
      { link: "https://example.com/b", title: 7, content: "  preserved\n  indent", publish_date: " May 23, 2025 " },
      ...hits.search_result,
    ] }))
    try {
      const result = await create({ maxResults: 2 }).execute({ query: "q", key: "k", count: 6 }, context())
      assert.equal(fake.calls[0].body.count, 2)
      assert.deepEqual(result, [
        { title: "https://example.com/a", url: "https://example.com/a", text: "" },
        { title: "https://example.com/b", url: "https://example.com/b", text: "  preserved\n  indent", age: "May 23, 2025" },
      ])
      assert.equal((await create({ maxResults: 50 }).execute({ query: "q", key: "k", count: 100 }, context())).length, 50)
      assert.equal(fake.calls[1].body.count, 50)
    } finally { fake.restore() }
  })

  test(`${id}: Unicode text truncation and disabling the local text cap`, async () => {
    const value = "🙂🚀搜后文"
    const fake = stubFetch(() => json({ search_result: [{ link: "https://example.com", content: value }] }))
    try {
      assert.equal((await create({ contentChars: 2 }).execute({ query: "q", key: "k" }, context()))[0].text, "🙂🚀…")
      assert.equal((await create({ contentChars: 0 }).execute({ query: "q", key: "k" }, context()))[0].text, value)
    } finally { fake.restore() }
  })

  test(`${id}: invalid envelopes and business errors fail without caching or inventing HTTP statuses`, async () => {
    const provider = create()
    const invalid = [
      null, [], {}, { search_result: null }, { search_result: {} },
      { search_result: "wrong" }, { search_result: [null, { title: "no URL" }] },
      { error: { code: "1703", message: "no valid data" }, search_result: [] },
      { code: 1702, message: "no engine", search_result: [] },
      { error: "🙂".repeat(400), search_result: [] },
    ]
    let reply
    const fake = stubFetch(() => reply)
    try {
      for (const body of invalid) {
        reply = json(body)
        await assert.rejects(provider.execute({ query: "recover", key: "k" }, context()), (error) => {
          assert.equal(error.status, undefined)
          assert.ok([...error.message].length < 450)
          return true
        })
      }
      reply = text("not JSON", 200)
      await assert.rejects(provider.execute({ query: "recover", key: "k" }, context()), /Invalid .* response/)
      reply = json(fixture.response)
      assert.deepEqual(await provider.execute({ query: "recover", key: "k" }, context()), fixture.expected)
      assert.equal(fake.calls.length, invalid.length + 2)
    } finally { fake.restore() }
  })

  test(`${id}: HTTP refusals retain status, business detail and validated Retry-After`, async () => {
    const provider = create()
    let reply
    const fake = stubFetch(() => reply)
    try {
      for (const status of [400, 401, 402, 403, 429, 500, 503]) {
        reply = json({ error: { code: status === 429 ? "1113" : "1214", message: "upstream reason" } }, status, { "Retry-After": "0007" })
        await assert.rejects(provider.execute({ query: "q", key: "k" }, context()), (error) => {
          assert.equal(error.status, status)
          assert.equal(error.retryAfter, "7")
          assert.match(error.message, /upstream reason/)
          if (status === 401) assert.match(error.message, /site and product type.*Standard API Key/)
          if (status === 429) {
            assert.match(error.message, /1113/)
            assert.match(error.message, /Rate limit or search quota/)
            assert.doesNotMatch(error.message, /concurrent/)
          }
          return true
        })
      }
      for (const [retry, expected] of [
        ["0", "0"], ["Wed, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 GMT"], ["invalid", undefined],
      ]) {
        // A broken body must not erase a known 429 or its retry instruction.
        reply = new Response(new ReadableStream({ start(controller) { controller.error(new Error("broken body")) } }), {
          status: 429, headers: { "Retry-After": retry },
        })
        await assert.rejects(provider.execute({ query: "q", key: "k" }, context()), (error) => {
          assert.equal(error.status, 429)
          assert.equal(error.retryAfter, expected)
          assert.match(error.message, /response body unavailable/)
          return true
        })
      }
      reply = text("Invalid key.", 401)
      await assert.rejects(provider.execute({ query: "q", key: "k" }, context()), (error) => {
        assert.equal(error.status, 401)
        assert.match(error.message, /Invalid key\. Check the key's site/)
        return true
      })
    } finally { fake.restore() }
  })

  test(`${id}: proxy success envelopes still require valid results and cannot hide business errors`, async () => {
    let reply
    const fake = stubFetch(() => json(reply))
    try {
      for (const code of [undefined, null, 0, "0", 200, "200"]) {
        for (const error of [undefined, null, false, "", 0]) {
          reply = { ...fixture.response, code, error }
          assert.deepEqual(await create().execute({ query: "q", key: "k" }, context()), fixture.expected)
        }
      }
      for (const body of [
        { code: 200 },
        { code: 0, error: false, search_result: null },
        { code: "200", error: "", search_result: [{ title: "no link" }] },
      ]) {
        reply = body
        await assert.rejects(create().execute({ query: "q", key: "k" }, context()), /Invalid .* response/)
      }
      for (const body of [
        { ...fixture.response, code: 200, error: { code: "1703", message: "no valid data" } },
        { ...fixture.response, code: "1702", error: false, message: "no engine" },
      ]) {
        reply = body
        await assert.rejects(create().execute({ query: "q", key: "k" }, context()), /API error/)
      }
    } finally { fake.restore() }
  })

  test(`${id}: empty results expire after 30 seconds and instances keep separate caches`, async () => {
    const now = Date.now
    let clock = 1_000_000
    Date.now = () => clock
    const fake = stubFetch(() => json({ search_result: [] }))
    try {
      const provider = create()
      const args = { query: "empty", key: "k" }
      assert.deepEqual(await provider.execute(args, context()), [])
      clock += 29_999
      await provider.execute(args, context())
      assert.equal(fake.calls.length, 1)
      clock++
      await provider.execute(args, context())
      assert.equal(fake.calls.length, 2)
      await create().execute(args, context())
      assert.equal(fake.calls.length, 3)
    } finally { Date.now = now; fake.restore() }
  })

  test(`${id}: settings use this site's environment and explicit options win`, async () => {
    const saved = { ...process.env }
    const fake = stubFetch(() => json(hits))
    try {
      process.env[`${prefix}MAX_RESULTS`] = "15"
      process.env[`${prefix}RECENCY`] = "oneWeek"
      process.env[`${prefix}DOMAIN_FILTER`] = "www.example.com"
      process.env[`${prefix}CONTENT_CHARS`] = "2"
      const envResults = await create().execute({ query: "q", key: "k" }, context())
      assert.equal(fake.calls[0].body.count, 15)
      assert.equal(fake.calls[0].body.search_recency_filter, "oneWeek")
      assert.equal(fake.calls[0].body.search_domain_filter, "www.example.com")
      assert.equal(envResults[0].text, "hi…")
      await create({ maxResults: 3, recency: "noLimit", domainFilter: "" }).execute({ query: "q", key: "k" }, context())
      assert.equal(fake.calls[1].body.count, 3)
      assert.equal(fake.calls[1].body.search_recency_filter, undefined)
      assert.equal(fake.calls[1].body.search_domain_filter, undefined)
      for (const options of [{ timeout: -1 }, { maxResults: 51 }, { contentChars: "2" }, { cacheTTL: -1 }, { recency: "bad" }, { domainFilter: [] }]) {
        assert.throws(() => create(options), (error) => error instanceof TypeError && error.message.startsWith(id + "."))
      }
      const { search } = await WebSearch({}, { enable: [id], disable: [id], [id]: { recency: "bad" } })
      assert.deepEqual(search, {})
    } finally { process.env = saved; fake.restore() }
  })

  test(`${id}: timeout covers fetch and body consumption, timeout zero preserves cancellation`, async () => {
    const keepAlive = setInterval(() => {}, 1000)
    const stalled = ({ init }) => new Promise((_, reject) => {
      if (init.signal.aborted) reject(init.signal.reason)
      else init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
    })
    let fake = stubFetch(stalled)
    const provider = create({ timeout: 10 })
    try {
      await assert.rejects(provider.execute({ query: "q", key: "k" }, context()), /timed out/)
      fake.restore()
      fake = stubFetch(({ init }) => new Response(new ReadableStream({
        start(controller) { init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true }) },
      })))
      await assert.rejects(provider.execute({ query: "q", key: "k" }, context()), /timed out/)
      const ac = new AbortController()
      const unlimited = create({ timeout: 0 })
      const pending = unlimited.execute({ query: "q", key: "k" }, { abort: ac.signal })
      ac.abort()
      await assert.rejects(pending, /cancelled/)
      fake.restore()
      fake = stubFetch(() => json(fixture.response))
      assert.deepEqual(await provider.execute({ query: "q", key: "k" }, context()), fixture.expected)
      assert.deepEqual(await unlimited.execute({ query: "q", key: "k" }, context()), fixture.expected)
      assert.equal(fake.calls.length, 2, "cancelled and timed out responses are not cached")
    } finally { clearInterval(keepAlive); fake.restore() }
  })
}

test("zhipu: enforce 70 Unicode code points without silently truncating; zai sends long queries intact", async () => {
  const fake = stubFetch(() => json({ search_result: [] }))
  try {
    for (const char of ["搜", "🙂"]) {
      await createZhipu().execute({ query: char.repeat(70), key: "k" }, context())
      assert.equal(fake.calls.at(-1).body.search_query, char.repeat(70))
      await assert.rejects(createZhipu().execute({ query: char.repeat(71), key: "k" }, context()), /1–70 characters/)
      await createZai().execute({ query: char.repeat(100), key: "k" }, context())
      assert.equal(fake.calls.at(-1).body.search_query, char.repeat(100))
    }
    assert.equal(fake.calls.length, 4)
  } finally { fake.restore() }
})

test("zhipu: all engines size requests and preserve the local result count including shared count buckets", async () => {
  const fake = stubFetch(() => json(hits))
  try {
    for (const engine of ["search_std", "search_pro", "search_pro_sogou", "search_pro_quark"]) {
      const provider = createZhipu({ engine, maxResults: 50, recency: "oneDay", contentSize: "high" })
      for (const count of [1, 6, 9, 10, 11, 24, 50]) {
        const result = await provider.execute({ query: "q", key: "k", count }, context())
        assert.equal(result.length, count)
        const body = fake.calls.at(-1).body
        assert.equal(body.search_engine, engine)
        assert.equal(body.search_intent, false)
        assert.equal(body.content_size, "high")
        assert.equal(body.search_recency_filter, "oneDay")
        assert.equal(body.count, engine === "search_pro_quark" ? undefined : engine === "search_pro_sogou" ? Math.ceil(count / 10) * 10 : count)
      }
    }
    assert.equal(fake.calls.length, 28, "local limits isolate Sogou buckets and Quark caches")
    for (const engine of ["search_std", "search_pro", "search_pro_sogou"]) {
      await createZhipu({ engine, domainFilter: "example.com", recency: "oneWeek" }).execute({ query: "q", key: "k", count: 6 }, context())
      assert.equal(fake.calls.at(-1).body.search_domain_filter, "example.com")
    }
    assert.throws(() => createZhipu({ engine: "search_pro_quark", domainFilter: "example.com" }), /zhipu.domainFilter.*not supported/)
    assert.throws(() => createZhipu({ engine: "search-prime" }), /zhipu.engine/)
    assert.throws(() => createZhipu({ contentSize: "full" }), /zhipu.contentSize/)
  } finally { fake.restore() }
})

test("zhipu: Quark ignores an environment domain filter without blocking plugin registration", async () => {
  const saved = { ...process.env }
  const warn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)
  const fake = stubFetch(() => json({ search_result: hits.search_result.slice(0, 10) }))
  try {
    process.env.ZHIPU_ENGINE = "search_pro_quark"
    process.env.ZHIPU_DOMAIN_FILTER = "example.com"
    const { search } = await WebSearch({})
    assert.equal(Object.keys(search).length, 12)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /ZHIPU_DOMAIN_FILTER.*search_pro_quark.*ignoring/)
    await search.zhipu.execute({ query: "q", key: "k" }, context())
    assert.equal(fake.calls[0].body.search_domain_filter, undefined)
    assert.equal(fake.calls[0].body.search_engine, "search_pro_quark")

    warnings.length = 0
    const provider = createZhipu({ engine: "search_pro_quark", maxResults: 50 })
    assert.equal(warnings.length, 1, "explicit engine also ignores an inherited domain filter")
    const result = await provider.execute({ query: "q", key: "k", count: 50 }, context())
    assert.equal(result.length, 10, "a local cap cannot fill a short upstream response")
    assert.equal(fake.calls[1].body.count, undefined)
    assert.equal(fake.calls[1].body.search_domain_filter, undefined)
    assert.equal(fake.calls.length, 2, "no extra calls to fill the requested count")

    assert.throws(() => createZhipu({ domainFilter: "example.com" }), /zhipu.domainFilter.*not supported/)
    await assert.rejects(WebSearch({}, { zhipu: { domainFilter: "example.com" } }), /zhipu.domainFilter.*not supported/)

    warnings.length = 0
    createZhipu({ domainFilter: "" })
    const { search: disabled } = await WebSearch({}, { disable: ["zhipu"] })
    assert.equal(disabled.zhipu, undefined)
    assert.equal(Object.keys(disabled).length, 11)
    assert.deepEqual(warnings, [])

    delete process.env.ZHIPU_DOMAIN_FILTER
    createZhipu()
    assert.deepEqual(warnings, [])
  } finally { process.env = saved; console.warn = warn; fake.restore() }
})

test("zai: explicit domestic-only options warn and leave the international request unchanged", async () => {
  const warn = console.warn
  const warnings = []
  console.warn = (message) => warnings.push(message)
  const fake = stubFetch(() => json(ZAI_CASE.response))
  try {
    createZai()
    createZai({ engine: undefined, contentSize: undefined })
    assert.deepEqual(warnings, [])
    for (const options of [
      { engine: "search_pro", contentSize: "high" },
      { engine: "invalid-engine", contentSize: "invalid-size" },
    ]) {
      warnings.length = 0
      const provider = createZai(options)
      assert.equal(warnings.length, 2)
      assert.match(warnings[0], /zai.engine.*only supported by Zhipu.*ignoring/)
      assert.match(warnings[1], /zai.contentSize.*only supported by Zhipu.*ignoring/)
      await provider.execute({ query: "q", key: "k" }, context())
      assert.deepEqual(fake.calls.at(-1).body, { search_query: "q", search_engine: "search-prime", count: 10 })
    }
  } finally { console.warn = warn; fake.restore() }
})

test("dual sites: independent environment, endpoint, credentials, options and cache", async () => {
  const saved = { ...process.env }
  const fake = stubFetch(() => json(hits))
  try {
    process.env.ZHIPU_ENGINE = "search_pro"
    process.env.ZHIPU_CONTENT_SIZE = "high"
    process.env.ZHIPU_RECENCY = "oneDay"
    process.env.ZHIPU_MAX_RESULTS = "12"
    delete process.env.ZAI_MAX_RESULTS
    delete process.env.ZAI_RECENCY
    const cn = createZhipu()
    const intl = createZai()
    await cn.execute({ query: "q", key: "cn-key" }, context())
    await intl.execute({ query: "q", key: "intl-key" }, context())
    assert.equal(fake.calls[0].init.headers.Authorization, "Bearer cn-key")
    assert.equal(fake.calls[0].body.count, 12)
    assert.equal(fake.calls[0].body.search_engine, "search_pro")
    assert.equal(fake.calls[0].body.content_size, "high")
    assert.equal(fake.calls[1].init.headers.Authorization, "Bearer intl-key")
    assert.deepEqual(fake.calls[1].body, { search_query: "q", search_engine: "search-prime", count: 10 })
    assert.equal(fake.calls[1].url, sites[1].endpoint)
    assert.equal(fake.calls.length, 2)
  } finally { process.env = saved; fake.restore() }
})
