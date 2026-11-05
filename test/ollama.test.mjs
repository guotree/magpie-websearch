import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { createOllama } from "../src/providers/ollama.mjs"
import { OLLAMA_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const args = { query: "q", key: "k" }

test("ollama: cloud POST, Bearer account key, normalized query and default five-result cap", async () => {
  const provider = createOllama()
  assert.equal(provider.name, "Ollama (magpie-websearch)")
  assert.equal(provider.keysURL, "https://ollama.com/settings/keys")
  assert.equal(provider.keyOptional, false)
  const fake = stubFetch(() => json(OLLAMA_CASE.response))
  try {
    assert.deepEqual(await provider.execute({ query: "  中文   search\n", count: 6, key: " key " }, context()), OLLAMA_CASE.expected)
    const call = fake.calls[0]
    assert.equal(call.url, "https://ollama.com/api/web_search")
    assert.equal(call.init.method, "POST")
    assert.equal(call.init.redirect, "error")
    assert.deepEqual(call.init.headers, { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer key" })
    assert.deepEqual(call.body, { query: "中文 search", max_results: 5 })
  } finally { fake.restore() }
})

test("ollama: empty call keys and queries fail before fetch without reading environment credentials", async () => {
  const original = { ...process.env }
  const fake = stubFetch(() => json({ results: [] }))
  try {
    Object.assign(process.env, { OLLAMA_API_KEY: "ignored", OSP_OLLAMA_API_KEY: "ignored", BOCHA_API_KEY: "ignored" })
    const provider = createOllama()
    for (const key of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, key }, context()), /Ollama needs a key: add one in magpie's Web search settings/)
    }
    for (const query of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, query }, context()), /Ollama query must not be empty/)
    }
    assert.equal(fake.calls.length, 0)
    const query = "搜".repeat(2000)
    await provider.execute({ ...args, query }, context())
    assert.equal(fake.calls[0].body.query, query)
  } finally { process.env = original; fake.restore() }
})

test("ollama: requested counts are floored and capped after unusable rows are removed", async () => {
  const fake = stubFetch(() => json(OLLAMA_CASE.response))
  try {
    for (const [count, maxResults, expected] of [[50, 10, 10], [6.9, 10, 6], [undefined, 7, 7], [6, 3, 3]]) {
      await createOllama({ maxResults }).execute({ ...args, count }, context())
      assert.equal(fake.calls.at(-1).body.max_results, expected)
    }
    assert.deepEqual(await createOllama({ maxResults: 1 }).execute(args, context()), OLLAMA_CASE.expected.slice(0, 1))
  } finally { fake.restore() }
})

test("ollama: bounds content by complete code points, zero keeps all and no age is inferred", async () => {
  const long = "😀".repeat(2001)
  const fake = stubFetch(() => json({ results: [
    { url: " https://example.com/long ", title: " Title ", content: long, date: "2026-11-05", publish_date: "2026-11-05" },
    { url: "https://example.com/date", content: "Date in content: 2026-11-05", age: "2026-11-05" },
    { url: "https://example.com/null", title: null, content: null },
    { url: "https://example.com/missing", title: " " },
    { url: "https://example.com/object", title: 42, content: {} },
  ] }))
  try {
    for (const contentChars of [undefined, 3, 0]) {
      const result = await createOllama({ contentChars }).execute(args, context())
      assert.equal(result[0].text, contentChars === 0 ? long : "😀".repeat(contentChars ?? 2000) + "…")
      assert.equal(result[0].title, "Title")
      assert.equal(result[0].url, "https://example.com/long")
      assert.deepEqual(result.slice(2).map((r) => r.text), ["", "", ""])
      assert.deepEqual(result.slice(2).map((r) => r.title), result.slice(2).map((r) => r.url))
      assert.ok(result.every((r) => !Object.hasOwn(r, "age")))
      assert.deepEqual(fake.calls.at(-1).body, { query: "q", max_results: 5 })
    }
  } finally { fake.restore() }
})

