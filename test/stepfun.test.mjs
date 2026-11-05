import test from "node:test"
import assert from "node:assert/strict"
import { WebSearch } from "../index.mjs"
import { createStepfun } from "../src/providers/stepfun.mjs"
import { STEPFUN_CASE } from "./cases.mjs"
import { context, json, stubFetch, text } from "./harness.mjs"

const args = { query: "q", key: "k" }

test("stepfun: domestic POST, Bearer key, normalized query, n and raw index time", async () => {
  const provider = createStepfun()
  assert.equal(provider.name, "StepFun (magpie-websearch)")
  assert.equal(provider.keysURL, "https://platform.stepfun.com/interface-key")
  assert.equal(provider.keyOptional, false)
  const fake = stubFetch(() => json(STEPFUN_CASE.response))
  try {
    assert.deepEqual(await provider.execute({ query: "  中文   search\n", count: 6, key: " key " }, context()), STEPFUN_CASE.expected)
    const call = fake.calls[0]
    assert.equal(call.url, "https://api.stepfun.com/v1/search")
    assert.equal(call.init.method, "POST")
    assert.equal(call.init.redirect, "error")
    assert.deepEqual(call.init.headers, {
      Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer key",
    })
    assert.deepEqual(call.body, { query: "中文 search", n: 6 })
  } finally { fake.restore() }
})

test("stepfun: empty keys and queries fail before fetch, without an invented query ceiling", async () => {
  const provider = createStepfun()
  const fake = stubFetch(() => json({ results: [] }))
  try {
    for (const key of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, key }, context()), /needs a key/)
    }
    for (const query of [undefined, null, "", " \n"]) {
      await assert.rejects(provider.execute({ ...args, query }, context()), /query must not be empty/)
    }
    assert.equal(fake.calls.length, 0)
    const query = "搜".repeat(2000)
    await provider.execute({ ...args, query }, context())
    assert.equal(fake.calls[0].body.query, query)
  } finally { fake.restore() }
})

test("stepfun: all documented categories and effective result counts", async () => {
  const fake = stubFetch(() => json(STEPFUN_CASE.response))
  try {
    for (const category of ["", "programming", "research", "gov", "business"]) {
      const provider = createStepfun({ category, maxResults: 20 })
      await provider.execute({ ...args, count: 50 }, context())
      assert.deepEqual(fake.calls.at(-1).body, { query: "q", n: 20, ...(category ? { category } : {}) })
    }
    for (const [count, maxResults, n] of [[6, 3, 3], [1, 10, 1], [undefined, 10, 10], [6.9, 10, 6]]) {
      const provider = createStepfun({ maxResults })
      await provider.execute({ ...args, count }, context())
      assert.equal(fake.calls.at(-1).body.n, n)
    }
    const results = await createStepfun({ maxResults: 1 }).execute(args, context())
    assert.deepEqual(results, STEPFUN_CASE.expected.slice(0, 1), "filter missing URLs before capping")
  } finally { fake.restore() }
})

test("stepfun: snippet/full are local choices with blank-field fallback and preserved whitespace", async () => {
  const response = { results: [
    { url: "https://example.com/one", snippet: "Snippet", content: "  Full\n    body  " },
    { url: "https://example.com/two", snippet: " \n", content: "Body fallback" },
    { url: "https://example.com/three", snippet: "Snippet fallback", content: " \n" },
    { url: "https://example.com/four", snippet: null, content: {} },
  ] }
  const fake = stubFetch(() => json(response))
  try {
    for (const content of ["snippet", "full"]) {
      const results = await createStepfun({ content }).execute(args, context())
      assert.deepEqual(results.map((r) => r.text), [
        content === "full" ? "  Full\n    body  " : "Snippet", "Body fallback", "Snippet fallback", "",
      ])
      assert.deepEqual(fake.calls.at(-1).body, { query: "q", n: 10 }, "no unsupported include_content switch")
    }
  } finally { fake.restore() }
})

