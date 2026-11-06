import test from "node:test"
import assert from "node:assert/strict"
import { cleanRetryAfter, configCountPolicy, configInt, configStr, makeCache, requestJSON, requestResponse, resolveResultCount, truncateCodePoints } from "../src/core.mjs"
import { context, stubFetch, text } from "./harness.mjs"

test("configuration helpers preserve legacy validation and error fields", () => {
  assert.equal(configInt({ count: 2 }, "count", "QUERIT_COUNT", 8), 2)
  for (const value of [-1, 1.5, "2", null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => configInt({ count: value }, "count", "QUERIT_COUNT", 8), {
      name: "TypeError", message: `querit.count must be an integer from 0 to ${Number.MAX_SAFE_INTEGER}`,
    })
  }
  for (const value of [0, 21]) {
    assert.throws(() => configInt({ maxResults: value }, "maxResults", "PARALLEL_MAX_RESULTS", 10, 1, 20), {
      name: "TypeError", message: "parallel.maxResults must be an integer from 1 to 20",
    })
  }
  assert.equal(configStr({ language: " zh " }, "language", "TINYFISH_LANGUAGE"), "zh")
  assert.equal(configStr({ language: " " }, "language", "TINYFISH_LANGUAGE"), "")
  assert.throws(() => configStr({ language: 1 }, "language", "TINYFISH_LANGUAGE"), {
    name: "TypeError", message: "tinyfish.language must be a string",
  })
  assert.throws(() => configStr({ content: "bad" }, "content", "MOONSHOT_CN_CONTENT", "snippet", ["snippet", "full"]), {
    name: "TypeError", message: 'moonshot-cn.content must be one of "snippet", "full"',
  })
})

test("configuration helpers infer provider names by stripping the complete option suffix", () => {
  for (const [name, env, expected] of [
    ["timeout", "MOONSHOT_TIMEOUT", "moonshot"],
    ["timeout", "MOONSHOT_CN_TIMEOUT", "moonshot-cn"],
    ["maxResults", "MOONSHOT_CN_MAX_RESULTS", "moonshot-cn"],
    ["cacheTTL", "MOONSHOT_CN_CACHE_TTL", "moonshot-cn"],
    ["contentChars", "MOONSHOT_CN_CONTENT_CHARS", "moonshot-cn"],
    ["googleDomain", "SERPAPI_GOOGLE_DOMAIN", "serpapi"],
    ["includeDomains", "TINYFISH_INCLUDE_DOMAINS", "tinyfish"],
    ["maxResults", "LEGACY_RESULT_LIMIT", "legacy"],
    ["count", "COUNT", "count"],
  ]) {
    assert.throws(() => configInt({ [name]: -1 }, name, env, 10), {
      name: "TypeError", message: `${expected}.${name} must be an integer from 0 to ${Number.MAX_SAFE_INTEGER}`,
    })
    assert.throws(() => configStr({ [name]: 1 }, name, env), {
      name: "TypeError", message: `${expected}.${name} must be a string`,
    })
  }
})

test("configuration helpers accept an explicit namespace over the inferred provider name", () => {
  for (const namespace of [undefined, null, "moonshot-cn", "Custom-ID", ""]) {
    const prefix = namespace ?? "moonshot-cn"
    for (const value of [0, 21, 1.5, "2", null, NaN, Infinity]) {
      assert.throws(() => configInt({ maxResults: value }, "maxResults", "MOONSHOT_CN_MAX_RESULTS", 10, 1, 20, namespace), {
        name: "TypeError", message: `${prefix}.maxResults must be an integer from 1 to 20`,
      })
    }
    assert.throws(() => configStr({ content: 1 }, "content", "MOONSHOT_CN_CONTENT", "snippet", ["snippet", "full"], namespace), {
      name: "TypeError", message: `${prefix}.content must be a string`,
    })
    assert.throws(() => configStr({ content: "bad" }, "content", "MOONSHOT_CN_CONTENT", "snippet", ["snippet", "full"], namespace), {
      name: "TypeError", message: `${prefix}.content must be one of "snippet", "full"`,
    })
  }
  assert.throws(() => configInt({ maxResults: 0 }, "maxResults", "LEGACY_RESULT_LIMIT", 10, 1, 20, "moonshot-cn"), {
    name: "TypeError", message: "moonshot-cn.maxResults must be an integer from 1 to 20",
  })
})

