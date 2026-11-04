# Parallel integration plan

Status: proposed; no provider implementation yet. Researched on **2026-11-04**.

Add `parallel` as an optional-key search provider: anonymous requests use the
official Parallel MCP server, while requests with a key use the GA Search REST
API. Follow the existing TinyFish access selection and the shared provider
configuration, cache, cancellation and error contracts. Keep the package free
of runtime dependencies.

## Eligibility and repository conventions

Parallel is absent from both magpie's built-in search vendors and provider
presets at commit
[`f177c36a`](https://github.com/yetone/magpie/tree/f177c36a9bce287a735b01ef4c1a65fcbeaac559).
Both files were checked in full, including a case-insensitive search of the
presets. This satisfies the eligibility rule in `PROVIDERS.md`; recheck if
implementation happens against a newer magpie revision.

Use these identifiers:

| Field | Value |
|---|---|
| Short ID / provider options | `parallel` |
| Vendor ID | `magpie-websearch:parallel` |
| Display name | `Parallel (magpie-websearch)` |
| Factory | `createParallel(options = {})` |
| Key creation URL | `https://platform.parallel.ai` |
| Optional key | `keyOptional: true` |

Register by default, between Linkup and Querit, consistent with the existing
alphabetical registry. Preserve `enable`/`disable`, including disabled providers
not being initialized. magpie continues to own saved keys, order, switches and
key rotation. Do not read `PARALLEL_API_KEY` inside the adapter: SDK examples use
that variable, but this repository receives credentials through `execute`.

## Verified protocol and version differences

### REST with a key

Use `POST https://api.parallel.ai/v1/search`, with `x-api-key`,
`Content-Type: application/json` and `Accept: application/json`.

The current GA contract differs from widely indexed beta examples:

| Concern | GA contract |
|---|---|
| Endpoint | `/v1/search`; no beta header needed |
| Queries | Required `search_queries: string[]`, at least one non-empty query |
| Objective | Optional `objective: string` |
| Modes | `turbo`, `fast`, `basic`, `advanced`; upstream default is `advanced` |
| Result count | `advanced_settings.max_results` |
| Per-result excerpt budget | `advanced_settings.excerpt_settings.max_chars_per_result` |
| Total excerpt budget | Top-level `max_chars_total` |
| Source filters | `advanced_settings.source_policy` |
| Geography | `advanced_settings.location` |
| Live-fetch policy | `advanced_settings.fetch_policy`; omitted means index content |

Do not send beta top-level `max_results`, `excerpts`, `source_policy` or
`fetch_policy`, or deprecated `processor`. Custom services must accept the GA
request and response shapes; changing the URL does not select a beta serializer.

The best-practices guide specifies at most five keyword queries of at most 200
characters each, and an objective of at most 5000 characters. These limits are
not all encoded in the OpenAPI schema. The advanced-settings guide states that
public Search modes currently cap results at **20**; larger requests are
reduced with a warning. Do not inherit another provider's 100-result limit.

### MCP without a key

Use `POST https://mcp.parallel.ai/mcp`, with
`Accept: application/json, text/event-stream` and JSON content type. Omit
authentication, TinyFish's keyless header and Parallel configuration headers.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "web_search",
    "arguments": {
      "objective": "Parallel Search API documentation",
      "search_queries": ["Parallel Search API documentation"]
    }
  }
}
```

The anonymous `tools/list` schema requires both `objective` and `search_queries`.
It also accepts optional `client_model` and `session_id`, but not mode, count,
excerpt settings or arbitrary advanced settings. Omit model and session fields:
the host search hook supplies neither an authoritative consuming model nor a
task-scoped session identifier.

The official MCP guide documents free anonymous access at lower, unspecified
rate limits. `web_search` defaults to `fast`. Custom override headers require
authentication. Authenticated MCP is available, but REST offers a simpler direct
mapping for the keyed path.

Live observations on the research date, without credentials or cookies:

- `initialize`, `tools/list` and a standalone `tools/call` each returned HTTP 200
  over SSE. Independent calls succeeded without sending a prior session ID.
- English and Chinese searches returned results. Responses included both
  `result.structuredContent.results` and JSON in `result.content[].text`.
- The existing `callTinyfishTool` successfully parsed the Chinese Parallel
  response with `label: "Parallel"` and no vendor-specific headers. It returned
  ten results; this observation is not a guaranteed page size.
- Responses supplied `mcp-session-id`, but no handshake or session reuse was
  necessary for these one-call searches. Do not store it as conversation state.
- REST without a key returned HTTP 401. An anonymous MCP request with
  `x-parallel-mcp-config` also returned HTTP 401. The MCP guide describes the
  latter as 400; preserve the actual HTTP status instead of hardcoding either.

These observations support a small stateless transport. They do not establish
an exact anonymous quota or a successful authenticated REST search.

## Proposed first-version behavior

### Access and URL selection

Trim the supplied key. An empty key selects MCP; a non-empty key selects REST.
A rejected key never triggers an anonymous retry.

| Access | Empty Base URL | Custom Base URL |
|---|---|---|
| Anonymous | `https://mcp.parallel.ai/mcp` | Complete MCP endpoint, used as given |
| With a key | `https://api.parallel.ai/v1/search` | Existing `searchEndpoint` rules |