test("stepfun: bounds snippets, full bodies and fallback by code points; zero keeps all", async () => {
  const long = "🙂".repeat(5000)
  const fake = stubFetch(() => json({ results: [
    { url: "https://example.com/snippet", snippet: long, content: long },
    { url: "https://example.com/body", content: long },
  ] }))
  try {
    for (const content of ["snippet", "full"]) {
      for (const contentChars of [undefined, 3, 0]) {
        const results = await createStepfun({ content, contentChars }).execute(args, context())
        const expected = contentChars === 0 ? long : "🙂".repeat(contentChars ?? 4000) + "…"
        assert.ok(results.every((r) => r.text === expected))
      }
    }
  } finally { fake.restore() }
})

test("stepfun: malformed rows are dropped, optional fields tolerate types, index dates stay strings", async () => {
  const fake = stubFetch(() => json({ query: {}, category: 7, results: [
    null, 1, [], "row", { url: 42 }, { url: " " }, { title: "No URL" },
    { url: " https://example.com/kept ", title: " ", snippet: {}, content: 1, time: 123, position: {} },
    { url: "https://example.com/date", title: " Title ", snippet: "s", time: " unknown index date " },
  ] }))
  try {
    assert.deepEqual(await createStepfun().execute(args, context()), [
      { title: "https://example.com/kept", url: "https://example.com/kept", text: "" },
      { title: "Title", url: "https://example.com/date", text: "s", age: "unknown index date" },
    ])
  } finally { fake.restore() }
})

test("stepfun: malformed responses and business failures fail without status or caching", async () => {
  for (const response of [null, [], 1, {}, { results: null }, { results: {} }, { results: "bad" },
    { results: [{ url: null }, null] }, { error: { message: "credit failure", type: "insufficient_credit" }, results: [] },
    { error: "failure", results: [] }]) {
    const provider = createStepfun()
    const fake = stubFetch(() => fake.calls.length === 1 ? json(response) : json(STEPFUN_CASE.response))
    try {
      await assert.rejects(provider.execute(args, context()), (error) => {
        assert.match(error.message, /Invalid StepFun response|StepFun API error/)
        assert.equal(error.status, undefined)
        return true
      })
      assert.deepEqual(await provider.execute(args, context()), STEPFUN_CASE.expected)
      assert.equal(fake.calls.length, 2)
    } finally { fake.restore() }
  }
  const fake = stubFetch(() => text("broken JSON", 200))
  try { await assert.rejects(createStepfun().execute(args, context()), /Invalid StepFun response/) }
  finally { fake.restore() }
})

test("stepfun: HTTP failures retain status, bounded diagnostics and actionable hints", async () => {
  for (const [status, hint] of [
    [400, /upstream/], [401, /platform\.stepfun\.com\/interface-key/],
    [402, /insufficient balance or organization Credit/], [403, /upstream/],
    [429, /Rate limit or Credit quota exceeded/], [451, /failed moderation/], [500, /upstream/],
  ]) {
    const provider = createStepfun()
    const fake = stubFetch(() => fake.calls.length === 1 ? json({ error: { message: "upstream " + "🙂".repeat(500), type: "project_credit_limit_exceeded" } }, status) : json(STEPFUN_CASE.response))
    try {
      await assert.rejects(provider.execute(args, context()), (error) => {
        assert.equal(error.status, status)
        assert.match(error.message, hint)
        if (status !== 402) assert.match(error.message, /project_credit_limit_exceeded/)
        assert.ok([...error.message].length < 650, "upstream diagnostics are bounded")
        return true
      })
      assert.deepEqual(await provider.execute(args, context()), STEPFUN_CASE.expected, "errors never cache")
    } finally { fake.restore() }
  }
})

