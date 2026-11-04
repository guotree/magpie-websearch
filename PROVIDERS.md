# Providers

This plugin adds search services to magpie. The roadmap includes providers that
have no built-in search API or provider preset in the official source reviewed
below.

## Supported

| Display name | magpie ID | Implementation | Key |
|---|---|---|---|
| AnySearch (magpie-websearch) | `magpie-websearch:anysearch` | [anysearch.mjs](src/providers/anysearch.mjs) | optional |
| Keenable (magpie-websearch) | `magpie-websearch:keenable` | [keenable.mjs](src/providers/keenable.mjs) | optional |
| Linkup (magpie-websearch) | `magpie-websearch:linkup` | [linkup.mjs](src/providers/linkup.mjs) | required |
| Querit (magpie-websearch) | `magpie-websearch:querit` | [querit.mjs](src/providers/querit.mjs) | required |
| TinyFish (magpie-websearch) | `magpie-websearch:tinyfish` | [tinyfish.mjs](src/providers/tinyfish.mjs) | optional |

Every search definition's `name` must follow `<Provider> (magpie-websearch)`.
This suffix identifies the plugin in magpie's GUI and CLI. Keep the short API ID
and the namespaced vendor ID independent of the display name; suffix changes
must not rename the IDs used by saved keys, switches, order or plugin options.

All five APIs are registered by default. `enable` and `disable` are optional
plugin options that filter this list by short ID (`linkup`, for example).
`disable` takes precedence over `enable`; `enable: []` registers none, while
`disable: []` excludes none. Provider settings such as `linkup.depth` do not
restrict registration by themselves. magpie manages keys, request order and
on/off switches for the registered APIs. See [README](README.md#optional-registration-filters)
for the full behavior and configuration examples.

AnySearch, Keenable and TinyFish declare `keyOptional: true`, so magpie accepts
them with an empty key and considers them ready for search. Their anonymous requests omit
authentication headers; Keenable selects the `/public` endpoint and sends
`X-Keenable-Title`. TinyFish uses POST `https://agent.tinyfish.ai/mcp`, JSON-RPC
`tools/call` for `search`, with `X-TinyFish-Access-Mode: keyless`. A supplied key
selects GET `https://api.search.tinyfish.ai/` with `X-API-Key`; failures do not
downgrade to anonymous. Anonymous 429 cooldowns are maintained per API instance and
final endpoint, respecting `Retry-After` with a 60-second default. Keyed requests
and other endpoints are independent of that cooldown. See
[anonymous search](README.md#anonymous-search) for setup and switching modes.

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
  JSON or SSE. Its transport is scoped to TinyFish in
  [tinyfish-mcp.mjs](src/providers/tinyfish-mcp.mjs), not a general MCP client.
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
  See [README](README.md#tinyfish-search) for configuration and switching modes.

## Planned

These candidates are not implemented. IDs are provisional; authentication,
endpoint details and available features must be verified before implementation.

| Provider | Proposed magpie ID |
|---|---|
| Bocha | `magpie-websearch:bocha` |
| Jina | `magpie-websearch:jina` |
| Kagi | `magpie-websearch:kagi` |
| Metaso | `magpie-websearch:metaso` |
| Parallel | `magpie-websearch:parallel` |
| Perplexity | `magpie-websearch:perplexity` |
| SerpApi | `magpie-websearch:serpapi` |
| Serper | `magpie-websearch:serper` |

The candidate list was checked on **2026-11-04** against magpie commit
[`4ca55c6`](https://github.com/yetone/magpie/tree/4ca55c6b62eeac30351b17ae37ad4f4dad9fd8e8).
Before adding TinyFish, support was rechecked on the same date at
[`cd83c314`](https://github.com/yetone/magpie/tree/cd83c3147fea120c53f789e5e80263fc5de66692).
TinyFish was absent from that revision's
[built-in search APIs](https://github.com/yetone/magpie/blob/cd83c3147fea120c53f789e5e80263fc5de66692/internal/provider/search_api.go)
and [provider presets](https://github.com/yetone/magpie/blob/cd83c3147fea120c53f789e5e80263fc5de66692/internal/provider/presets.go).

A provider is excluded from the roadmap if it exists in either list, even when
its official preset is for model access rather than a standalone search API.
Check both lists again before starting an integration, and remove candidates
that magpie has since added. A custom user-configured endpoint is not a built-in
integration.

## Adding a provider

1. Check official magpie support and the provider's current API documentation.
2. Implement `execute({ query, count, key, url }, ctx)`. Use the supplied key,
   honor the custom Base URL, and cap `count` according to the API's limits.
   If upstream has no count parameter, cap valid results locally and document
   endpoint/protocol differences (TinyFish uses complete custom endpoints).
3. Return `{ title, url, text, age? }` results. Drop entries without a URL and
   preserve the provider's date string when available.
4. Preserve `ctx.abort` and apply the configured request timeout. Throw errors
   with a numeric `status` for HTTP refusals and carry `retryAfter` on 429.
5. Create settings and cache per plugin instance. Isolate cache entries by
   final endpoint, key digest and all request parameters.
6. Add optional provider settings with environment fallback and document their
   defaults in README. magpie continues to own API keys.
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
