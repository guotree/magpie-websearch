import { createAnysearch } from "./src/providers/anysearch.mjs"
import { createBocha } from "./src/providers/bocha.mjs"
import { createJina } from "./src/providers/jina.mjs"
import { createKagi } from "./src/providers/kagi.mjs"
import { createKeenable } from "./src/providers/keenable.mjs"
import { createLinkup } from "./src/providers/linkup.mjs"
import { createMetaso } from "./src/providers/metaso.mjs"
import { createMoonshot } from "./src/providers/moonshot.mjs"
import { createMoonshotCN } from "./src/providers/moonshot-cn.mjs"
import { createOllama } from "./src/providers/ollama.mjs"
import { createParallel } from "./src/providers/parallel.mjs"
import { createPerplexity } from "./src/providers/perplexity.mjs"
import { createQuerit } from "./src/providers/querit.mjs"
import { createSerpapi } from "./src/providers/serpapi.mjs"
import { createSerper } from "./src/providers/serper.mjs"
import { createStepfun } from "./src/providers/stepfun.mjs"
import { createTinyfish } from "./src/providers/tinyfish.mjs"
import { createZai } from "./src/providers/zai.mjs"
import { createZhipu } from "./src/providers/zhipu.mjs"
import { optionGroup } from "./src/core.mjs"

const PROVIDERS = [
  ["anysearch", createAnysearch],
  ["bocha", createBocha],
  ["jina", createJina],
  ["kagi", createKagi],
  ["keenable", createKeenable],
  ["linkup", createLinkup],
  ["metaso", createMetaso],
  ["moonshot", createMoonshot],
  ["moonshot-cn", createMoonshotCN],
  ["ollama", createOllama],
  ["parallel", createParallel],
  ["perplexity", createPerplexity],
  ["querit", createQuerit],
  ["serpapi", createSerpapi],
  ["serper", createSerper],
  ["stepfun", createStepfun],
  ["tinyfish", createTinyfish],
  ["zai", createZai],
  ["zhipu", createZhipu],
]
const KNOWN = new Set(PROVIDERS.map(([id]) => id))
const WARNING = "[magpie-websearch]"

function readOption(options, name) {
  const requested = options?.[name]
  if (requested === undefined) return undefined
  if (!Array.isArray(requested)) {
    console.warn(`${WARNING} ${name} must be an array of provider IDs; ignoring it`)
    return undefined
  }
  const ids = new Set(requested.filter((entry) => typeof entry === "string"))
  const unknown = [...ids].filter((id) => !KNOWN.has(id))
  if (unknown.length > 0) console.warn(`${WARNING} ${name} names no provider this package registers: ${unknown.join(", ")}`)
  return ids
}

// magpie calls every exported function as a plugin. Keep this the only one.
export const WebSearch = async (_input, options = {}) => {
  const opts = options ?? {}
  const allowed = readOption(opts, "enable")
  const disabled = readOption(opts, "disable") ?? new Set()
  const overlap = allowed ? [...allowed].filter((id) => disabled.has(id)) : []
  if (overlap.length > 0) {
    console.warn(`${WARNING} disable overrides enable for: ${overlap.join(", ")} -- those providers stay out`)
  }
  if (allowed !== undefined && ![...allowed].some((id) => KNOWN.has(id))) {
    console.warn(`${WARNING} enable lists no known provider; the search pool will be empty`)
  }
  const search = {}
  for (const [id, create] of PROVIDERS) {
    if (disabled.has(id) || (allowed !== undefined && !allowed.has(id))) continue
    search[id] = create(optionGroup(opts, id))
  }
  return { search }
}