test("stepfun: error identifiers precede long messages for HTTP and business errors", async () => {
  for (const status of [200, 401, 429, 451]) {
    for (const body of [
      { error: { message: "Long upstream message. ".repeat(100), type: "project_credit_limit_exceeded", code: "member_limit" } },
      { message: "Long upstream message. ".repeat(100), type: "project_credit_limit_exceeded", code: "member_limit" },
    ]) {
      if (status === 200 && !body.error) continue
      const fake = stubFetch(() => json(body, status))
      try {
        await assert.rejects(createStepfun().execute(args, context()), (error) => {
          assert.equal(error.status, status === 200 ? undefined : status)
          assert.match(error.message, /\[project_credit_limit_exceeded, member_limit\] Long upstream message/)
          assert.match(error.message, /\[truncated\]/)
          assert.ok([...error.message].length < 650)
          return true
        })
      } finally { fake.restore() }
    }
  }
  for (const body of ["<html>gateway error</html>", "null", '{"error":{"type":{},"code":null,"message":"Readable message"}}']) {
    const fake = stubFetch(() => text(body, 500))
    try {
      await assert.rejects(createStepfun().execute(args, context()), (error) => {
        assert.equal(error.status, 500)
        assert.match(error.message, /gateway error|null|Readable message/)
        return true
      })
    } finally { fake.restore() }
  }
})

test("stepfun: interrupted 401/403/451 bodies retain status and provider hints", async () => {
  for (const [status, hint] of [[401, /interface-key/], [403, /response body unavailable/], [451, /failed moderation/]]) {
    const fake = stubFetch(() => new Response(new ReadableStream({
      start(controller) { controller.error(new Error("interrupted")) },
    }), { status }))
    try {
      await assert.rejects(createStepfun().execute(args, context()), (error) => {
        assert.equal(error.status, status)
        assert.match(error.message, hint)
        return true
      })
    } finally { fake.restore() }
  }
})

