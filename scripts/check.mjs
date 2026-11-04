// Loads the plugin the way magpie does and checks the shape of what it
// returns. It signs in to nothing and sends no request.
import * as entry from "../index.mjs"

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/
const EXPECTED = ["anysearch", "keenable", "linkup"]

let failed = 0
const fail = (message) => {
  failed++
  console.error("✗ " + message)
}

const functions = Object.values(entry).filter((value) => typeof value === "function")
if (functions.length !== 1) {
  fail(`index.mjs exports ${functions.length} functions; magpie calls every one as a plugin`)
}

const hooks = await entry.WebSearch({}, {})
const search = hooks?.search
if (!search || typeof search !== "object" || Array.isArray(search)) {
  fail("WebSearch returned no search object")
} else {
  for (const [id, definition] of Object.entries(search)) {
    if (!ID.test(id)) fail(`${id}: id must match ${ID}`)
    if (typeof definition?.name !== "string" || !definition.name.trim()) {
      fail(`${id}: name is missing`)
    }
    if (typeof definition?.execute !== "function") fail(`${id}: execute is missing`)
    if (definition?.keysURL !== undefined && !/^https?:\/\//.test(definition.keysURL)) {
      fail(`${id}: keysURL must be an http(s) address`)
    }
    if (definition?.keyOptional !== undefined && typeof definition.keyOptional !== "boolean") {
      fail(`${id}: keyOptional must be a boolean`)
    }
    if (definition?.url !== undefined && typeof definition.url !== "boolean") {
      fail(`${id}: url must be a boolean`)
    }
  }
  for (const id of EXPECTED) {
    if (!search[id]) fail(`missing pilot provider ${id}`)
  }
}

if (failed > 0) {
  console.error(`${failed} problem(s)`)
  process.exitCode = 1
} else {
  console.log(`✓ ${Object.keys(search).length} search APIs: ${Object.keys(search).join(", ")}`)
}