test("ollama: malformed envelopes and business errors fail without caching or fabricated HTTP status", async () => {
  for (const [response, message] of [
    [null, "expected an object"], [[], "expected an object"], [1, "expected an object"],
    [{}, "results must be an array"], [{ results: null }, "results must be an array"], [{ results: {} }, "results must be an array"],
    [{ results: [null, [], 1, "row", {}, { url: 1 }, { url: " " }] }, "no usable search results in payload"],
    [{ error: "business failure", results: [] }, "business failure"], [{ error: { message: "business failure" } }, "business failure"],
  ]) {
    const provider = createOllama()
    const fake = stubFetch(() => fake.calls.length === 1 ? json(response) : json(OLLAMA_CASE.response))
    try {
      await assert.rejects(provider.execute(args, context()), (error) => {
        assert.ok(error.message.includes(message), error.message)
        assert.equal(error.status, undefined)
        return true
      })
      assert.deepEqual(await provider.execute(args, context()), OLLAMA_CASE.expected)
      assert.equal(fake.calls.length, 2)
    } finally { fake.restore() }
  }
  const fake = stubFetch(() => text("broken JSON", 200))
  try { await assert.rejects(createOllama().execute(args, context()), /Invalid Ollama response/) }
  finally { fake.restore() }
})

test("ollama: valid empty results expire after at most thirty seconds", async () => {
  const original = Date.now
  let now = 1_800_000_000_000
  Date.now = () => now
  const fake = stubFetch(() => json({ results: [] }))
  try {
    const provider = createOllama()
    assert.deepEqual(await provider.execute(args, context()), [])
    assert.deepEqual(await provider.execute(args, context()), [])
    assert.equal(fake.calls.length, 1)
    now += 30_001
    await provider.execute(args, context())
    assert.equal(fake.calls.length, 2)
  } finally { Date.now = original; fake.restore() }
})

test("ollama: HTTP status survives long diagnostics and interrupted 401 bodies; failures retry", async () => {
  for (const status of [401, 402, 403, 429, 502]) {
    for (const response of [{ error: "upstream " + "😀".repeat(500) }, "<html>" + "x".repeat(2000)]) {
      const provider = createOllama()
      const fake = stubFetch(() => fake.calls.length > 1 ? json(OLLAMA_CASE.response) : typeof response === "string" ? text(response, status) : json(response, status))
      try {
        await assert.rejects(provider.execute(args, context()), (error) => {
          assert.equal(error.status, status)
          assert.match(error.message, /\[truncated\]/)
          assert.ok([...error.message].length < 400)
          return true
        })
        assert.deepEqual(await provider.execute(args, context()), OLLAMA_CASE.expected)
        assert.equal(fake.calls.length, 2)
      } finally { fake.restore() }
    }
  }
  const fake = stubFetch(() => new Response(new ReadableStream({ start(c) { c.error(new Error("interrupted")) } }), { status: 401 }))
  try {
    await assert.rejects(createOllama().execute(args, context()), (error) => {
      assert.equal(error.status, 401)
      assert.match(error.message, /response body unavailable/)
      return true
    })
  } finally { fake.restore() }
})

test("ollama: business error diagnostics are bounded", async () => {
  const fake = stubFetch(() => json({ error: { message: "😀".repeat(1000) } }))
  try {
    await assert.rejects(createOllama().execute(args, context()), (error) => {
      assert.equal(error.status, undefined)
      assert.match(error.message, /Ollama API error:.*\[truncated\]/u)
      assert.ok([...error.message].length < 400)
      return true
    })
  } finally { fake.restore() }
})