for (const namespace of [undefined, "moonshot-cn"]) {
  test(`configuration helpers preserve environment behavior with namespace ${namespace}`, () => {
    const env = "MAGPIE_CONFIG_TEST_VALUE"
    const saved = process.env[env]
    const warn = console.warn
    const warnings = []
    console.warn = (message) => warnings.push(message)
    try {
      for (const [raw, expected] of [[undefined, 10], ["", 10], ["bad", 10], ["-1", 10], ["1.5", 10],
        ["9007199254740992", 10], ["0", 1], ["25", 20], [" 6 ", 6]]) {
        if (raw === undefined) delete process.env[env]
        else process.env[env] = raw
        assert.equal(configInt({}, "maxResults", env, 10, 1, 20, namespace), expected)
        assert.equal(configInt({ maxResults: 3 }, "maxResults", env, 10, 1, 20, namespace), 3)
      }
      delete process.env[env]
      assert.equal(configStr({}, "language", env, undefined, undefined, namespace), "")
      assert.equal(configStr({}, "content", env, "snippet", undefined, namespace), "snippet")
      process.env[env] = " full "
      assert.equal(configStr({}, "content", env, "snippet", ["snippet", "full"], namespace), "full")
      assert.equal(configStr({ content: " snippet " }, "content", env, "snippet", ["snippet", "full"], namespace), "snippet")
      assert.equal(configStr({ language: " " }, "language", env, undefined, undefined, namespace), "")
      process.env[env] = "invalid"
      assert.equal(configStr({}, "content", env, "snippet", ["snippet", "full"], namespace), "snippet")
      assert.deepEqual(warnings, [`[magpie-websearch] ${env} is invalid; using "snippet"`])
    } finally {
      console.warn = warn
      if (saved === undefined) delete process.env[env]
      else process.env[env] = saved
    }
  })
}

test("result limits follow host counts while preserving explicit caps and missing-count fallbacks", () => {
  const env = "MAGPIE_TEST_RESULT_LIMIT"
  const saved = process.env[env]
  try {
    for (const raw of [undefined, "", " ", "bad", "-1", "1.5", "9007199254740992"]) {
      if (raw === undefined) delete process.env[env]
      else process.env[env] = raw
      const policy = configCountPolicy({}, env, 10, 50)
      for (const [count, expected] of [[6, 6], [12, 12], [20, 20], [60, 50], [6.9, 6], [undefined, 10], [0, 10], [NaN, 10]]) {
        assert.equal(resolveResultCount(count, policy), expected, `env=${raw}, count=${count}`)
      }
    }
    for (const [raw, cap] of [["3", 3], [" 10 ", 10], ["0", 1], ["99", 50]]) {
      process.env[env] = raw
      assert.equal(resolveResultCount(20, configCountPolicy({}, env, 10, 50)), Math.min(20, cap))
      assert.equal(resolveResultCount(undefined, configCountPolicy({}, env, 10, 50)), cap)
      assert.equal(resolveResultCount(20, configCountPolicy({ resultLimit: 2 }, env, 10, 50)), 2)
    }
    assert.throws(() => configCountPolicy({ resultLimit: "3" }, env, 10, 50), TypeError)
    delete process.env[env]
    assert.equal(resolveResultCount(6, configCountPolicy({}, env, 5, 10)), 6)
    assert.equal(resolveResultCount(undefined, configCountPolicy({}, env, 5, 10)), 5)
    assert.deepEqual(configCountPolicy({}, env, 5, 10), { fallbackCount: 5, configuredLimit: undefined, providerMax: 10 })
  } finally {
    if (saved === undefined) delete process.env[env]
    else process.env[env] = saved
  }
})

