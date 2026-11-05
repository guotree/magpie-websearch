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
  [src/mcp.mjs](src/mcp.mjs) included in the
  npm package. Distinguish live anonymous verification from local fake-service
  checks; do not claim a live keyed success or an anonymous quota without evidence.
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
