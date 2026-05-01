# n8n template E2E audit — 2026-05-01

Source: live execution against n8n@2.18.5 + n8n-nodes-freightutils@0.3.0
Upstream issue: https://github.com/n8n-io/n8n/issues/29619

---

# ADR DG Validation workflow — Live E2E findings (2026-05-01)

## Test environment

- **Runner**: Local headless n8n via `npx n8n@2.18.5` start, no UI use
- **n8n version**: 2.18.5
- **Community node**: `n8n-nodes-freightutils@0.3.0` installed into `$N8N_USER_FOLDER/.n8n/nodes/node_modules/` (not via in-app install — n8n's `POST /rest/community-packages` failed with `npm ENOENT` on Windows; manual `npm install` in the user folder + restart loaded the node cleanly)
- **Credential**: `freightUtilsApi` created via `POST /rest/credentials` using SMOKE_API_KEY from `.env.local` (Pro tier). `POST /rest/credentials/test` returned `{"status":"OK","message":"Connection successful!"}` once the apiKey was actually present in the credential body (confirmed by direct `curl` to `/api/auth/whoami` and `/api/adr?un=1263`).
- **Wrapper pattern**: workflow.json's trigger is `executeWorkflowTrigger`, so a separate Manual-Trigger → Set-Input (literal JSON) → Execute-Workflow wrapper was imported per test case to drive the sub-workflow.

**Result**: the workflow.json as committed CANNOT be executed inside n8n at all. 7 distinct bugs surfaced before getting a clean primary execution; an 8th bug surfaced on the invalid-UN edge case. Patches required to drive the workflow to a green run are listed below.

---

## Bugs found in `templates/adr-dg-validation/workflow.json`

### Bug 1 — `Split Items` and `Aggregate Items` missing required `resource` + `operation` parameters (n8n v2.18 itemLists v3)

n8n's `n8n-nodes-base.itemLists` v3 is a multi-operation node and requires `resource` + `operation` to disambiguate. The workflow.json only sets `fieldToSplitOut` / `fieldsToAggregate`. Pre-flight `WorkflowExecute.checkForWorkflowIssues` rejects the workflow with `"The workflow has issues and cannot be executed for that reason. Please fix them first."` (no per-node detail surfaced via REST API — confirmed by reading `n8n-core/src/execution-engine/workflow-execute.ts:1350`).

**Fix** for the Split node:
```json
{
  "resource": "itemList",
  "operation": "splitOutItems",
  "fieldToSplitOut": "items",
  "include": "noOtherFields",
  "options": {}
}
```

**Fix** for the Aggregate node — see Bug 3.

### Bug 2 — `Split Items` `include: "selectedOtherFields"` produces nested item shape

Even after fixing Bug 1, with `include: "selectedOtherFields"` and `fieldsToInclude: "consignment"`, the `splitOutItems` operation puts the array element under a key matching `fieldToSplitOut` (i.e. each output item has `{ items: <element>, consignment: ... }`). The `ADR Lookup` node's expression `={{ $json.un_number }}` then evaluates to `undefined` and the request hits `/api/adr` with no query string, returning 400 `"No query parameter provided."`.

This is correct n8n behaviour (per `splitOutItems.operation.js:158-167`): the spread-into-output path is only taken when `include === "noOtherFields"`. With other modes the element is written under `fieldName`.

**Fix**: use `include: "noOtherFields"`. The downstream Compose Output node fetches `consignment` directly from the trigger via `$('Validate Input').first().json.consignment`, so no per-item consignment plumbing is needed.

### Bug 3 — `Aggregate Items` uses default `aggregate: "aggregateIndividualFields"` with field `"*"`, which is treated as a literal field name and produces `{ "*": [] }` instead of an items array

The committed config:
```json
{
  "fieldsToAggregate": { "fieldToAggregate": [{ "fieldToAggregate": "*", "renameField": false }] },
  "options": {}
}
```

`concatenateItems.operation.js:243-253` does `lodash.get(item, "*")` which returns `undefined` for every item, then skips them (default `keepMissing: false`). Output: `{ "*": [] }`.

The downstream LQ Check expects `$json.data` to be the array of items. With current config the field doesn't exist; `$json.data.map(...)` evaluates to `undefined.map(...)` (which n8n surfaces inconsistently — see Bug 5).

**Fix**:
```json
{
  "resource": "itemList",
  "operation": "concatenateItems",
  "aggregate": "aggregateAllItemData",
  "destinationFieldName": "data",
  "include": "allFields",
  "options": {}
}
```

This produces `{ data: [...all items...] }` matching the downstream contract.

### Bug 4 — `Merge ADR Data Into Item` Code node uses `$input.first()` in default `runOnceForAllItems` mode → only the first of N items is merged

The Code node (typeVersion 2) defaults to `mode: "runOnceForAllItems"`. The committed JS:
```js
const lookup = $input.first().json;     // only takes input[0]
const originalItem = $('Split Items').item.json;
return [{ json: { ...originalItem, adr_data: {...} } }];   // returns 1 item
```

With 2 input items from the upstream loop, the node runs once, reads only `input[0]`, returns 1 item. `Aggregate Items` then receives 1 item instead of 2.

**Fix options**: (a) set `mode: "runOnceForEachItem"` and rewrite to use `$json` instead of `$input.first().json` (e.g. `const lookup = $json;`); (b) keep `runOnceForAllItems` and iterate `$input.all().map(...)`. We took (a) for the live run — see `_e2e-evidence/patched-workflow.json` for the exact rewrite.

Note that in `runOnceForEachItem` mode `$input.first()` is forbidden (n8n throws `"This is only available in 'Run Once for All Items' mode"`).

### Bug 5 — FU node v0.3.0 `adrLqCheck` operation: dynamic-array expression for `items.itemValues` sends wrong payload to API

The `dangerousGoods` resource's `Dangerous Goods Items` parameter is a `fixedCollection` with `multipleValues: true`. The committed workflow.json sets `items.itemValues` to a single string expression that returns an array:
```json
"items": {
  "itemValues": "={{ $json.data.map(it => ({un_number: it.un_number, quantity: it.total_quantity, unit: it.quantity_unit})) }}"
}
```

The declarative routing then assigns this directly to `body.items` (`FreightUtils.node.js:332`). With this assignment pattern the API rejects the request with HTTP 400 `"Maximum 20 items per check"` even though the source array only contains 2 items. **Reproduced with a minimal 2-item hardcoded fixture** (no upstream nodes) — see `_e2e-evidence/repro-` notes below.

When `items.itemValues` is set as a literal array of structured items (each with `un_number`, `quantity`, `unit` keys), the same operation succeeds. So the bug is not in the API, it's in how n8n's RoutingNode resolves a string-expression assignment to a fixedCollection-multipleValues parameter — the resolved value is not an array of items but something the API interprets as >20 items.

**Same bug applies to** `adrExemptionConsignment` (same pattern: `body: { items: '={{$parameter.items.itemValues.map(...)}}' }`).

**Workaround used for live run**: replaced both FU node calls with `n8n-nodes-base.httpRequest@4.2` nodes:
- `POST https://www.freightutils.com/api/adr/lq-check` with `jsonBody: '={{ JSON.stringify({ mode: "lq", items: $json.data.map(it => ({un_number: it.un_number, quantity: it.total_quantity, unit: it.quantity_unit})) }) }}'`
- `POST https://www.freightutils.com/api/adr-calculator` with the analogous mapping
- Header: `X-API-Key: ={{$credentials.freightUtilsApi.apiKey}}` using the same `freightUtilsApi` credential

Both succeed and the Compose Output node consumes their JSON unchanged. **Recommended permanent fix**: add `adrLqCheckJsonBody` / `adrExemptionConsignmentJsonBody` operations on the FU node that accept a single `itemsJson` string parameter (raw JSON) so dynamic arrays can be passed without going through the broken fixedCollection routing path.

### Bug 6 — `ADR Lookup` does not degrade gracefully on unknown UN

Edge case (c): UN 9999 (does not exist in ADR 2025). The FU node throws `NodeApiError: "The resource you are requesting could not be found"` (HTTP 404 from `/api/adr?un=9999`) and the workflow halts.

The Merge ADR Data Into Item Code node has fallback logic `if (!variant) { return { ...originalItem, adr_data: null, adr_lookup_error: ... } }` — but this branch is dead, since the FU node fails before Merge is reached.

**Fix options**: (a) configure the ADR Lookup node with `continueOnFail: true` and have Merge handle empty/error inputs; (b) or put a Code node "Validate Per Item" before ADR Lookup that pre-filters known UNs (the FU MCP server has a 2,939-entry static dataset that could be bundled as a Code-node lookup table).

Per sprint goal "graceful degradation: items_with_errors populated OR fails at adrLookup with a useful error message" — the current behaviour is the second option, with a clear 404 message containing the UN number, so this is acceptable but not ideal for a marketplace template that should keep going on partial-success consignments.

### Bug 7 — `Compose Output` references fields that don't exist on the aggregated item: `it.proper_shipping_name`, `it.class`, `it.packing_group`

The committed Compose code maps:
```js
input: {
  un_number: it.un_number,
  proper_shipping_name: it.proper_shipping_name,   // undefined
  class: it.class,                                 // undefined
  packing_group: it.packing_group,                 // undefined
  quantity_per_package: it.quantity_per_package,
  ...
}
```

`it` is each entry of `$('Aggregate Items').first().json.data` — i.e. the merged item. The Merge ADR Data Into Item node only adds `adr_data` (a sub-object) to the original item; it does NOT promote `proper_shipping_name`, `class`, `packing_group` to the top level. So those three fields end up `undefined` and JSON serialization drops them.

**Live diff** vs the committed `example-output.json` — exactly these 3 fields per item are missing:
```
.items[N].input.proper_shipping_name -> undefined  (committed: "PAINT (...")
.items[N].input.class                -> undefined  (committed: "3")
.items[N].input.packing_group        -> undefined  (committed: "I")
```

**Fix**: in the Merge node, also lift these fields:
```js
return { json: { ...originalItem,
  proper_shipping_name: variant.proper_shipping_name,
  class: variant.class,
  packing_group: variant.packing_group,
  adr_data: { ... } } };
```

OR change Compose to read from `it.adr_data.proper_shipping_name` etc.

This is the source of the **non-byte-identical** diff between the live execution output and the committed `example-output.json`. The committed example was likely generated by a "Compose-JS replay" with mocked input data that already had those fields populated — which would not catch that the upstream nodes don't actually populate them.

### Bug 8 — `n8n-nodes-base.executeWorkflowTrigger` requires a wrapper to be testable in CI

Not a bug in the workflow itself but a packaging concern: the only way to drive this sub-workflow standalone is via a sibling workflow that calls Execute Workflow → sub-workflow. Adding a Manual Trigger as a parallel entry point (or pinning input data on the executeWorkflowTrigger so it's runnable manually) would make the template self-testable and easier to import for evaluation.

---

## Primary execution result (after Bugs 1–5 patched, Bug 6 not yet hit, Bug 7 still open)

- **Sub-workflow execution ID**: 18 (status: `success`)
- **Per-node duration**:
  | Node | Status | Duration |
  |---|---|---|
  | When Executed by Another Workflow | success | 1ms |
  | Validate Input | success | 10ms |
  | Split Items | success | 1ms |
  | ADR Lookup | success | 221ms (2 calls) |
  | Merge ADR Data Into Item | success | 18ms |
  | Aggregate Items | success | 0ms |
  | ADR LQ Check (Consignment) | success | 209ms |
  | ADR 1.1.3.6 Exemption (Consignment) | success | 187ms |
  | Compose Output | success | 22ms |

- **Diff vs `example-output.json`**: NOT byte-identical. 3 fields per item missing under `items[N].input` (`proper_shipping_name`, `class`, `packing_group`) — see Bug 7. All other fields, including `aggregate.total_transport_category_points`, `aggregate.exemption_113_6_status`, `aggregate.tunnel_restrictions`, `aggregate.notes`, and the per-item `adr_data` block, match committed exactly.

- **Note**: this run used HTTP Request workarounds for the LQ Check + Exemption calls (Bug 5 workaround). Output structure is unchanged because the underlying API responses are identical regardless of how the request is made. So the output matches what the workflow would produce IF Bugs 1–7 were fixed in upstream.

---

## Edge case results (3 cases)

| Case | Input | Status | Behaviour | Verdict |
|---|---|---|---|---|
| (a) Single item | 1 × UN 1263 PAINT | success | Workflow runs end-to-end, output structure correct (with same Bug 7 missing fields) | **PASS** |
| (b) Empty items array | `items: []` | error | Validate Input throws `\`items\` must be a non-empty array` — fail-fast as intended | **PASS** |
| (c) Invalid UN 9999 | 1 × UN 9999 | error | ADR Lookup throws 404 `"The resource you are requesting could not be found"` with `contextData: { error: "UN number 9999 not found in ADR 2025 dataset.", un_number: "9999" }`. Workflow halts; Merge's `adr_lookup_error` fallback is dead code. | **PARTIAL** — error is descriptive but workflow doesn't populate `validation.items_with_errors[]` as the schema implies. |

---

## Files in this evidence bundle

- `findings.md` — this report
- `primary-live-output.json` — actual JSON output from sub-execution 18 (post-patch-final). 3 fields per item missing vs `example-output.json` (Bug 7).
- `primary-execution-runData.json` — per-node summary (status, duration, item counts) for the primary run.
- `edge-results.json` — full per-node summary + final output (or error context) for all 3 edge cases.

No SMOKE_API_KEY value or other `fu_live_*` / `cus_*` / `sub_*` tokens appear in any of these files (verified with `grep -rE 'fu_(live|test|5fa|sk)|cus_|sub_' _e2e-evidence/` returning 0 matches). Only the masked stub `freightUtilsApi.apiKey` reference appears, in node parameters.

---

## Recommendations

1. **Fix Bugs 1–7 in `templates/adr-dg-validation/workflow.json`** before any Creator-hub upload — current file does not run as-is in n8n 2.18.5 with FU node v0.3.0.
2. **Add a smoke-test wrapper workflow** (`templates/adr-dg-validation/_test-wrapper.json`) committed alongside, so future runs of this kind can be `n8n execute --id=<wrapperId>` without rebuilding the Manual-Trigger wrapper each time.
3. **Add a CI check** that imports `workflow.json` into a fresh n8n + FU@latest and runs the wrapper against a 2-item fixture, comparing JSON output to `example-output.json`. Catch byte drift on every PR. The repro infrastructure for this run is at `~/.n8n-e2e-test/` and could be containerised for CI.
4. **Fix the FU node v0.3.0 `adrLqCheck` / `adrExemptionConsignment` dynamic-items issue** (Bug 5) — likely a v0.3.1 patch. Add a node-level test that calls these operations with `items.itemValues` set to an expression returning a 2-item array.
5. **Skip the Creator-hub upload** until the workflow byte-matches its committed `example-output.json`.

---

*Generated 2026-05-01 by E2E live-execution sprint.*
