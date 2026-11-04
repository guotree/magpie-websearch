# magpie-websearch

Web search APIs for [magpie](https://usemagpie.ai). This is a **magpie plugin**, not an MCP tool: once installed, the APIs appear in **Settings › Models › Web search**, and magpie uses them for its `web_search` tool when no provider can search.

Pilot: **AnySearch**, **Keenable**, **Linkup**. The remaining providers from [guotree/opencode-search-plugin](https://github.com/guotree/opencode-search-plugin) will be ported in batches; see [PROVIDERS.md](PROVIDERS.md).

## Install

```sh
magpie plugin add @guotree/tools-websearch
# or from GitHub
magpie plugin add github:guotree/magpie-websearch
```

The package's short name is `websearch`, so the vendor IDs are:

```text
websearch:anysearch
websearch:keenable
websearch:linkup
```

## Configure

In the app: **Settings › Models › Web search**, add a key for each API you want, switch it on, and order it.

In a terminal:

```sh
# AnySearch: the key is optional; anonymous access uses the free per-IP tier
magpie search add websearch:anysearch

# Keenable: a key is required
magpie search add websearch:keenable <key>

# Linkup: a key is required
magpie search add websearch:linkup <key>
```

Several keys for one API are separated by commas; magpie takes them in turn and rests one the vendor refuses:

```sh
magpie search add websearch:linkup key1,key2
```

Order, switch off, or remove:

```sh
magpie search move websearch:anysearch 1
magpie search off websearch:keenable
magpie search on websearch:keenable
magpie search rm websearch:linkup
```

`magpie search` lists every API magpie knows, including the ones this plugin gives.

## Providers

| API | Vendor ID | Key | Notes |
|---|---|---|---|
| AnySearch | `websearch:anysearch` | optional | Free per-IP tier; intent routing, `cn`/`intl` zones, markdown or JSON content |
| Keenable | `websearch:keenable` | required | 100,000 free requests/month. The keyless `/public` pool is deliberately not wired up; see below |
| Linkup | `websearch:linkup` | required | `content` is a query-relevant excerpt, not the page; depth buys recall, not text |

### Why Keenable needs a key

Keenable's keyless `/public` pool is shared per egress IP (1,000 requests an hour and 10 a second), and magpie does not rest an empty key after a 429. Every search would therefore hit the shared pool again with no cooldown, and a proxy, NAT or cloud runner can make that pool unpredictable. This package requires a key; the keyed account gets 100,000 free requests a month.

AnySearch remains the only keyless pilot: its anonymous tier is a separate free pool, and its key is optional.

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

## Options

The plugin accepts magpie's plugin options:

```sh
magpie plugin options websearch '{"disable":["keenable"]}'
```

- `enable`: only these IDs are registered.
- `disable`: these IDs are not registered; it wins over `enable`.
- Unknown IDs are named in magpie's log rather than failing the whole plugin.

## Develop

```sh
npm test        # node:test, no dependencies
npm run check   # load index.mjs and validate the search hook shape
```

Local folder installs use the folder name as the short name. If the folder is `magpie-websearch`, `magpie plugin add ./` gives `magpie-websearch:*`; use `npm pack` and install the tarball to test the `websearch:*` IDs.

## Roadmap

[PROVIDERS.md](PROVIDERS.md) tracks the 22 providers from `opencode-search-plugin`, the three done here, and the ones that overlap magpie's built-in search APIs.

## License

MIT
