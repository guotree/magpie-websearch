# Metaso (秘塔) integration plan

Status: proposed; no provider implementation yet. Researched on **2026-11-04**.

Add `metaso` as an authenticated REST search provider: requests use the official
Metaso (秘塔AI搜索) Search API (`POST https://metaso.cn/api/v1/search`) with Bearer
authentication. Follow the existing Linkup / Querit provider conventions and
shared contracts: configuration, in-memory cache, abort signals, deadline
enforcement, and error mapping. Keep the package free of runtime dependencies.

---

## 1. Eligibility and repository conventions

Metaso is listed under `## Planned` in [PROVIDERS.md](../PROVIDERS.md#planned)
and is absent from magpie's built-in search vendors and provider presets at commit
[`f177c36a`](https://github.com/yetone/magpie/tree/f177c36a9bce287a735b01ef4c1a65fcbeaac559).
This satisfies the eligibility criteria for addition to this plugin.

Use these identifiers:

| Field | Value |
|---|---|
| Short ID / provider options | `metaso` |
| Vendor ID | `magpie-websearch:metaso` |
| Display name | `Metaso (magpie-websearch)` |
| Factory | `createMetaso(options = {})` |
| Keys URL | `https://metaso.cn/search-api/api-keys` |
| Playground URL | `https://metaso.cn/search-api/playground` |
| Key requirement | Required (`keyOptional: false` / default) |

Alphabetical placement:
Register between `linkup` and `parallel` (or after `linkup`), maintaining
alphabetical order in `index.mjs`, documentation tables, and test expectations.
Preserve `enable` and `disable` options. magpie manages saved keys, rotation,
on/off switches, and priority. Do not read `METASO_API_KEY` inside the provider
adapter: the host supplies the key through `execute({ key })`.

---

## 2. Protocol research and specification

### 2.1 Endpoint and Authentication

- **Endpoint**: `POST https://metaso.cn/api/v1/search`
- **Headers**:
  - `Authorization: Bearer <API_KEY>` (keys typically start with `mk-` or `sk-`)
  - `Content-Type: application/json`
  - `Accept: application/json`
- **Anonymous access**: Metaso does not provide an anonymous/keyless REST tier.
  Requests without a key fail with HTTP 401. If no key is provided in `execute`,
  the adapter immediately throws a friendly configuration error before network fetch.

### 2.2 Request Body Parameters

Based on Metaso's API playground (`https://metaso.cn/search-api/playground`) and
official documentation:

| Parameter | Type | Required | Default in Adapter | Description |
|---|---|---|---|---|
| `q` | `string` | Yes | - | Normalized query string |
| `scope` | `string` | No | `"webpage"` | Search scope: `"webpage"`, `"document"`, `"paper"`, `"image"`, `"video"`, `"podcast"` |
| `size` | `number` | No | min(count, maxResults, 50) | Number of results requested (1–50) |
| `page` | `number` | No | `1` | Pagination page number |
| `concise` | `boolean` | No | `true` | Return concise, focused snippet matching info |
| `includeSummary` | `boolean` | No | `false` | Whether to boost recall via webpage summary info |
| `includeRawContent` | `boolean` | No | `false` | Extract full-text content of source web pages |

### 2.3 Response Structure

A successful response (HTTP 200) has the shape:

```json
{
  "credits": 3,
  "total": 21,
  "webpages": [
    {
      "title": "网页标题示例",
      "link": "https://example.com/page",
      "snippet": "这是网页内容的高亮或匹配摘要片段...",
      "score": "medium",
      "date": "2024-01-01"
    }
  ]
}
```

*Note on result field naming*:
- The primary result list for `scope: "webpage"` is returned in `webpages`.
- For other scopes (e.g. `paper`, `document`), Metaso may return `papers`, `documents`, or fall back to `results`. The adapter will check `webpages ?? results ?? []` and filter entries with a valid link.
- Notice the URL field is named **`link`** (not `url`). The adapter must check `item.link || item.url`.
- The snippet is in `item.snippet`.
- The publication date (if present) is in `item.date`, which maps to `page(..., date)`.

---

## 3. Adapter design and behavior

### 3.1 URL Handling

- Default endpoint: `https://metaso.cn/api/v1/search`
- Custom Base URL: uses `resolveEndpoint(url, "https://metaso.cn/api/v1/search")`.
  If a custom URL is provided, it must be an HTTP(S) URL without credentials,
  query, or hash, used directly as the exact endpoint.

### 3.2 Configuration Options

Evaluate options with precedence: explicit option -> environment variable -> default.
Reuse shared helpers `configInt` and `configStr`.

| Option | Environment Variable | Default | Allowed Values / Range | Description |
|---|---|---|---|---|
| `cacheTTL` | `METASO_CACHE_TTL` | `600000` | integer >= 0 | Cache time-to-live in ms; 0 disables cache |
| `timeout` | `METASO_TIMEOUT` | `25000` | 0–2147483647 | Request timeout in ms; 0 leaves only host deadline |
| `maxResults` | `METASO_MAX_RESULTS` | `10` | 1–50 | Local cap on requested/returned results |
| `scope` | `METASO_SCOPE` | `"webpage"` | `"webpage"`, `"document"`, `"paper"`, `"image"`, `"video"`, `"podcast"` | Search scope |
| `contentChars` | `METASO_CONTENT_CHARS` | `4000` | integer >= 0 | Snippet character cap per item; 0 keeps all text |
| `concise` | `METASO_CONCISE` | `true` | boolean | Request concise snippets |

### 3.3 Query Normalization and Validation

- Normalize via `normalizeQuery(query)`.
- If the normalized query is empty, throw a descriptive error or return empty results according to existing search contract conventions.
- Map count using `sizeFor(count, maxResults, 50)`.

### 3.4 Result Transformation

- Read items from `json.webpages ?? json.results`.
- Drop null/undefined entries or items missing a valid `link` / `url`.
- Map each item to `page(item.title, item.link || item.url, trimContent(item.snippet), item.date)`.
- Enforce `contentChars` truncation with an ellipsis (`…`) when truncated.
- Slice output to `sizeFor(count, maxResults, 50)`.

### 3.5 Caching and Error Handling

- Cache key: `cacheKey(endpoint, body, key)` ensures results are not cross-contaminated between queries, keys, scopes, or endpoints.
- Check cache before making network calls.
- Wrap HTTP requests with `requestJSON(endpoint, options, ctx, { label: "Metaso", timeout })` to preserve abort signal (`ctx.abort`), timeout, and numeric HTTP error statuses.
- Metaso-specific HTTP errors:
  - 401: Unauthorized / invalid API key.
  - 400: Malformed query or arguments.
  - 429: Rate limited or quota depleted.

---

## 4. Implementation phases and PR breakdown

To ensure maintainability and seamless code reviews, the implementation will follow standard PR stages:

### Phase 1: Planning and Research (Current PR)
- [x] Survey Metaso official API & playground.
- [x] Create `docs/metaso-plan.md` detailing protocol, options, and contract mapping.
- [ ] Submit PR into `main` to align on specifications.

### Phase 2: Core Adapter and Integration
- [ ] Implement `src/providers/metaso.mjs`.
- [ ] Export and register `metaso` in `index.mjs`.
- [ ] Add unit tests in `test/metaso.test.mjs` and fixtures in `test/cases.mjs`.
- [ ] Update `test/index.test.mjs`, `test/search-contract.test.mjs`, and `scripts/check.mjs`.

### Phase 3: Host Smoke Verification and Documentation
- [ ] Extend `scripts/smoke-magpie.mjs` with a Metaso mock/fake route.
- [ ] Verify execution, key handling, timeouts, and options.
- [ ] Update `PROVIDERS.md` (move Metaso to Supported) and `README.md`.
- [ ] Update `package.json` description/keywords.
