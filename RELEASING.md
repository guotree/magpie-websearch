# Releasing

The package is published as `@guotree/tools-websearch` from this repository.

## First publish (once, from your machine)

Trusted publishing is configured on a package that already exists, so publish
the first version by hand:

```sh
npm login
npm publish --access public
```

The package's `publishConfig.access` is already `public`, so `--access public`
is only an explicit reminder.

Then, on npmjs.com:

1. Open **Packages → @guotree/tools-websearch → Settings → Trusted Publisher**.
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

Do **not** push a `v0.1.0` tag after the manual publish: that version already
exists, and the workflow would fail trying to publish it again. The tag flow
starts at the next version (for example `0.1.1`).

## Later releases

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

If you prefer to tag by hand:

```sh
# bump the version in package.json first
git add package.json
git commit -m "release: 0.1.1"
git tag v0.1.1
git push --follow-tags
```

## Token fallback

If you ever need to publish without OIDC, create a granular access token on
npmjs.com with read/write access to `@guotree/tools-websearch` and 2FA bypass,
save it as the `NPM_TOKEN` repository secret, and add this to the publish step:

```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Trusted publishing is preferred; keep a token only as a fallback.

## Verify

```sh
npm view @guotree/tools-websearch version
npm audit signatures
```

The npm package page should show the provenance badge for versions published by
the workflow.
