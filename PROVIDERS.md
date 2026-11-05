# Providers

This plugin adds search services to magpie. The roadmap includes standalone
web search APIs that magpie has not already integrated in the official source
reviewed below. A model provider preset alone does not cover a vendor's
standalone search API.

## Supported

| Display name | magpie ID | Implementation | Key |
|---|---|---|---|
| AnySearch (magpie-websearch) | `magpie-websearch:anysearch` | [anysearch.mjs](src/providers/anysearch.mjs) | optional |
| Keenable (magpie-websearch) | `magpie-websearch:keenable` | [keenable.mjs](src/providers/keenable.mjs) | optional |
| Linkup (magpie-websearch) | `magpie-websearch:linkup` | [linkup.mjs](src/providers/linkup.mjs) | required |
| Metaso (magpie-websearch) | `magpie-websearch:metaso` | [metaso.mjs](src/providers/metaso.mjs) | required |
| Parallel (magpie-websearch) | `magpie-websearch:parallel` | [parallel.mjs](src/providers/parallel.mjs) | optional |
| Querit (magpie-websearch) | `magpie-websearch:querit` | [querit.mjs](src/providers/querit.mjs) | required |
| SerpApi (magpie-websearch) | `magpie-websearch:serpapi` | [serpapi.mjs](src/providers/serpapi.mjs) | required |
| TinyFish (magpie-websearch) | `magpie-websearch:tinyfish` | [tinyfish.mjs](src/providers/tinyfish.mjs) | optional |
| Moonshot (magpie-websearch) | `magpie-websearch:moonshot` | [moonshot.mjs](src/providers/moonshot.mjs) | required |
| Moonshot CN (magpie-websearch) | `magpie-websearch:moonshot-cn` | [moonshot-cn.mjs](src/providers/moonshot-cn.mjs) | required |

Every search definition's `name` must follow `<Provider> (magpie-websearch)`.
This suffix identifies the plugin in magpie's GUI and CLI. Keep the short API ID
and the namespaced vendor ID independent of the display name; suffix changes
must not rename the IDs used by saved keys, switches, order or plugin options.

All ten APIs are registered by default. `enable` and `disable` are optional
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
- Public search caps results at 20. The adapter caps requests to `sizeFor(count, maxResults, 20)`.
- Excerpts are joined with `\n\n` and trimmed to `contentChars` (default 4000 code points,
  0 keeps all). `publish_date` maps to `age`.
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
  [mcp.mjs](src/mcp.mjs), not a general MCP client.
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
- Results are read from `webpages` (or fallback `results`), mapping `link` to `url`,
  `snippet` to `text`, and `date` to `age`.
- Supports configurable search scope (`webpage`, `document`, `paper`, `image`, `video`, `podcast`).
- Public search caps results at 50 (`sizeFor(count, maxResults, 50)`).

### SerpApi protocol notes