For REST, an origin becomes `/v1/search`, a prefix preserves its path, `/v1`
gets `/search`, and a complete `/search` endpoint stays unchanged. For anonymous
MCP, append nothing. Validate both as HTTP(S) without URL credentials, query
strings or fragments, following the existing helpers.

Document the custom-URL protocol distinction alongside TinyFish. A user
switching access modes may need to update their custom endpoint. Keep REST URL
handling in `searchEndpoint`; do not change its behavior for existing providers.

The enterprise EU REST endpoint can be selected through Base URL, but requires
`mode: "basic"` and an eligible account. Do not silently change modes or route
failed EU requests to another region. MCP is not available at the EU endpoint.

### Mapping the host's single query

Normalize with `normalizeQuery`. For both paths, send the normalized string as
`objective` and the sole member of `search_queries`. This preserves the host's
query and satisfies MCP's required fields without inventing extra queries or
making an additional model call. It cannot express separate task context and
multiple keyword variants; that would require a richer host search contract.

Validate a non-empty query of at most **200 Unicode code points** before fetching.
Use the documented keyword-query limit, even though the objective accepts more.
Reject longer input with a clear provider error; do not silently truncate or
split it into unrelated queries. The 3–6 word recommendation is guidance, not a
local validation rule, especially for Chinese queries. Keep operators as given.

### Configuration

Use explicit option → environment variable → default, evaluated at factory
creation. Reuse `configInt` and `configStr`; preserve their existing explicit
validation and environment fallback behavior.

| Option | Environment variable | Default | Meaning |
|---|---|---|---|
| `cacheTTL` | `PARALLEL_CACHE_TTL` | `600000` | Milliseconds; 0 disables caching |
| `timeout` | `PARALLEL_TIMEOUT` | `25000` | Milliseconds, 0–2147483647; 0 leaves only the host deadline |
| `maxResults` | `PARALLEL_MAX_RESULTS` | `10` | Integer 1–20; cap on host count and local results |
| `contentChars` | `PARALLEL_CONTENT_CHARS` | `4000` | Code points per joined excerpt; 0 keeps all returned text |
| `mode` | `PARALLEL_MODE` | `fast` | `turbo`, `fast`, `basic`, `advanced`; REST selection |

`contentChars` follows Linkup's option name and zero semantics. On REST,
a positive value also sets `advanced_settings.excerpt_settings.max_chars_per_result`;
zero omits that upstream setting rather than sending zero. Apply the local
code-point cap to both paths, appending `…` when truncated, as Linkup does.
Zero does not request full page content or unlimited upstream excerpts.

Anonymous MCP has a server-controlled mode. Allow `fast`; if the configured
mode is another value and no key was supplied, fail before fetching with an
actionable message that this mode requires a key. Validate this at execution,
since the factory does not know which key will be supplied. This avoids an
option silently doing nothing. `maxResults` and `contentChars` work locally in
anonymous mode; do not send them as MCP arguments or override headers.

Explicitly choose `fast`, matching Parallel's recommendation for most agents
and its MCP default. Official figures are about 700 ms and $1/1000 REST requests,
versus about 1 s / $5 for `basic` and 3 s / $5 for `advanced`. They are vendor
estimates, not adapter guarantees. `basic` offers longer excerpts; `advanced`
offers deeper retrieval. `turbo` has documented English/Japanese coverage only.
The successful Chinese anonymous call does not establish comparative Chinese
quality; recommend evaluating keyed `basic`/`advanced` for multilingual needs.

Do not expose `max_chars_total` initially: the per-result budget and result cap
already bound expected output. Likewise defer location, source/date filters,
live-fetch policy, client model, session IDs, Extract, Responses and Task APIs.
They add configuration or task state beyond this small search adapter.

