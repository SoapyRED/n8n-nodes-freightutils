# ADR DG Validation — E2E success evidence (2026-05-01)

This directory documents the successful e2e validation of [`templates/adr-dg-validation/workflow.json`](../workflow.json) after the fixes applied in commits [`6b99fd8`](https://github.com/SoapyRED/n8n-nodes-freightutils/commit/6b99fd8) (n8n-nodes-freightutils v0.3.1) and [`b6e5655`](https://github.com/SoapyRED/n8n-nodes-freightutils/commit/b6e5655) (workflow.json bug fixes). The original failure-mode evidence that motivated those commits is preserved at [`docs/audits/2026-05-01-n8n-template-e2e.md`](../../../docs/audits/2026-05-01-n8n-template-e2e.md).

## Test environment

- **n8n**: 2.18.5 (headless, isolated user folder, SQLite)
- **Community node**: `n8n-nodes-freightutils@0.3.1` (installed from npm, NOT a local build)
- **Workflow**: `templates/adr-dg-validation/workflow.json` at commit `b6e5655`
- **API**: live `https://www.freightutils.com/api/*` with `SMOKE_API_KEY` (Pro tier, Marius's `.env.local`)
- **Run date**: 2026-05-01

## Cases

| # | Case | Verdict | Evidence | Notes |
|---|---|---|---|---|
| 1 | Primary 2-item GB→DE consignment (UN 1263 PAINT 5×25L drums + UN 3082 IBC 1000L) | ✅ **PASS** | [`primary-run.json`](./primary-run.json) | Output JSON byte-equivalent to committed [`example-output.json`](../example-output.json). All 9 nodes succeed, ~870ms wall-time. |
| 2 | Single-item run (UN 1263 only, len=1) | ✅ **PASS** | [`single-run.json`](./single-run.json) | All 9 nodes succeed, ~437ms wall-time. Bug 7 fix confirmed for len=1 — `items[0].input.proper_shipping_name`/`class`/`packing_group` populated correctly from `adr_data`. `items_with_errors: []`. |
| 3 | Empty array (`items: []`) | ✅ **PASS** | [`empty-run.json`](./empty-run.json) | Fail-fast at `Validate Input` Code node with `\`items\` must be a non-empty array`. ~12ms before halt. No API calls made. Expected behaviour for invalid input. |
| 4 | Bug 6 graceful degradation — 3-item with one invalid UN (1263 + 9999 + 3082) | ✅ **PASS** | [`bug-6-invalid-un-run.json`](./bug-6-invalid-un-run.json) | Workflow runs to completion, all 9 nodes succeed, ~880ms wall-time. `items[1]` carries `lookup_failed: true`, `error_reason: "UN 9999 could not be looked up in ADR 2025"`, `adr_data: null`. `validation.items_with_errors: [{index: 1, reasons: ["UN 9999 could not be looked up in ADR 2025"]}]`. Aggregate math correctly excludes UN 9999 — total_transport_category_points = 7250 (UN 1263 contributes 6250, UN 3082 contributes 1000, UN 9999 contributes 0). |

## What this proves

The 7 bugs identified in the [2026-05-01 audit](../../../docs/audits/2026-05-01-n8n-template-e2e.md) are all closed:

| Bug | Status |
|---|---|
| 1 — Split + Aggregate Items v3 missing `resource` + `operation` | ✅ Fixed in `b6e5655`, workflow imports + runs without pre-flight warnings |
| 2 — Split Items `selectedOtherFields` nests element under `items` | ✅ Fixed in `b6e5655` (changed to `noOtherFields`); `$json.un_number` resolves correctly downstream |
| 3 — Aggregate Items field `"*"` produces empty array | ✅ Fixed in `b6e5655` (changed to `aggregateAllItemData` + `destinationFieldName: "data"`) |
| 4 — Merge ADR Data `$input.first()` only processes 1 of N items | ✅ Fixed in `b6e5655` (mode = `runOnceForEachItem`, code uses `$json`) |
| 5 — FU node v0.3.0 dynamic-array regression on consignment ops | ✅ Fixed in `n8n-nodes-freightutils@0.3.1` (`6b99fd8`) — new `itemsSource: 'json'` mode added; workflow.json updated to use it |
| 6 — Invalid UN halts at ADR Lookup, no `items_with_errors` | ✅ Fixed in `b6e5655` — `onError: continueRegularOutput` + Merge handles error pass-through + downstream filters via `lookup_failed` |
| 7 — Compose Output reads `it.X` from wrong path for `proper_shipping_name`/`class`/`packing_group` | ✅ Fixed in `b6e5655` — reads `it.adr_data?.X` |

## Reproducing locally

```bash
mkdir -p ~/.n8n-test/.n8n/nodes
cd ~/.n8n-test
mkdir -p runtime && cd runtime && npm install n8n@2.18.5 --omit=dev
cd ../.n8n/nodes && npm install n8n-nodes-freightutils@0.3.1 --omit=dev
cd ~/.n8n-test
N8N_USER_FOLDER=$(pwd) ./runtime/node_modules/.bin/n8n start &
# Bootstrap owner via REST, create freightUtilsApi credential with your fu_live_* key,
# import workflow.json, drive via Execute Workflow node from a Manual Trigger wrapper.
```

Each `*-run.json` in this directory contains the full `perNode` durations + final output for the case, captured directly from n8n's `/rest/executions/{id}?includeData=true` endpoint and parsed via the `flatted` library.

No `fu_live_*` API keys appear in any committed file in this directory (verified with `grep -rE 'fu_(live|test)_[a-z0-9]{16,}'` returning 0 matches).
