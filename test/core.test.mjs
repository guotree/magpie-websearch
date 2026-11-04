import test from "node:test"
import assert from "node:assert/strict"
import { makeCache } from "../src/core.mjs"

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