If source filters are added later, account for their actual contract:
`include_domains`/`exclude_domains` are arrays with a combined 200-entry limit;
a non-empty include list overrides excludes. They accept domains, extensions
and path prefixes, but paths are unsupported in `turbo`. `after_date` uses
`YYYY-MM-DD`. Geography is separate from language. Live-fetch freshness is
separate from the plugin's cache TTL and increases latency.

### Request and result mapping

For host `count: 6` with default options, the REST body is:

```json
{
  "objective": "Parallel Search API documentation",
  "search_queries": ["Parallel Search API documentation"],
  "mode": "fast",
  "advanced_settings": {
    "max_results": 6,
    "excerpt_settings": { "max_chars_per_result": 4000 }
  }
}
```

Both paths use the same search result shape:

```json
{
  "search_id": "search_example",
  "results": [{
    "url": "https://docs.parallel.ai/search/search-quickstart",
    "title": "Search API Quickstart",
    "publish_date": "2026-11-04",
    "excerpts": ["First relevant passage", "Second relevant passage"]
  }],
  "session_id": "session_example"
}
```

Require a `results` array; malformed success bodies are errors and must not
be cached as empty results. For MCP, prefer `structuredContent` with a results
array, then try JSON in text content parts, as TinyFish does. Check JSON-RPC
and tool errors before mapping content.

Drop URL-less/null entries, preserve upstream order, then slice to
`sizeFor(count, maxResults, 20)` on both paths, even when REST should honor the
requested count. Use `page(title, url, text, publish_date)`. Build `text` from
string entries in `excerpts`, joined with `\n\n`, then apply `contentChars`.
Missing excerpts produce empty text; never stringify malformed objects.
Preserve non-empty string dates as `age` without parsing or substituting fetch
times. Missing titles fall back to the URL through `page`.

Ignore unknown metadata fields, including observed MCP `metadata`. Do not put
`search_id`, `session_id`, usage or warnings in page text. Non-fatal warnings
do not invalidate useful results. Initially leave their reporting out of the
page contract; settings exposed by this plan avoid known upstream coercions.

magpie currently asks for six results, cleans and collapses text, then cuts it
to **1500 bytes** per page. A 4000-code-point excerpt budget leaves room for
upstream excerpt selection, but is not a promise that the consuming model gets
all 4000 characters. Longer excerpts and full-page extraction do not bypass
the host's limit. Relevant evidence should appear early in the returned text.

### Cache, deadlines and failures

- Keep settings, `makeCache` and `makeAnonymousCooldown("Parallel")` per factory
  instance. Cache only successfully mapped pages, using the existing short TTL
  for empty results and bounded entry count.
- Hash mode of access, final endpoint, effective request arguments, local
  result/text caps and key through `cacheKey`. REST mode is already part of the
  body. Equivalent normalized queries and effective counts can reuse results;
  different keys, protocols, endpoints or settings cannot.
- Check cache before anonymous cooldown. Preserve cached results during a
  cooldown; a keyed request never enters it. Respect HTTP 429 `Retry-After`
  seconds/dates, with the shared 60-second fallback even when cache is off.
- Reuse `requestJSON` for REST and `requestResponse` for MCP so `ctx.abort`,
  timeout and cancellation apply through response-body consumption.
- Preserve actual numeric HTTP status and `retryAfter`. magpie owns keyed
  refusal handling for 401/402/403/429. Keep HTTP 422/5xx as errors, not empty
  results. Do not add adapter retries or sleeps inside the host deadline.
- JSON-RPC codes and MCP `isError` are protocol/tool failures, not HTTP status
  codes. Do not infer a 429 from error text. Anonymous cooldown can only be
  promised for an actual HTTP 429; other tool-level quota failures still throw.

## Implementation sequence and affected files

1. **Share the proven MCP transport.** Move the narrow stateless JSON/SSE
   implementation from `src/providers/tinyfish-mcp.mjs` to `src/mcp.mjs`, rename
   its function to `callMCPTool`, and update TinyFish's import. Move its parser
   tests to `test/mcp.test.mjs`, retaining coverage for chunked SSE, CR/LF,
   request IDs, malformed messages, tool failures, cancellation and deadlines.
   Keep vendor response extraction in each adapter. This is a reusable
   `tools/call` transport, not a complete MCP client or session manager.
2. **Add the adapter.** Create `src/providers/parallel.mjs` with the five
   settings, endpoint selection, shared query/result mapping and both access
   paths. Register `createParallel` in `index.mjs`, keeping its single exported
   plugin function. No shared configuration or URL helper redesign is needed.
