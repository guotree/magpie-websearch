# Technical reference

[中文说明](technical-reference.md) | [English](technical-reference.en.md) · [Back to README](../README.en.md)

This page covers configuration, protocols, result handling and development
checks. See the [README](../README.en.md) for installation and quick start, and
[PROVIDERS.md](../PROVIDERS.md) for support status and integration guidelines.

- [Setup](#setup)
- [Custom Base URL](#custom-base-url)
- [CLI management](#cli)
- [Anonymous search and rate limits](#anonymous-search)
- [Parallel](#parallel-search), [TinyFish](#tinyfish-search), [SerpApi](#serpapi-search) and [Moonshot and Moonshot CN](#moonshot-search) protocols
- [Magpie result processing](#result-processing)
- [Full configuration reference](#configuration)
- [Registration filters](#registration-filters)
- [Development and local tests](#development)

<a id="setup"></a>

## Setup

### In the app

In the app: **Settings › Models › Web search**, add each API you want, switch it
on, and order it. Leave the key empty for anonymous AnySearch, Keenable, Parallel
or TinyFish, or provide a key to use your account. Linkup, Metaso, Moonshot, Moonshot CN, Querit and SerpApi require a key.

No plugin options are required. With no registration filters, all ten APIs are
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

# Linkup: a key is required
magpie search add magpie-websearch:linkup <key>

# Metaso: a key is required
magpie search add magpie-websearch:metaso <key>

# Moonshot (international): a key is required
magpie search add magpie-websearch:moonshot <key>

# Moonshot CN (domestic): a key is required
magpie search add magpie-websearch:moonshot-cn <key>

# Querit: a key is required
magpie search add magpie-websearch:querit <key>

# SerpApi: a key is required
magpie search add magpie-websearch:serpapi <key>

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
`parallel.maxResults`. `text` joins `excerpts` with `\n\n` and trims to
`parallel.contentChars` (default 4000 code points, `0` keeps all returned text).
`publish_date` preserves the original date string as `age`.

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
- **Content Mode and Truncation**: Defaults to snippet mode (`content: "snippet"`), omitting `include_content` from the request and reading `snippet`. In full-text mode (`content: "full"`), requests include `"include_content": true`, and valid `text` is preferred over `snippet` while preserving whitespace and indentation. Both modes cap text to `contentChars` (default 4000 code points, `0` disables local truncation), appending `…` without splitting emoji surrogate pairs. Note that Magpie applies its own 1500-byte cap downstream.
- **Result Processing**: Upstream must return an object with a `search_results` array. Entries lacking valid URLs or object shape are dropped; if upstream returns items but none are valid, a structural error is raised instead of caching an empty result. `title` falls back to the URL, and the original string `date` maps to `age`.
- **Rate Limit Headers**: On HTTP 429, standard `Retry-After` (delay-seconds or HTTP-date) takes precedence, including a valid zero delay. If missing or invalid, `X-RateLimit-Reset` is interpreted as the official Unix timestamp in seconds, rounded up to a relative delay; only 1–86400 seconds is accepted. If the raw integer exceeds `1e11` and its seconds interpretation fails, the plugin also tries a proxy's integer millisecond timestamp within the same delay window. The 24-hour bound is a local defensive policy; millisecond tolerance is not an official protocol guarantee. Expired, malformed or excessive resets are omitted so host defaults apply, rather than capped to 24 hours. This bound applies only to the reset header and does not change standard `Retry-After` priority or handling.
- **Billing and Limits**: Official charges apply to HTTP 200 responses with a non-empty upstream `search_results` array ($0.002/search internationally before applicable taxes, ¥0.01/search domestically). Upstream failures and empty arrays are not charged. Local filtering or truncation does not reduce the charge; discarding all unusable entries locally does not establish that a search was free. Search QPS limits are separate from model RPM/TPM limits. The international site requires at least $1 recharge to enable API access. Keys are configured separately; the plugin does not share keys or retry across sites automatically.
- **Custom Base URL**: Custom endpoints are used exactly as provided without heuristics or appended paths.

Both adapters have passed dummy-key local simulations and Magpie host checks for
requests, snippet/full-text mapping, empty results, timeout, 429 reset headers,
key rotation and fallback. Neither site has been verified with a real account key
for successful search, full-text responses, latency, account rate limits or search quality.

<a id="result-processing"></a>

## What magpie does with a result

- `count` is 6: adapters request at most 6 results when supported; responses with unconfigurable result counts (such as anonymous MCP) are capped locally. magpie keeps at most 6.
- `text` is stripped of tags, unescaped, whitespace-collapsed, and cut to 1500 bytes.
- `age` is the vendor's own date string; this plugin does not parse or rewrite it.
- A hit without a URL is dropped.
- A thrown error with a numeric `status` (401, 402, 403, 429) is an API refusal. For keyed calls, magpie records the key's rest and tries the next key. Anonymous 429 cooldowns are managed by this plugin; failed APIs give way to the next configured API.
- `retryAfter` on a 429 follows the adapter's policy. SerpApi forwards only validated and normalized integer seconds or a standard HTTP date. Moonshot's two adapters prefer a valid standard header, falling back to the [reset-header rules](#moonshot-search) when it is missing or invalid. Other adapters use the shared header passthrough behavior.

<a id="configuration"></a>

## Full configuration reference

All plugin options are optional, including provider objects, their fields, and
the top-level `enable` and `disable` filters. Omitted provider fields fall back
to the environment variable or the default listed below.

Use **Plugins → Installed → Options**, or pass a JSON object on the command line.
For example, change search parameters while keeping all ten APIs registered:

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

Each API keeps a bounded search cache in memory, isolated by final endpoint,
key digest and request parameters (including result count). Empty results are
cached for at most 30 seconds.

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
| parallel | `cacheTTL` | `PARALLEL_CACHE_TTL` | `600000` | ≥ 0 |
| parallel | `timeout` | `PARALLEL_TIMEOUT` | `25000` | ≥ 0; includes reading the MCP stream |
| parallel | `maxResults` | `PARALLEL_MAX_RESULTS` | `10` | 1–20; cap on magpie's requested count |
| parallel | `contentChars` | `PARALLEL_CONTENT_CHARS` | `4000` | Code points per joined excerpt (`0` keeps all) |
| parallel | `mode` | `PARALLEL_MODE` | `fast` | `fast`, `turbo`, `basic`, `advanced`; non-fast modes require a key |
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
| tinyfish | `cacheTTL` | `TINYFISH_CACHE_TTL` | `600000` | ≥ 0 |
| tinyfish | `timeout` | `TINYFISH_TIMEOUT` | `25000` | ≥ 0; includes reading the MCP stream |
| tinyfish | `maxResults` | `TINYFISH_MAX_RESULTS` | `10` | ≥ 1; local cap, not an upstream page-size guarantee |
| tinyfish | `location` | `TINYFISH_LOCATION` | empty | Country code, e.g. `US`; omitted when empty |
| tinyfish | `language` | `TINYFISH_LANGUAGE` | empty | Language code, e.g. `zh`; omitted when empty |
| tinyfish | `domainType` | `TINYFISH_DOMAIN_TYPE` | `web` | `web`, `news`, `research_paper`; papers require a key at execution time |
| tinyfish | `includeDomains` | `TINYFISH_INCLUDE_DOMAINS` | empty | Comma-separated domains; maps to `include_domains` |
| tinyfish | `excludeDomains` | `TINYFISH_EXCLUDE_DOMAINS` | empty | Comma-separated domains; maps to `exclude_domains` |

Environment variables are read when the plugin instance is created. They
must be in the environment of the magpie process; setting a variable in a
separate terminal does not change an already running desktop app. Prefer options
for desktop use.

<a id="registration-filters"></a>

## Optional registration filters

The optional top-level `enable` and `disable` arrays control which APIs the
plugin registers. Entries use short IDs: `anysearch`, `keenable`, `linkup`,
`metaso`, `moonshot`, `moonshot-cn`, `parallel`, `querit`, `serpapi`, `tinyfish` (without the `magpie-websearch:` prefix).

| Filters | APIs registered |
|---|---|
| Both omitted, or `{}` | All ten APIs |
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
described under Configuration.

These filters control registration. magpie's Web search switches independently
control whether a registered API is asked, keeping its key and place in the list
when switched off. You can use those switches without setting either filter.

To remove all saved plugin options, including provider overrides and filters:

```sh
magpie plugin options magpie-websearch off
```

All ten APIs are registered again. Provider settings use environment
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
It covers Parallel and TinyFish MCP/REST, SerpApi, and both Moonshot adapters.
Moonshot cases also check seconds/milliseconds reset headers, excessive resets
and resting-key preference. It removes its sandbox when finished. Search requests
use only local mocks and dummy keys, without paid search calls; Magpie startup
may independently fetch public resources such as the model catalog.
`MAGPIE_PLUGIN_DIR` can point to an
unpacked npm package (keep its folder named `magpie-websearch` for stable vendor
IDs). `MAGPIE_SMOKE_ROOT` can override the system temporary directory used for
the sandbox. CI runs separate jobs for Node 22/24, Bun, and Magpie testing of the
unpacked npm package; the three jobs have no ordering dependency.

Local verification on **2026-11-05** used **Node.js 24.19.0** and **magpie 0.1.2964**.
The earlier **magpie 0.1.2911 / Bun 1.4.4** record is historical. No standalone Bun
executable was found in this environment, so `check:bun` could not run; the historical
record does not verify the current changes on the full Bun suite. These records
do not establish minimum supported versions.

Local folder installs use the folder name as the short name. Because the package is `@guotree/magpie-websearch` and the folder is `magpie-websearch`, both installs give the same `magpie-websearch:*` IDs.
