# Technical reference

[中文说明](technical-reference.md) | [English](technical-reference.en.md) · [Back to README](../README.en.md)

This page covers configuration, protocols, result handling and development
checks. See the [README](../README.en.md) for installation and quick start, and
[PROVIDERS.md](../PROVIDERS.md) for support status and integration guidelines.

- [Setup](#setup)
- [Custom Base URL](#custom-base-url)
- [CLI management](#cli)
- [Anonymous search and rate limits](#anonymous-search)
- [Parallel](#parallel-search), [TinyFish](#tinyfish-search), [SerpApi](#serpapi-search), [Moonshot and Moonshot CN](#moonshot-search), [Zhipu and Z.ai](#zhipu-search), [StepFun](#stepfun-search), [Perplexity](#perplexity-search), [Bocha](#bocha-search), [Ollama](#ollama-search), [Jina](#jina-search), [Kagi](#kagi-search), and [Serper](#serper-search) protocols
- [Magpie result processing](#result-processing)
- [Full configuration reference](#configuration)
- [Registration filters](#registration-filters)
- [Development and local tests](#development)

<a id="setup"></a>

## Setup

### In the app

In the app: **Settings › Models › Web search**, add each API you want, switch it
on, and order it. Leave the key empty for anonymous AnySearch, Keenable, Parallel
or TinyFish, or provide a key to use your account. Bocha, Jina, Kagi, Linkup, Metaso, Moonshot, Moonshot CN, Ollama, Perplexity, Querit, SerpApi, Serper, StepFun, Z.ai and Zhipu require a key.

No plugin options are required. With no registration filters, all nineteen APIs are
registered; magpie's Web search settings decide which are configured and used.

<a id="custom-base-url"></a>

## Custom Base URL

The optional **Base URL** field routes requests to your own compatible service or proxy.
Leave it empty for the official vendor API. **When provided, the plugin treats the custom
URL as the exact endpoint destination and sends requests directly to that address, without
heuristically appending paths.** For example, if your proxy serves Linkup search at
`https://search.example.com/proxy/v1/search`, enter that complete address. If an endpoint
serves requests at its root, enter `https://proxy.example.com/`.

HTTP and HTTPS are supported; credentials, query strings and fragments in the address are
rejected. Keep the API key in magpie's key field.

For dual-mode providers (Parallel and TinyFish), if you switch between anonymous (MCP)
and keyed access, ensure your custom address matches the selected protocol
(for example, `/mcp` anonymously or a search endpoint with a key); leave it empty to
select the appropriate official endpoint automatically. See [Parallel search](#parallel-search)
and [TinyFish search](#tinyfish-search) for wire formats and capability details.

<a id="cli"></a>

## CLI management

```sh
# AnySearch, Keenable, Parallel and TinyFish: no key needed for anonymous search
magpie search add magpie-websearch:anysearch
magpie search add magpie-websearch:keenable
magpie search add magpie-websearch:parallel
magpie search add magpie-websearch:tinyfish

# Or supply a key to use your account
magpie search add magpie-websearch:anysearch <key>
magpie search add magpie-websearch:keenable <key>
magpie search add magpie-websearch:parallel <key>
magpie search add magpie-websearch:tinyfish <key>

# Bocha: API key from the open platform is required
magpie search add magpie-websearch:bocha <key>

# Jina and Kagi: each service requires its own API key
magpie search add magpie-websearch:jina <key>
magpie search add magpie-websearch:kagi <key>

# Linkup: a key is required
magpie search add magpie-websearch:linkup <key>

# Metaso: a key is required
magpie search add magpie-websearch:metaso <key>

# Moonshot (international): a key is required
magpie search add magpie-websearch:moonshot <key>

# Moonshot CN (domestic): a key is required
magpie search add magpie-websearch:moonshot-cn <key>

# Ollama: cloud account API key required
magpie search add magpie-websearch:ollama <key>

# Perplexity: official Search API Key required
magpie search add magpie-websearch:perplexity <key>

# Querit: a key is required
magpie search add magpie-websearch:querit <key>

# SerpApi: a key is required
magpie search add magpie-websearch:serpapi <key>

# Serper: a separate API key from SerpApi
magpie search add magpie-websearch:serper <key>

# StepFun China: a key from the domestic Open Platform is required
magpie search add magpie-websearch:stepfun <china-key>

# Zhipu (China) and Z.ai (international): each site's own Standard API Key
magpie search add magpie-websearch:zhipu <china-key>
magpie search add magpie-websearch:zai <international-key>

# A compatible endpoint of your own
magpie search add magpie-websearch:linkup <key> url=https://search.example.com/proxy/v1/search
```

Several keys for one API are separated by commas; magpie takes them in turn and rests one the vendor refuses:

A resting key is tried after healthy keys of the same API rather than disabled.
The host can still try it when it is the only key or all keys are resting.

```sh
magpie search add magpie-websearch:linkup key1,key2
```

Order, switch off, or remove:

```sh
magpie search move magpie-websearch:anysearch 1
magpie search off magpie-websearch:keenable
magpie search on magpie-websearch:keenable
magpie search rm magpie-websearch:linkup
```

`magpie search` lists every API magpie knows, including the ones this plugin gives.

<a id="anonymous-search"></a>

## Anonymous search and rate limits

AnySearch uses the same search endpoint without an Authorization header.
Keenable uses `/v1/search/public` without an API key, with the application title
configured by `keenable.title`. Parallel calls its hosted MCP search with no API
key or OAuth credentials. TinyFish calls its hosted MCP search with
`X-TinyFish-Access-Mode: keyless` and no API key or OAuth credentials. All four
support leaving the key empty in the GUI because the plugin declares
`keyOptional: true`.

An invalid or exhausted configured key is reported as a failure; the plugin
does not silently retry anonymously. For an existing keyed entry, leaving the
key field empty keeps its saved key. To switch it to anonymous mode, remove the
entry and add it again without a key; reapply any custom address, order and
on/off setting as needed.

AnySearch and Keenable anonymous quotas are shared by clients using the same
public IP. Parallel and TinyFish anonymous quota scopes and exact limits have
not been verified. For all four APIs, on an HTTP 429 the plugin pauses new anonymous
requests to that API's final endpoint for the
`Retry-After` duration (seconds or an HTTP date), or 60 seconds if the header is
missing, invalid or already expired. During the pause it returns a 429 without
fetching, allowing magpie to try the next configured API. Cached results remain
usable, and supplying a key bypasses the anonymous pause. Cooldowns are kept in
memory per plugin instance, reset when the host reloads, and remain active even
when `cacheTTL` is zero.

<a id="parallel-search"></a>

## Parallel search

Parallel has two access paths, selected by the key magpie supplies:

| Access | Default endpoint | Request |
|---|---|---|
| Anonymous (empty key) | `https://mcp.parallel.ai/mcp` | POST JSON-RPC `tools/call`, tool `web_search` |
| With a key | `https://api.parallel.ai/v1/search` | POST with `x-api-key` and nested `advanced_settings` |

Anonymous requests directly call `web_search` without a session handshake.
The plugin reads JSON or SSE responses, checks JSON-RPC and tool errors,
then extracts search results from structured content or text content parts.
Keyed requests use the GA `/v1/search` endpoint with `x-api-key`. Both paths accept
a normalized query of 1–200 characters (Parallel's keyword query limit).

Parallel's MCP server defaults to `fast` mode. If `parallel.mode` is configured to
another mode (`turbo`, `basic` or `advanced`), anonymous requests fail before
fetching with an error reminding you to add a key. With a key, all four modes
are supported on REST.

Parallel's public search caps results at 20. The plugin requests at most 20
results on REST and caps valid results locally to magpie's count and
`parallel.maxResults`. `text` joins `excerpts` with `\n\n`; it retains up to
`parallel.contentChars` code points (default 4000, `0` keeps all returned text)
and appends `…` when truncated. `publish_date` preserves the original date
string as `age`.

Anonymous access was verified on **2026-11-04** against the official MCP endpoint:
keyless `tools/call` returned HTTP 200 with search results for English and
Chinese queries. A configured key always selects REST, including when it is
invalid or exhausted; there is no automatic downgrade to MCP. A custom endpoint
is used as the exact destination for either protocol (for example, `/mcp`
anonymously or your proxy's search endpoint with a key).

<a id="tinyfish-search"></a>

## TinyFish search

TinyFish has two access paths, selected by the key magpie supplies:

| Access | Default endpoint | Request |
|---|---|---|
| Anonymous (empty key) | `https://agent.tinyfish.ai/mcp` | POST JSON-RPC `tools/call`, tool `search`, header `X-TinyFish-Access-Mode: keyless` |
| With a key | `https://api.search.tinyfish.ai/` | GET with URL-encoded search parameters, header `X-API-Key` |

Anonymous requests directly call the search tool without a session handshake.
The plugin reads either JSON or SSE responses, checks JSON-RPC and tool errors,
then extracts the search JSON from structured content or a text content part.
REST requests have no body. Both paths accept a normalized query of 1–2000
characters. Neither sends a result-count parameter: TinyFish returns one page,
then the plugin drops URL-less entries and caps valid results
to magpie's requested count and `tinyfish.maxResults`. It does not fetch more pages
to fill a short response. `text` is the search snippet; `age` preserves `date`,
including human-readable dates. A paper's numeric `year` is not converted to a date.

Both paths support the configured location, language, domain filters, and `web`
or `news` searches. `research_paper` requires a key; using it anonymously reports
an error before making a request. Omitted location/language are resolved by
TinyFish: one can determine the other, and omitting both defaults to US/en.
The plugin does not infer them from the query. Purpose, pagination, date/year
filters, thumbnails and inline page fetching are not exposed as plugin options.

For example, use Chinese-language news search with a local cap of four results:

```sh
magpie plugin options magpie-websearch '{"tinyfish":{"language":"zh","domainType":"news","maxResults":4}}'
```

Anonymous access was verified on **2026-11-04** against the official MCP endpoint:
keyless `tools/call` returned HTTP 200 with search results, and `tools/list`
advertised `web`/`news` plus location, language and domain filtering. The same MCP
call without the keyless header returned 401. The REST endpoint returned 401
without an API key, even with that header. The [REST reference](https://docs.tinyfish.ai/search-api/reference.md)
documents API keys; the [MCP guide](https://docs.tinyfish.ai/mcp-integration/index.md)
primarily documents OAuth and does not fully describe this anonymous route.
This is observed support, not a guarantee of permanent anonymous access. Its
precise quota is not documented here; do not assume it shares authenticated
account limits. HTTP 429 uses the anonymous cooldown described above. JSON-RPC
codes and tool-error text are not treated as HTTP status codes.

The adapter also passed a live anonymous search against that endpoint. Keyed
REST success and MCP SSE parsing were verified against a local fake service,
including through the magpie host; a successful REST search with a real account
key has not been verified.

A configured key always selects REST, including when it is invalid or exhausted;
there is no automatic downgrade to MCP. See [Anonymous search and rate limits](#anonymous-search)
for switching a saved keyed entry back to anonymous access. A custom endpoint
must match the selected protocol, for example `/proxy/mcp` anonymously or
`/proxy/search` with a key; neither address is rewritten.

<a id="serpapi-search"></a>

## SerpApi search

SerpApi integrates with Google's search engine via SerpApi's Google Search API:

- **Protocol**: GET requests to `https://serpapi.com/search` with URL-encoded query parameters and authentication via `api_key`.
- **Sensitive Error Protection**: Network, HTTP, parsing and status errors use fixed descriptions and necessary status codes, without retaining original exceptions, response bodies, request URLs or an underlying `cause`. Requests do not follow redirects. This protects plugin-generated errors and diagnostics; it cannot control server or proxy logs and does not rewrite normal web result content.
- **Organic Results & Local Capping**: Only `organic_results` items with valid links are retained. Because Google deprecated the `num` parameter in September 2025, results are retrieved per page and capped locally (`serpapi.maxResults`).
- **Empty Result Handling**: An error-free empty array, or `status: "Success"` with `organic_results_state: "Fully empty"`, returns `[]`; the latter may contain SerpApi's empty-result error string. Null result fields, unknown statuses and unexplained errors fail without caching. Valid empty results are cached for at most 30 seconds; `cacheTTL: 0` disables plugin caching. When no other results are available, magpie reports `found nothing`.
- **Optional Knobs**: Supports configuring country (`gl`), interface language (`hl`), location (`location`), Google domain (`googleDomain`), and safe search (`safe`) with environment variable fallbacks.

`hl` controls interface language and `gl` is a country preference; neither strictly restricts result language or source country. The adapter fetches one page without automatic pagination. The 1–10 `maxResults` range is a local plugin cap, and fewer results may be returned. Disabling plugin caching does not disable SerpApi's server cache. Under the [official billing rules](https://serpapi.com/pricing), successful empty searches can count toward quota; reducing the local cap does not reduce the charge for a search.

<a id="moonshot-search"></a>

## Moonshot and Moonshot CN search

Moonshot provides two independent Basic web search endpoints:

| Site | Adapter ID | Default endpoint | Console & API keys |
|---|---|---|---|
| International | `moonshot` | `https://api.moonshot.ai/v1/tools/search` | `https://platform.kimi.ai/console/api-keys` |
| Domestic (China) | `moonshot-cn` | `https://api.moonshot.cn/v1/tools/search` | `https://platform.kimi.com/console/api-keys` |

- **Protocol and Request Constraints**: Standalone Basic search API over `POST` JSON with Bearer authentication and `redirect: "error"`. Snippet requests contain `text_query` and `limit` (1–20, sized via `sizeFor(count, maxResults, 20)`); full-text requests also send `include_content: true`. Pro search, standalone fetch, Responses API, Formula API and model-integrated search are not exposed; the server-side `timeout_seconds` parameter is omitted.
- **Content Mode and Truncation**: Defaults to snippet mode (`content: "snippet"`), omitting `include_content` from the request and reading `snippet`. In full-text mode (`content: "full"`), requests include `"include_content": true`, and valid `text` is preferred over `snippet` while preserving whitespace and indentation. Both modes retain up to `contentChars` code points (default 4000, `0` disables local truncation) and append `…` when truncating, without splitting emoji surrogate pairs. Note that Magpie applies its own 1500-byte cap downstream.
- **Result Processing**: Upstream must return an object with a `search_results` array. Entries lacking valid URLs or object shape are dropped; if upstream returns items but none are valid, a structural error is raised instead of caching an empty result. `title` falls back to the URL, and the original string `date` maps to `age`.
- **Rate Limit Headers**: On HTTP 429, standard `Retry-After` (delay-seconds or HTTP-date) takes precedence, including a valid zero delay. If missing or invalid, `X-RateLimit-Reset` is interpreted as the official Unix timestamp in seconds, rounded up to a relative delay; only 1–86400 seconds is accepted. If the raw integer exceeds `1e11` and its seconds interpretation fails, the plugin also tries a proxy's integer millisecond timestamp within the same delay window. The 24-hour bound is a local defensive policy; millisecond tolerance is not an official protocol guarantee. Expired, malformed or excessive resets are omitted so host defaults apply, rather than capped to 24 hours. This bound applies only to the reset header and does not change standard `Retry-After` priority or handling.
- **Billing and Limits**: Official charges apply to HTTP 200 responses with a non-empty upstream `search_results` array ($0.002/search internationally before applicable taxes, ¥0.01/search domestically). Upstream failures and empty arrays are not charged. Local filtering or truncation does not reduce the charge; discarding all unusable entries locally does not establish that a search was free. Search QPS limits are separate from model RPM/TPM limits. The international site requires at least $1 recharge to enable API access. Keys are configured separately; the plugin does not share keys or retry across sites automatically.
- **Custom Base URL**: Custom endpoints are used exactly as provided without heuristics or appended paths.

Both adapters have passed dummy-key local simulations and Magpie host checks for
requests, snippet/full-text mapping, empty results, timeout, 429 reset headers,
key rotation and fallback. Neither site has been verified with a real account key
for successful search, full-text responses, latency, account rate limits or search quality.

<a id="zhipu-search"></a>

## Zhipu and Z.ai search

Each site provides standalone REST web search without a model call. They register
separately, with independent credentials, configuration and caches:

| Site | Adapter ID | Default POST endpoint | Standard API keys |
|---|---|---|---|
| China | `zhipu` | `https://open.bigmodel.cn/api/paas/v4/web_search` | <https://bigmodel.cn/apikey/platform> |
| International | `zai` | `https://api.z.ai/api/paas/v4/web_search` | <https://z.ai/manage-apikey/apikey-list> |

Requests use JSON and `Authorization: Bearer <key>` and reject redirects. Custom
Base URLs are exact endpoints without appended paths. Magpie manages keys; the
plugin does not read model credentials or automatically retry across sites.
Distinguish Standard API Keys, individual/team Coding Plan keys and legacy
Compatible keys. A 401 suggests checking the site and product type, without
assuming that the key necessarily belongs to the other site.

After normalization, domestic queries must contain 1–70 Unicode code points.
Longer queries fail locally without silent truncation. International queries
must be nonempty but have no additional plugin length ceiling. Domestic requests
send `search_intent: false` to search directly. International requests fix
`search-prime` and omit `search_intent` and `content_size`. Only Zhipu supports
`engine` and `contentSize`; explicitly supplying either in `zai` options warns
and ignores it, including invalid values.

| Domestic engine | Upstream count | Domain filter | Recency / content size | Published CNY/use |
|---|---|---|---|---|
| `search_std` (default) | 1–50 | Supported | Supported | 0.01 |
| `search_pro` | 1–50 | Supported | Supported | 0.03 |
| `search_pro_sogou` | 10/20/30/40/50 | Supported | Supported | 0.05 |
| `search_pro_quark` | Count omitted; capped locally | Not listed as supported | Supported | 0.05 |

The effective local cap is `sizeFor(count, maxResults, 50)`. Sogou rounds the
upstream count up to an accepted bucket: requesting 6 locally sends 10, and 24
sends 30, while returning at most the local cap after filtering. Sogou ignores
count when both domain and recency filters are supplied. The adapter does not
make extra calls to fill a short response. Quark omits count, so the actual number
of results is controlled by upstream; `maxResults` is only a local cap and does
not guarantee 50 results. Quark's default and maximum counts need real-key
verification. Cache identities include both upstream parameters and the local
cap so Quark or shared Sogou count buckets cannot reuse a response trimmed to a
different count.

With Quark selected, domain filtering is unsupported. A nonempty
`ZHIPU_DOMAIN_FILTER` warns and is ignored, whether the engine comes from options
or the environment, so it does not block plugin loading. An explicit nonempty
`zhipu.domainFilter` still throws a configuration error and fails plugin
initialization when that provider is included. An explicit empty string clears an
inherited environment filter.

`domainFilter` maps to the single whitelist domain in `search_domain_filter`.
Use a bare domain such as `www.example.com`, without a scheme, path, comma list
or wildcard. The adapter only trims and forwards it without validating or
converting its format; upstream may reject malformed values.
`recency` accepts `oneDay`, `oneWeek`, `oneMonth`, `oneYear` and `noLimit`; the
default `noLimit` is omitted. Domestic `contentSize` defaults to `medium` (also
omitted); `high` requests longer excerpts, not a separate full-page fetch.
Both adapters retain up to `contentChars` Unicode code points (4000 by default,
0 disables local truncation), then append one `…` when truncating. The resulting
text may contain `contentChars + 1` code points. Magpie still applies its own
1500-byte cap.

International search costs $0.01/use. The official
[guide](https://docs.z.ai/guides/tools/web-search) demonstrates count, domain and
recency parameters, but their descriptions in the
[API reference](https://docs.z.ai/api-reference/tools/web-search) mention
`search_pro_jina`, which is absent from the engine enum. The adapter sends the
guide's parameters; their actual effects need real-key verification. It exposes
neither a Jina engine nor international `contentSize`. Prices come from the
[domestic](https://docs.bigmodel.cn/cn/guide/start/pricing) and
[international](https://docs.z.ai/guides/overview/pricing) pricing pages. Empty or
failed searches are not promised to be free.

Results come from `search_result`: a valid string `link` maps to `url`, `content`
to `text` and string `publish_date` to `age`. A missing/blank title falls back to
the URL. Top-level `created` is the request timestamp, not a publication date.
Invalid links are filtered before capping, preserving order. As a **plugin
validation policy**, results must be an explicit array: missing/null/non-array
values and nonempty arrays with no usable links fail without caching. This is
not a required-field guarantee in upstream OpenAPI. An explicit empty array
caches for at most 30 seconds. A truthy `error` or a present, non-null top-level
business `code` other than `0`, `"0"`, `200` or `"200"` fails even on HTTP 200,
without inventing an HTTP status. Tolerating these success codes and falsy `error`
fields is a proxy compatibility policy; result-array validation still applies.

HTTP refusals retain numeric `status`, bounded upstream details and validated
standard `Retry-After` (integer seconds or a standard HTTP date, including 0).
429 can mean rate limits, insufficient balance or exhausted quota. Domestic
search business codes 1701/1702/1703 mean concurrency limit/no engine/no valid
data respectively. Magpie handles key rest, rotation and fallback; adapters add
no sleeps or automatic retries. Cancellation and timeout cover requests and body
consumption. `timeout: 0` still preserves `ctx.abort`.

These adapters use standard REST only. Coding Plan's `webSearchPrime` MCP is a
separate access path with different credentials and billing. Both sites' current
plan documents use credits; old fixed monthly call allowances should not be
reused or described as anonymous free access. See the
[domestic REST reference](https://docs.bigmodel.cn/api-reference/工具-api/网络搜索),
[domestic MCP](https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server) and
[international MCP](https://docs.z.ai/devpack/mcp/search-mcp-server).

Dummy-key local tests cover both sites' requests, domestic engine differences,
mapping, count/text caps, caches, malformed responses, timeouts, 429, key rotation
and host fallback. Neither site has been verified with real account keys for
successful search, international filter effects, latency, billing, account
limits or search quality.

```sh
magpie plugin options magpie-websearch '{"zhipu":{"engine":"search_pro","contentSize":"high","maxResults":6},"zai":{"maxResults":6}}'
```

<a id="stepfun-search"></a>

## StepFun China search

Uses the [standalone REST search API](https://platform.stepfun.com/docs/zh/api-reference/search/search.md):
POST `https://api.stepfun.com/v1/search`, JSON with `Authorization: Bearer <key>`,
without a model call. Magpie manages the required API key from
<https://platform.stepfun.com/interface-key>. The adapter registers by default as
`magpie-websearch:stepfun`, displayed as `StepFun (magpie-websearch)`.

Queries are whitespace-normalized and must be nonempty, without an invented
length ceiling or silent truncation. Requests send `query`, `n` sized via
`sizeFor(count, maxResults, 20)`, and optional `category`: `programming`, `research`,
`gov` or `business`. The default omits category to search all scenarios. Invalid
links are filtered before capping, preserving upstream order without extra calls
to fill short results. Pagination, domain, recency, language and safe-search
parameters are not published and are not exposed.

The default `content: "snippet"` prefers snippets, falling back to the full
`content` when the snippet is blank. `"full"` reverses that preference. Selected
text preserves indentation and line breaks, then retains up to `contentChars`
Unicode code points (4000 by default; 0 keeps all) and appends `…` on truncation.
Both modes use this budget. Magpie still applies its own 1500-byte cap. The API
documents no way to suppress the response's full body; no `include_content`
switch is sent, and these options only select text locally.

Results read the `results` array. Each row requires a nonblank string `url`,
which is trimmed without further protocol, syntax or reachability checks.
Missing, non-string or blank titles fall back to the URL. String `time` maps to
`age` after trimming surrounding whitespace; blank or non-string values are
omitted. It is not parsed: it is the page's **index time**, not its publication
date. As a plugin validation policy, missing/null/non-array results and
nonempty arrays with no usable URLs fail without caching. Explicit
empty arrays cache for at most 30 seconds. A truthy `error` also fails on HTTP 200
without inventing an HTTP status. Each plugin instance owns its cache, hashing
the endpoint, key, query, count, category, content mode and text budget together.

HTTP refusals retain numeric `status` and bounded upstream diagnostics; 402 uses
a fixed insufficient-balance/organization-Credit message. 401 suggests checking
the domestic key and account access. 429 can mean rate limits or project/member
Credit caps, and retains upstream error identifiers and validated standard
`Retry-After` (integer seconds or HTTP date, including 0). 451 reports moderation
of the query or result content. Magpie owns key rest, rotation and fallback;
the adapter adds no sleeps or retries. Custom URLs are exact endpoints without
appended paths, and redirects are rejected. Timeout and `ctx.abort` cover fetch
and body consumption; `timeout: 0` still preserves host cancellation.

Error details put string or numeric `type`/`code` before the message. Each
identifier retains its first 80 code points plus an appended `…` when truncated.
Upstream diagnostics retain up to 300 code points plus `… [truncated]` when
truncated; HTTP prefixes, retry hints and action suggestions are outside that
budget. Without usable structured fields, or for non-JSON bodies, bounded raw
diagnostics are used. Interrupted or timed-out error bodies still retain known
HTTP statuses such as 401/403 so key rotation can continue. Explicit host
cancellation during a request takes precedence. 402 uses a fixed message and
cancels the unread body without waiting for cleanup.

[Domestic pricing](https://platform.stepfun.com/docs/zh/guides/pricing/details.md)
lists ¥0.04/search without promising free empty or failed requests. The
[rate-limit guide](https://platform.stepfun.com/docs/zh/guides/pricing/rate-limits.md)
lists account tiers without a separate numeric search quota. The
[error reference](https://platform.stepfun.com/docs/zh/api-reference/error-codes.md)
lists `project_credit_limit_exceeded` and `member_project_credit_limit_exceeded`
as 429 errors, so not every refusal is a short rate-limit window.

This adapter supports domestic standard REST only. On 2026-11-05, unauthenticated
domestic REST returned 401, international `/v1/search` returned 404 and international
chat returned 401. The [international documentation](https://platform.stepfun.ai/docs/en/guides/developer/integrations/codex.md#connect-stepsearch-mcp)
does list a separate Step Plan MCP endpoint at
`https://api.stepfun.ai/step_plan/v1/mcp/web_search/mcp` (also returned 401 without a
key). Its protocol and subscription channel differ; it is not an automatic fallback.

```sh
magpie plugin options magpie-websearch '{"stepfun":{"category":"research","content":"full","maxResults":6,"contentChars":4000}}'
```

Dummy-key local tests cover requests, snippet/full-text fallback, empty/malformed
results, cancellation/timeouts, Credit 429, moderation 451, key rotation and host
fallback. Host cases also verify Credit identifiers survive long error messages,
and interrupted 401 bodies still rotate to a healthy key.
Successful searches, full-text responses, latency, billing, limits and
quality with real account keys remain unverified.

<a id="perplexity-search"></a>

## Perplexity search

Uses the [official standalone search API](https://docs.perplexity.ai/api-reference/search-post):
POST `https://api.perplexity.ai/search`, JSON with `Authorization: Bearer <key>`, without
a model or agent call. Magpie manages the required API key from
<https://console.perplexity.ai/project/keys>. The adapter registers by default as
`magpie-websearch:perplexity`, displayed as `Perplexity (magpie-websearch)`.

Requests send `query`, `max_results` and `search_type`, plus configured filtering options:
- `searchType`: `"web"` (default, comprehensive search) or `"fast"` (isomorphic response, lower latency). The `people` search type is excluded from this initial rollout.
- `recency`: Maps to `search_recency_filter`, accepting `hour`, `day`, `week`, `month`, `year`; empty by default for no limit.
- `country`: Maps to `country`; trims whitespace and uppercases before accepting an empty value or two ASCII letters (e.g. `us` becomes `US`). Explicit invalid values throw TypeError; invalid environment values warn and fall back to no filter. Assignment to an actual country is not checked.
- `language`: Maps to `search_language_filter`; splits on commas, trims each item, removes empty items and lowercases before accepting at most 20 two-letter codes (e.g. `EN, zh` becomes `en,zh`). Explicit violations throw TypeError; invalid environment values warn and fall back to an empty array. Assignment to actual languages is not checked. An explicit empty string overrides environment configuration.
- `maxResults`: 1–20 (default 10); caps Magpie's requested count.

`snippet` contains query-relevant extracted text; original whitespace and indentation are preserved,
and text is bounded by `contentChars` (default 4000 code points, 0 keeps all), appending `…` when truncated.
Empty snippets still retain valid URLs. `url` must be a valid non-empty string; rows without a URL are dropped.
`title` falls back to the URL when empty or missing. `age` prioritizes `date` when non-empty, falling back
to `last_updated`, and is omitted if neither is present; `server_time` is not used.

Empty result arrays (`results: []`) return successfully and are cached for a short beat (at most 30s);
non-empty result arrays without usable items fail and are not cached. HTTP 200 responses with a truthy
`error` field throw an API error (without inventing a numeric status). HTTP failures retain numeric `status`;
standard `Retry-After` headers (integer seconds or canonical HTTP-date) are cleaned and forwarded;
timeouts and cancellations are not cached.

[Pricing](https://docs.perplexity.ai/docs/getting-started/pricing#search-api-pricing) is $5/1k successful
requests for `web` and $1/1k for `fast`; successful empty results are billed. The API uses prepaid billing
independently of Pro subscriptions; introductory credits ($10 for 60 days on select new accounts) do not
form a permanent free tier.

```sh
magpie plugin options magpie-websearch '{"perplexity":{"searchType":"fast","recency":"week","country":"US","language":"en,zh","maxResults":10}}'
```

Synthetic fixtures, Node/Bun unit tests and the real Magpie 0.1.3041 host sandbox
verify request formatting, search modes and filters, empty/malformed results,
timeouts, 429 Retry-After, key rotation and Linkup fallback dispatch. Real keys
have not been verified, and live recall, latency and real 429 response headers
have not been tested online; see [Development and local tests](#development) for full test counts.

<a id="bocha-search"></a>

## Bocha China search

Uses the [standalone REST search API](https://open.bochaai.com/):
POST `https://api.bochaai.com/v1/web-search`, JSON with `Authorization: Bearer <key>`,
without a model call. Magpie manages the required API key from
<https://open.bochaai.com/api-keys>. The adapter registers by default as
`magpie-websearch:bocha`, displayed as `Bocha (magpie-websearch)`.

Queries are whitespace-normalized and must be nonempty, without an invented
length ceiling or silent truncation. Requests send `query`, `count` sized via
`sizeFor(count, maxResults, 50)` (1–50, default 10), and `summary: boolean`.
`freshness` is an optional trimmed string filter passed through without local calendar
or range validation (e.g. `noLimit`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, `YYYY-MM-DD`,
or `YYYY-MM-DD..YYYY-MM-DD`); unsupported expressions are rejected upstream by the API.
An explicit empty string clears any inherited environment freshness; when unset or empty,
the parameter is omitted.

By default, `summary: false` extracts the standard `snippet` and avoids generated
summaries. Enabling generated summaries requires explicit opt-in (`summary: true`),
which selects the nonblank generated `summary` if available and falls back to `snippet`
when `summary` is blank, null, or not a string. Original whitespace is preserved in the
selected text. Explicit `options.bocha.summary` must be a JSON boolean; any other type
throws `TypeError`. For environment configuration, `BOCHA_SUMMARY` accepts only exact
trimmed `true` or `false`; empty or blank values default to `false`, and invalid strings
emit a warning (`[magpie-websearch] BOCHA_SUMMARY is invalid; using false`) and fall back
to `false`. Local text selection controls the mapped and cached text; magpie independently
applies its own 1500-byte cap to final result text, so it does not promise the model
will receive full text. Enabling summary does not make an additional model call.

Responses require a top-level object with a `data` object. If `data.webPages` is missing or
null, it is treated as a valid empty result (`[]`). When present, `webPages.value` must be an
array. Results without a valid nonblank string `url` are filtered out before capping;
nonempty arrays with no usable URLs fail. `name` maps to `title` (falling back to the URL
when blank or missing). `age` prioritizes trimmed `datePublished`, falling back to
`dateLastCrawled`, and is omitted if neither is a nonblank string. Dates are preserved as
original vendor strings without calendar parsing or time zone conversion.

HTTP 200 responses with a defined `code` that is neither numeric 200 nor string `"200"`
(missing `code` is allowed), or with a truthy `error`, throw a business API error
without inventing an HTTP status or caching the failure. Structured error
diagnostics prioritize bounded `code` and `log_id` (each capped at 80 code points) followed by
the vendor message. HTTP refusals retain numeric `status`; 401 appends a key check hint
pointing to `https://open.bochaai.com/api-keys`, and 403 appends an account access/balance hint
pointing to `https://open.bochaai.com/overview`. Valid standard `Retry-After` headers (integer
seconds or HTTP date, including 0) are cleaned and forwarded. Empty results are cached for at most
30 seconds; successful results cache per instance with endpoint, key, query, count, freshness,
and summary mode hashed together.

The [Bocha console overview](https://open.bochaai.com/overview) advertises a 1,000-call trial resource
pack; eligibility, expiration and generated-summary coverage depend on the account and current terms.
Generated summaries may incur additional charges. During research the linked
[pricing document](https://aq6ky2b8nql.feishu.cn/wiki/JYSbwzdPIiFnz4kDYPXcHSDrnZb)
required Feishu login, so fixed prices, QPS and empty-result billing remain unverified.
Custom URLs are exact endpoints; the adapter never automatically falls back to older domains.

```sh
magpie plugin options magpie-websearch '{"bocha":{"summary":false,"freshness":"oneWeek","maxResults":10},"ollama":{"maxResults":5,"contentChars":2000}}'
```

This replaces the complete options object; include any other settings you want to keep.
Set `summary` explicitly to `true` for generated summaries after checking account charges.

<a id="ollama-search"></a>

## Ollama cloud search

Uses the [official cloud Web Search API](https://docs.ollama.com/capabilities/web-search.md):
POST `https://ollama.com/api/web_search`, JSON with `Authorization: Bearer <key>`.
Magpie manages the required API key from <https://ollama.com/settings/keys>.
The adapter registers by default as `magpie-websearch:ollama`, displayed as
`Ollama (magpie-websearch)`. This is a cloud search API requiring an Ollama account key;
it does not connect to a local Ollama daemon (e.g. localhost:11434), call models, or run web_fetch.

Requests send `query` and `max_results` sized via `sizeFor(count, maxResults, 10)` (1–10, default 5).
Queries are whitespace-normalized and must be nonempty. The response contains a `results` array of
items with `title`, `url`, and `content`. Items without a valid nonblank string `url` are dropped
before capping; nonempty arrays with no usable URLs fail. `title` falls back to the URL when
missing or blank. Results have no date metadata; `age` is omitted.

`content` contains extracted page text and is bounded locally by `contentChars` (default 2000 code
points; 0 keeps full text). Truncation iterates code points up to the limit and appends `…` without
expanding full arrays. This local character budget bounds the adapter's mapped and cached payload;
magpie independently truncates each result's `text` to 1500 bytes before feeding it to the model,
so configuring large or unlimited `contentChars` does not promise full text delivery to the model.
Empty result arrays (`results: []`) return successfully and cache for at most 30 seconds.
Non-object responses, missing `results` arrays, or nonempty arrays with no usable URLs fail and
are not cached. HTTP 200 responses with a truthy `error` throw an API error without inventing an HTTP
status. HTTP refusals retain numeric `status` and bounded upstream diagnostics; valid standard
`Retry-After` headers (integer seconds or HTTP date, including 0) are cleaned and forwarded.
Successful results cache per instance with endpoint, key, query, count, and `contentChars` hashed together.

Non-string content becomes an empty string. Extra undocumented date fields or dates in content
do not produce `age`. Both providers consume only the supplied execution key; environment API
keys, OSP credentials, model credentials and local Ollama configuration are not read.

[Ollama's web search announcement](https://ollama.com/blog/web-search) describes a personal free tier,
but fixed quotas, per-search pricing, and QPS are unverified; [current pricing page](https://ollama.com/pricing)
plans for cloud models do not constitute a search allowance.

```sh
magpie plugin options magpie-websearch '{"ollama":{"maxResults":5,"contentChars":2000}}'
```

Synthetic fixtures, Node/Bun unit tests and real Magpie 0.1.3041 sandbox tests cover both providers:
Bocha ordinary/generated summaries, freshness and business diagnostics; Ollama content truncation;
and exact endpoints, malformed/empty results, timeout, 429 Retry-After, Linkup fallback, ordered key
rotation after 429 and interrupted 401 bodies, and healthy-key preference. Successful live searches,
billing, quality and rate limits remain explicitly recorded as "real Key unverified".

<a id="jina-search"></a>

## Jina search

Uses the [Jina Search API](https://docs.jina.ai/api.md): POST `https://s.jina.ai/search` with JSON, `Authorization: Bearer <key>` and `Accept: application/json`. Magpie manages the required key from <https://jina.ai/?sui=apikey>. Requests send a normalized, nonempty `q` and `num` sized via `sizeFor(count, maxResults, 20)`. Optional `gl`, `hl` and `location` strings are trimmed and forwarded when nonempty.

The default `content: "snippet"` sends `X-Respond-With: no-content` and maps only string `description`. `content: "full"` omits that header and prefers nonblank string `content`, falling back to `description`. Both modes retain up to `contentChars` code points (4000 by default; 0 keeps all) and append `…` on truncation. The default timeout is 25000 ms for snippets or 60000 ms for full content; an explicit `timeout` or valid `JINA_TIMEOUT` overrides that mode default. These describe the adapter's request and mapping; a local dummy service does not establish live page-fetching behavior or billing.

Responses read the `data` array, filtering rows without nonblank string URLs before capping. A nonempty array with no usable URLs fails. Missing/blank titles fall back to the URL; string `publishedTime` maps to `age` after trimming. A supplied `code` other than numeric 200 or a supplied `status` other than numeric 20000 raises a business error. An `error` field is tolerated only when absent, null, an empty string or an empty array; other values fail without inventing an HTTP status. Missing, null or non-array `data` fails.

```sh
magpie plugin options magpie-websearch '{"jina":{"content":"full","contentChars":4000,"maxResults":6}}'
```

<a id="kagi-search"></a>

## Kagi search

Uses the [Kagi Search API](https://redocly-api-docs.kagi.com/api/docs/openapi/search/search.md): POST `https://kagi.com/api/v1/search` with JSON and `Authorization: Bearer <key>`. Magpie manages the required key from <https://kagi.com/api/keys>. Requests send a normalized, nonempty `query`, fixed `workflow: "search"` and `limit` sized via `sizeFor(count, maxResults, 1024)` (`maxResults` defaults to 10). This caps the returned count without guaranteeing that many results.

A nonempty `lens` maps to `lens_id`, accepting a named Lens or shared Lens ID/URL. Otherwise, nonempty `recency` maps to `lens.time_relative` (`day`, `week`, `month`). When both are set, Lens wins and the factory warns. Explicit `lens: ""` clears an inherited environment value to restore recency filtering. `region` maps to `filters.region`. The adapter omits `extract` and does not request additional page extraction.

Responses require an object `data`. Missing or empty-array `data.search` returns `[]`; other collections are not mapped to web results. Null/non-array search results or a nonempty array with no usable URLs fail. Valid rows are filtered before capping; missing/blank titles fall back to the URL, `snippet` maps to `text` and string `time` maps to `age`. There is no separate `contentChars` option. An `error` field is tolerated only when absent, null or an empty array; other values raise a business error without inventing an HTTP status.

```sh
magpie plugin options magpie-websearch '{"kagi":{"recency":"week","region":"cn","maxResults":6}}'
```

<a id="serper-search"></a>

## Serper search

Uses POST `https://google.serper.dev/search` with JSON and an `X-API-KEY` header. Magpie manages the required key from <https://serper.dev/>. Serper is independent of SerpApi, which uses GET and a URL `api_key` parameter. Requests send a normalized, nonempty `q`, fixed `num: 10` and optional `gl`, `hl`, `tbs`. `tbs` accepts `qdr:h`, `qdr:d`, `qdr:w`, `qdr:m`, `qdr:y`; the empty default is omitted. `maxResults` (1–10, default 10) and the host's `count` only cap results locally, without changing the wire `num`. One page is fetched without extra calls to fill short results.

Only `organic` is mapped: rows without nonblank string `link` are removed before capping; missing/blank titles fall back to the URL, string `snippet` maps to `text` and string `date` maps to `age`. Missing `organic` returns `[]` only when an object `knowledgeGraph`/`answerBox` or array `peopleAlsoAsk`/`relatedSearches` is present. Other missing, null/non-array, or nonempty but unusable organic results fail. A nonblank string `message` raises a business error. An `error` field is tolerated only when absent, null or an empty array; other values fail without inventing an HTTP status. There is no separate text-budget option; cache identities include the local count cap.

```sh
magpie plugin options magpie-websearch '{"serper":{"gl":"cn","hl":"zh-cn","tbs":"qdr:w","maxResults":6}}'
```

All three reject redirects and use custom Base URLs as exact endpoints. HTTP refusals retain numeric `status` and validated standard `Retry-After`. Settings, caches and credentials are isolated per plugin instance; valid empty results cache for at most 30 seconds. The commands above replace the complete options object, so include other settings you want to keep. Synthetic fixtures, unit tests and the Magpie 0.1.3041 local sandbox cover requests, mapping, timeouts, 429, key rotation and Linkup fallback. Live real-key searches, billing, quality and rate limits remain unverified. Magpie still applies its final 1500-byte cap to each result's `text`.

<a id="result-processing"></a>

## What magpie does with a result

- `count` is 6: adapters request the needed count and cap locally. Sogou must request at least 10 because of its upstream buckets; Serper always sends `num: 10`; APIs without a configurable count are capped locally. magpie keeps at most 6.
- `text` is stripped of tags, unescaped, whitespace-collapsed, and cut to 1500 bytes.
- `age` preserves the vendor's date-string format after trimming surrounding whitespace. Blank or non-string values are omitted, without guessing dates or converting time zones. StepFun supplies index time.
- A hit without a URL is dropped.
- A thrown error with a numeric `status` (401, 402, 403, 429) is an API refusal. For keyed calls, magpie records the key's rest and tries the next key. Anonymous 429 cooldowns are managed by this plugin; failed APIs give way to the next configured API.
- `retryAfter` on a 429 follows the adapter's policy. Bocha, Jina, Kagi, Ollama, Perplexity, SerpApi, Serper, StepFun, Zhipu and Z.ai forward only validated and normalized integer seconds or a standard HTTP date. Moonshot's two adapters prefer a valid standard header, falling back to the [reset-header rules](#moonshot-search) when it is missing or invalid. Other adapters use the shared header passthrough behavior.
- If reading a failed HTTP response body is interrupted or times out, the shared HTTP layer retains the known `status` and retry metadata extracted by the adapter. Explicit host cancellation during a request takes precedence. Network failures and business errors in HTTP 200 responses do not acquire invented HTTP statuses.

<a id="configuration"></a>

## Full configuration reference

All plugin options are optional, including provider objects, their fields, and
the top-level `enable` and `disable` filters. Omitted provider fields fall back
to the environment variable or the default listed below.

Use **Plugins → Installed → Options**, or pass a JSON object on the command line.
For example, change search parameters while keeping all nineteen APIs registered:

```sh
magpie plugin options magpie-websearch '{"linkup":{"depth":"deep","maxResults":4,"timeout":25000,"cacheTTL":600000},"anysearch":{"zone":"cn","language":"zh-CN"}}'
```

Each command replaces the saved options object, so include every option you want
to keep. Saving options reloads the plugin host. Each plugin instance gets its
own settings and caches.

Values are selected in this order: **explicit provider option → environment
variable → default**. Invalid explicit values for known fields of registered
providers fail plugin loading with a field error; unrecognized fields are ignored.
Explicit numeric options must be JSON safe integers within the documented range
(no greater than 9,007,199,254,740,991), not numeric strings. String options are
trimmed before validation.

Environment variables retain fallback behavior: blank values are unset; values
that cannot be parsed as nonnegative safe integers use the default, and valid
numbers are then clamped to the field's range. Invalid enum strings produce a
warning and use the default. `timeout` and `cacheTTL` are milliseconds (`timeout`
is at most 2,147,483,647 ms). A zero timeout removes the plugin's own deadline,
while the host's cancellation signal and deadline still apply; a zero cache TTL
disables caching.

Each API keeps a bounded search cache in memory, isolated by hashing the final
endpoint, credential and request parameters (including result count) together.
Empty results are cached for at most 30 seconds.

The table lists fields inside each provider's object (`linkup.depth`, for example):

| Provider | Option | Environment variable | Default | Values / meaning |
|---|---|---|---|---|
| anysearch | `cacheTTL` | `ANYSEARCH_CACHE_TTL` | `600000` | ≥ 0 |
| anysearch | `maxResults` | `ANYSEARCH_MAX_RESULTS` | `10` | 1–10; cap on magpie's requested count |
| anysearch | `tag` | `ANYSEARCH_TAG` | empty | Intent tag, e.g. `code.snippet` |
| anysearch | `zone` | `ANYSEARCH_ZONE` | empty | empty, `cn`, `intl` |
| anysearch | `language` | `ANYSEARCH_LANGUAGE` | empty | e.g. `zh-CN` |
| anysearch | `format` | `ANYSEARCH_FORMAT` | `markdown` | `markdown`, `json` |
| anysearch | `timeout` | `ANYSEARCH_TIMEOUT` | `25000` | ≥ 0 |
| bocha | `cacheTTL` | `BOCHA_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| bocha | `timeout` | `BOCHA_TIMEOUT` | `25000` | 0–2147483647 ms; 0 disables plugin timeout, preserving host cancellation |
| bocha | `maxResults` | `BOCHA_MAX_RESULTS` | `10` | 1–50; cap on magpie's requested count |
| bocha | `freshness` | `BOCHA_FRESHNESS` | empty | empty, `noLimit`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, or date/date-range |
| bocha | `summary` | `BOCHA_SUMMARY` | `false` | JSON boolean; `false` snippet only, `true` generated summary with snippet fallback |
| jina | `cacheTTL` | `JINA_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| jina | `content` | `JINA_CONTENT` | `snippet` | `snippet`, `full` |
| jina | `timeout` | `JINA_TIMEOUT` | snippet `25000`; full `60000` | 0–2147483647 ms; 0 disables plugin timeout, preserving host cancellation; overrides mode default |
| jina | `maxResults` | `JINA_MAX_RESULTS` | `10` | 1–20; cap on magpie's requested count |
| jina | `contentChars` | `JINA_CONTENT_CHARS` | `4000` | Code points per text; 0 keeps all |
| jina | `gl` | `JINA_GL` | empty | Country code, e.g. `us` |
| jina | `hl` | `JINA_HL` | empty | Language code, e.g. `zh-cn` |
| jina | `location` | `JINA_LOCATION` | empty | City or geographic location string |
| kagi | `cacheTTL` | `KAGI_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| kagi | `timeout` | `KAGI_TIMEOUT` | `25000` | 0–2147483647 ms; 0 disables plugin timeout, preserving host cancellation |
| kagi | `maxResults` | `KAGI_MAX_RESULTS` | `10` | 1–1024; cap on magpie's requested count |
| kagi | `lens` | `KAGI_LENS` | empty | Named or shared Lens ID / URL; overrides `recency` |
| kagi | `recency` | `KAGI_RECENCY` | empty | empty, `day`, `week`, `month`; effective when lens is empty |
| kagi | `region` | `KAGI_REGION` | empty | Country code, e.g. `cn`, `us`; maps to `filters.region` |
| keenable | `cacheTTL` | `KEENABLE_CACHE_TTL` | `600000` | ≥ 0 |
| keenable | `maxResults` | `KEENABLE_MAX_RESULTS` | `10` | 1–50 |
| keenable | `mode` | `KEENABLE_MODE` | empty | empty, `pro`, `realtime` |
| keenable | `title` | `KEENABLE_TITLE` | `magpie-websearch` | `X-Keenable-Title`, at most 256 characters |
| keenable | `timeout` | `KEENABLE_TIMEOUT` | `25000` | ≥ 0 |
| linkup | `cacheTTL` | `LINKUP_CACHE_TTL` | `600000` | ≥ 0 |
| linkup | `depth` | `LINKUP_DEPTH` | `fast` | `flash`, `fast`, `standard`, `deep` |
| linkup | `maxResults` | `LINKUP_MAX_RESULTS` | `10` | 1–100; upstream limits also apply |
| linkup | `contentChars` | `LINKUP_CONTENT_CHARS` | `4000` | Code points per excerpt (`0` keeps all) |
| linkup | `timeout` | `LINKUP_TIMEOUT` | `25000` | ≥ 0 |
| metaso | `cacheTTL` | `METASO_CACHE_TTL` | `600000` | ≥ 0 |
| metaso | `scope` | `METASO_SCOPE` | `webpage` | `webpage`, `document`, `paper`, `image`, `video`, `podcast` |
| metaso | `maxResults` | `METASO_MAX_RESULTS` | `10` | 1–50; cap on magpie's requested count |
| metaso | `contentChars` | `METASO_CONTENT_CHARS` | `4000` | Code points per excerpt (`0` keeps all) |
| metaso | `timeout` | `METASO_TIMEOUT` | `25000` | ≥ 0 |
| moonshot | `cacheTTL` | `MOONSHOT_CACHE_TTL` | `600000` | ≥ 0 |
| moonshot | `timeout` | `MOONSHOT_TIMEOUT` | `25000` | ≥ 0 |
| moonshot | `maxResults` | `MOONSHOT_MAX_RESULTS` | `10` | 1–20; cap on magpie's requested count |
| moonshot | `content` | `MOONSHOT_CONTENT` | `snippet` | `snippet`, `full` |
| moonshot | `contentChars` | `MOONSHOT_CONTENT_CHARS` | `4000` | Code points per text (`0` keeps all) |
| moonshot-cn | `cacheTTL` | `MOONSHOT_CN_CACHE_TTL` | `600000` | ≥ 0 |
| moonshot-cn | `timeout` | `MOONSHOT_CN_TIMEOUT` | `25000` | ≥ 0 |
| moonshot-cn | `maxResults` | `MOONSHOT_CN_MAX_RESULTS` | `10` | 1–20; cap on magpie's requested count |
| moonshot-cn | `content` | `MOONSHOT_CN_CONTENT` | `snippet` | `snippet`, `full` |
| moonshot-cn | `contentChars` | `MOONSHOT_CN_CONTENT_CHARS` | `4000` | Code points per text (`0` keeps all) |
| ollama | `cacheTTL` | `OLLAMA_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| ollama | `timeout` | `OLLAMA_TIMEOUT` | `25000` | 0–2147483647 ms; 0 disables plugin timeout, preserving host cancellation |
| ollama | `maxResults` | `OLLAMA_MAX_RESULTS` | `5` | 1–10; cap on magpie's requested count |
| ollama | `contentChars` | `OLLAMA_CONTENT_CHARS` | `2000` | Code points per content text; 0 keeps all |
| parallel | `cacheTTL` | `PARALLEL_CACHE_TTL` | `600000` | ≥ 0 |
| parallel | `timeout` | `PARALLEL_TIMEOUT` | `25000` | ≥ 0; includes reading the MCP stream |
| parallel | `maxResults` | `PARALLEL_MAX_RESULTS` | `10` | 1–20; cap on magpie's requested count |
| parallel | `contentChars` | `PARALLEL_CONTENT_CHARS` | `4000` | Code points per joined excerpt (`0` keeps all) |
| parallel | `mode` | `PARALLEL_MODE` | `fast` | `fast`, `turbo`, `basic`, `advanced`; non-fast modes require a key |
| perplexity | `cacheTTL` | `PERPLEXITY_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| perplexity | `timeout` | `PERPLEXITY_TIMEOUT` | `25000` | 0–2147483647 ms; 0 disables plugin timeout, preserving host cancellation |
| perplexity | `maxResults` | `PERPLEXITY_MAX_RESULTS` | `10` | 1–20; upstream and local cap |
| perplexity | `searchType` | `PERPLEXITY_SEARCH_TYPE` | `web` | `web`, `fast`; `people` excluded from initial release |
| perplexity | `recency` | `PERPLEXITY_RECENCY` | empty | empty, `hour`, `day`, `week`, `month`, `year`; maps to `search_recency_filter` |
| perplexity | `country` | `PERPLEXITY_COUNTRY` | empty | Trimmed, uppercased and checked for 2 ASCII letters, e.g. `us` → `US` |
| perplexity | `language` | `PERPLEXITY_LANGUAGE` | empty | Comma-separated, trimmed, empty items removed and lowercased; at most 20 two-letter codes, e.g. `EN, zh` → `en,zh` |
| perplexity | `contentChars` | `PERPLEXITY_CONTENT_CHARS` | `4000` | Code points per snippet; 0 keeps all |
| querit | `cacheTTL` | `QUERIT_CACHE_TTL` | `600000` | ≥ 0 |
| querit | `count` | `QUERIT_COUNT` | `8` | ≥ 1; cap on magpie's count, Querit's own limit applies |
| querit | `timeout` | `QUERIT_TIMEOUT` | `25000` | ≥ 0 |
| serpapi | `cacheTTL` | `SERPAPI_CACHE_TTL` | `600000` | ≥ 0 |
| serpapi | `timeout` | `SERPAPI_TIMEOUT` | `25000` | ≥ 0 |
| serpapi | `maxResults` | `SERPAPI_MAX_RESULTS` | `10` | 1–10; local cap on magpie's requested count |
| serpapi | `location` | `SERPAPI_LOCATION` | empty | Geographic origin, e.g. `Austin, Texas, United States` |
| serpapi | `gl` | `SERPAPI_GL` | empty | Country code, e.g. `us` |
| serpapi | `hl` | `SERPAPI_HL` | empty | Interface language code, e.g. `zh-cn` |
| serpapi | `googleDomain` | `SERPAPI_GOOGLE_DOMAIN` | empty | Google domain, e.g. `google.com` |
| serpapi | `safe` | `SERPAPI_SAFE` | empty | empty, `active`, `off` |
| serper | `cacheTTL` | `SERPER_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| serper | `timeout` | `SERPER_TIMEOUT` | `25000` | 0–2147483647 ms; 0 disables plugin timeout, preserving host cancellation |
| serper | `maxResults` | `SERPER_MAX_RESULTS` | `10` | 1–10; local cap on magpie's requested count (wire fixed at 10) |
| serper | `gl` | `SERPER_GL` | empty | Country code, e.g. `cn`, `us` |
| serper | `hl` | `SERPER_HL` | empty | Interface language code, e.g. `zh-cn`, `en` |
| serper | `tbs` | `SERPER_TBS` | empty | empty, `qdr:h`, `qdr:d`, `qdr:w`, `qdr:m`, `qdr:y` |
| stepfun | `cacheTTL` | `STEPFUN_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| stepfun | `timeout` | `STEPFUN_TIMEOUT` | `25000` | 0–2147483647 ms; 0 disables the plugin timeout, preserving host cancellation |
| stepfun | `maxResults` | `STEPFUN_MAX_RESULTS` | `10` | 1–20; upstream and local cap |
| stepfun | `category` | `STEPFUN_CATEGORY` | empty | empty, `programming`, `research`, `gov`, `business` |
| stepfun | `content` | `STEPFUN_CONTENT` | `snippet` | `snippet`, `full`; local text selection only |
| stepfun | `contentChars` | `STEPFUN_CONTENT_CHARS` | `4000` | Code points per text; 0 keeps all |
| tinyfish | `cacheTTL` | `TINYFISH_CACHE_TTL` | `600000` | ≥ 0 |
| tinyfish | `timeout` | `TINYFISH_TIMEOUT` | `25000` | ≥ 0; includes reading the MCP stream |
| tinyfish | `maxResults` | `TINYFISH_MAX_RESULTS` | `10` | ≥ 1; local cap, not an upstream page-size guarantee |
| tinyfish | `location` | `TINYFISH_LOCATION` | empty | Country code, e.g. `US`; omitted when empty |
| tinyfish | `language` | `TINYFISH_LANGUAGE` | empty | Language code, e.g. `zh`; omitted when empty |
| tinyfish | `domainType` | `TINYFISH_DOMAIN_TYPE` | `web` | `web`, `news`, `research_paper`; papers require a key at execution time |
| tinyfish | `includeDomains` | `TINYFISH_INCLUDE_DOMAINS` | empty | Comma-separated domains; maps to `include_domains` |
| tinyfish | `excludeDomains` | `TINYFISH_EXCLUDE_DOMAINS` | empty | Comma-separated domains; maps to `exclude_domains` |
| zai | `cacheTTL` | `ZAI_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| zai | `timeout` | `ZAI_TIMEOUT` | `25000` | ≥ 0; milliseconds |
| zai | `maxResults` | `ZAI_MAX_RESULTS` | `10` | 1–50; local cap |
| zai | `contentChars` | `ZAI_CONTENT_CHARS` | `4000` | Code points per text; 0 keeps all |
| zai | `recency` | `ZAI_RECENCY` | `noLimit` | `noLimit`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`; effects unverified |
| zai | `domainFilter` | `ZAI_DOMAIN_FILTER` | empty | Single whitelist domain; effects unverified |
| zhipu | `cacheTTL` | `ZHIPU_CACHE_TTL` | `600000` | ≥ 0; milliseconds |
| zhipu | `timeout` | `ZHIPU_TIMEOUT` | `25000` | ≥ 0; milliseconds |
| zhipu | `maxResults` | `ZHIPU_MAX_RESULTS` | `10` | 1–50; local cap; Sogou rounds upstream up, Quark omits count |
| zhipu | `contentChars` | `ZHIPU_CONTENT_CHARS` | `4000` | Code points per text; 0 keeps all |
| zhipu | `recency` | `ZHIPU_RECENCY` | `noLimit` | `noLimit`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear` |
| zhipu | `domainFilter` | `ZHIPU_DOMAIN_FILTER` | empty | Single whitelist domain; unsupported on Quark |
| zhipu | `engine` | `ZHIPU_ENGINE` | `search_std` | `search_std`, `search_pro`, `search_pro_sogou`, `search_pro_quark` |
| zhipu | `contentSize` | `ZHIPU_CONTENT_SIZE` | `medium` | `medium`, `high`; upstream excerpt size |

In the table, `contentChars` is the number of Unicode code points retained before
truncation, not the final text length; truncation appends one `…`, so the result
may be one code point longer.

Environment variables are read when the plugin instance is created. They
must be in the environment of the magpie process; setting a variable in a
separate terminal does not change an already running desktop app. Prefer options
for desktop use.

<a id="registration-filters"></a>

## Optional registration filters

The optional top-level `enable` and `disable` arrays control which APIs the
plugin registers. Entries use short IDs: `anysearch`, `bocha`, `jina`, `kagi`, `keenable`, `linkup`,
`metaso`, `moonshot`, `moonshot-cn`, `ollama`, `parallel`, `perplexity`, `querit`, `serpapi`, `serper`, `stepfun`, `tinyfish`, `zai`, `zhipu` (without the `magpie-websearch:` prefix).

| Filters | APIs registered |
|---|---|
| Both omitted, or `{}` | All nineteen APIs |
| `"enable": ["linkup", "querit"]` | Linkup and Querit only |
| `"disable": ["keenable"]` | All except Keenable |
| `"enable": ["linkup", "querit"], "disable": ["querit"]` | Linkup only; `disable` wins |
| `"enable": []` | None |
| `"disable": []` | Excludes none; `enable` still limits the set when supplied |

Combine filters with provider settings when needed:

```sh
magpie plugin options magpie-websearch '{"disable":["keenable"],"linkup":{"depth":"deep","maxResults":4}}'
```

An unknown ID is logged and ignored. An explicit `enable` list containing no
known IDs registers no APIs and logs a warning. A filter that is not an array is
logged and ignored; malformed per-provider settings instead fail loading as
described under [Full configuration reference](#configuration).

These filters control registration. magpie's Web search switches independently
control whether a registered API is asked, keeping its key and place in the list
when switched off. You can use those switches without setting either filter.

To remove all saved plugin options, including provider overrides and filters:

```sh
magpie plugin options magpie-websearch off
```

All nineteen APIs are registered again. Provider settings use environment
values when present, otherwise their defaults. To remove only the filters,
save a complete options object containing the provider settings you want to keep.

<a id="development"></a>

## Development and local tests

For new provider settings, name environment variables as the uppercase underscore
form of the provider short ID, followed by `_` and the uppercase underscore form of
the option name. For example, `moonshot-cn.maxResults` maps to
`MOONSHOT_CN_MAX_RESULTS`, and `cacheTTL` maps to the `CACHE_TTL` suffix. Option names
must be strings in camelCase; adapters define these names locally. The shared helpers
strip the complete option suffix to label configuration errors. For retained aliases
or other naming schemes, pass the provider short ID as the final `namespace` argument.
See the [provider integration rules](../PROVIDERS.md#configuration-naming) for details.

Reuse `truncateCodePoints(text, limit)` for text budgets. Callers supply a string
and a validated nonnegative integer; the function does not validate types, trim
whitespace or normalize text. 0 keeps all text; truncation retains the first N
code points and appends `…`. It only iterates through the retained prefix plus one
code point without expanding the full page. Adapters own text selection and
field tolerance.

`requestResponse`/`requestJSON` accept an optional synchronous
`errorDetailFromBody(raw, response)` callback for vendor formatting after reading
a non-successful HTTP response body and before bounding its diagnostic.
Exceptions or non-string returns fall back to the raw body. A fixed `messages`
entry for that status, sensitive mode and withheld 402 bodies take precedence
and skip the callback. It does not handle business errors in HTTP 200 responses;
adapters validate those themselves. Failed body reads retain the known HTTP
status and retry metadata; explicit host cancellation during a request takes
precedence.

```sh
npm test        # node:test, no dependencies
npm run check   # validate the search hook shape and run unit tests
npm run check:bun # the same checks and tests on Bun (install Bun separately)
npm run smoke:magpie # real magpie host, dummy key and a local upstream
```

magpie runs the plugin on **Bun**, which it manages. The Node-based development
commands require **Node.js 20.3.0 or later** (`AbortSignal.any` is used to combine
deadlines and cancellation); `check:bun` runs directly on Bun. This plugin uses magpie's `search` hook. The
`opencode` keywords in package.json are required for magpie's npm discovery.

The smoke script requires `magpie` on PATH (`MAGPIE_BIN` can name its executable).
It creates a temporary HOME/config/cache, disables account discovery, starts a
gateway on a free loopback port, and tests registration, options, custom URL,
timeout, anonymous search, 429 cooldown and fallback against a local fake API.
It covers Parallel and TinyFish MCP/REST, SerpApi, Perplexity, StepFun, Bocha, Ollama, Jina, Kagi, Serper, both Moonshot adapters, and Zhipu/Z.ai.
Moonshot cases also check seconds/milliseconds reset headers, excessive resets
and resting-key preference. Zhipu/Z.ai cases check Sogou count buckets, local caps,
business errors, query length, key rotation and separate credentials on fallback.
StepFun cases check category, full text, malformed results, Credit 429, 451 and key rotation.
Perplexity cases check fast mode, filter parameters, errors, timeout, 429 Retry-After, key rotation and fallback dispatch.
Bocha cases check snippet vs generated summary opt-in, freshness filters, business errors with code and log_id, malformed results and key rotation.
Ollama cases check max_results, content truncation, malformed results, 429 retry after and key rotation.
Jina cases check snippet/full content, text budgets and header switching. Kagi cases check Lens priority, clearing Lens to restore recency, and region filtering. Serper cases check fixed num, local capping and endpoint/credential isolation from SerpApi. All three also cover empty/malformed results, timeouts, 429 Retry-After, Linkup fallback, key rotation after 429 and interrupted 401 bodies, and healthy-key preference.
It removes its sandbox when finished. Search requests
use only local mocks and dummy keys, without paid search calls; Magpie startup
may independently fetch public resources such as the model catalog.
`MAGPIE_PLUGIN_DIR` can point to an
unpacked npm package (keep its folder named `magpie-websearch` for stable vendor
IDs). `MAGPIE_SMOKE_ROOT` can override the system temporary directory used for
the sandbox. CI runs separate jobs for Node 22/24, Bun, and Magpie testing of the
unpacked npm package; the three jobs have no ordering dependency.

Local verification on **2026-11-05** used **Node.js 24.19.0, Bun 1.4.4 and magpie
0.1.3041**. Node and Bun each passed 300 tests across 22 test files. The complete
Magpie sandbox checks passed, including the new Jina, Kagi and Serper cases.
Bun ran temporarily via `npm exec --yes --package=bun@1.4.4 -- bun run check:bun`,
without adding a project dependency or lockfile. On Windows, `MAGPIE_BIN` can name
the executable; otherwise the script uses `magpie` on PATH. These checks use
local fake services and dummy keys, not live account search, quality or billing.
Earlier **magpie 0.1.2911/0.1.2964/0.1.3026/0.1.3035** records are historical and do
not establish minimum supported versions.

Local folder installs use the folder name as the short name. Because the package is `@guotree/magpie-websearch` and the folder is `magpie-websearch`, both installs give the same `magpie-websearch:*` IDs.
