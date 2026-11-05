import { createZhipuProvider } from "./zhipu-common.mjs"

export function createZai(options = {}) {
  return createZhipuProvider({
    id: "zai",
    name: "Z.ai (magpie-websearch)",
    defaultEndpoint: "https://api.z.ai/api/paas/v4/web_search",
    keysURL: "https://z.ai/manage-apikey/apikey-list",
    envPrefix: "ZAI_",
    china: false,
  }, options)
}