test("stepfun: normalizes standard Retry-After even when a 429 body fails", async () => {
  for (const [header, expected] of [
    ["0007", "7"], ["0", "0"], ["Wed, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["bad", undefined], ["-1", undefined], ["1.5", undefined], [undefined, undefined],
  ]) {
    for (const broken of [false, true]) {
      const headers = header === undefined ? {} : { "Retry-After": header }
      const fake = stubFetch(() => broken ? new Response(new ReadableStream({
        start(controller) { controller.error(new Error("broken body")) },
      }), { status: 429, headers }) : json({ error: { type: "member_project_credit_limit_exceeded" } }, 429, headers))
      try {
        await assert.rejects(createStepfun().execute(args, context()), (error) => {
          assert.equal(error.status, 429)
          assert.equal(error.retryAfter, expected)
          if (expected === undefined) assert.doesNotMatch(error.message, /retry after/)
          else assert.ok(error.message.includes(`retry after ${expected}`))
          assert.match(error.message, /Credit quota/)
          if (!broken) assert.match(error.message, /member_project_credit_limit_exceeded/)
          return true
        })
      } finally { fake.restore() }
    }
  }
})

test("stepfun: cache expiration uses full TTL for hits and at most 30 seconds for empty arrays", async () => {
  const original = Date.now
  let now = 1_800_000_000_000
  Date.now = () => now
  try {
    for (const [response, ttl] of [[STEPFUN_CASE.response, 600_000], [{ results: [] }, 30_000]]) {
      const provider = createStepfun()
      const fake = stubFetch(() => json(response))
      try {
        await provider.execute(args, context())
        now += ttl - 1
        await provider.execute(args, context())
        assert.equal(fake.calls.length, 1)
        now += 2
        await provider.execute(args, context())
        assert.equal(fake.calls.length, 2)
      } finally { fake.restore() }
    }
  } finally { Date.now = original }
})

test("stepfun: plugin instances isolate content choices, categories, budgets and caches", async () => {
  const fake = stubFetch(() => json(STEPFUN_CASE.response))
  try {
    const first = await WebSearch({}, { enable: ["stepfun"], stepfun: { category: "research", content: "full", contentChars: 3 } })
    const second = await WebSearch({}, { enable: ["stepfun"] })
    const third = await WebSearch({}, { enable: ["stepfun"] })
    assert.deepEqual(Object.keys(first.search), ["stepfun"])
    const result = await first.search.stepfun.execute(args, context())
    assert.equal(result[0].text, "Ste…")
    assert.equal(fake.calls[0].body.category, "research")
    for (const plugin of [second, third]) {
      assert.deepEqual(await plugin.search.stepfun.execute(args, context()), STEPFUN_CASE.expected)
      assert.equal(fake.calls.at(-1).body.category, undefined)
    }
    assert.equal(fake.calls.length, 3)
  } finally { fake.restore() }
})

test("stepfun: explicit configuration validates field names and overrides environment fallbacks", async () => {
  for (const [field, values] of Object.entries({
    maxResults: [0, 21, "6", 1.5], timeout: [-1, 2_147_483_648], cacheTTL: [-1],
    contentChars: [-1, "3", null, Number.MAX_SAFE_INTEGER + 1], category: ["news", 1], content: ["invalid", true],
  })) {
    for (const value of values) assert.throws(() => createStepfun({ [field]: value }), new RegExp(`stepfun\\.${field}`))
  }
  const original = { ...process.env }
  const warnings = []
  const warn = console.warn
  const fake = stubFetch(() => json(STEPFUN_CASE.response))
  console.warn = (...values) => warnings.push(values.join(" "))
  try {
    Object.assign(process.env, { STEPFUN_MAX_RESULTS: "99", STEPFUN_CATEGORY: "research", STEPFUN_CONTENT: "full", STEPFUN_CONTENT_CHARS: "3", STEPFUN_CACHE_TTL: "0" })
    const env = createStepfun()
    assert.equal((await env.execute(args, context()))[0].text, "Ste…")
    await env.execute(args, context())
    assert.equal(fake.calls.length, 2, "environment cacheTTL zero disables cache")
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", n: 20, category: "research" })
    const explicit = createStepfun({ maxResults: 1, category: "", content: "snippet", contentChars: 0, cacheTTL: 600_000 })
    assert.equal((await explicit.execute(args, context()))[0].text, "StepFun snippet")
    await explicit.execute(args, context())
    assert.equal(fake.calls.length, 3)
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", n: 1 })
    Object.assign(process.env, { STEPFUN_MAX_RESULTS: "invalid", STEPFUN_CATEGORY: "news", STEPFUN_CONTENT: "bad", STEPFUN_CONTENT_CHARS: "-1" })
    await createStepfun().execute(args, context())
    assert.deepEqual(fake.calls.at(-1).body, { query: "q", n: 10 })
    assert.ok(warnings.some((w) => w.includes("STEPFUN_CATEGORY")))
    assert.ok(warnings.some((w) => w.includes("STEPFUN_CONTENT")))
  } finally { process.env = original; console.warn = warn; fake.restore() }
})

test("stepfun: timeout and host abort cover fetch and body consumption without caching", async () => {
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (const phase of ["fetch", "body"]) {
      for (const timeout of [10, 0]) {
        const controller = new AbortController()
        const provider = createStepfun({ timeout })
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
          const pending = provider.execute(args, { abort: controller.signal })
          if (timeout === 0) { await reading; controller.abort() }
          await assert.rejects(pending, timeout === 0 ? /cancelled/ : /timed out after 10ms/)
          assert.equal(fake.calls[0].init.signal.aborted, true)
        } finally { fake.restore() }
        const recovered = stubFetch(() => json(STEPFUN_CASE.response))
        try { assert.deepEqual(await provider.execute(args, context()), STEPFUN_CASE.expected) }
        finally { recovered.restore() }
      }
    }
  } finally { clearInterval(keepAlive) }
})
