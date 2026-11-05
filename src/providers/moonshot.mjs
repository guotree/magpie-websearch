import { createMoonshotProvider } from "./moonshot-common.mjs"

export function createMoonshot(options = {}) {
  return createMoonshotProvider({
    id: "moonshot",
    name: "Moonshot (magpie-websearch)",
    defaultEndpoint: "https://api.moonshot.ai/v1/tools/search",
    keysURL: "https://platform.kimi.ai/console/api-keys",
    envPrefix: "MOONSHOT_",
  }, options)
}
