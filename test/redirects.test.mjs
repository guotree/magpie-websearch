import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { WebSearch } from "../index.mjs"
import { context } from "./harness.mjs"

test("REST and anonymous MCP reject real redirects before visiting their destination", { timeout: 10_000 }, async () => {
  let destinations = 0
  const originals = []
  const server = createServer((req, res) => {
    req.resume()
    if (req.url === "/destination") {
      destinations++
      res.setHeader("Content-Type", "application/json").end('{"results":[]}')
    } else {
      originals.push({ path: req.url, method: req.method, auth: req.headers.authorization, key: req.headers["x-api-key"] })
      res.writeHead(307, { Location: "/destination" }).end()
    }
  })
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  try {
    const { search } = await WebSearch({}, {})
    for (const id of ["anysearch", "keenable", "linkup", "metaso", "querit", "parallel", "tinyfish"]) {
      const url = `http://127.0.0.1:${server.address().port}/${id}`
      await assert.rejects(search[id].execute({ query: "redirect", key: "dummy-key", url }, context()), /request failed/)
    }
    for (const id of ["parallel", "tinyfish"]) {
      await assert.rejects(search[id].execute({ query: "redirect", url: `http://127.0.0.1:${server.address().port}/${id}/mcp` }, context()), /request failed/)
    }
    assert.equal(originals.length, 9)
    assert.equal(originals[6].method, "GET")
    assert.equal(originals[2].auth, "Bearer dummy-key")
    assert.equal(originals[5].key, "dummy-key")
    assert.equal(destinations, 0)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
