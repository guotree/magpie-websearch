import { createZhipuCodingProvider } from "./zhipu-coding-common.mjs"

export function createZaiCoding(options = {}) {
  return createZhipuCodingProvider({
    id: "zai-coding",
    name: "Z.ai Coding Plan (magpie-websearch)",
    defaultEndpoint: "https://api.z.ai/api/mcp/web_search_prime/mcp",
    keysURL: "https://z.ai/manage-apikey/apikey-list",
    envPrefix: "ZAI_CODING_",
  }, options)
}
