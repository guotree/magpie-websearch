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

Every search definition's `name` must follow `<Provider> (magpie-websearch)`.
This suffix identifies the plugin in magpie's GUI and CLI. Keep the short API ID
and the namespaced vendor ID independent of the display name; suffix changes
must not rename the IDs used by saved keys, switches, order or plugin options.

All four APIs are registered by default. `enable` and `disable` are optional
plugin options that filter this list by short ID (`linkup`, for example).
`disable` takes precedence over `enable`; `enable: []` registers none, while
`disable: []` excludes none. Provider settings such as `linkup.depth` do not
restrict registration by themselves. magpie manages keys, request order and
on/off switches for the registered APIs. See [README](README.md#optional-registration-filters)
for the full behavior and configuration examples.

AnySearch and Keenable declare `keyOptional: true`, so magpie accepts them with
an empty key and considers them ready for search. Their anonymous requests omit
authentication headers; Keenable selects the `/public` endpoint and sends
`X-Keenable-Title`. Anonymous 429 cooldowns are maintained per API instance and
final endpoint, respecting `Retry-After` with a 60-second default. Keyed requests
and other endpoints are independent of that cooldown. See
[anonymous search](README.md#anonymous-search) for setup and switching modes.

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
| TinyFish | `magpie-websearch:tinyfish` |

The list was checked on **2026-11-04** against magpie commit
[`4ca55c6`](https://github.com/yetone/magpie/tree/4ca55c6b62eeac30351b17ae37ad4f4dad9fd8e8):

- [Built-in search APIs](https://github.com/yetone/magpie/blob/4ca55c6b62eeac30351b17ae37ad4f4dad9fd8e8/internal/provider/search_api.go)
- [Built-in provider presets](https://github.com/yetone/magpie/blob/4ca55c6b62eeac30351b17ae37ad4f4dad9fd8e8/internal/provider/presets.go)

A provider is excluded from the roadmap if it exists in either list, even when
its official preset is for model access rather than a standalone search API.
Check both lists again before starting an integration, and remove candidates
that magpie has since added. A custom user-configured endpoint is not a built-in
integration.

## Adding a provider

1. Check official magpie support and the provider's current API documentation.
2. Implement `execute({ query, count, key, url }, ctx)`. Use the supplied key,
   honor the custom Base URL, and cap `count` according to the API's limits.
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