test("resultLimit migration preserves aliases, precedence and actionable validation", () => {
  const saved = { ...process.env }
  const warn = console.warn
  const warnings = []
  console.warn = message => warnings.push(message)
  const resolve = options => resolveResultCount(20, configCountPolicy(options, "COUNT_TEST_RESULT_LIMIT", 10, 50))
  try {
    delete process.env.COUNT_TEST_RESULT_LIMIT
    delete process.env.COUNT_TEST_MAX_RESULTS
    assert.equal(resolve({ maxResults: 5 }), 5)
    assert.match(warnings.pop(), /count-test\.maxResults is deprecated; use count-test\.resultLimit/)
    process.env.COUNT_TEST_MAX_RESULTS = "7"
    assert.equal(resolve({}), 7)
    assert.match(warnings.pop(), /COUNT_TEST_MAX_RESULTS is deprecated; use COUNT_TEST_RESULT_LIMIT/)
    process.env.COUNT_TEST_RESULT_LIMIT = "9"
    assert.equal(resolve({}), 9)
    assert.equal(resolve({ maxResults: 5 }), 5, "explicit legacy option beats environment values")
    assert.equal(resolve({ resultLimit: 3, maxResults: 5 }), 3)
    assert.match(warnings.pop(), /resultLimit takes precedence/)
    assert.equal(resolve({ resultLimit: 4, maxResults: "bad" }), 4, "ignored alias cannot reject a canonical option")
    assert.throws(() => resolve({ resultLimit: "bad", maxResults: 5 }), /count-test\.resultLimit/)
    assert.throws(() => resolve({ maxResults: "bad" }), /count-test\.maxResults/)
    process.env.COUNT_TEST_RESULT_LIMIT = "bad"
    assert.equal(resolve({}), 20, "an invalid canonical environment value does not resurrect its alias")
    process.env.COUNT_TEST_RESULT_LIMIT = " "
    assert.equal(resolve({}), 7, "blank canonical environment values are unset")
    delete process.env.COUNT_TEST_RESULT_LIMIT
    delete process.env.COUNT_TEST_MAX_RESULTS
    const policy = configCountPolicy({ count: 8 }, "QUERIT_RESULT_LIMIT", 8, Number.MAX_SAFE_INTEGER, { legacyOption: "count", legacyEnv: "QUERIT_COUNT" })
    assert.equal(resolveResultCount(20, policy), 8)
    assert.match(warnings.pop(), /querit\.count is deprecated; use querit\.resultLimit/)
  } finally { process.env = saved; console.warn = warn }
})

test("cache expires empty answers early and evicts least recently used entries", () => {
  const original = Date.now
  let now = 1000
  Date.now = () => now
  try {
    const cache = makeCache(60_000, 2)
    cache.write("empty", [])
    cache.write("one", [{ url: "https://one.example" }])
    now += 30_001
    assert.equal(cache.read("empty"), undefined)
    assert.ok(cache.read("one"))
    cache.write("two", [{ url: "https://two.example" }])
    cache.read("one")
    cache.write("three", [{ url: "https://three.example" }])
    assert.equal(cache.read("two"), undefined)
    assert.ok(cache.read("one"))
    now += 30_000
    assert.equal(cache.read("one"), undefined)
  } finally { Date.now = original }
})

test("cleanRetryAfter accepts delay-seconds and valid HTTP-dates, rejecting other values", () => {
  assert.equal(cleanRetryAfter("12"), "12")
  assert.equal(cleanRetryAfter("0"), "0")
  assert.equal(cleanRetryAfter(" 0007 "), "7")
  assert.equal(cleanRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), "Wed, 21 Oct 2026 07:28:00 GMT")
  assert.equal(cleanRetryAfter("wed, 21 oct 2026 07:28:00 gmt"), "Wed, 21 Oct 2026 07:28:00 GMT")
  assert.equal(cleanRetryAfter("Thu, 01 Jan 1970 00:00:00 GMT"), "Thu, 01 Jan 1970 00:00:00 GMT")
  for (const dirty of [
    "Key, 21 Oct 2026 07:28:00 GMT", "Tue, 21 Oct 2026 07:28:00 GMT",
    "Tue, 31 Feb 2026 07:28:00 GMT", "Wed, 21 Oct 2026 25:28:00 GMT",
    "2026-10-21", "Wed, 21 Oct 2026 07:28:00 GMT; private=marker",
  ]) assert.equal(cleanRetryAfter(dirty), undefined)
  assert.equal(cleanRetryAfter(""), undefined)
  assert.equal(cleanRetryAfter("   "), undefined)
  assert.equal(cleanRetryAfter(null), undefined)
  assert.equal(cleanRetryAfter("not a date or number"), undefined)
  assert.equal(cleanRetryAfter("12s"), undefined)
  assert.equal(cleanRetryAfter("-5"), undefined)
})

