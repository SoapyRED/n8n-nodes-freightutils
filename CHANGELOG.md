# Changelog

## 0.1.1 — 2026-04-25

Closes 10 of the 27 bugs surfaced by the v0.1.0 dogfood (`dogfood/n8n-v0.1.0-bug-list.md`); the remaining 17 are deferred to v0.2.0 with one-line reasons below. Severity breakdown of closed: 0 Critical, 2 Major, 3 Minor, 5 Cosmetic.

### Closed

- **B005 (Major)** — HS Code Lookup field labelled `'HS Code or Keyword'` (was `'Query'`); helpText now reads `"Enter a numeric HS code (e.g. 8517) or a keyword (e.g. telephones). Both patterns work."` Mirrors Zapier v0.1.1 word-for-word.
- **B028 (Major)** — Credential test endpoint switched from `/api/health` (which returned 200 to any caller and silently green-ticked invalid keys) to `/api/auth/whoami` (requires a valid key, returns 401 otherwise). Closes the security/UX defect identified in the dogfood. Same fix landed in the Zapier app v0.1.2.
- **B014 + B026 (Minor)** — AWB Prefix helpText tightened to "3-digit IATA AWB prefix (numeric only, e.g. 176 for Emirates SkyCargo). An empty results array means no airline holds that prefix."
- **B021 (Cosmetic)** — Calculate Consignment action description now hyphenated: `'Calculate a multi-item consignment'`.
- **B022 (Cosmetic)** — Items collections renamed for context: `'Consignment Items'` on the consignment operation, `'Dangerous Goods Items'` on the ADR LQ/EQ Check operation.
- **B020 + B023 (Cosmetic)** — Unit symbols now lowercase per SI: `(cm)` (was `(Cm)`), `(kg)` (was `(Kg)`), `(kg or L)` (was `(Kg Or L)`). Applied across Length / Width / Height / Gross Weight / Pallet & Box dimensions / ADR exemption Quantity / ADR LQ Kilograms option.

### Underlying API change (passthrough impact)

- **B001 + B002 (Major)** — The FreightUtils REST API migrated to `snake_case` site-wide (website commit `636bfb1`). Six endpoints (`/api/unlocode`, `/api/uld`, `/api/containers`, `/api/vehicles`, `/api/consignment`, `/api/duty`) previously returned `camelCase`; all now return `snake_case`. Plus `/api/hs`'s `hscode` is now `hs_code`. The n8n node uses declarative routing — n8n forwards the API JSON to downstream nodes verbatim — so user expressions referencing the old camelCase keys (`$json.results[0].locationCode`, `$json.commodityCode`, `$json.results[0].hscode`, etc.) need to be re-keyed to snake_case (`$json.results[0].location_code`, `$json.commodity_code`, `$json.results[0].hs_code`). No code change in this node was required to surface the new shapes, but **breaking for any user workflows that referenced the old keys.**

### Deferred to v0.2.0

Each item below is a real bug from the dogfood report. Listed with the reason it didn't fit a patch release.

- **B003 (Major)** — `/api/health` vs `/api/tools` count mismatch. Closed on the website side (commit `3e080d7`) — the n8n node doesn't surface this count anywhere, so no node-side change needed.
- **B004 (Major)** — `/api/duty` accepts both camelCase and snake_case input; n8n node currently sends camelCase via routing.body. The duty endpoint continues to accept both; aligning the routing.body to snake_case is a v0.2.0 cleanup.
- **B006 (Minor)** — `/api/uld?type=` returns `{result}` (singular) while no-param returns `{results}`. Source-side API shape inconsistency; node doesn't reshape. v0.2.0 may add a `routing.output.postReceive` to normalise.
- **B007 (Minor)** — ULD Type / Container Type are free-text strings; v0.2.0 will convert to `options` enums (15 ULDs, 10 containers — small enough to enumerate).
- **B008 (Minor)** — Vehicle Lookup exposes only `category` filter, not `?slug=` for single-vehicle lookup. v0.2.0 enhancement.
- **B009 (Minor)** — `un_number` → `unNumber` in adrLqCheck items collection for cross-action consistency with consignment camelCase fields. Defer: requires routing.body remap (`items: items.map(i => ({un_number: i.unNumber, ...}))`) which is risky on a patch release; existing user workflows likely have `$item.un_number` expressions that would break.
- **B010 (Minor)** — Subtitle template uses raw operation key (`cbm`) not display name. Cosmetic; v0.2.0.
- **B011 (Minor)** — Convert Units `from` / `to` are free-text; v0.2.0 will switch to options dropdown grouped by dimension (mass / length / volume).
- **B012 (Minor)** — Inconsistent error response shapes across endpoints (`{error}` vs `{error, hint}` vs `{error, valid_codes}` vs `{count: 0, results: []}`). API-side concern; out of node scope.
- **B013 (Minor)** — UNLOCODE empty-results returns 200 with no `error` field. May be desired; v0.2.0 may add a `failOnEmpty: boolean` option on lookup operations.
- **B015 (Minor)** — LDM Pallet Type dropdown missing US Standard. v0.2.0 audit + expand.
- **B016 (Minor)** — LDM stack factor / weight-per-pallet not exposed. v0.2.0 enhancement.
- **B017 (Minor)** — ULD/Container/Vehicle list mode (no params) not exposed. v0.2.0 lookup-mode selector.
- **B018 (Minor)** — Container fit-check mode (`?l=&w=&h=`) not exposed. v0.2.0 optional dimension fields.
- **B019 (Cosmetic)** — `from` / `to` field names in Convert. Defer: rename breaks user expressions referencing `$parameter.from`.
- **B024 (Minor)** — No output schema declared on any operation. Substantial work (need samples per operation); v0.2.0.
- **B025 (Minor)** — Several `eslint-disable-next-line n8n-nodes-base/...` directives. Hygiene; v0.2.0.
- **B027 (Cosmetic)** — `/api/chargeable-weight` sea mode returns both `basis` and `billing_basis` (duplicate). API-side; out of node scope.

### Docs

- README badges: added monthly + total npm downloads + license alongside the existing version.
- CHANGELOG.md created.

### Out-of-scope per sprint hard rule

This sprint did not touch n8n's runtime build pipeline, the dogfood bug list document, the website API, or other repos. Source-only n8n node fixes.

## 0.1.0 — 2026-04-24

Initial release. 19 operations across 4 resources (Freight Ops, Dangerous Goods, Customs & Trade, Reference Data). Declarative routing, `X-API-Key` auth via `FreightUtilsApi` credential.
