# Providers

This plugin adds search services to magpie. It targets standalone web search
APIs that magpie has not already integrated in the official source reviewed
below; all third-batch candidates (Jina, Kagi, Serper) have now been integrated.
A model provider preset alone does not cover a vendor's standalone search API.

## Supported

| Display name | magpie ID | Implementation | Key |
|---|---|---|---|
| AnySearch (magpie-websearch) | `magpie-websearch:anysearch` | [anysearch.mjs](src/providers/anysearch.mjs) | optional |
| Bocha (magpie-websearch) | `magpie-websearch:bocha` | [bocha.mjs](src/providers/bocha.mjs) | required |
| Jina (magpie-websearch) | `magpie-websearch:jina` | [jina.mjs](src/providers/jina.mjs) | required |
| Kagi (magpie-websearch) | `magpie-websearch:kagi` | [kagi.mjs](src/providers/kagi.mjs) | required |
| Keenable (magpie-websearch) | `magpie-websearch:keenable` | [keenable.mjs](src/providers/keenable.mjs) | optional |
| Linkup (magpie-websearch) | `magpie-websearch:linkup` | [linkup.mjs](src/providers/linkup.mjs) | required |
| Metaso (magpie-websearch) | `magpie-websearch:metaso` | [metaso.mjs](src/providers/metaso.mjs) | required |
| Moonshot (magpie-websearch) | `magpie-websearch:moonshot` | [moonshot.mjs](src/providers/moonshot.mjs) | required |
| Moonshot CN (magpie-websearch) | `magpie-websearch:moonshot-cn` | [moonshot-cn.mjs](src/providers/moonshot-cn.mjs) | required |
| Ollama (magpie-websearch) | `magpie-websearch:ollama` | [ollama.mjs](src/providers/ollama.mjs) | required |
| Parallel (magpie-websearch) | `magpie-websearch:parallel` | [parallel.mjs](src/providers/parallel.mjs) | optional |
| Perplexity (magpie-websearch) | `magpie-websearch:perplexity` | [perplexity.mjs](src/providers/perplexity.mjs) | required |
| Querit (magpie-websearch) | `magpie-websearch:querit` | [querit.mjs](src/providers/querit.mjs) | required |
| SerpApi (magpie-websearch) | `magpie-websearch:serpapi` | [serpapi.mjs](src/providers/serpapi.mjs) | required |
| Serper (magpie-websearch) | `magpie-websearch:serper` | [serper.mjs](src/providers/serper.mjs) | required |
| StepFun (magpie-websearch) | `magpie-websearch:stepfun` | [stepfun.mjs](src/providers/stepfun.mjs) | required |
| TinyFish (magpie-websearch) | `magpie-websearch:tinyfish` | [tinyfish.mjs](src/providers/tinyfish.mjs) | optional |
| Z.ai (magpie-websearch) | `magpie-websearch:zai` | [zai.mjs](src/providers/zai.mjs) | required |
| Z.ai Coding Plan (magpie-websearch) | `magpie-websearch:zai-coding` | [zai-coding.mjs](src/providers/zai-coding.mjs) | required |
| Zhipu (magpie-websearch) | `magpie-websearch:zhipu` | [zhipu.mjs](src/providers/zhipu.mjs) | required |
| Zhipu Coding Plan (magpie-websearch) | `magpie-websearch:zhipu-coding` | [zhipu-coding.mjs](src/providers/zhipu-coding.mjs) | required |

Every search definition's `name` must follow `<Provider> (magpie-websearch)`.
This suffix identifies the plugin in magpie's GUI and CLI. Keep the short API ID
and the namespaced vendor ID independent of the display name; suffix changes
must not rename the IDs used by saved keys, switches, order or plugin options.