3. **Add fixtures and contract coverage.** Add `PARALLEL_CASE` and an MCP envelope
   to `test/cases.mjs`; create `test/parallel.test.mjs`. Update default registry
   expectations in `test/index.test.mjs` and `scripts/check.mjs`. Extend the
   fixture-driven tests in `test/search-contract.test.mjs`, including its count
   assertion to read `body.advanced_settings?.max_results`.
4. **Exercise host behavior.** Extend `scripts/smoke-magpie.mjs` with a separate
   Parallel fake route, extracting the query from `body.search_queries[0]` or
   MCP arguments. Verify anonymous/keyed paths, headers, options, custom URLs,
   mapped excerpts/dates, count limits, anonymous 429 cooldown and host fallback.
   Update default and optional-key registry expectations to include Parallel.
5. **Update package and user docs.** Update explicit test filenames in
   `package.json` for the added provider and moved MCP tests; add Parallel to
   its description and keywords. Move Parallel from planned to supported in
   `PROVIDERS.md`. Update README provider/key lists, six-provider counts,
   configuration table, CLI examples, filter IDs, anonymous behavior and URL
   exceptions. Explain the fixed anonymous mode and the 200-character limit.

Useful targeted cases for the provider tests:

- Correct GA nesting and `x-api-key`; no beta fields or empty auth headers.
- Anonymous JSON and SSE responses, structured result and JSON-text fallback;
  no initialize call, session dependency or TinyFish header.
- Multiple excerpts, null title/date, empty excerpts, malformed excerpt members,
  missing URLs, upstream overflow and filtering before the count cap.
- ASCII/Chinese/emoji queries at 200/201 code points; whitespace normalization;
  zero/positive text cap without cutting a surrogate pair.
- Each REST mode, anonymous rejection of non-fast mode, invalid options,
  environment fallback and disabled-provider initialization behavior.
- Cache identity across keys, URLs, access modes and effective counts; instance
  isolation, empty results and disabled cache.
- HTTP 401/402/403/422/429/5xx, Retry-After seconds/date, invalid JSON, malformed
  MCP envelopes, RPC/tool errors, request timeout and streaming cancellation.

Run `npm run check`, `npm run check:bun` and `npm run smoke:magpie`, following
the repository's existing checks. CI also exercises the unpacked npm package;
the planned design document need not be added to published package files.
Use dummy keys and local upstreams for automated checks. Record any unavailable
runtime explicitly. A real keyed REST success remains a separate validation
item when an account key is supplied; never describe fixture success as live
authentication validation.

## Sources

- [GA Search API reference and OpenAPI](https://docs.parallel.ai/api-reference/search/search.md)
- [Beta-to-GA migration](https://docs.parallel.ai/search/search-migration-guide.md)
- [Search quickstart](https://docs.parallel.ai/search/search-quickstart.md)
- [Query guidance and limits](https://docs.parallel.ai/search/best-practices.md)
- [Search modes, pricing and language notes](https://docs.parallel.ai/search/modes.md)
- [Advanced settings and 20-result cap](https://docs.parallel.ai/search/advanced-search-settings.md)
- [MCP authentication, tool schema and override restrictions](https://docs.parallel.ai/integrations/mcp/quickstart.md)
- [Source policy](https://docs.parallel.ai/resources/source-policy.md)
- [Pricing](https://docs.parallel.ai/getting-started/pricing.md)
- [Rate limits](https://docs.parallel.ai/getting-started/rate-limits.md)
- [EU endpoint requirements](https://docs.parallel.ai/resources/eu-data-residency.md)
- [magpie search vendors at reviewed commit](https://github.com/yetone/magpie/blob/f177c36a9bce287a735b01ef4c1a65fcbeaac559/internal/provider/search_api.go)
- [magpie provider presets at reviewed commit](https://github.com/yetone/magpie/blob/f177c36a9bce287a735b01ef4c1a65fcbeaac559/internal/provider/presets.go)
- [magpie count, text limit and plugin mapping](https://github.com/yetone/magpie/blob/f177c36a9bce287a735b01ef4c1a65fcbeaac559/internal/gateway/search_api.go)
- Local implementation references: `src/core.mjs`, `src/providers/linkup.mjs`,
  `src/providers/tinyfish.mjs`, `src/providers/tinyfish-mcp.mjs`,
  `test/search-contract.test.mjs` and `scripts/smoke-magpie.mjs`.
