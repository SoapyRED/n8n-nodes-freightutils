# ADR DG Validation — n8n sub-workflow template

Validate a road-freight dangerous-goods consignment against UNECE ADR 2025 in a single n8n sub-workflow call. Returns per-item ADR data, LQ/EQ eligibility, transport-category points, 1.1.3.6 exemption status, tunnel restrictions, and driver-certification flags — all keyed off the FreightUtils REST API.

## What this does

Given a consignment header + array of DG items (`un_number`, quantity, packaging), the sub-workflow:

1. Validates input shape (fails fast if required fields missing)
2. Looks each item up against UNECE ADR 2025 via `GET /api/adr` — fills in proper shipping name, class, packing group, transport category, tunnel code, LQ/EQ limits
3. Runs a consignment-level Limited Quantity check via `POST /api/adr/lq-check`
4. Runs the 1.1.3.6 exemption calculation via `POST /api/adr-calculator` (transport-category points, threshold, per-substance overage detection)
5. Composes a structured output: per-item enriched records + aggregate compliance flags

The whole sub-workflow runs in ~150–400 ms for a 1–10 item consignment, depending on FU API cold-start.

## When to use it

- **Pre-manifest enrichment** — feed in a booking line and get ADR-compliant manifest data (proper shipping name, hazard ID number, tunnel code) without manually consulting Labeline or the ADR book.
- **Compliance gap detection** — surface 1.1.3.6 threshold breaches, per-substance overage warnings, and tunnel restriction conflicts before dispatch.
- **Sub-workflow building block** — chain into a larger workflow that handles document generation, transport-route booking, or driver assignment.

Not a replacement for a qualified DGSA (ADR 1.8.3). Outputs are best-effort regulatory annotations; final compliance decisions remain with the consignor.

## Inputs

See [`schema.md`](./schema.md) for the full input contract. Minimum example (one item):

```json
{
  "consignment": {
    "shipper": "Acme Coatings Ltd",
    "consignee": "Bauchemie GmbH",
    "transport_mode": "road",
    "origin_country": "GB",
    "destination_country": "DE"
  },
  "items": [
    {
      "un_number": "1263",
      "quantity_per_package": 25,
      "quantity_unit": "L",
      "package_count": 5,
      "packaging_type": "drums"
    }
  ]
}
```

## Outputs

See [`schema.md`](./schema.md) for the full output contract. Top-level shape:

```json
{
  "consignment": { "...echo of input header" },
  "validation": { "all_items_recognized": true, "items_validated": 2, "items_with_warnings": [], "items_with_errors": [] },
  "items": [ { "input": {...}, "adr_data": {...}, "lq_eq_check": {...}, "transport_category_points": 6250 } ],
  "aggregate": {
    "total_transport_category_points": 7250,
    "exemption_113_6_status": "exceeds_threshold",
    "vehicle_marking_required": true,
    "tunnel_restrictions": ["(D/E)"],
    "driver_adr_certificate_required": true,
    "notes": [ "..." ]
  }
}
```

Items with an unknown / failed UN lookup don't halt the workflow — they appear in `validation.items_with_errors` (with `index` + `reasons`) and as `{ input, adr_data: null, lookup_failed: true, error_reason }` in the items array. Aggregate calculations exclude failed items. See `schema.md` → "Graceful degradation on unknown UN numbers" for the full contract.

## How to call it from a parent workflow

**Prerequisite:** install [`n8n-nodes-freightutils`](https://www.npmjs.com/package/n8n-nodes-freightutils) **>= 0.3.1** (Settings → Community Nodes → Install). The workflow uses three native operations from this node: `adrLookup`, `adrLqCheck`, and `adrExemptionConsignment` (the last one was added in v0.3.0). v0.3.1 fixed a regression in dynamic-array handling — the consignment ops in this workflow are configured with `Items Source: JSON Expression` so they accept the upstream array directly. Older v0.3.0 won't parse the workflow's `itemsSource: 'json'` parameter.

1. Import `workflow.json` into your n8n instance (Workflows → Import from File).
2. Create a **FreightUtils API** credential (single credential, used by all three FreightUtils nodes in the workflow):
   - **API Key:** your FreightUtils API key (`fu_live_…` from [freightutils.com/api-docs#signup](https://www.freightutils.com/api-docs#signup) or [/pricing](https://www.freightutils.com/pricing))
   - **Base URL:** leave at default (`https://www.freightutils.com/api`)
3. In your parent workflow, add an **Execute Workflow** node:
   - **Source:** Database
   - **Workflow:** ADR DG Validation (sub-workflow)
   - **Pass parameters:** Map your booking data to the input shape (see `example-input.json`)
4. Activate the sub-workflow (toggle in the top-right of the editor).

The sub-workflow returns the composed output to the calling workflow's next node.

## Examples

- [`example-input.json`](./example-input.json) — 2-item GB→DE consignment (UN 1263 PAINT 5×25L drums + UN 3082 ENVIRONMENTALLY HAZARDOUS SUBSTANCE 1×1000L IBC)
- [`example-output.json`](./example-output.json) — actual workflow output for the above input, computed against live FU API responses captured in [`api-samples.md`](./api-samples.md)

## Limitations (v1)

- **Road only.** Air (IATA-DGR) and sea (IMDG) variants are out of scope. The transport_category and 1.1.3.6 exemption are ADR road-specific. A future template will swap to IATA/IMDG endpoints for those modes.
- **1.1.3.6 only.** The aggregate exemption check uses ADR 1.1.3.6 (transport-category points). Other exemption schemes (3.4 Limited Quantity, 3.5 Excepted Quantity) are reported per-item but not aggregated as alternative consignment-level exemptions.
- **Single transport unit assumed.** The aggregate calculation assumes the entire consignment travels in one vehicle. For multi-vehicle splits, run the workflow once per vehicle.
- **PG defaults.** When the input item omits `packing_group` and the UN has multiple variants (e.g. UN 1263 has 6), the workflow picks `variant_index: 0` (the most restrictive PG). Pre-set `packing_group` on the input if you need a specific variant.

## Tags & metadata

```
adr · dangerous-goods · compliance · freight · freightutils
```

## Related

- FreightUtils API docs: https://www.freightutils.com/api-docs
- The FreightUtils n8n custom node: [n8n-nodes-freightutils on npm](https://www.npmjs.com/package/n8n-nodes-freightutils)
- ADR 2025 official text: https://unece.org/transport/dangerous-goods/adr-2025

## License

MIT, matching the parent `n8n-nodes-freightutils` package.