All twenty-one APIs are registered by default. `enable` and `disable` are optional
plugin options that filter this list by short ID (`linkup`, for example).
`disable` takes precedence over `enable`; `enable: []` registers none, while
`disable: []` excludes none. Provider settings such as `linkup.depth` do not
restrict registration by themselves. magpie manages keys, request order and
on/off switches for the registered APIs. See the [registration filters reference](docs/technical-reference.en.md#registration-filters)
for the full behavior and configuration examples.

AnySearch, Keenable, Parallel and TinyFish declare `keyOptional: true`, so magpie accepts
them with an empty key and considers them ready for search. Their anonymous requests omit
authentication headers; Keenable selects the `/public` endpoint and sends
`X-Keenable-Title`. Parallel uses POST `https://mcp.parallel.ai/mcp`, JSON-RPC
`tools/call` for `web_search`. TinyFish uses POST `https://agent.tinyfish.ai/mcp`, JSON-RPC
`tools/call` for `search`, with `X-TinyFish-Access-Mode: keyless`. A supplied key
selects POST `https://api.parallel.ai/v1/search` with `x-api-key` for Parallel, or
GET `https://api.search.tinyfish.ai/` with `X-API-Key` for TinyFish; failures do not
downgrade to anonymous. Anonymous 429 cooldowns are maintained per API instance and
final endpoint, respecting `Retry-After` with a 60-second default. Keyed requests
and other endpoints are independent of that cooldown. See
[anonymous search reference](docs/technical-reference.en.md#anonymous-search) for setup and switching modes.

### Parallel protocol notes

- The [Search API reference](https://docs.parallel.ai/api-reference/search/search.md)
  describes GA POST search at `/v1/search`. Beta `/v1beta/search` and deprecated top-level
  `max_results`, `excerpts` and `processor` fields are avoided.
- Anonymous MCP was verified on **2026-11-04**: `web_search` over SSE returned HTTP 200
  without credentials or cookies for English and Chinese queries. `tools/list` requires
  `objective` and `search_queries`; the adapter populates both from the normalized query.
- Parallel defaults to `fast` mode on MCP and for agents. REST supports `fast`, `turbo`,
  `basic` and `advanced`. Non-`fast` modes require an API key and fail with a clear
  message if run anonymously.
- Public search caps results at 20. The adapter sizes requests with `resolveResultCount(count, countPolicy)`.
- Excerpts are joined with `\n\n`; text retains up to `contentChars` code points
  (default 4000, 0 keeps all) and appends `…` when truncated. `publish_date` maps to `age`.
- Custom Base URLs are exact endpoints for either mode without automatic path rewriting.

### TinyFish protocol notes

- The [REST reference](https://docs.tinyfish.ai/search-api/reference.md) and
  [OpenAPI](https://agent.tinyfish.ai/v1/openapi/search) describe authenticated GET
  search. The default endpoint is the product host's root, with no `/v1/search`.
- Anonymous MCP was verified on **2026-11-04**: the keyless header produced HTTP
  200 search results without a key, OAuth token or cookies. Omitting it produced
  401; adding it to REST still produced 401. `tools/list` advertised `web` and
  `news`, including location, language and domain filters. `research_paper` is
  keyed-only. Anonymous quotas and long-term availability are not guaranteed by
  this observation; the [MCP guide](https://docs.tinyfish.ai/mcp-integration/index.md)
  primarily documents OAuth.
- A single stateless `tools/call` works without `initialize`. Responses may be
  JSON or SSE. Its transport is implemented in
  [mcp/stateless.mjs](src/mcp/stateless.mjs), not a general MCP client.
  Search JSON is extracted from `structuredContent.results` or
  JSON text in `content[]`; JSON-RPC and tool failures are errors, not empty hits.
  RPC codes do not become numeric HTTP statuses.
- Both paths return one page without a count parameter. Filter missing URLs,
  preserve array order, then cap locally. Map `snippet` to `text` and string
  `date` to `age`; do not turn a paper's numeric year into a date.
- Custom Base URLs are complete endpoints, used as given for MCP POST without a
  key or REST GET with one. No path is appended. A mode change may require a new
  custom address. Caches include mode, endpoint, effective parameters/count and key.
- First-version settings expose geography, language, search type and domain
  filters. Purpose, pagination, date/year filters and inline fetch are deferred.
  See the [TinyFish reference](docs/technical-reference.en.md#tinyfish-search) for configuration and switching modes.

### Metaso protocol notes

- The [Metaso Search API playground](https://metaso.cn/search-api/playground) documents
  authenticated POST search at `/api/v1/search`.
- Metaso requires an API key (Bearer token). Anonymous access returns HTTP 401.
- Results are read from `webpages`, falling back to `results`, `papers`, `documents`
  or `data`; `link` or `url` maps to `url`, `snippet` (or `content` when `snippet`
  is absent) to `text`, and a string `date` to `age`.
- Supports configurable search scope (`webpage`, `document`, `paper`, `image`, `video`, `podcast`).
- Public search caps results at 50 (`resolveResultCount(count, countPolicy)`).

### SerpApi protocol notes

- The [Google Search Engine Results API](https://serpapi.com/search-api) documents
  authenticated GET search at `https://serpapi.com/search`.
- SerpApi requires an API key and has no anonymous path. The key is passed via the `api_key`
  query parameter.
- Only the first page of `organic_results` is mapped: `link` to `url`, `title` to `title`,
  `snippet` to `text`, and string `date` to `age`. Other SERP blocks and hits lacking
  a valid link are ignored; malformed optional snippets become empty text.
- Google deprecated the `num` parameter in September 2025; results are retrieved as returned
  by upstream and locally capped (`resolveResultCount(count, countPolicy)`, at most 10).
- An error-free empty array or `status: "Success"` with `organic_results_state:
  "Fully empty"` returns `[]` and is cached for at most 30 seconds. The latter may
  include SerpApi's empty-result error string. Unexplained errors, unknown statuses
  and null result arrays fail without caching. magpie reports `found nothing` if
  no provider supplies results.
- SerpApi-generated errors omit original exceptions, upstream bodies and request
  URLs. Refusals retain numeric status and validated, normalized `Retry-After` only;
  body cancellation cannot delay the refusal. Redirects are rejected. This policy
  does not control vendor/proxy logs or alter ordinary search result content.
- Supports optional location, country (`gl`), language (`hl`), domain (`googleDomain`),
  and safe-search (`safe`) options with environment variable fallbacks.

### Moonshot and Moonshot CN protocol notes

- The Moonshot Basic search API ([international](https://platform.kimi.ai/docs/api/tools-search.md), [domestic](https://platform.kimi.com/docs/api/tools-search.md)) documents standalone `POST /v1/tools/search` with Bearer authentication. Default endpoints are `https://api.moonshot.ai/v1/tools/search` and `https://api.moonshot.cn/v1/tools/search`.
- Both sites require an API key (`keyOptional: false`). Credentials and console accounts are independent; keys are configured separately and are not interchanged.
- Basic search accepts `text_query` and `limit` (1–20, sized via `resolveResultCount(count, countPolicy)`). The initial release does not expose Pro search, responses API, formula API, or model-integrated search.
- Response payloads must contain a `search_results` array. Results map `url` to `url`, non-empty `title` to `title` (fallback to URL), and string `date` to `age`.
- Results default to snippet text (`content: "snippet"`). When `content: "full"` is selected, requests include `"include_content": true`, and nonblank string `text` is preferred over `snippet` while preserving whitespace and markdown indentation. Both modes retain up to `contentChars` code points (default 4000, 0 disables local truncation) and append `…` when truncating; Magpie still applies its own text limit.
- On HTTP 429, standard `Retry-After` takes precedence, including zero. The fallback `X-RateLimit-Reset` conversion accepts delays of 1–86400 seconds; invalid or excessive values are omitted for host defaults. Official timestamps use Unix seconds; plausible proxy millisecond timestamps are tolerated within the same window. This bound is a local defensive policy, not an upstream quota guarantee; see the [Moonshot reference](docs/technical-reference.en.md#moonshot-search) for conversion rules.
- Official billing applies to HTTP 200 with a non-empty upstream `search_results` array ($0.002/search internationally before applicable taxes, ¥0.01/search domestically). Local filtering or truncation does not reduce that charge. Search rate limits are independent of model RPM/TPM limits.
- Both adapters have passed dummy-key local simulations and Magpie host checks. Successful searches, full text, latency, rate limiting and search quality with real account keys have not been verified on either site.

### Zhipu and Z.ai protocol notes

- Standalone POST JSON search with Bearer authentication: domestic
  `https://open.bigmodel.cn/api/paas/v4/web_search` and international
  `https://api.z.ai/api/paas/v4/web_search`. Each site uses its own Standard API Key
  from its console; Magpie manages keys. Both set `keyOptional: false`.
- Domestic [OpenAPI](https://docs.bigmodel.cn/api-reference/工具-api/网络搜索)
  specifies a 70-character query ceiling. Longer normalized queries fail locally
  without truncation; international queries have no additional plugin length cap.
- Domestic defaults to `search_std`; `search_pro`, `search_pro_sogou` and
  `search_pro_quark` are selectable. Always send `search_intent: false` domestically.
  International fixes `search-prime` and omits `search_intent` and `content_size`.
  Explicit international `engine` or `contentSize` options warn and are ignored.
- Size locally via `resolveResultCount(count, countPolicy)`, at most 50. Sogou rounds upstream count
  up to 10/20/30/40/50; Quark omits count. Filter invalid links before capping.
  Sogou ignores count when both domain and recency filters are specified.
  Quark's actual/default result count needs real-key verification; the local cap
  cannot fill a short response. Quark warns and ignores a nonempty environment
  domain filter, but under Quark an explicit nonempty `domainFilter` fails configuration.
  Otherwise domain filters are trimmed and passed through without format
  validation; use a single bare domain without a scheme, path, list or wildcard.
- Both read `search_result`, mapping `link` to `url`, `content` to `text` and
  string `publish_date` to `age`. Text defaults to 4000 code points plus an
  appended `…` when truncated; 0 keeps all.
  As a plugin validation policy, missing/null/non-array results and non-empty
  lists without any usable links fail without caching. Explicit empty arrays
  cache for at most 30 seconds. For proxy compatibility, `code` values `0`, `"0"`,
  `200` and `"200"` and falsy `error` fields are tolerated, subject to result
  validation. Business errors never become HTTP statuses.
- The international [reference](https://docs.z.ai/api-reference/tools/web-search)
  mentions `search_pro_jina` in filter/count descriptions despite enumerating
  only `search-prime`. The adapter follows the official guide's count/domain/time
  examples; their effects need real-key verification. No Jina engine is exposed.
- HTTP refusals preserve numeric status and validated standard `Retry-After`.
  429 can mean balance/quota exhaustion as well as rate limiting. Requests reject
  redirects and custom URLs are exact endpoints. The site, endpoint, effective
  request parameters, local limit, text budget and credential are hashed together
  to form the cache identity; no raw credential is stored in the cache key.
- Published REST prices: domestic ¥0.01/0.03/0.05/0.05 per use respectively;
  international $0.01 per use. No promise of free empty or failed searches is made.
  Coding Plan MCP is a separate access path and is never used by the `zhipu` or `zai`
  REST adapters.
- Dummy-key tests cover protocol behavior and host scheduling; successful searches,
  filter effects, billing, real account limits and quality with real keys remain
  unverified. See the [technical reference](docs/technical-reference.en.md#zhipu-search).

### Zhipu and Z.ai Coding Plan MCP notes

- MCP modules live in `src/mcp/` and are separated by responsibility:
  [stateless.mjs](src/mcp/stateless.mjs) performs a direct tool call, while
  [session.mjs](src/mcp/session.mjs) handles
  initialization and a session lifecycle. Both depend on
  [response.mjs](src/mcp/response.mjs) for JSON/SSE and JSON-RPC decoding;
  neither calling strategy imports the other. Authentication is independent of
  this split. Tool-level `isError` is checked at each tool-call boundary. The
  session helper still performs tool discovery and selection using caller-supplied
  names; it is not a general MCP SDK or a callback-based session API.
- [search-results.mjs](src/mcp/search-results.mjs) extracts search payloads
  independently of transport or session state. The stateless `callMCPSearch`
  composes its tool call with this extractor; Coding Plan providers call the
  extractor directly with `search_result` compatibility and up to three JSON
  decoding layers. Default extraction keeps the original `results`/single-decode
  policy for Parallel and TinyFish. It preserves envelope metadata and leaves
  URL filtering, row mapping, text limits and caches to providers.
- `zhipu-coding` and `zai-coding` are separate required-key providers. They use the
  official Streamable HTTP endpoints
  `https://open.bigmodel.cn/api/mcp/web_search_prime/mcp` and
  `https://api.z.ai/api/mcp/web_search_prime/mcp`. Coding Plan keys are not Standard
  API keys, are never exchanged between sites, and never trigger a fallback to the
  metered REST providers.
- Each result-cache miss creates one session: `initialize`, `notifications/initialized`,
  `tools/list`, `tools/call`, then a best-effort `DELETE`. One 25-second default
  budget covers initialization, discovery and the tool call; cleanup has a separate
  one-second budget. Requests reject redirects and carry credentials only in the
  Bearer header. HTTP refusal bodies are withheld so reflected keys or session IDs
  cannot enter adapter errors. `clientInfo.version` comes from the installed
  `package.json` at module load.
  No session is opened on a result-cache hit.
- The client negotiates known MCP protocol versions, supports JSON and SSE responses,
  and discovers the tool on every cache miss. It prefers `web_search_prime` while
  accepting the documented `webSearchPrime` spelling. `count` and optional filters
  are sent only when the current `inputSchema` advertises them. An explicitly
  configured unsupported recency, domain or content-size filter fails before
  `tools/call`; count still caps results locally when the schema omits it.
  This checks property presence, not every JSON Schema constraint such as
  `maxLength`, `minimum`, or `maximum`. Server-side validation still applies.
- Results may be structured content or JSON text decoded up to three times, containing a
  top-level array, `results`, or `search_result`. Rows without a nonblank string
  `link ?? url` are removed before the
  local cap. Valid empty results receive the normal short cache; malformed or wholly
  unusable non-empty payloads are not cached. Result URLs are trimmed without syntax,
  protocol or reachability validation. A non-null `link` takes precedence over `url`.
- Official plan documentation currently describes each Web Search MCP call as using
  shared Coding Plan credits (the documented coefficient at implementation time is
  1.2 credits per call). It is not anonymous or unlimited. Local fake-service and
  Magpie 0.1.3141 host checks cover both endpoints, JSON/SSE, lifecycle cleanup,
  count, timeout, HTTP refusal, key rotation and explicit provider fallback. No live
  Coding Plan key or billing account has been used yet.
- These two providers are experimental pending confirmation that Magpie use falls
  within the current Coding Plan client policy. The official pages describe use by
  compatible MCP clients but do not list Magpie as an officially supported client;
  this project makes no such support claim.

### StepFun protocol notes

- The domestic [REST reference](https://platform.stepfun.com/docs/zh/api-reference/search/search.md)
  documents standalone POST `https://api.stepfun.com/v1/search` with Bearer auth.
  Magpie manages the key from `https://platform.stepfun.com/interface-key`;
  `keyOptional: false`. Custom URLs are exact endpoints and redirects are rejected.
- Requests send a normalized nonempty `query`, `n` sized via
  `resolveResultCount(count, countPolicy)` (at most 20), and optional `category` (`programming`,
  `research`, `gov`, `business`). The API publishes no query length ceiling,
  pagination, domain/recency filters or safe-search switch.
- Results read `results`, retaining rows with a nonblank string `url` before
  capping in upstream order. URLs are trimmed without further syntax, protocol
  or reachability checks.
  Missing/null/non-array results and nonempty arrays with no usable links fail
  without caching; explicit empty arrays cache for at most 30 seconds. This is a
  plugin validation policy. Truthy `error` payloads fail even on HTTP 200.
- `content: "snippet"` defaults to the snippet with blank-text fallback to the
  full `content`; `"full"` reverses that preference. Both apply `contentChars`
  (4000 Unicode code points by default, 0 keeps all), appending `…` on truncation.
  These are local choices: no undocumented `include_content` switch is sent.
  String `time` maps to `age` after trimming surrounding whitespace; blank or
  non-string values are omitted. It represents index time, not publication.
- Numeric HTTP status, bounded diagnostics and validated standard `Retry-After`
  are retained. 402 reports insufficient balance/Credit; 429 can mean rate limits
  or project/member Credit caps; 451 reports query/result moderation. Magpie owns
  key rotation and fallback, with no adapter sleeps or retries.
  Error formatting keeps string/numeric `type`/`code` before long messages:
  each identifier retains 80 code points plus `…` when truncated; the diagnostic
  retains 300 code points plus `… [truncated]`, excluding prefixes and advice.
  Interrupted error bodies retain the known HTTP status; explicit host cancellation
  takes precedence. Withheld 402 bodies are cancelled without waiting for cleanup.
- Domestic [pricing](https://platform.stepfun.com/docs/zh/guides/pricing/details.md)
  lists ¥0.04/search without promising free empty or failed calls. Search-specific
  numeric rate limits are not published; account tier limits are documented separately.
- On 2026-11-05, unauthenticated domestic REST returned 401; international
  `/v1/search` returned 404 while international chat returned 401. International
  [Step Plan documentation](https://platform.stepfun.ai/docs/en/guides/developer/integrations/codex.md#connect-stepsearch-mcp)
  does list a separate StepSearch MCP at
  `https://api.stepfun.ai/step_plan/v1/mcp/web_search/mcp` (also returned 401).
  This adapter implements domestic REST only, with no automatic channel switching.
- Dummy-key tests and Magpie host checks cover requests, full text, malformed/empty
  results, timeout, Credit refusals, moderation, key rotation (including interrupted
  401 bodies) and fallback. Real-key
  successful searches, billing, latency and quality remain unverified. See the
  [technical reference](docs/technical-reference.en.md#stepfun-search).

### Perplexity protocol notes

- The [Search API reference](https://docs.perplexity.ai/api-reference/search-post)
  describes POST `https://api.perplexity.ai/search`, with JSON body and `Authorization: Bearer <key>`.
- `search_type` supports `web` and `fast`. Defaults to `web`; `fast` provides lower
  latency and lower pricing ($1/1k requests vs. $5/1k requests). `people` search is
  excluded from this initial rollout.
- Pricing is billed per 1k successful requests; empty responses still incur charges,
  without extra token fees. The API uses prepaid billing without requiring a Pro subscription;
  introductory credits ($10 for 60 days on select new accounts) do not constitute a permanent free tier.
- Upstream supports `search_recency_filter` (`hour/day/week/month/year`), `country`
  (2-letter ISO code) and `search_language_filter` (up to 20 2-letter ISO 639-1 codes).
- Results map `title`, `url`, `snippet`, `date`, and `last_updated`. If `date` is empty or missing,
  `last_updated` is used as fallback for `age`. Empty snippets preserve URLs.
- On 2026-11-05, unauthenticated POST `/search` returned HTTP 401 without `Retry-After`.
- Dummy-key tests and Magpie host checks cover requests, fast/web modes, filters,
  count caps, empty/malformed results, timeout, 429 Retry-After, key rotation, and fallback.
  Real-key successful searches, billing, latency, and quality remain unverified. See the
  [technical reference](docs/technical-reference.en.md#perplexity-search).

### Bocha protocol notes

- POST `https://api.bochaai.com/v1/web-search` with Bearer auth, as documented by the
  [current console](https://open.bochaai.com/) and
  [official MCP implementation](https://github.com/BochaAI/bocha-search-mcp/blob/master/src/bocha_search_mcp/server.py).
  Magpie manages the required [API key](https://open.bochaai.com/api-keys). Custom URLs
  are exact endpoints; there is no automatic fallback to the old API domain.
- Requests send normalized `query`, `count` (configured default 10, range 1–50)
  and `summary: false` by default. Generated summaries require explicit opt-in;
  this search option does not make an additional model call. Optional `freshness`
  is trimmed and forwarded as an opaque string: `noLimit`, `oneDay`, `oneWeek`,
  `oneMonth`, `oneYear`, `YYYY-MM-DD` or `YYYY-MM-DD..YYYY-MM-DD`. Upstream validates
  its content; an explicit empty string clears an inherited environment filter.
- Results map `data.webPages.value`: `name`/`url`/`snippet`, with nonblank `summary`
  preferred only when enabled. Blank or invalid summaries fall back to snippet.
  Dates use `datePublished` before `dateLastCrawled`, preserving original strings
  without time-zone conversion. Missing/null `webPages` is a valid empty search;
  missing/nonobject `data`, invalid `value`, and nonempty unusable arrays are errors.
- Non-200 business `code` (numeric or string 200 succeeds) and truthy `error` in
  HTTP 200 fail without a fabricated HTTP status. Bounded diagnostics retain
  `code` and `log_id` before message/msg. HTTP 401 suggests checking the key;
  403 suggests checking account access and balance without assuming one cause.
- The [console overview](https://open.bochaai.com/overview) advertises a claimable
  1000-call trial resource pack. Eligibility, expiry and summary coverage depend
  on the account and latest official terms. Generated summaries may cost extra.
  The linked [pricing document](https://aq6ky2b8nql.feishu.cn/wiki/JYSbwzdPIiFnz4kDYPXcHSDrnZb)
  required Feishu login during research; no fixed price, QPS or free-empty-result
  promise is asserted. Historical prices and a zero-valued unloaded purchase form
  are not current pricing evidence.
- Dummy-key tests and real Magpie 0.1.3097 sandbox checks cover ordinary/generated
  summaries, freshness, exact URLs, empty/malformed results, timeouts, bounded
  business diagnostics, 429 Retry-After, Linkup fallback, and key rotation after
  429 or an interrupted 401 body. Real-key success, billing, quality and live rate
  limits remain unverified. See the [technical reference](docs/technical-reference.en.md#bocha-search).

### Ollama protocol notes

- The [Web Search contract](https://docs.ollama.com/capabilities/web-search.md)
  specifies POST `https://ollama.com/api/web_search`, Bearer
  [account API key](https://ollama.com/settings/keys), and JSON `{ query, max_results }`.
  An explicit `resultLimit` is a cap of 1–10; otherwise follow the host count,
  falling back to 5 only when it is missing or invalid. This is cloud search; local Ollama, model
  credentials, inference and `web_fetch` are not used. Free account keys are still
  required keys, not anonymous access.
- Results map `title`/`url`/`content` after removing unusable rows and before
  applying the cap. Title falls back to URL; absent or non-string content is empty.
  `contentChars` defaults to 2000 Unicode code points; 0 keeps all, truncation adds
  `…`. Only the retained prefix is traversed; no full-content array is allocated.
  No `age` is inferred from content or undocumented response fields. Magpie still
  caps tool text at 1500 bytes, so local truncation bounds mapping/cache size.
- The [launch post](https://ollama.com/blog/web-search) describes a personal free
  layer. A fixed search allowance, paid search price or search QPS was not publicly
  verified; [model-plan pricing](https://ollama.com/pricing) does not establish
  search quotas. Real account search, billing, quality and live rate limits remain
  unverified.
- Dummy-key tests and real Magpie 0.1.3097 sandbox checks cover exact POST URLs,
  mandatory keys, content truncation, empty/malformed results, timeout, 429
  Retry-After, Linkup fallback and key rotation after 429 or interrupted 401 bodies.
  Both new providers normalize standard Retry-After (including zero), retain
  numeric HTTP status, isolate caches per instance/request/key/endpoint, and cache
  valid empty results for at most 30 seconds. See the
  [technical reference](docs/technical-reference.en.md#ollama-search).

### Jina protocol notes

- Sourced from official [Jina Search API documentation](https://docs.jina.ai/api.md) and [Search OpenAPI](https://s.jina.ai/openapi.json) read 2026-11-05.
- POST `https://s.jina.ai/search`, Bearer key authentication.
- Snippet mode (`content: "snippet"`, default) sends `X-Respond-With: no-content` and extracts `description`. Full mode (`content: "full"`) omits `X-Respond-With: no-content` and prioritizes `content`, falling back to `description`. `contentChars` (default 4000; 0 for full) bounds code points in both modes. Note: Jina search pricing is based on a fixed token charge per request from 10,000 tokens; snippet mode does not guarantee reduced billing.
- `publishedTime` mapped directly to `age`; missing dates are omitted rather than guessed from text.
- Validated via unit tests, dummy keys, and real Magpie 0.1.3097 host sandbox tests covering endpoint routing, headers, truncation, empty results, malformed data, timeouts, 429 Retry-After, Linkup fallback, and sequential key rotation. Real account search quality, billing, and live rate limits remain unverified without a user-provided API key.

### Kagi protocol notes

- Sourced from official [Kagi Search API documentation](https://redocly-api-docs.kagi.com/api/docs/openapi/search/search.md) and [announcement](https://form.kagi.com/searchapi) read 2026-11-05.
- The Kagi Search API is in public **preview** for all Kagi users since 2026-05.
- POST `https://kagi.com/api/v1/search`, Bearer key authentication, `workflow: "search"`.
- Supports `lens` (named or shared URL), `recency` (`day`, `week`, `month`), and `region` (filters.region). Lens takes priority over recency with a single factory warning. The expensive `extract` parameter is not requested.
- `data.search` mapped to `{ title, url, snippet, age: time }`. Other collections (e.g. `news`, `images`) without `search` return an empty list `[]`.
- Validated via unit tests, dummy keys, and real Magpie 0.1.3097 host sandbox tests. Real account access, billing, and live rate limits remain unverified without a user-provided API key.

### Serper protocol notes

- Sourced from official [Serper documentation](https://serper.dev/) and current playground script read 2026-11-05.
- POST `https://google.serper.dev/search` with an `X-API-KEY` header and no Bearer/`Authorization` header, independent from SerpApi (which uses a GET `api_key` query parameter, not Bearer auth).
- Wire `num: 10` is fixed for standard single-page Google organic search; local capping via `resultLimit` (1–10) and the host's `count` bounds the returned results. Identity includes the local limit to isolate caches.
- Rich-media collections (`knowledgeGraph`, `answerBox`, `peopleAlsoAsk`, `relatedSearches`) without `organic` fall back to `[]`, while arbitrary objects missing `organic` throw invalid response.
- Validated via unit tests, dummy keys, and real Magpie 0.1.3097 host sandbox tests covering endpoint routing, header isolation against SerpApi, empty results, malformed data, timeouts, 429 Retry-After, Linkup fallback, and key rotation. Real account search quality, billing, and live rate limits remain unverified without a user-provided API key.

## Planned

All third-batch planned standalone web search APIs (Jina, Kagi, Serper) have now been integrated.

## Adding a provider

1. Check official magpie support and the provider's current API documentation.
2. Implement `execute({ query, count, key, url }, ctx)`. Use the supplied key,
   honor the custom Base URL (exact endpoint across all providers), and cap `count`
   according to the API's limits. If upstream has no count parameter, cap valid results
   locally. Use `configCountPolicy` and `resolveResultCount` so an omitted `resultLimit` follows
   the host count while explicit options and valid environment values remain caps.
   Preserve the legacy fallback only when no valid host count is supplied. Filter
   unusable rows before capping, even when the upstream ignores the requested count.
3. Return `{ title, url, text, age? }` results. Drop entries without a URL and
   preserve the provider's date string when available.
4. Preserve `ctx.abort` and apply the configured request timeout. Throw errors
   with a numeric `status` for HTTP refusals and carry `retryAfter` on 429.
5. Create settings and cache per plugin instance. Isolate cache entries by
   hashing the final endpoint, credential and all request parameters together.
6. Add optional provider settings with environment fallback and document their
   defaults and canonical names in both technical references. Follow the
   [configuration naming rules](#configuration-naming) below. magpie continues to own API keys.
7. For APIs that support anonymous requests, set `keyOptional: true`, omit empty
   authentication headers and select the documented anonymous endpoint. Keep an
   anonymous 429 cooldown per final endpoint because magpie does not rest empty
   keys. Preserve keyed behavior without silently downgrading failed keys.
8. Register the API by default while preserving the optional `enable`/`disable`
   filters (`disable` wins). Use short IDs for those filters and update the
   registration checks. Set `name` to `<Provider> (magpie-websearch)` and keep
   vendor IDs stable. magpie owns request ordering and its own on/off switches.
9. Add response fixtures and tests for request mapping, custom URLs, cache
   isolation and errors. Cover host counts above 6 and the `fallbackCount` with at
   least 25 valid results, smaller explicit/environment caps, `providerMax` and
   missing-count fallbacks. Exercise canonical `resultLimit` names and legacy
   aliases. Run Node, Bun and the magpie host checks.
10. Update the supported-provider table, README, package description and keywords.

### Configuration naming

Environment variable names are defined locally by each adapter; they are not
derived from upstream responses. New settings must follow this convention:

```text
ENV_NAME = UPPER_SNAKE_CASE(provider short ID) + "_" + UPPER_SNAKE_CASE(option name)
```

Use string option names in camelCase, preserving acronym groups such as `TTL`.
Convert hyphens in provider IDs to underscores and uppercase the ID. Convert
option word boundaries to underscores and uppercase the option name:

| Provider short ID | Option | Environment variable |
|---|---|---|
| `moonshot` | `timeout` | `MOONSHOT_TIMEOUT` |
| `moonshot-cn` | `resultLimit` | `MOONSHOT_CN_RESULT_LIMIT` |
| `moonshot-cn` | `cacheTTL` | `MOONSHOT_CN_CACHE_TTL` |
| `moonshot-cn` | `contentChars` | `MOONSHOT_CN_CONTENT_CHARS` |

`configInt` and `configStr` strip the complete option suffix and convert the
remaining prefix to a lowercase ID with hyphens. This produces error fields such
as `moonshot-cn.resultLimit` without changing the environment key used to read values.
Do not prepend an application prefix or introduce an unrelated suffix for new settings.

When retaining an existing environment alias or another naming scheme, explicitly
pass the provider short ID as the final `namespace` argument to either helper.
If the option suffix does not match, automatic inference falls back to the first
environment segment and may lose a multi-part provider ID. The namespace override
only labels errors; it does not rename the environment variable or change configuration
precedence. Add tests for the error field, environment fallback and explicit-option
priority, and document defaults and environment mappings in both technical references.

All search adapters use `resultLimit` / `*_RESULT_LIMIT` for the optional user cap.
`configCountPolicy` returns separate `configuredLimit`, `fallbackCount` and
`providerMax` fields. Declare compatibility aliases through `legacyOption` and
`legacyEnv`: the default aliases are `maxResults` / `*_MAX_RESULTS`, while Querit
uses `count` / `QUERIT_COUNT`. New options beat old options; either beats environment
values, where the new nonblank name beats its alias. Keep protocol fields such as
Linkup's `maxResults` and Querit's upstream `count` unchanged.