test("truncateCodePoints preserves text at the boundary, Unicode pairs and zero-limit behavior", () => {
  for (const [value, limit, expected] of [
    ["", 3, ""], ["abc", 3, "abc"], ["abcd", 3, "abc…"],
    ["🙂🚀", 2, "🙂🚀"], ["🙂🚀x", 2, "🙂🚀…"],
    ["a🙂b", 2, "a🙂…"], ["🙂a", 1, "🙂…"],
    ["  a\nb  ", 5, "  a\nb…"], ["e\u0301x", 2, "e\u0301…"],
    ["🙂".repeat(100_000), 3, "🙂🙂🙂…"], ["🙂🚀x", 0, "🙂🚀x"],
  ]) assert.equal(truncateCodePoints(value, limit), expected)
})

test("withheld 402 bodies are cancelled without waiting or exposing cleanup failures", async () => {
  for (const mode of ["stalled", "rejected", "broken"]) {
    let cancelled = false
    let formatted = false
    const fake = stubFetch(() => new Response(new ReadableStream({
      start(controller) { if (mode === "broken") controller.error(new Error("private body")) },
      cancel() {
        cancelled = true
        return mode === "stalled" ? new Promise(() => {}) : Promise.reject(new Error("private cleanup"))
      },
    }), { status: 402, headers: { "Retry-After": "7" } }))
    let deadline
    try {
      const outcome = await Promise.race([
        requestJSON("https://example.com", {}, context(), {
          timeout: 0, messages: { 402: "Top up credit" },
          errorDetailFromBody() { formatted = true; return "private body" },
        }).then(() => "unexpected success", (error) => error),
        new Promise((resolve) => { deadline = setTimeout(() => resolve("cleanup blocked refusal"), 200) }),
      ])
      assert.equal(outcome.status, 402)
      assert.equal(outcome.retryAfter, "7")
      assert.equal(outcome.message, "Top up credit")
      assert.equal(formatted, false)
      if (mode !== "broken") assert.equal(cancelled, true)
    } finally { clearTimeout(deadline); fake.restore() }
  }
})

test("failed HTTP bodies retain every known refusal status and retry metadata", async () => {
  for (const status of [400, 401, 403, 429, 451, 500, 503]) {
    const fake = stubFetch(() => new Response(new ReadableStream({
      start(controller) { controller.error(new Error("stream interrupted")) },
    }), { status, headers: { "Retry-After": "7" } }))
    try {
      await assert.rejects(requestJSON("https://example.com", {}, context()), (error) => {
        assert.equal(error.status, status)
        assert.equal(error.retryAfter, "7")
        assert.match(error.message, /response body unavailable/)
        return true
      })
      await assert.rejects(requestJSON("https://example.com", {}, context(), {
        messages: { [status]: "Custom refusal" },
      }), { message: status === 429 ? "Custom refusal, retry after 7s" : "Custom refusal", status })
    } finally { fake.restore() }
  }
})

test("HTTP body timeouts keep status but explicit host cancellation takes precedence", async () => {
  const keepAlive = setInterval(() => {}, 1000)
  try {
    for (const status of [401, 403, 429, 451]) {
      for (const cancel of [false, true]) {
        const controller = new AbortController()
        let started
        const reading = new Promise((resolve) => { started = resolve })
        const fake = stubFetch(({ init }) => ({
          ok: false, status, headers: new Headers({ "Retry-After": "7" }),
          text: () => new Promise((_, reject) => {
            started()
            if (init.signal.aborted) return reject(init.signal.reason)
            init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true })
          }),
        }))
        try {
          const pending = requestJSON("https://example.com", {}, { abort: controller.signal }, { timeout: cancel ? 0 : 10 })
          if (cancel) { await reading; controller.abort() }
          await assert.rejects(pending, (error) => {
            assert.equal(error.status, cancel ? undefined : status)
            assert.match(error.message, cancel ? /cancelled/ : /response body unavailable/)
            return true
          })
        } finally { fake.restore() }
      }
    }
  } finally { clearInterval(keepAlive) }
})

