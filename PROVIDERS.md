# Providers

Source of truth for the port from [guotree/opencode-search-plugin](https://github.com/guotree/opencode-search-plugin) (v4.6.1, `plugins/*-search.ts`).

## Done (pilot)

| Provider | magpie ID | Source | Key | Overlap with magpie built-in |
|---|---|---|---|---|
| AnySearch | `magpie-websearch:anysearch` | `anysearch-search.ts` | required | none; anonymous tier not wired up |
| Keenable | `magpie-websearch:keenable` | `keenable-search.ts` | required | none; keyless `/public` deliberately not wired up |
| Linkup | `magpie-websearch:linkup` | `linkup-search.ts` | required | none |

## Planned

| Provider | magpie ID | Source | Key | Overlap |
|---|---|---|---|---|
| Bocha | `magpie-websearch:bocha` | `bocha-search.ts` | required | none |
| Brave | `magpie-websearch:brave` | `brave-search.ts` | required | built-in `brave` (adds country/lang/freshness) |
| DeepSeek | — | `deepseek-search.ts` | required | built-in `deepseek` (identical; skip unless wanted) |
| Doubao | `magpie-websearch:doubao` | `doubao-search.ts` | required | built-in `volcengine` (adds authority/time/content) |
| Jina | `magpie-websearch:jina` | `jina-search.ts` | required | none |
| Kagi | `magpie-websearch:kagi` | `kagi-search.ts` | required | none |
| Metaso | `magpie-websearch:metaso` | `metaso-search.ts` | required | none |
| Moonshot | `magpie-websearch:moonshot` | `moonshot-search.ts` | required | none |
| Moonshot CN | `magpie-websearch:moonshot-cn` | `moonshot-cn-search.ts` | required | none |
| Ollama | `magpie-websearch:ollama` | `ollama-search.ts` | required | none |
| Perplexity | `magpie-websearch:perplexity` | `perplexity-search.ts` | required | none |
| Querit | `magpie-websearch:querit` | `querit-search.ts` | required | none |
| SerpApi | `magpie-websearch:serpapi` | `serpapi-search.ts` | required | none |
| Serper | `magpie-websearch:serper` | `serper-search.ts` | required | none |
| StepFun | `magpie-websearch:stepfun` | `stepfun-search.ts` | required | none |
| You.com | `magpie-websearch:youcom` | `youcom-search.ts` | required | built-in `you` (adds extraction/freshness; built-in has free keyless search) |
| Yuanbao | `magpie-websearch:yuanbao` | `yuanbao-search.ts` | required | built-in `wsa` (adds site/freshness/industry/count) |
| Z.ai | `magpie-websearch:zai` | `zai-search.ts` | required | none |
| Zhipu | `magpie-websearch:zhipu` | `zhipu-search.ts` | required | none |

## Port checklist

1. Keep the request shape and response mapping from the old adapter.
2. Use `count` from magpie (6) instead of the old `*_NUM` default; keep the API's min/max.
3. Return `{ title, url, text, age? }`; no date parser, no `time.published`.
4. Throw `apiError(status, message, retryAfter)` for key refusals; keep HTTP 200 business errors as throws.
5. Do not read `OSP_*_API_KEY`; the key arrives in `execute({ key })`.
6. Set `keyOptional: true` for keyless providers.
7. Add a fixture test and a request-shape test.
8. Update this table.
