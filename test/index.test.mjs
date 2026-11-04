import test from "node:test"
import assert from "node:assert/strict"

import * as mod from "../index.mjs"

test("index: exports one plugin function with six search APIs", async () => {
  const functions = Object.values(mod).filter((value) => typeof value === "function")
  assert.equal(functions.length, 1)

  const hooks = await mod.WebSearch({}, {})
  assert.deepEqual(Object.keys(hooks.search).sort(), [
    "anysearch",
    "keenable",
    "linkup",
    "parallel",
    "querit",
    "tinyfish",
  ])
})

test("index: enable narrows the pool", async () => {
  const hooks = await mod.WebSearch({}, { enable: ["linkup"] })
  assert.deepEqual(Object.keys(hooks.search), ["linkup"])
})

test("index: disable removes a provider", async () => {
  const hooks = await mod.WebSearch({}, { disable: ["linkup"] })
  assert.deepEqual(Object.keys(hooks.search).sort(), ["anysearch", "keenable", "parallel", "querit", "tinyfish"])
})

test("index: disable wins over enable and is named", async () => {
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(" "))
  try {
    const hooks = await mod.WebSearch({}, { enable: ["linkup"], disable: ["linkup"] })
    assert.deepEqual(Object.keys(hooks.search), [])
  } finally {
    console.warn = original
  }
  assert.ok(warnings.some((line) => line.includes("disable overrides enable")))
})

test("index: an unknown id is warned about, not fatal", async () => {
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.join(" "))
  try {
    const hooks = await mod.WebSearch({}, { enable: ["anysearch", "nope"] })
    assert.deepEqual(Object.keys(hooks.search), ["anysearch"])
  } finally {
    console.warn = original
  }
  assert.ok(warnings.some((line) => line.includes("nope")))
})
