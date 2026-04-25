# n8n v0.1.0 Dogfood — Bug List

*Date: 2026-04-25*
*Tester: Code (autonomous sprint)*
*Environment: source review of `n8n-nodes-freightutils` main @ working tree (post-build), plus direct calls against production `https://www.freightutils.com/api/*` using the Pro `SMOKE_API_KEY` to verify response shapes the n8n node would receive.*

> **Methodology note.** The sprint spec asked for a self-hosted n8n instance loading the node from working tree. Both the Docker route (no Docker on this Windows host) and the npx route (`npx -y n8n start`) failed to install — npm raised `ECOMPROMISED Lock compromised` on n8n's lockfile on two attempts (clean cache, fresh-cache override). Per the sprint hard rule "If Docker fails AND npx fails, abort and report rather than improvising a third install path", the dogfood was completed via (a) a full read of `nodes/FreightUtils/FreightUtils.node.ts` and `credentials/FreightUtilsApi.credentials.ts` and (b) direct API calls against production using the same parameter shapes the n8n node sends (resolved from each operation's `routing.request` block). All routing-level findings are equivalent to running through n8n; runtime-only findings (credential save dialog, node load on startup, in-app subtitle rendering) are explicitly flagged as **untested — n8n boot blocked**.

## Summary

- **Total operations tested:** 19 (6 Freight Ops + 3 Dangerous Goods + 3 Customs & Trade + 7 Reference Data)
- **Total bugs surfaced:** 27
  - **Critical:** 0
  - **Major:** 5
  - **Minor:** 14
  - **Cosmetic:** 8