test("ollama: Retry-After accepts zero and HTTP dates and rejects invalid headers", async () => {
  for (const [header, expected] of [["0007", "7"], ["0", "0"], ["Wed, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 GMT"], ["bad", undefined], ["-1", undefined], ["1.5", undefined], [undefined, undefined]]) {
    for (const broken of [false, true]) {
      const headers = header === undefined ? {} : { "Retry-After": header }
      const fake = stubFetch(() => broken ? new Response(new ReadableStream({ start(c) { c.error(new Error("interrupted")) } }), { status: 429, headers }) : json({ error: "slow" }, 429, headers))
      try {
        await assert.rejects(createOllama().execute(args, context()), (error) => {
          assert.equal(error.status, 429)
          assert.equal(error.retryAfter, expected)
          if (expected === undefined) assert.doesNotMatch(error.message, /retry after/)
          else assert.ok(error.message.includes(`retry after ${expected}`))
          return true
        })
      } finally { fake.restore() }
    }
  }
})

test("ollama: instances isolate truncation choices and identically configured caches", async () => {
  const fake = stubFetch(() => json(OLLAMA_CASE.response))
  try {
    for (const contentChars of [3, 0, 0]) {
      const { search } = await WebSearch({}, { enable: ["ollama"], ollama: { contentChars } })
      const result = await search.ollama.execute(args, context())
      assert.equal(result[0].text, contentChars === 3 ? "Oll…" : "Ollama content")
      await search.ollama.execute({ ...args, query: " q\n" }, context())
    }
    assert.equal(fake.calls.length, 3)
  } finally { fake.restore() }
})

test("ollama: explicit fields validate and override clamped or invalid environment defaults", async () => {
  for (const [field, values] of Object.entries({ maxResults: [0, 11, "6", 1.5], timeout: [-1, 2_147_483_648], cacheTTL: [-1, null], contentChars: [-1, "3", null, Number.MAX_SAFE_INTEGER + 1] })) {
    for (const value of values) assert.throws(() => createOllama({ [field]: value }), { name: "TypeError", message: new RegExp(`ollama\\.${field}`) })
  }
  const original = { ...process.env }
  const fake = stubFetch(() => json(OLLAMA_CASE.response))
  try {
    Object.assign(process.env, { OLLAMA_MAX_RESULTS: "99", OLLAMA_CONTENT_CHARS: "3", OLLAMA_CACHE_TTL: "0" })
    const env = createOllama()
    assert.equal((await env.execute(args, context()))[0].text, "Oll…")
    await env.execute(args, context())
    assert.equal(fake.calls.length, 2)
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", max_results: 10 })
    const explicit = createOllama({ maxResults: 1, contentChars: 0, cacheTTL: 600_000, timeout: 0 })
    assert.deepEqual(await explicit.execute(args, context()), OLLAMA_CASE.expected.slice(0, 1))
    await explicit.execute(args, context())
    assert.equal(fake.calls.length, 3)
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", max_results: 1 })
    Object.assign(process.env, { OLLAMA_MAX_RESULTS: "bad", OLLAMA_CONTENT_CHARS: "-1", OLLAMA_TIMEOUT: "invalid" })
    assert.deepEqual(await createOllama().execute(args, context()), OLLAMA_CASE.expected)
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", max_results: 5 })
  } finally { process.env = original; fake.restore() }
})

test("ollama: timeout and host abort cover fetch and successful response consumption", async () => {
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (const phase of ["fetch", "body"]) {
      for (const timeout of [10, 0]) {
        const controller = new AbortController()
        let started
        const reading = new Promise((resolve) => { started = resolve })
        const fake = stubFetch(({ init }) => {
          const wait = () => {
            const pending = new Promise((_, reject) => {
              if (init.signal.aborted) return reject(init.signal.reason)
              init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
            })
            started()
            return pending
          }
          return phase === "fetch" ? wait() : { ok: true, text: wait }
        })
        try {
          const pending = createOllama({ timeout, cacheTTL: 0 }).execute(args, { abort: controller.signal })
          if (timeout === 0) { await reading; controller.abort() }
          await assert.rejects(pending, timeout === 0 ? /cancelled/ : /timed out after 10ms/)
          assert.equal(fake.calls[0].init.signal.aborted, true)
        } finally { fake.restore() }
      }
    }
  } finally { clearInterval(keepAlive) }
})
