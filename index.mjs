import { anysearch } from "./src/providers/anysearch.mjs"
import { keenable } from "./src/providers/keenable.mjs"
import { linkup } from "./src/providers/linkup.mjs"

// The pilot. Each entry is the id magpie shows as `websearch:<id>` and the
// definition its search hook reads. Adding a provider means adding its module
// and one line here.
const PROVIDERS = [
  ["anysearch", anysearch],
  ["keenable", keenable],
  ["linkup", linkup],
]

const KNOWN = new Set(PROVIDERS.map(([id]) => id))
const WARNING = "[websearch]"

// Reads the `enable` or `disable` plugin option: an array of provider IDs.
// A wrong shape is ignored, and an ID naming no provider here is dropped with
// a warning rather than costing the user every provider.
function readOption(options, name) {
  const requested = options?.[name]
  if (requested === undefined) return undefined
  if (!Array.isArray(requested)) {
    console.warn(`${WARNING} ${name} must be an array of provider IDs; ignoring it`)
    return undefined
  }
  const ids = new Set(requested.filter((entry) => typeof entry === "string"))
  const unknown = [...ids].filter((id) => !KNOWN.has(id))
  if (unknown.length > 0) {
    console.warn(
      `${WARNING} ${name} names no provider this package registers: ${unknown.join(", ")}`,
    )
  }
  return ids
}

// magpie calls every function this module exports as a plugin, so this is the
// only export. Helpers live in src/.
export const WebSearch = async (_input, options = {}) => {
  const opts = options ?? {}
  const allowed = readOption(opts, "enable")
  const disabled = readOption(opts, "disable") ?? new Set()

  // Deny wins on the overlap: a provider `disable` names stays out even when
  // `enable` lists it, so a per-provider exclusion is never overridden by a
  // bulk allow-list. The overlap is named because the config is redundant,
  // not fatal.
  const overlap = allowed ? [...allowed].filter((id) => disabled.has(id)) : []
  if (overlap.length > 0) {
    console.warn(
      `${WARNING} disable overrides enable for: ${overlap.join(", ")} -- those providers stay out`,
    )
  }

  if (allowed !== undefined && ![...allowed].some((id) => KNOWN.has(id))) {
    console.warn(`${WARNING} enable lists no known provider; the search pool will be empty`)
  }

  const search = {}
  for (const [id, definition] of PROVIDERS) {
    if (disabled.has(id)) continue
    if (allowed !== undefined && !allowed.has(id)) continue
    search[id] = definition
  }
  return { search }
}
