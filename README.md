# magpie-websearch

Web search APIs for [magpie](https://usemagpie.ai). This is a **magpie plugin**, not an MCP tool: once installed, the APIs appear in **Settings › Models › Web search**, and magpie uses them for its `web_search` tool when no provider can search.

Pilot: **AnySearch**, **Keenable**, **Linkup**, plus **Querit**. All require a key; magpie owns the keys. The remaining providers from [guotree/opencode-search-plugin](https://github.com/guotree/opencode-search-plugin) will be ported in batches; see [PROVIDERS.md](PROVIDERS.md).

## Install

```sh
magpie plugin add @guotree/magpie-websearch
# or from GitHub
magpie plugin add github:guotree/magpie-websearch
```

The package's short name is `magpie-websearch`, so the vendor IDs are:

```text
magpie-websearch:anysearch
magpie-websearch:keenable
magpie-websearch:linkup
```

## Configure

In the app: **Settings › Models › Web search**, add a key for each API you want, switch it on, and order it.

In a terminal:

```sh
# AnySearch: a key is required
magpie search add magpie-websearch:anysearch <key>

# Keenable: a key is required
magpie search add magpie-websearch:keenable <key>

# Linkup: a key is required
magpie search add magpie-websearch:linkup <key>

# Querit: a key is required
magpie search add magpie-websearch:querit <key>
```

Several keys for one API are separated by commas; magpie takes them in turn and rests one the vendor refuses:

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

## Providers

| API | Vendor ID | Key | Notes |
|---|---|---|---|
| AnySearch | `magpie-websearch:anysearch` | required | Intent routing, `cn`/`intl` zones, markdown or JSON content. The anonymous tier is deliberately not wired up |
| Keenable | `magpie-websearch:keenable` | required | 100,000 free requests/month. The keyless `/public` pool is deliberately not wired up; see below |
| Linkup | `magpie-websearch:linkup` | required | `content` is a query-relevant excerpt, not the page; depth buys recall, not text |
| Querit | `magpie-websearch:querit` | required | Snippet, or joined sentence matches when a snippet is missing; `QUERIT_COUNT` caps results |

### Why the pilot requires keys

Keenable's keyless `/public` pool is shared per egress IP (1,000 requests an hour and 10 a second), and magpie does not rest an empty key after a 429. Every search would therefore hit the shared pool again with no cooldown, and a proxy, NAT or cloud runner can make that pool unpredictable. This package requires a key; the keyed account gets 100,000 free requests a month.

AnySearch's anonymous tier is also not wired up: the pilot keeps one predictable quota per key instead of a second shared pool. Linkup and Querit already required a key.

## What magpie does with a result

- `count` is 6: the plugin asks for at most 6 pages; magpie keeps 6.
- `text` is stripped of tags, unescaped, whitespace-collapsed, and cut to 1500 bytes.
- `age` is the vendor's own date string; this plugin does not parse or rewrite it.
- A hit without a URL is dropped.
- A thrown error with a numeric `status` (401, 402, 403, 429) is a key refusal: magpie rests that key and tries the next. Any other throw is a failure.
- `retryAfter` on a 429 is passed through.

## Keys

magpie owns the keys. The plugin does **not** read `OSP_ANYSEARCH_API_KEY`, `OSP_KEENABLE_API_KEY`, or `OSP_LINKUP_API_KEY`; set the key in magpie so the UI, the key list and the plugin all see the same credential.

## Configuration

Knobs are read from the environment when the plugin loads. Restart magpie (or turn the plugin off and on) after changing one.

| Variable | Default | Applies to |
|---|---|---|
| `ANYSEARCH_CACHE_TTL` | `600000` | ms to reuse a response for the same query (`0` disables) |
| `ANYSEARCH_MAX_RESULTS` | `10` | cap on results (1–10) |
| `ANYSEARCH_TAG` | — | pin AnySearch's intent router, e.g. `code.snippet` |
| `ANYSEARCH_ZONE` | — | `cn` or `intl` |
| `ANYSEARCH_LANGUAGE` | — | e.g. `zh-CN` |
| `ANYSEARCH_FORMAT` | `markdown` | `markdown` or `json` |
| `ANYSEARCH_TIMEOUT` | `25000` | ms before the request fails (`0` removes the deadline) |
| `KEENABLE_CACHE_TTL` | `600000` | same |
| `KEENABLE_MAX_RESULTS` | `10` | cap (1–50) |
| `KEENABLE_MODE` | — | `pro` or `realtime` |
| `KEENABLE_TITLE` | `magpie-websearch` | `X-Keenable-Title`; names the calling application |
| `KEENABLE_TIMEOUT` | `25000` | same |
| `LINKUP_CACHE_TTL` | `600000` | same |
| `LINKUP_DEPTH` | `fast` | `flash`, `fast`, `standard`, `deep` |
| `LINKUP_MAX_RESULTS` | `10` | cap (1–100) |
| `LINKUP_CONTENT_CHARS` | `4000` | code points kept from each excerpt (`0` keeps all) |
| `LINKUP_TIMEOUT` | `25000` | same |
| `QUERIT_CACHE_TTL` | `600000` | same |
| `QUERIT_COUNT` | `8` | cap on results; magpie asks for 6, so a larger value is not sent; Querit applies its own limit |
| `QUERIT_TIMEOUT` | `25000` | same |

## Options

The plugin accepts magpie's plugin options:

```sh
magpie plugin options magpie-websearch '{"disable":["keenable"]}'
```

- `enable`: only these IDs are registered.
- `disable`: these IDs are not registered; it wins over `enable`.
- Unknown IDs are named in magpie's log rather than failing the whole plugin.

## Develop

```sh
npm test        # node:test, no dependencies
npm run check   # load index.mjs and validate the search hook shape
```

Local folder installs use the folder name as the short name. Because the package is `@guotree/magpie-websearch` and the folder is `magpie-websearch`, both installs give the same `magpie-websearch:*` IDs.

## Roadmap

[PROVIDERS.md](PROVIDERS.md) tracks the 22 providers from `opencode-search-plugin`, the four done here, and the ones that overlap magpie's built-in search APIs.

## License

MIT