test("host cancellation before body consumption releases even immediate HTTP refusals", async () => {
  for (const [status, options] of [[200, {}], [401, {}], [429, { sensitive: true }], [402, { messages: { 402: "Top up" } }]]) {
    const controller = new AbortController()
    let cancelled = false
    const fake = stubFetch(() => {
      controller.abort()
      return new Response(new ReadableStream({ cancel() { cancelled = true } }), { status })
    })
    try {
      await assert.rejects(requestJSON("https://example.com", {}, { abort: controller.signal }, options), (error) => {
        assert.equal(error.status, undefined)
        assert.match(error.message, /cancelled/)
        return true
      })
      assert.equal(cancelled, true)
    } finally { fake.restore() }
  }
})

test("vendor error formatting runs before bounding and cannot override transport or privacy policy", async () => {
  let calls = 0
  const formatter = (raw, response) => {
    calls++
    assert.equal(response.status, 401)
    assert.equal(raw, "upstream detail")
    return "machine-code " + "🙂".repeat(500)
  }
  const fake = stubFetch(() => text("upstream detail", 401, { "Retry-After": "7" }))
  try {
    await assert.rejects(requestJSON("https://example.com", {}, context(), { errorDetailFromBody: formatter }), (error) => {
      assert.equal(error.status, 401)
      assert.equal(error.retryAfter, "7")
      assert.match(error.message, /machine-code/)
      assert.match(error.message, /\[truncated\]/)
      assert.ok([...error.message].length < 400)
      return true
    })
    for (const options of [{ sensitive: true }, { messages: { 401: "Fixed refusal" } }]) {
      await assert.rejects(requestJSON("https://example.com", {}, context(), {
        ...options, errorDetailFromBody: formatter,
      }), (error) => error.status === 401 && !error.message.includes("machine-code"))
    }
    assert.equal(calls, 1)
    for (const errorDetailFromBody of [() => { throw new Error("formatter crashed") }, () => undefined]) {
      await assert.rejects(requestJSON("https://example.com", {}, context(), { errorDetailFromBody }), (error) => {
        assert.equal(error.status, 401)
        assert.match(error.message, /upstream detail/)
        assert.doesNotMatch(error.message, /formatter crashed/)
        return true
      })
    }
  } finally { fake.restore() }
})

test("sensitive HTTP refusals never wait for failed or stalled body cleanup", async () => {
  for (const status of [401, 429]) {
    for (const mode of ["stalled", "rejected", "broken"]) {
      let cancelled = false
      const stream = new ReadableStream({
        start(controller) {
          if (mode === "broken") controller.error(new Error("private body failure"))
        },
        cancel() {
          cancelled = true
          return mode === "stalled" ? new Promise(() => {}) : Promise.reject(new Error("private cleanup failure"))
        },
      })
      const fake = stubFetch(() => new Response(stream, {
        status, headers: { "Retry-After": "0007", "X-Private": "private header" },
      }))
      let deadline
      try {
        const outcome = await Promise.race([
          requestResponse("https://example.com", {}, context(), { sensitive: true, timeout: 10 })
            .then(() => "unexpected success", (error) => error),
          new Promise((resolve) => { deadline = setTimeout(() => resolve("cleanup blocked refusal"), 200) }),
        ])
        assert.equal(outcome.status, status, `${mode} cleanup must preserve HTTP ${status}`)
        assert.equal(outcome.retryAfter, "7")
        assert.equal(outcome.cause, undefined)
        assert.deepEqual(Object.keys(outcome).sort(), ["retryAfter", "status"])
        assert.doesNotMatch(String(outcome), /private/)
        if (mode !== "broken") assert.equal(cancelled, true)
      } finally { clearTimeout(deadline); fake.restore() }
    }
  }
})

test("sensitive readers hide body exceptions while default request diagnostics remain available", async () => {
  let fake = stubFetch(() => text("ok"))
  try {
    await assert.rejects(requestResponse("https://example.com", {}, context(), { sensitive: true }, () => {
      throw new Error("private reader exception")
    }), { message: "search response body unavailable" })
  } finally { fake.restore() }
  fake = stubFetch(() => { throw new Error("ordinary network detail") })
  try {
    await assert.rejects(requestJSON("https://example.com", {}, context()), /ordinary network detail/)
  } finally { fake.restore() }
  fake = stubFetch(() => text("ordinary upstream detail", 503))
  try {
    await assert.rejects(requestJSON("https://example.com", {}, context()), (error) => {
      assert.equal(error.status, 503)
      assert.match(error.message, /ordinary upstream detail/)
      return true
    })
  } finally { fake.restore() }
})

