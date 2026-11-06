import { createZhipuCodingProvider } from "./zhipu-coding-common.mjs"

export function createZhipuCoding(options = {}) {
  return createZhipuCodingProvider({
    id: "zhipu-coding",
    name: "Zhipu Coding Plan (magpie-websearch)",
    defaultEndpoint: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
    keysURL: "https://bigmodel.cn/apikey/coding-plan-per",
    envPrefix: "ZHIPU_CODING_",
  }, options)
}
