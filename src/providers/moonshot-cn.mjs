import { createMoonshotProvider } from "./moonshot-common.mjs"

export function createMoonshotCN(options = {}) {
  return createMoonshotProvider({
    id: "moonshot-cn",
    name: "Moonshot CN (magpie-websearch)",
    defaultEndpoint: "https://api.moonshot.cn/v1/tools/search",
    keysURL: "https://platform.kimi.com/console/api-keys",
    envPrefix: "MOONSHOT_CN_",
  }, options)
}