- The [Google Search Engine Results API](https://serpapi.com/search-api) documents
  authenticated GET search at `https://serpapi.com/search`.
- SerpApi requires an API key and has no anonymous path. The key is passed via the `api_key`
  query parameter.
- Only the first page of `organic_results` is mapped: `link` to `url`, `title` to `title`,
  `snippet` to `text`, and string `date` to `age`. Other SERP blocks and hits lacking
  a valid link are ignored; malformed optional snippets become empty text.
- Google deprecated the `num` parameter in September 2025; results are retrieved as returned
  by upstream and locally capped (`sizeFor(count, maxResults, 10)`).
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
- Basic search accepts `text_query` and `limit` (1–20, capped via `sizeFor(count, maxResults, 20)`). The initial release does not expose Pro search, responses API, formula API, or model-integrated search.
- Response payloads must contain a `search_results` array. Results map `url` to `url`, non-empty `title` to `title` (fallback to URL), and string `date` to `age`.
- Results default to snippet text (`content: "snippet"`). When `content: "full"` is selected, requests include `"include_content": true`, and nonblank string `text` is preferred over `snippet` while preserving whitespace and markdown indentation. Both modes cap text to `contentChars` (default 4000 code points, 0 disables local truncation; Magpie still applies its own text limit).
- On HTTP 429, standard `Retry-After` takes precedence, including zero. The fallback `X-RateLimit-Reset` conversion accepts delays of 1–86400 seconds; invalid or excessive values are omitted for host defaults. Official timestamps use Unix seconds; plausible proxy millisecond timestamps are tolerated within the same window. This bound is a local defensive policy, not an upstream quota guarantee; see the [Moonshot reference](docs/technical-reference.en.md#moonshot-search) for conversion rules.
- Official billing applies to HTTP 200 with a non-empty upstream `search_results` array ($0.002/search internationally before applicable taxes, ¥0.01/search domestically). Local filtering or truncation does not reduce that charge. Search rate limits are independent of model RPM/TPM limits.
- Both adapters have passed dummy-key local simulations and Magpie host checks. Successful searches, full text, latency, rate limiting and search quality with real account keys have not been verified on either site.

## Planned

These candidates are not implemented. IDs are provisional; authentication,
endpoint details and available features must be verified before implementation.

| Provider | Proposed magpie ID |
|---|---|
| Bocha | `magpie-websearch:bocha` |
| Jina | `magpie-websearch:jina` |
| Kagi | `magpie-websearch:kagi` |
| Ollama | `magpie-websearch:ollama` |
| Perplexity | `magpie-websearch:perplexity` |
| Serper | `magpie-websearch:serper` |
| StepFun (China) | `magpie-websearch:stepfun` |
| Z.ai | `magpie-websearch:zai` |
| Zhipu (China) | `magpie-websearch:zhipu` |

The candidate list was checked on **2026-11-05** against magpie commit
[`6abacd46`](https://github.com/yetone/magpie/tree/6abacd46c3433f811b32d72c3bfe7a49e78b3d87).
None of the planned candidates appears in that revision's
[built-in search APIs](https://github.com/yetone/magpie/blob/6abacd46c3433f811b32d72c3bfe7a49e78b3d87/internal/provider/search_api.go).
Ollama, StepFun, Z.ai and Zhipu have
[model provider presets](https://github.com/yetone/magpie/blob/6abacd46c3433f811b32d72c3bfe7a49e78b3d87/internal/provider/presets.go),
but their standalone search APIs remain candidates for evaluation.

Exclude a candidate from the roadmap only when magpie already integrates the
corresponding standalone web search API. A model provider preset or a model's
built-in search capability is not sufficient: neither establishes that magpie
can call the vendor's standalone search API independently of the selected model.
Before starting an integration, recheck magpie's official search support and
remove candidates whose corresponding search API magpie has since integrated.
A custom user-configured endpoint is not a built-in integration.

## Adding a provider

1. Check official magpie support and the provider's current API documentation.
2. Implement `execute({ query, count, key, url }, ctx)`. Use the supplied key,
   honor the custom Base URL (exact endpoint across all providers), and cap `count`
   according to the API's limits. If upstream has no count parameter, cap valid results
   locally.
3. Return `{ title, url, text, age? }` results. Drop entries without a URL and
   preserve the provider's date string when available.
4. Preserve `ctx.abort` and apply the configured request timeout. Throw errors
   with a numeric `status` for HTTP refusals and carry `retryAfter` on 429.
5. Create settings and cache per plugin instance. Isolate cache entries by
   final endpoint, key digest and all request parameters.
6. Add optional provider settings with environment fallback and document their
   defaults in both technical references. Follow the [configuration naming rules](#configuration-naming)
   below. magpie continues to own API keys.
7. For APIs that support anonymous requests, set `keyOptional: true`, omit empty
   authentication headers and select the documented anonymous endpoint. Keep an
   anonymous 429 cooldown per final endpoint because magpie does not rest empty
   keys. Preserve keyed behavior without silently downgrading failed keys.
8. Register the API by default while preserving the optional `enable`/`disable`
   filters (`disable` wins). Use short IDs for those filters and update the
   registration checks. Set `name` to `<Provider> (magpie-websearch)` and keep
   vendor IDs stable. magpie owns request ordering and its own on/off switches.
9. Add response fixtures and tests for request mapping, custom URLs, cache
   isolation and errors. Run Node, Bun and the magpie host checks.
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
| `moonshot-cn` | `maxResults` | `MOONSHOT_CN_MAX_RESULTS` |
| `moonshot-cn` | `cacheTTL` | `MOONSHOT_CN_CACHE_TTL` |
| `moonshot-cn` | `contentChars` | `MOONSHOT_CN_CONTENT_CHARS` |

`configInt` and `configStr` strip the complete option suffix and convert the
remaining prefix to a lowercase ID with hyphens. This produces error fields such
as `moonshot-cn.maxResults` without changing the environment key used to read values.
Do not prepend an application prefix or introduce an unrelated suffix for new settings.

When retaining an existing environment alias or another naming scheme, explicitly
pass the provider short ID as the final `namespace` argument to either helper.
If the option suffix does not match, automatic inference falls back to the first
environment segment and may lose a multi-part provider ID. The namespace override
only labels errors; it does not rename the environment variable or change configuration
precedence. Add tests for the error field, environment fallback and explicit-option
priority, and document defaults and environment mappings in both technical references.
