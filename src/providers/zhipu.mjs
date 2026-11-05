import { createZhipuProvider } from "./zhipu-common.mjs"

export function createZhipu(options = {}) {
  return createZhipuProvider({
    id: "zhipu",
    name: "Zhipu (magpie-websearch)",
    defaultEndpoint: "https://open.bigmodel.cn/api/paas/v4/web_search",
    keysURL: "https://bigmodel.cn/apikey/platform",
    envPrefix: "ZHIPU_",
    china: true,
  }, options)
}