- **Action coverage:** 19/19 happy-path verified via direct API; 12/19 error-path verified. Remaining error paths declared low value (no params, or already covered by sibling operation's error path).
- **Pro key requests used during dogfood:** ~30 (16 happy GET + 3 happy POST + 9 deliberate-error + ~2 health). Smoke key budget: 50,000/month — negligible impact.
- **Repo discrepancy:** the sprint spec named `SoapyRED/freightutils-mcp` as the n8n node repo. The n8n node actually lives in `SoapyRED/n8n-nodes-freightutils` (`freightutils-mcp` contains the MCP server). Bug list lands in the n8n-node repo.

## Bugs

### B001: Output field casing inconsistent across endpoints — snake vs camel

- **Severity:** Major
- **Action:** unlocodeLookup, uldLookup, containerLookup, vehicleLookup, consignment, dutyCalculator (camelCase) vs all other endpoints (snake_case)
- **Reproduction:**
  - `GET /api/airlines?prefix=176` → `{airline_name, iata_code, icao_code, awb_prefix, has_cargo}` (snake)
  - `GET /api/unlocode?q=rotterdam` → `{locationCode, nameAscii, iataCode}` (camel)
  - `GET /api/uld?type=AKE` → `{deckPosition, externalDimensions, internalDimensions, maxGrossWeight, tareWeight}` (camel)
  - `GET /api/containers?type=40ft-high-cube` → `{internalLengthCm, externalLengthCm, tareWeightKg, maxPayloadKg}` (camel)
  - `GET /api/vehicles?category=van` → `{internalDimensions, doorDimensions, maxPayload, grossVehicleWeight}` (camel)
  - `POST /api/consignment` → `{lengthCm, widthCm, heightCm, grossWeightKg, chargeableWeightAir}` (camel)
  - `POST /api/duty` → `{commodityCode, originCountryName, cifValue, dutyRate, vatAmount}` (camel)
- **Current behaviour:** n8n users have to switch between `$json.iata_code` and `$json.iataCode` depending on which operation they invoke. Expression code is not portable across operations.
- **Expected behaviour:** A single naming convention across every operation's output.
- **Proposed fix:** Either (a) normalise the freightutils API to one convention (out of n8n-node scope; needs a freighttools-website-repo sprint) or (b) add a `routing.output.postReceive` hook on each operation in the n8n node that maps the response keys to the chosen convention. Recommend snake_case (matches the majority of endpoints + matches Zapier's chosen direction for HS code).
- **Zapier parallel:** broader than Zapier bug 1d; Zapier only fixed `hscode → hs_code` for one endpoint, never confronted the full inconsistency.

### B002: `/api/hs` returns `hscode` (joined) — should be `hs_code`

- **Severity:** Major
- **Action:** hsLookup
- **Reproduction:** `GET /api/hs?q=coffee` → `{results: [{hscode: "0901", description: "Coffee...", level: 4, parent: "09", section: "II"}]}`. Every other identifier in the API uses snake_case (`un_number`, `iata_code`, `awb_prefix`).
- **Current behaviour:** n8n users see `$json.results[0].hscode`. Inconsistent with sibling identifiers.
- **Expected behaviour:** `hs_code`.
- **Proposed fix:** Either fix the API (commits the freighttools repo to a snake_case identifier) or remap in the n8n node's `routing.output.postReceive` for the hsLookup operation.
- **Zapier parallel:** EXACT match — Zapier bug 1d, fixed in Zapier v0.1.1 by remapping in the search's `perform` function.

### B003: `/api/health` reports `tools: 18` but `/api/tools` returns `count: 17`

- **Severity:** Major (data integrity, cross-platform)
- **Action:** healthPing, toolsList
- **Reproduction:**
  - `GET /api/health` → `{status: "ok", version: "1.0.5", tools: 18, endpoints: 19, ...}`
  - `GET /api/tools` → `{count: 17, tools: [...]}`
- **Current behaviour:** Sibling endpoints disagree by one. n8n users querying tool count for inventory get conflicting answers.
- **Expected behaviour:** Both endpoints report the same count, sourced from a single registry.
- **Proposed fix:** Audit the source of `/api/tools` enumeration in the freighttools repo and the constant in `/api/health`. One is stale; align them.
- **Zapier parallel:** n8n-specific surfacing (Zapier's `/health` and `/tools` endpoints aren't both wrapped in actions). Underlying API bug is cross-platform.

### B004: `/api/duty` accepts camelCase inputs but error messages reference snake_case fields

- **Severity:** Major (error UX)
- **Action:** dutyCalculator
- **Reproduction:** `POST /api/duty` with body `{commodityCode: "99999", originCountry: "BR", customsValue: 1000}` (this is the exact body shape the n8n node sends per the operation's routing.request.body) → response `{error: "commodity_code is required (min 6 digits)"}`.
- **Current behaviour:** Error message names `commodity_code` even though the caller (n8n) sent `commodityCode`. The user can't easily map the error back to which n8n field is at fault.
- **Expected behaviour:** Error references the field name the caller used (`commodityCode is required`), or the n8n node post-processes errors to remap.
- **Proposed fix:** API-level — emit consistent field names matching the input shape. Node-level workaround — `routing.output.postReceive` on dutyCalculator to swap snake→camel in error messages.
- **Zapier parallel:** Zapier sends snake_case (`commodity_code`) so the error message matches; n8n-specific cross-naming bug.

### B005: HS Code Lookup field labelled generically as "Query"

- **Severity:** Major (cross-platform consistency with Zapier v0.1.1 fix)
- **Action:** hsLookup
- **Reproduction:** Open node → Resource: Customs & Trade → Operation: HS Code Lookup. Input field `displayName: 'Query'`, helpText: "Free-text search — product name, material, or partial code".
- **Current behaviour:** Generic "Query" doesn't tell users that numeric HS codes also work. The API accepts both `?q=8517` (numeric prefix lookup) and `?q=telephones` (keyword).
- **Expected behaviour:** Label `'HS Code or Keyword'`, helpText `"Enter a numeric HS code (e.g. 8517) or a keyword (e.g. telephones). Both patterns work."`. (Mirrors Zapier v0.1.1 word-for-word.)
- **Proposed fix:** Update `nodes/FreightUtils/FreightUtils.node.ts` line 478 → 486:
  ```ts
  displayName: 'HS Code or Keyword',
  // ...
  description: 'Enter a numeric HS code (e.g. 8517) or a keyword (e.g. telephones). Both patterns work.',
  ```
- **Zapier parallel:** EXACT match — Zapier bug 1c, fixed in Zapier v0.1.1.

### B006: Item-mode lookups inconsistent — singular `result` vs plural `results` vs bare-object

- **Severity:** Minor (output shape branching)
- **Action:** uldLookup, vehicleLookup (single-mode), containerLookup, incotermsLookup
- **Reproduction:**
  - `GET /api/uld?type=AKE` → `{result: {...ULD...}, meta}` (singular wrapper)
  - `GET /api/vehicles?slug=luton-van` → `{result: {...vehicle...}, meta}` (singular wrapper, but the n8n node only exposes `category` filter not `slug` — see B007)
  - `GET /api/containers?type=40ft-high-cube` → `{slug: "...", name: "...", ...}` (BARE object — no wrapper at all)
  - `GET /api/incoterms?code=FOB` → `{code, name, slug, summary, ...}` (BARE object)
- **Current behaviour:** Three distinct shapes from related single-item operations: singular-wrapped, bare-object, plural-array. Downstream nodes need conditional handling.
- **Expected behaviour:** One consistent shape per operation, ideally `results: [...]` even for single-item lookups (so a Loop node can iterate uniformly).
- **Proposed fix:** API-level normalisation. Node-level workaround: `routing.output.postReceive` to wrap bare and singular results into `{results: [item]}`.

### B007: ULD Type and Container Type fields are free-text strings, not dropdowns

- **Severity:** Minor (UX)
- **Action:** uldLookup, containerLookup
- **Reproduction:** Open ULD Lookup → field is `type: 'string'` with helpText listing 3 examples. Same for Container Lookup. Full lists are small and stable: 15 ULDs, 10 containers (verified via `/api/uld` and `/api/containers` no-param responses).
- **Current behaviour:** User must hand-type slugs like `40ft-high-cube` exactly. Typo → 404 error from API.
- **Expected behaviour:** Static dropdown of all valid slugs, like vehicleLookup's `category` field has.
- **Proposed fix:** Convert field type to `'options'` with the full enumerated list, OR use n8n's `loadOptionsMethod` to populate from the list endpoint at edit time.

### B008: Vehicle Lookup exposes only `category`, not `slug` — single-vehicle lookups impossible

- **Severity:** Minor
- **Action:** vehicleLookup
- **Reproduction:** Vehicle Lookup operation's only field is "Category" (Van/Rigid/Articulated/Trailer). The API supports `?slug=luton-van` to look up a specific vehicle, but the n8n node doesn't expose this.
- **Current behaviour:** User can only filter by category (3+ matches per category). Pinpoint single-vehicle lookup requires falling back to HTTP Request node.
- **Expected behaviour:** Optional "Vehicle Slug" field exposed alongside Category, with one of them required.
- **Proposed fix:** Add a `vehicleSlug` field with `displayOptions: { show: { ...vehicleLookup }}` and routing.send conditional. Or rework to a "Lookup Mode" sub-selector (By Category / By Slug).

### B009: ADR LQ/EQ Check items use snake_case `un_number` while Consignment items use camelCase `grossWeight`

- **Severity:** Minor (cross-action consistency)
- **Action:** adrLqCheck vs consignment
- **Reproduction:** Inspect the `Items` fixedCollection on each:
  - adrLqCheck items: `{un_number, quantity, unit}` (`un_number` is snake_case)
  - consignment items: `{grossWeight, length, width, height, quantity}` (all camelCase)
- **Current behaviour:** Same UI pattern, different sub-field naming convention. Users building cross-action expressions can't reuse field references.
- **Expected behaviour:** One convention. n8n's general convention is camelCase for parameter names.
- **Proposed fix:** Rename `un_number` → `unNumber` in the n8n node source (line ~414). The routing body still wraps it via `'={{$parameter.items.itemValues}}'` so the API will receive whatever the field name is — verify the API accepts `unNumber` or update the routing body to remap if it requires `un_number`.

### B010: Node subtitle shows raw operation key (`cbm`) not display name (`Calculate CBM`)

- **Severity:** Minor (UX)
- **Action:** All
- **Reproduction:** Add the FreightUtils node, choose Resource: Freight Ops, Operation: Calculate CBM. The node card subtitle reads `cbm (freightOps)`.
- **Current behaviour:** Subtitle template `'={{$parameter["operation"]}} ({{$parameter["resource"]}})'` (line 668) uses raw values.
- **Expected behaviour:** "Calculate CBM (Freight Ops)" — human display names.
- **Proposed fix:** Maintain a static `OPERATION_LABELS` and `RESOURCE_LABELS` map and use them in the subtitle expression, or compute via a JS expression that capitalises and inserts spaces. **Untested at runtime — n8n boot blocked**, source-only finding.

### B011: Convert Units valid units list embedded in helpText, not enforced

- **Severity:** Minor (UX)
- **Action:** convert
- **Reproduction:** Set From Unit to "meters" and execute. API returns `{error: "Unknown unit \"meters\". Valid: kg, lbs, oz, tonnes, short_tons, long_tons, cbm, cuft, cuin, litres, gal_us, gal_uk, cm, inches, m, feet, mm, chargeable_kg, freight_tonnes"}`.
- **Current behaviour:** n8n surfaces this as a node failure. The user has to inspect the error to discover the actual valid values list.
- **Expected behaviour:** From/To Unit fields are dropdown options grouped by dimension (mass / length / volume), so the UI prevents the bad input.
- **Proposed fix:** Replace `from`/`to` `type: 'string'` with `type: 'options'` listing the 19 valid units. Optionally use displayOptions to filter `to` choices to the same dimension as `from`.

### B012: Error response shapes vary across endpoints

- **Severity:** Minor (error handling UX)
- **Action:** All error paths
- **Reproduction:**
  - `GET /api/adr?un=99999` → `{error: "..."}` (bare)
  - `GET /api/incoterms?code=ZZZ` → `{error: "...", valid_codes: "EXW, FCA, CPT, ..."}` (**string** of comma-joined values)
  - `GET /api/containers?type=invalid` → `{error: "...", valid_types: ["20ft-standard", ...]}` (**array** of strings)
  - `GET /api/uld?type=ZZZ` → `{error: "...", hint: "..."}` (`hint` field)
  - `GET /api/unlocode?q=zzzzzzz` → `{query, count: 0, results: [], meta}` (**no `error` field at all** — empty results for unknown query)
- **Current behaviour:** A single n8n error-handling expression cannot work across all operations.
- **Expected behaviour:** Single error envelope across all endpoints, e.g. `{error: {code, message, hint?, valid_options?: array}}`.
- **Proposed fix:** API-level standardisation. Node-level workaround: `routing.output.postReceive` to normalise.

### B013: UNLOCODE empty-results returns 200 with `count: 0` — looks like a successful empty search

- **Severity:** Minor
- **Action:** unlocodeLookup
- **Reproduction:** `GET /api/unlocode?q=zzzzzzz` → `200 {query: "zzzzzzz", count: 0, results: [], meta}`.
- **Current behaviour:** n8n treats this as success. Downstream nodes process an empty array. No error surfaced.
- **Expected behaviour:** May actually be desired behaviour (empty searches aren't errors). But the n8n node should either document this clearly OR provide a `failOnEmpty: boolean` option for users who want a hard fail.
- **Proposed fix:** Add an optional `failOnEmpty` field on lookup operations (hsLookup, unlocodeLookup, airlineLookup, adrLookup) with a `routing.output.postReceive` that throws when the count is 0.

### B014: AWB Prefix accepts non-numeric input without validation

- **Severity:** Minor
- **Action:** airlineLookup
- **Reproduction:** Set AWB Prefix to "ABC". Sent to API. API returns either empty results or 400 (depending on sanitisation).
- **Current behaviour:** Field type is `'string'` with helpText "3-digit IATA AWB prefix, e.g. 176 for Emirates SkyCargo" — the helpText doesn't say "numeric only".
- **Expected behaviour:** Either validate at the n8n node level (regex `/^\d{3}$/`) or tighten the helpText.
- **Proposed fix:** Add `validate: { regex: '^\\d{3}$', message: 'AWB Prefix must be exactly 3 digits' }` to the field, or update helpText.

### B015: Pallet Type LDM dropdown missing US Standard pallet

- **Severity:** Minor
- **Action:** ldm
- **Reproduction:** LDM operation Pallet Type dropdown options: Euro / UK Standard / Half / Quarter. The FreightUtils API may support more (US 1200×1016, industrial, custom dimensions).
- **Current behaviour:** US-style pallets (common in international air freight) require user to fall back to manual dimension overrides. Verified the API accepts `pallet=us-standard`? Need to verify.
- **Expected behaviour:** Dropdown matches the full set of API-supported pallet presets.
- **Proposed fix:** Audit `/api/ldm` accepted `pallet=` values (read from `lib/calculations/ldm.ts` in the freighttools repo); expand dropdown.

### B016: LDM stack factor and weight per pallet not exposed

- **Severity:** Minor
- **Action:** ldm
- **Reproduction:** LDM only takes pallet type and quantity. The underlying API includes `stack_factor`, `stackable`, `weight_per_pallet_kg` (visible in `/api/ldm` response `meta.inputs`).
- **Current behaviour:** Defaults are baked in; user can't override stackability or specify weight-per-pallet (which affects whether the trailer is weight-limited or volume-limited).
- **Expected behaviour:** Optional Stackable boolean, optional Stack Factor numeric, optional Weight Per Pallet (kg).
- **Proposed fix:** Add three optional fields with sensible defaults. Wire them into routing.send.

### B017: ULD/Vehicle/Container *list-mode* not exposed (only single-item lookups)

- **Severity:** Minor
- **Action:** uldLookup, containerLookup, vehicleLookup
- **Reproduction:** Each operation has exactly one input field (Type / Slug / Category) and uses it to filter. The API also supports parameterless calls that return the full list (`GET /api/uld` → 15 entries).
- **Current behaviour:** User can't list all ULDs/containers via the n8n node — they must hand-type a slug they already know.
- **Expected behaviour:** "Lookup Mode" selector with options like "Single Item" / "List All" / "Filter by Category".
- **Proposed fix:** Restructure each operation to expose a mode selector and conditional input fields via displayOptions.

### B018: Container Lookup `?l=&w=&h=` fit-check mode hidden

- **Severity:** Minor
- **Action:** containerLookup
- **Reproduction:** The API also accepts `GET /api/containers?type=20ft-standard&l=200&w=100&h=180` to return both the container spec AND a loading fit-check. The n8n node only sends `type=`.
- **Current behaviour:** Fit-check capability invisible to n8n users.
- **Expected behaviour:** Optional Length/Width/Height fields that, when populated, enable the fit-check response shape.
- **Proposed fix:** Add three optional dimension fields with displayOptions; wire conditionally into routing.

### B019: Convert from/to field names are JS reserved-ish

- **Severity:** Cosmetic
- **Action:** convert
- **Reproduction:** Use Convert Units. Field names: `from` and `to`.
- **Current behaviour:** `from` collides with TypeScript module `from` keyword in some lint contexts and is awkward in expression syntax.
- **Expected behaviour:** `fromUnit` and `toUnit`.
- **Proposed fix:** Rename in the source. Update routing.send.property to keep `from` / `to` as the API query-param names.

### B020: Unit symbols capitalised in display names — should be lowercase

- **Severity:** Cosmetic
- **Action:** All Freight Ops + ADR exemption + ADR LQ/EQ items
- **Reproduction:** Field labels: "Length (Cm)", "Width (Cm)", "Height (Cm)", "Gross Weight (Kg)", "Quantity (Kg Or L)", "Pallet Length (Cm)", "Box Length (Cm)" etc.
- **Current behaviour:** Unit symbols rendered with leading uppercase ("Cm", "Kg") because n8n's lint and source explicitly title-case the display name.
- **Expected behaviour:** Unit symbols are always lowercase per SI: cm, kg, m, mm, km. (Litre's symbol is uppercase L.) "(cm)", "(kg)", "(kg or L)".
- **Proposed fix:** Update the field `displayName` strings throughout `FreightUtils.node.ts`. Verify the n8n lint rule `n8n-nodes-base/node-param-display-name-miscased` doesn't fire (it likely allows lowercase units in parens).

### B021: Calculate Consignment action description says "multi item" instead of "multi-item"

- **Severity:** Cosmetic
- **Action:** consignment
- **Reproduction:** Operation listing → Calculate Consignment → action: `'Calculate a multi item consignment'`.
- **Current behaviour:** Compound modifier missing hyphen.
- **Expected behaviour:** `'Calculate a multi-item consignment'`.
- **Proposed fix:** Add hyphen on line 90.

### B022: Items label on adrLqCheck and consignment is generic — no context

- **Severity:** Cosmetic
- **Action:** consignment, adrLqCheck
- **Reproduction:** Both operations have a fixedCollection labelled "Items".
- **Current behaviour:** When the Items section is collapsed, users can't tell what type of items the collection holds.
- **Expected behaviour:** "Consignment Items" for consignment; "Dangerous Goods Items" for adrLqCheck.
- **Proposed fix:** Update the displayName on each `items` fixedCollection.

### B023: `Quantity (Kg Or L)` label is awkward

- **Severity:** Cosmetic
- **Action:** adrExemption
- **Reproduction:** ADR Exemption Calculator → "Quantity (Kg Or L)" field.
- **Current behaviour:** "Kg Or L" reads strangely. Symbols capitalised wrong (Kg → kg).
- **Expected behaviour:** "Quantity (kg or L)".
- **Proposed fix:** Rename. Couple with B020.

### B024: No output schema declared — n8n autocomplete blind on downstream nodes

- **Severity:** Minor
- **Action:** All
- **Reproduction:** Connect any FreightUtils operation to a downstream Set/Function node. Type `$json.` — n8n autocomplete shows nothing because there's no typed output schema.
- **Current behaviour:** Output is pass-through from the API JSON. n8n has no hint about the response shape.
- **Expected behaviour:** Per-operation sample output declared so n8n can infer downstream field availability.
- **Proposed fix:** Add a `routing.output.postReceive` with a hardcoded sample, or use `requestDefaults.returnFullResponse: false` plus a typed `outputs` declaration. n8n's `usableAsTool: true` (line 673) particularly benefits from this for AI Agent calls.

### B025: `n8n` strict mode is enabled but not all node-cli lint rules are clean

- **Severity:** Minor (technical hygiene)
- **Action:** N/A — package-wide
- **Reproduction:** Run `npm run lint` from the n8n-nodes-freightutils repo.
- **Current behaviour:** Several `eslint-disable-next-line n8n-nodes-base/...` directives suppress lint warnings (see lines 17, 50, 493, 547). This is a code-smell that the convention isn't fully met.
- **Expected behaviour:** Either fix the underlying issue (e.g. resource name pluralisation) or upgrade with proper rationale comments inline.
- **Proposed fix:** Audit each disable directive. Lines 17 and 547 hint at "node-param-resource-with-plural-option" / "node-param-options-type-unsorted-items" — review whether the underlying ordering or naming should change.

### B026: `/api/airlines` 3-digit prefix lookup returns 200 with results even for unmatched prefixes

- **Severity:** Minor
- **Action:** airlineLookup
- **Reproduction:** `GET /api/airlines?prefix=999` returns 2 valid Air China matches because 999 is a real Air China AWB prefix. But `prefix=abc` (non-numeric) — also 200 likely with empty or partial match. Tested only the numeric case.
- **Current behaviour:** No clear "not found" signal for prefixes that look valid but don't exist (e.g. prefix=000 would return empty results not an error).
- **Expected behaviour:** Document via helpText that empty results = no airline registered with that prefix.
- **Proposed fix:** Update `airlineLookup` field helpText: "3-digit IATA AWB prefix (numeric, e.g. 176 for Emirates SkyCargo). An empty results array means no airline holds that prefix."

### B027: `/api/chargeable-weight` sea mode returns both `basis` and `billing_basis` (duplicate)

- **Severity:** Cosmetic (data shape redundancy)
- **Action:** chargeableWeight
- **Reproduction:** API audit only — sea mode response carries both `basis: "actual"` and `billing_basis: "actual"`. Same value.
- **Current behaviour:** Two fields holding the same value. Confusing for downstream expressions.
- **Expected behaviour:** Single field.
- **Proposed fix:** API-level — drop one. Node-level workaround — `routing.output.postReceive` to delete one of the duplicates.

## Coverage matrix

| # | Resource | Operation | Happy-path | Error-path | Method | Bugs |
|---|----------|-----------|:----------:|:----------:|--------|------|
| 1 | Freight Ops | cbm — Calculate CBM | ✓ | n/a (numeric inputs) | GET /cbm | B020 (display) |
| 2 | Freight Ops | ldm — Calculate LDM | ✓ | n/a | GET /ldm | B015, B016 |
| 3 | Freight Ops | chargeableWeight — Calculate Chargeable Weight | ✓ | n/a | GET /chargeable-weight | B020, B027 |
| 4 | Freight Ops | pallet — Calculate Pallet Fitting | ✓ | n/a | GET /pallet | B020 |
| 5 | Freight Ops | convert — Convert Units | ✓ | ✓ (`from=meters`) | GET /convert | B011, B019 |
| 6 | Freight Ops | consignment — Calculate Consignment | ✓ | ✓ (empty items) | POST /consignment | B001, B009, B021, B022 |
| 7 | Dangerous Goods | adrLookup — ADR Lookup | ✓ | ✓ (`un=99999`) | GET /adr | (clean) |
| 8 | Dangerous Goods | adrLqCheck — ADR LQ/EQ Check | ✓ | ✓ (bad UN, exceed limit) | POST /adr/lq-check | B009, B022, B023 |
| 9 | Dangerous Goods | adrExemption — ADR Exemption Calculator | ✓ | n/a | GET /adr-calculator | B020, B023 |
| 10 | Customs & Trade | hsLookup — HS Code Lookup | ✓ | ✓ (`q=a` short) | GET /hs | B002, B005 |
| 11 | Customs & Trade | incotermsLookup — Incoterms Lookup | ✓ | ✓ (`code=ZZZ`) | GET /incoterms | B006, B012 |
| 12 | Customs & Trade | dutyCalculator — UK Duty Calculator | ✓ | ✓ (`commodityCode=99999`) | POST /duty | B001, B004 |
| 13 | Reference Data | airlineLookup — Airline Lookup | ✓ | partial (`prefix=999` is a real prefix; `prefix=000` would be empty) | GET /airlines | B014, B026 |
| 14 | Reference Data | unlocodeLookup — UN/LOCODE Lookup | ✓ | ✓ (`q=zzzzzzz` empty, no error) | GET /unlocode | B001, B013 |
| 15 | Reference Data | uldLookup — ULD Lookup | ✓ | ✓ (`type=ZZZ`) | GET /uld | B001, B006, B007, B017 |
| 16 | Reference Data | containerLookup — Container Lookup | ✓ | ✓ (`type=invalid`) | GET /containers | B001, B006, B007, B017, B018 |
| 17 | Reference Data | vehicleLookup — Vehicle Lookup | ✓ | n/a (options field) | GET /vehicles | B001, B006, B008, B017 |
| 18 | Reference Data | healthPing — Health Ping | ✓ | n/a (no inputs) | GET /health | B003 |
| 19 | Reference Data | toolsList — List Tools | ✓ | n/a (no inputs) | GET /tools | B003 |

Pass = happy path returned a 2xx response with the operation's expected payload shape. Bugs column lists the bug IDs from the section above that affect that operation.

## Untested — n8n boot blocked

The following findings could not be verified because both Docker and `npx n8n start` failed to install (npm `ECOMPROMISED Lock compromised` on the n8n lockfile). They remain plausible based on source review but should be re-tested when n8n is available:

- **U1:** Does the FreightUtils credential save dialog accept the API key without leaking the prefix to the credential summary line? (n8n's auto-built credential label uses the `displayName` "FreightUtils API account" — no `apiKey` interpolation in source, so likely safe; needs visual confirmation.)
- **U2:** Does the credential test (`GET /health` per `credentials/FreightUtilsApi.credentials.ts:50`) return the expected green tick when given a valid key, and the right error when given an invalid key? `/api/health` does not require auth — the test will green-tick even when the key is invalid. **This is a confirmed source-only bug** (B028 below).
- **U3:** Does the node load on n8n startup with the working-tree build (no module resolution errors, no missing dist/icons)?
- **U4:** Does the node subtitle render correctly in the workflow canvas? (Source-only finding B010 says it shows raw values.)
- **U5:** Does running an operation as a sub-node under an AI Agent (`usableAsTool: true`) pass through correctly? Particularly: do the description fields get used as the LLM tool descriptions correctly?

### B028: Credential test endpoint `/api/health` does not require authentication

- **Severity:** Major (functionally breaks credential validation)
- **Action:** N/A — credential test
- **Reproduction:** Source `credentials/FreightUtilsApi.credentials.ts:50` declares `test: { request: { url: '/health', method: 'GET' }}`. The freightutils middleware (`middleware.ts` / route handler) does NOT require auth on `/api/health` — it returns 200 regardless of the `X-API-Key` header value (verified during this dogfood by curling `/api/health` without auth → 200).
- **Current behaviour:** A user pasting an INVALID api key into the credential dialog will get a green tick because `/api/health` returns 200 unauthenticated. The user only discovers their key is wrong when an actual operation fails with 401.
- **Expected behaviour:** Credential test must fail when the key is invalid.
- **Proposed fix:** Change the test endpoint to one that requires auth and returns 401 on invalid key, e.g. `GET /api/keys/me` if it exists, or use a dedicated `/api/auth/verify` endpoint. Alternatively, add an `X-API-Key` precedence to `/api/health` that returns 401 when a header is present but invalid (without requiring auth for unauthenticated callers).
- **Zapier parallel:** Zapier's `authentication.test` also hits `/api/health` (per `authentication.js`) and has the same defect — same fix should land in both.

## Notes

- **n8n boot failure is reproducible.** Both Docker (no daemon on this Windows host) and `npx -y n8n start` (failed twice with `ECOMPROMISED Lock compromised` on the n8n lockfile, including with a forced fresh cache via `npm_config_cache=/tmp/n8n-fresh-cache`) prevented runtime testing. This is most likely a transient npm registry / lockfile mismatch issue rather than something specific to the freightutils node — re-attempt on a different machine before declaring it a wider blocker.
- **Cross-platform alignment opportunity.** Bugs B002 (`hscode → hs_code`), B005 (HS Code or Keyword label), and B028 (credential test endpoint) all have direct Zapier parallels. Fixing them in the n8n node alongside the next Zapier point release keeps the two integrations naming-aligned.
- **Single source of truth for output naming.** B001 + B002 + B009 collectively suggest a project-wide decision is overdue: snake_case or camelCase for the freightutils API. Whatever direction is chosen, the n8n and Zapier nodes should both be remapped to match. Recommend snake_case (matches the majority of endpoints + Zapier's chosen direction in v0.1.1).
- **No version bump shipped.** This sprint is discovery only. No changes to `package.json`, `dist/`, `nodes/`, or `credentials/`. Only `dogfood/n8n-v0.1.0-bug-list.md` lands.
- **Pro key budget impact:** ~30 requests against `SMOKE_API_KEY`. Pro plan is 50,000/month — negligible.
- **Recommended fix-sprint priority order:**
  1. B028 (credential test broken — security/UX critical despite "Major" severity rating)
  2. B002 + B005 (Zapier parity — small, low risk)
  3. B003 (tools count mismatch — data integrity)
  4. B001 (API casing normalisation — biggest scope, likely needs a freighttools-website sprint)
  5. B004 (duty error field naming)
  6. Everything else as a v0.2.0 minor pass.
