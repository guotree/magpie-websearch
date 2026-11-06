# Releasing

The package is published as `@guotree/magpie-websearch` from this repository.

## Trusted publishing setup

Trusted publishing requires an existing npm package. For a new package, publish
its first version manually before configuring it:

```sh
npm login
npm publish --access public
```

The package's `publishConfig.access` is already `public`, so `--access public`
is only an explicit reminder.

Then, on npmjs.com:

1. Open **Packages → @guotree/magpie-websearch → Settings → Trusted Publisher**.
2. Choose **GitHub Actions** and fill in:
   - **Organization or user:** `guotree`
   - **Repository:** `magpie-websearch`
   - **Workflow filename:** `publish.yml` (the filename only, with `.yml`)
   - **Environment name:** leave empty
   - **Allowed actions:** check **Allow npm publish**
3. Save.

Two important details:

- Configurations created after 2026-09-03 default to **`npm stage publish` only**.
  Our workflow runs `npm publish`, so **Allow npm publish** must be checked.
- A new trusted publisher must complete its first successful publish within
  **2 days**, or it expires. If it expires, delete it and create it again.

Do not push a release tag for a version already published manually. The tag
workflow starts with the next unpublished version.

## Later releases

Before bumping the version:

- Run `npm run check`, `npm run check:bun` and `npm run smoke:magpie`.
- Record the magpie version verified by the smoke test in the release notes.
- Verify Magpie 0.1.3062+ `web_search` counts with a local upstream that returns
  at least 25 results: omitted count keeps 6, requested 12/20 follows the host
  without a configured cap, and explicit options/environment values still cap.
  Check provider maxima and legacy missing-count fallbacks. This changes default
  sizing for host requests above previous defaults; describe it in release notes
  and preserve explicit user caps rather than raising every default to 20.
- Use `resultLimit` / `*_RESULT_LIMIT` consistently for public configuration.
  Verify migration warnings and precedence for legacy `maxResults` / `*_MAX_RESULTS`
  and Querit's `count` / `QUERIT_COUNT`. Keep `countPolicy.configuredLimit`,
  `fallbackCount` and `providerMax` distinct; do not rename upstream wire fields.
