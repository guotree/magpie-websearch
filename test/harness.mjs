// Stubs global fetch for one test and records the calls it saw.
export function stubFetch(handler) {
  const original = globalThis.fetch
  const calls = []

  globalThis.fetch = async (input, init = {}) => {
    const call = {
      url: String(input),
      init,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    return handler(call)
  }

  return {
    calls,
    restore() {
      globalThis.fetch = original
    },
  }
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

export function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers })
}

export function context() {
  return { abort: new AbortController().signal }
}