test("requestResponse and requestJSON in sensitive mode conceal credentials and details", async () => {
  const SECRET = "secret-key-12345"
  const URL_WITH_SECRET = `https://api.example.com/search?api_key=${SECRET}`

  // 1. Network failure
  const fakeNetwork = stubFetch(() => {
    throw new Error(`fetch failed at ${URL_WITH_SECRET}`)
  })
  try {
    await assert.rejects(
      requestResponse(URL_WITH_SECRET, {}, context(), { label: "TestAPI", sensitive: true }),
      (err) => {
        assert.equal(err.message, "TestAPI request failed")
        assert.doesNotMatch(String(err), new RegExp(SECRET))
        return true
      },
    )
  } finally { fakeNetwork.restore() }

  // 2. HTTP error response with secret in body
  const fakeHttp = stubFetch(() => text(`{"error":"bad key: ${SECRET}"}`, 401, { "Retry-After": "30" }))
  try {
    await assert.rejects(
      requestResponse(URL_WITH_SECRET, {}, context(), { label: "TestAPI", sensitive: true }),
      (err) => {
        assert.equal(err.status, 401)
        assert.equal(err.retryAfter, "30")
        assert.equal(err.message, "TestAPI API error 401: invalid API key")
        assert.doesNotMatch(String(err), new RegExp(SECRET))
        return true
      },
    )
  } finally { fakeHttp.restore() }

  // 3. Malformed JSON with secret in body
  const fakeJson = stubFetch(() => text(`not json with ${SECRET}`, 200))
  try {
    await assert.rejects(
      requestJSON(URL_WITH_SECRET, {}, context(), { label: "TestAPI", sensitive: true }),
      (err) => {
        assert.equal(err.message, "Invalid TestAPI response: malformed JSON")
        assert.doesNotMatch(String(err), new RegExp(SECRET))
        return true
      },
    )
  } finally { fakeJson.restore() }
})

test("retryAfterFromResponse custom hook extracts retry hints across failure paths", async () => {
  const customHook = (res) => {
    const raw = res.headers.get("X-Custom-Retry")
    return raw ? String(Number(raw) * 2) : undefined
  }

  // 1. Ordinary HTTP 429 failure
  let fake = stubFetch(() => text("rate limited", 429, { "X-Custom-Retry": "5" }))
  try {
    await assert.rejects(
      requestJSON("https://api.example.com/test", {}, context(), {
        label: "CustomAPI",
        retryAfterFromResponse: customHook,
      }),
      (err) => {
        assert.equal(err.status, 429)
        assert.equal(err.retryAfter, "10")
        assert.match(err.message, /retry after 10s/)
        return true
      },
    )
  } finally { fake.restore() }

  // 2. 429 with failing body read
  const brokenStream = new ReadableStream({
    start(controller) { controller.error(new Error("network stream aborted")) },
  })
  fake = stubFetch(() => new Response(brokenStream, {
    status: 429,
    headers: { "X-Custom-Retry": "8" },
  }))
  try {
    await assert.rejects(
      requestResponse("https://api.example.com/test", {}, context(), {
        label: "CustomAPI",
        retryAfterFromResponse: customHook,
      }),
      (err) => {
        assert.equal(err.status, 429)
        assert.equal(err.retryAfter, "16")
        assert.match(err.message, /response body unavailable, retry after 16s/)
        return true
      },
    )
  } finally { fake.restore() }

  // 3. Sensitive mode HTTP failure
  fake = stubFetch(() => text("refused", 429, { "X-Custom-Retry": "3" }))
  try {
    await assert.rejects(
      requestResponse("https://api.example.com/test", {}, context(), {
        label: "CustomAPI",
        sensitive: true,
        retryAfterFromResponse: customHook,
      }),
      (err) => {
        assert.equal(err.status, 429)
        assert.equal(err.retryAfter, "6")
        assert.match(err.message, /retry after 6s/)
        return true
      },
    )
  } finally { fake.restore() }
})