- Keep the Chinese and English READMEs, both versions of the
  [configuration reference](docs/technical-reference.en.md#configuration), and the
  [provider checklist](PROVIDERS.md#adding-a-provider) in sync with any option changes.
  All options are optional: omitted `enable`/`disable` register every API;
  `enable: []` registers none, `disable: []` excludes none, and `disable` wins
  when both name the same API. Document per-provider fields, defaults and
  environment mappings. Confirm that parameter-only examples still register all
  APIs and that the smoke test covers the combined registration filters.
- Verify that AnySearch, Keenable, Parallel and TinyFish can be added with no key, remain
  ready in magpie, and reach their anonymous endpoints. The host smoke test must check
  anonymous 429 cooldown and fallback; keyed calls must keep their authentication
  and remain independent of an anonymous cooldown.
- For Parallel and TinyFish, check anonymous MCP JSON/SSE and keyed REST, complete custom
  endpoint URLs, local result caps, and mode/domain restrictions. Keep the shared MCP transport in
  [src/mcp/stateless.mjs](src/mcp/stateless.mjs) and shared
  [src/mcp/response.mjs](src/mcp/response.mjs) included in the
  npm package. Distinguish live anonymous verification from local fake-service
  checks; do not claim a live keyed success or an anonymous quota without evidence.
- Include [src/mcp/search-results.mjs](src/mcp/search-results.mjs) in the package.
  Verify structured content takes precedence even for empty results, metadata is
  preserved, and text parts are inspected in order. Keep alternate array keys and
  additional JSON decoding layers explicit per caller; Coding Plan compatibility
  must not broaden Parallel/TinyFish's default extraction policy.
- For both Moonshot sites, check independent registration and credentials, Basic
  request limits, snippet/full-text mapping, seconds/milliseconds reset headers,
  excessive-reset omission, key rotation and explicit fallback. Keep both entry
  modules and the shared factory in the package. Report local dummy-key verification
  separately from any successful live search with real account keys.
- For Zhipu and Z.ai, check independent registration and credentials, domestic
  engine/count tiers and the 70-code-point query limit, international fixed-engine
  warnings, Quark environment-filter fallback and explicit configuration errors,
  response/business-error validation, key rotation and explicit cross-site fallback.
  Keep both entry modules and the shared factory in the package. Distinguish local
  dummy-key checks from real-key verification of result counts, filters and billing.
- For `zhipu-coding` and `zai-coding`, verify the complete Streamable HTTP lifecycle
  (`initialize`, initialized notification, `tools/list`, `tools/call`, `DELETE`),
  JSON and SSE, negotiated protocol/session headers, the shared total timeout,
  live-schema field gating, tool-name compatibility, result decoding and cache
  isolation by site/key/endpoint/count/filter. Preserve HTTP 401/403/429 status and
  validated `Retry-After` without exposing refusal bodies, credentials or session IDs.
  Confirm failed MCP requests never call Standard REST or cross to the other site.
  Keep [src/mcp/session.mjs](src/mcp/session.mjs), the shared response reader, both entry modules and the
  Coding Plan shared factory in the package.
- Treat Coding Plan support as experimental until Zhipu/Z.ai confirms that Magpie use
  is permitted by the current client policy. Do not claim official Magpie support.
  Record real-key verification separately for China and international accounts, and
  verify shared-credit usage independently from Standard REST billing before release.
- For StepFun China, check REST `query`/`n`/`category`, snippet/full-text fallback,
  Unicode text budgets, malformed/empty results, timeout and cancellation, Credit
  429 and moderation 451. Verify long errors retain `type`/`code`, withheld 402
  bodies are cancelled without blocking, and interrupted 401 bodies still permit
  key rotation. Keep domestic REST separate from Step Plan MCP; distinguish
  dummy-key/local-host checks from real-key search and billing verification.
- For Bocha, check ordinary snippets by default, explicit generated-summary opt-in,
  freshness passthrough, original date strings, nullable webPages and strict data
  validation. Preserve code/log_id before bounded diagnostics and HTTP status on
  interrupted refusal bodies. Do not publish unverified summary pricing, trial
  eligibility, QPS or empty-result billing claims.
- For Ollama cloud search, require the supplied account key, cap max_results at 10,
  truncate content by Unicode code points and omit undocumented dates. Distinguish
  free account access from anonymous search and model subscriptions from search quotas.
- For both, verify exact URLs, isolated caches, timeout/host cancellation, 429
  Retry-After (including zero), Linkup fallback and ordered key rotation on 429
  and interrupted 401 bodies. Report local dummy-key proof separately from real-key
  success, billing, quality and live limits.
- For Jina, Kagi and Serper, check the required key and exact POST endpoints:
  `https://s.jina.ai/search`, `https://kagi.com/api/v1/search` and
  `https://google.serper.dev/search`. Jina and Kagi authenticate with a Bearer
  key; Serper uses an `X-API-KEY` header, not Bearer. Confirm the result mapping:
  Jina reads `data[]` (`description`, or `content` with a `description` fallback;
  `publishedTime` to `age`), Kagi reads `data.search[]` (`snippet`, `time` to `age`)
  and Serper reads `organic[]` (`snippet`, `date` to `age`); all three drop entries
  without a URL before the local cap, with blank titles falling back to the URL.
- For Jina, verify `content` snippet/full: `X-Respond-With: no-content` only in
  snippet mode, full text preferring `content` over `description`, and
  `contentChars` truncation by Unicode code points (default 4000; `0` keeps all),
  with `resultLimit` 1–20 and the wire `num` capped at 20. For Kagi, verify `lens`
  overriding `recency` (day/week/month) with a factory warning, `lens_id` versus
  `lens.time_relative`, `region` via `filters.region` and the 1024 local cap. For
  Serper, keep the wire `num` fixed at 10 with a local cap of 10 (`resultLimit` 1–10)
  and `gl`/`hl`/`tbs` in the body; keep SerpApi isolated as a separate GET
  `https://serpapi.com/search` with an `api_key` query parameter, its own key and
  cache, and no `X-API-KEY` or `api_key` cross-talk between the two.
- For all three, check the locally exercised coverage: exact URLs (including
  custom endpoints), caches isolated by key, count and endpoint, timeouts
  (per-provider in the host smoke test; host cancellation via the shared
  `requestJSON` tests), 429 `Retry-After` (for example `0007` normalized to `7`),
  HTTP/business refusals, malformed and empty payloads, ordered key rotation on 429
  and interrupted 401 bodies that prefers the healthy key afterward, and fallback
  to a configured Linkup search on refusal. Report the local dummy-key and
  fake-upstream checks separately; do not claim real-key success, billing,
  quality or live limits without evidence.
- Run `npm pack --dry-run` and check that the entry, `src/`, `docs/` and
  `assets/icon-128.png` are included. Keep runtime files committed so GitHub installs
  work without a build.
- If `assets/icon-128.png` changes, add or update the `magpie.icon` URL's `v` query
  parameter in `package.json` too. magpie caches a successful icon URL; new bytes at
  the same URL may keep showing the old picture. Push the image to `main` before
  publishing a package whose metadata points to it.

```sh
npm version patch   # or minor / major
git push --follow-tags
```

`npm version` updates `package.json`, commits, and creates the `v<version>` tag.
Pushing the tag runs `.github/workflows/publish.yml`, which:

1. checks the tag matches `package.json`;
2. runs `npm run check` and `npm pack --dry-run`;
3. publishes with OIDC (`id-token: write`), with provenance generated
   automatically.

If you tag by hand, first commit the version bump and all release files, then
create `v<version>` using exactly the version in package.json. For example,
replace `NEXT_VERSION` below with the new version:

```sh
# Commit all release changes before creating the tag
git tag -a vNEXT_VERSION -m "Release vNEXT_VERSION"
git push --follow-tags
```

Use an annotated tag as above: `--follow-tags` does not push lightweight tags.

After CI and the npm publish workflow succeed, publish the GitHub Release using
the existing tag. Write the release notes to a UTF-8 Markdown file with actual
line breaks and blank lines between paragraphs and lists, then pass that file:

```sh
gh release create vNEXT_VERSION --verify-tag --title "vNEXT_VERSION" --notes-file release-notes.md
```

The release notes file is an input to the release command; it is not part of the
npm package. Check that the published release body retains its line breaks.

## Token fallback

If you ever need to publish without OIDC, create a granular access token on
npmjs.com with read/write access to `@guotree/magpie-websearch` and 2FA bypass,
save it as the `NPM_TOKEN` repository secret, and add this to the publish step:

```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Trusted publishing is preferred; keep a token only as a fallback.

## Verify

```sh
npm view @guotree/magpie-websearch version
```

Confirm that npm reports the intended release version, then check the npm
package page for the provenance badge and its link to the publishing workflow.
