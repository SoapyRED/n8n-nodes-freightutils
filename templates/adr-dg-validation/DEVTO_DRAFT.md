---
title: "Shipping an n8n template that didn't run: a core bug in `multipleValues` fixedCollections"
published: false
description: "How an end-to-end run against a real engine — after lint, build, and recorded-API replay all passed — surfaced an n8n core bug."
tags: n8n, dangerousgoods, freight, opensource
cover_image: ""
---

We just spent the better part of a day running an n8n workflow template through every static check we could think of — JSON schema validation, the n8n-node CLI lint, TypeScript build, byte-equivalence against committed example output replayed through the Compose JS node — and they all passed.

Then we ran the same template inside a real n8n instance against the real API it depends on, and it produced wrong output. Seven bugs surfaced before we got a clean primary execution. One of them turned out to be in n8n core itself, latent under any community node that exposes a `multipleValues: true` fixedCollection and accepts expression input — meaning every other node author hitting the same shape is probably tripping it without knowing.

This is the gap between "looks ready to ship" and "actually works inside an engine," and the thing we're filing about it.

## What the template does

The template is [`templates/adr-dg-validation/workflow.json`](https://github.com/SoapyRED/n8n-nodes-freightutils/blob/main/templates/adr-dg-validation/workflow.json) in the [n8n-nodes-freightutils](https://www.npmjs.com/package/n8n-nodes-freightutils) repo. It validates a road-freight dangerous-goods consignment against UNECE ADR 2025: takes a header plus an array of items (each with a UN number, quantity, packaging), looks each item up to enrich proper shipping name / class / packing group / transport category / tunnel codes, runs a consignment-level Limited Quantity check, runs the 1.1.3.6 exemption calculation (transport-category points against the 1000-point threshold), and composes a structured output with per-item enrichment plus aggregate compliance flags — vehicle marking required, tunnel restrictions, driver ADR certificate required, the regulatory `notes`. About 150–400ms per run for a 1–10 item consignment.

The template is designed as a sub-workflow. A parent workflow calls Execute Workflow with the consignment shape, gets back the validated structure, and continues — booking confirmation, manifest enrichment, automated freight-forwarder responses.

It sits on top of the [FreightUtils](https://www.freightutils.com) REST API, a free freight-data API run by an ADR-certified UK transport planner. Free tier is 100 req/day, no card required. That's the only sales pitch in this article.

## The pre-publish discipline

Before any live execution, we put the template through the static checks that the community has come to treat as the bar for shipping:

- `workflow.json` parses as valid n8n workflow JSON. Every node has the right `type` / `typeVersion`. Every `connections` entry resolves. No orphan nodes. Schema-validates clean against n8n's exported types.
- `npm run lint` passes — `n8n-node lint` reports zero errors on the wider node package.
- `npm run build` ships a clean dist.
- We captured live API responses from `/api/adr`, `/api/adr/lq-check`, and `/api/adr-calculator` against the same example input as the committed [`example-output.json`](https://github.com/SoapyRED/n8n-nodes-freightutils/blob/main/templates/adr-dg-validation/example-input.json), then replayed those captured payloads through the Compose JS node in isolation. The output was byte-identical to the committed example.

Every check passed. We could plausibly have shipped at this point.

## The live run, and the seven bugs

We didn't ship. We installed n8n@2.18.5 fresh, dropped `n8n-nodes-freightutils@0.3.0` into the user folder, set up a `freightUtilsApi` credential against the live API, and ran the workflow with a 2-item GB→DE consignment fixture (UN 1263 PAINT 5×25L drums + UN 3082 ENVIRONMENTALLY HAZARDOUS SUBSTANCE 1×1000L IBC).

Seven distinct bugs surfaced before we got a clean run. They fell into three buckets.

**Workflow-config bugs that no static check catches (4):**

- `Split Items` and `Aggregate Items` (`n8n-nodes-base.itemLists` v3) require explicit `resource` + `operation` parameters that the JSON didn't have. n8n's pre-flight `WorkflowExecute.checkForWorkflowIssues` rejects with a generic "has issues" message — no per-node detail surfaced through the REST API.
- `Split Items` `include: "selectedOtherFields"` produced a nested item shape that broke the downstream expression `={{ $json.un_number }}`. Fix: `include: "noOtherFields"`.
- `Aggregate Items`'s `aggregate: "aggregateIndividualFields"` with field `"*"` treated the asterisk as a literal field name and produced `{ "*": [] }` instead of an items array. Fix: `aggregate: "aggregateAllItemData"` with `destinationFieldName: "data"`.
- The `Merge ADR Data Into Item` Code node ran in `runOnceForAllItems` mode and used `$input.first()` — meaning only the first of N items got merged. Fix: switch to `runOnceForEachItem` and read from `$json`.

**Workflow-logic bug (1):**

- `Compose Output` mapped from `it.proper_shipping_name`, `it.class`, `it.packing_group` — fields the upstream Merge node never lifts to the top level. Three fields per item silently came out `undefined`. This was the source of the non-byte-identical diff against `example-output.json` when we re-ran a Compose-JS replay against real upstream data instead of mocked Compose-stage input.

**Graceful-degradation gap (1):**

- An invalid UN (test case: UN 9999) made `ADR Lookup` throw 404 and halted the workflow. The intended behaviour, per the [`schema.md`](https://github.com/SoapyRED/n8n-nodes-freightutils/blob/main/templates/adr-dg-validation/schema.md) contract, is to populate `validation.items_with_errors[]` and continue with the valid items. Fix: `onError: 'continueRegularOutput'` on the lookup node + a Merge fallback that emits `{ adr_data: null, lookup_failed: true, error_reason }`.

**One bug in n8n core itself.** Bug 5. The headline.

## Bug 5 — the upstream finding

Some context on the surface symptom first.

In v0.3.0 of `n8n-nodes-freightutils`, the consignment-shape operations (`adrLqCheck`, `adrExemptionConsignment`, and the all-purpose `consignment`) declared their items input as a `fixedCollection` with `multipleValues: true`:

```ts
{
  displayName: 'Dangerous Goods Items',
  name: 'items',
  type: 'fixedCollection',
  typeOptions: { multipleValues: true },
  default: {},
  options: [{
    name: 'itemValues',
    displayName: 'Item',
    values: [
      { displayName: 'UN Number', name: 'un_number', type: 'string', default: '1203' },
      { displayName: 'Quantity', name: 'quantity', type: 'number', default: 0.5 },
      { displayName: 'Unit', name: 'unit', type: 'string', default: 'L' },
    ],
  }],
}
```

The intent: a user could either click `Add Item` in the UI for static items, or — for dynamic flows where items come from upstream — set the parameter to a single expression that resolves to an array, e.g. `={{ $json.items }}`. Declarative routing assigns `$parameter.items.itemValues` to the API request body's `items` field.

Items typed literally into the UI worked. Expression input — the path nearly any non-toy workflow uses — produced a payload the API rejected with HTTP 400 `Maximum 20 items per check`, even when the upstream array contained two items.

We instrumented `NodeHelpers.getNodeParameters` in `n8n-workflow` to log `propertyValues[itemName]` and what the recursion produced for it. The result: the eighteen-character string `'={{ $json.items }}'` was iterating *as a string* through a `for (const nodeValue of propertyValues[itemName])` loop. Each character was being treated as a fixedCollection row, recursively resolved through `getNodeParameters`, and emitted with the parameter's schema defaults. The API was receiving 18 items, each `{ un_number: "1203", quantity: 0.5, unit: "L" }`. By the time the node's `preSend` hook saw `node.parameters.items.itemValues`, it had already been mutated to the defaults array. The original expression string was unrecoverable from inside the node.

The root-cause site is `packages/workflow/src/NodeHelpers.ts` lines 723–770 in n8n master at the time of filing. The relevant iteration is approximately:

```ts
for (const nodeValue of propertyValues[itemName]) {
  // ...recursive resolution against the fixedCollection schema...
}
```

When `propertyValues[itemName]` is a string — i.e. an unresolved expression that hasn't been evaluated to its array value yet — the for-of iterates the string's characters. JavaScript strings are iterable; this is not a bug per the language spec. It is a bug per the contract of resolving a `multipleValues` fixedCollection.

The implication is that any community or built-in node exposing a `multipleValues: true` fixedCollection that intends to support dynamic-array input via expression is silently broken in this way. The bug is invisible to the node author — request payloads come out as well-formed JSON with the right shape, just with N×default-items where N is the expression string's character length. Downstream APIs see a payload with too many items, or a payload of all-defaults, depending on what the node does next.

## The workaround pattern

We can't fix n8n core inside a node patch, so the v0.3.1 release works around the iteration bug by avoiding `multipleValues` for the dynamic case entirely. The shape is a transferable pattern any community-node author hitting the same trap can adopt:

```ts
// Step 1: an enum toggle that defaults to the legacy fixedCollection path
{
  displayName: 'Items Source',
  name: 'itemsSource',
  type: 'options',
  default: 'list',
  options: [
    { name: 'Add Items in List', value: 'list' },
    { name: 'JSON Expression',   value: 'json' },
  ],
}

// Step 2: the dynamic path — a string parameter, not a fixedCollection
{
  displayName: 'Items (JSON)',
  name: 'itemsJson',
  type: 'string',
  typeOptions: { rows: 4 },
  default: '',
  placeholder: '={{ $json.items }}',
  displayOptions: { show: { itemsSource: ['json'] } },
}

// Step 3: the existing fixedCollection, gated to the legacy path
{
  displayName: 'Items',
  name: 'items',
  type: 'fixedCollection',
  typeOptions: { multipleValues: true },
  displayOptions: { show: { itemsSource: ['list'] } },
  // ...same options as v0.3.0
}
```

Then a shared `preSend` hook reads from whichever source the user picked and assembles the request body:

```ts
async function buildConsignmentItemsBody(this, requestOptions) {
  const source = this.getNodeParameter('itemsSource', 0) as string;
  const items = source === 'json'
    ? JSON.parse(this.getNodeParameter('itemsJson', 0) as string)
    : (this.getNodeParameter('items.itemValues', 0) as Array<unknown>);
  requestOptions.body = { ...(requestOptions.body as object), items };
  return requestOptions;
}
```

String parameters resolve expressions cleanly because they don't go through the broken fixedCollection iteration path. The user gets a single field they paste `={{ $json.items }}` into, and it works. Reference implementation: [v0.3.1 source](https://github.com/SoapyRED/n8n-nodes-freightutils/blob/v0.3.1/nodes/FreightUtils/FreightUtils.node.ts).

The pattern is backwards-compatible. `default: 'list'` means existing user workflows keep the old fixedCollection UI and behave exactly as in v0.3.0; only users explicitly switching to `JSON Expression` route through the new path. No migration script needed.

## Filing upstream

We filed the issue at [n8n-io/n8n#29619](https://github.com/n8n-io/n8n/issues/29619) on the same day we caught it. It's open and has been triaged into n8n's internal Linear queue (visible via the `team:cats` and `status:in-linear` labels). The suggested fix direction: short-circuit the for-of when `propertyValues[itemName]` is a string — either treat it as a single fixedCollection row needing further resolution, or defer iteration until after expression evaluation. If you author a community node with a `multipleValues` fixedCollection accepting expression input, subscribe to the issue and adopt the workaround above in the meantime.

## The lesson

The boring lesson, the one we ought not need to relearn: static validation plus replay-against-recorded-API is necessary but not sufficient for any workflow template targeting a marketplace. End-to-end execution — real n8n version, real community-node version, real API, real expression resolution path — is the gating step, not an afterthought. A template that fails this last check has no business sitting on a Creator hub no matter how clean the lint is.

Concrete actions we're now taking in this repo: a CI check that imports `workflow.json` into a fresh n8n + FU@latest, runs a wrapper against a 2-item fixture, and compares JSON output to the committed `example-output.json`. Byte drift fails the PR. The smoke-test wrapper is committed alongside the template so future runs can be `n8n execute --id=<wrapperId>` without rebuilding the Manual-Trigger plumbing each time.

If you want to run the template: install [`n8n-nodes-freightutils`](https://www.npmjs.com/package/n8n-nodes-freightutils) (>= 0.3.1), grab a free FreightUtils API key (100 req/day, no card) at [freightutils.com](https://www.freightutils.com), import [`templates/adr-dg-validation/workflow.json`](https://github.com/SoapyRED/n8n-nodes-freightutils/blob/main/templates/adr-dg-validation/workflow.json), and call it from a parent workflow via Execute Workflow. Issues, PRs, and bug reports against the [n8n-nodes-freightutils repo](https://github.com/SoapyRED/n8n-nodes-freightutils) are welcome.

## References

- npm package: <https://www.npmjs.com/package/n8n-nodes-freightutils>
- GitHub repo: <https://github.com/SoapyRED/n8n-nodes-freightutils>
- Workflow template: [`templates/adr-dg-validation/workflow.json`](https://github.com/SoapyRED/n8n-nodes-freightutils/blob/main/templates/adr-dg-validation/workflow.json)
- E2E audit (full bug list): [`docs/audits/2026-05-01-n8n-template-e2e.md`](https://github.com/SoapyRED/n8n-nodes-freightutils/blob/main/docs/audits/2026-05-01-n8n-template-e2e.md)
- Upstream n8n issue: <https://github.com/n8n-io/n8n/issues/29619>
- Workaround source (v0.3.1): <https://github.com/SoapyRED/n8n-nodes-freightutils/blob/v0.3.1/nodes/FreightUtils/FreightUtils.node.ts>
- ADR 2025 official text: <https://unece.org/transport/dangerous-goods/adr-2025>
- FreightUtils API docs: <https://www.freightutils.com/api-docs>

---

*By Marius Cristoiu (Soap) — UK freight transport planner and founder of [FreightUtils](https://www.freightutils.com). This article exists at the intersection of freight-ops practitioner and community-node author; the bug above was caught while shipping a template I'll personally use on bookings.*
