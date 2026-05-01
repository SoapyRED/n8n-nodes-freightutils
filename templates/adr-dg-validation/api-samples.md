# FreightUtils API samples — captured against prod with `SMOKE_API_KEY`

These responses were captured during the design of this template by hitting the production FreightUtils API with a Pro-tier key. They drive the example fixtures and document the exact wire format the workflow expects.

Captured: **2026-05-01**
Endpoint base: `https://www.freightutils.com`

---

## 1. `adr_lookup` — UN 1263 PAINT

`GET /api/adr?un=1263` — returns 6 variants for "PAINT". The workflow picks `variant_index: 0` (first match, typically the most-restrictive Packing Group I entry):

```json
{
  "count": 6,
  "results": [
    {
      "un_number": "1263",
      "proper_shipping_name": "PAINT (including paint, lacquer, enamel, stain, shellac, varnish, polish, liquid filler and liquid lacquer base) or PAINT RELATED MATERIAL (including paint thinning and reducing compound)",
      "class": "3",
      "classification_code": "F1",
      "packing_group": "I",
      "labels": "3",
      "special_provisions": "163 367 650",
      "limited_quantity": "500 ml",
      "excepted_quantity": "E3",
      "transport_category": "1",
      "tunnel_restriction_code": "(D/E)",
      "hazard_identification_number": "33",
      "variant_index": 0,
      "variant_count": 6
    }
    /* …5 more variants for PG II, viscous PAINT, etc. */
  ]
}
```

**Workflow behaviour:** the `Merge ADR Data Into Item` Code node picks `results[0]` and copies the fields above into `adr_data`. For UN 1263 specifically this defaults to PG I (the most restrictive), which is the safe default for compliance tools. Users with PG-known data should pre-set `packing_group` on the input item — the workflow respects user-supplied values and skips the variant pick.

## 2. `adr_lookup` — UN 3082 ENVIRONMENTALLY HAZARDOUS SUBSTANCE

`GET /api/adr?un=3082` — single variant:

```json
{
  "count": 1,
  "results": [
    {
      "un_number": "3082",
      "proper_shipping_name": "ENVIRONMENTALLY HAZARDOUS SUBSTANCE, LIQUID, N.O.S.",
      "class": "9",
      "classification_code": "M6",
      "packing_group": "III",
      "labels": "9",
      "special_provisions": "274 335 375 601 650",
      "limited_quantity": "5 L",
      "excepted_quantity": "E1",
      "transport_category": "3",
      "tunnel_restriction_code": "(-)",
      "hazard_identification_number": "90",
      "variant_index": 0,
      "variant_count": 1
    }
  ]
}
```

## 3. `adr_lookup` — UN 1090 ACETONE

`GET /api/adr?un=1090` — single variant, used by tests + smoke fixtures:

```json
{
  "count": 1,
  "results": [
    {
      "un_number": "1090",
      "proper_shipping_name": "ACETONE",
      "class": "3",
      "classification_code": "F1",
      "packing_group": "II",
      "labels": "3",
      "special_provisions": null,
      "limited_quantity": "1 L",
      "excepted_quantity": "E2",
      "transport_category": "2",
      "tunnel_restriction_code": "(D/E)",
      "hazard_identification_number": "33",
      "variant_index": 0,
      "variant_count": 1
    }
  ]
}
```

## 4. `adr_lq_eq_check` — 2-item LQ check (consignment-level)

`POST /api/adr/lq-check` with body:

```json
{
  "mode": "lq",
  "items": [
    { "un_number": "1263", "quantity": 125, "unit": "L" },
    { "un_number": "3082", "quantity": 1000, "unit": "L" }
  ]
}
```

Response:

```json
{
  "mode": "lq",
  "overall_status": "fails",
  "items": [
    {
      "un_number": "1263",
      "substance": "PAINT (…)",
      "class": "3",
      "packing_group": "I",
      "lq_limit": "500 ml",
      "lq_limit_value": 500,
      "lq_limit_unit": "ml",
      "eq_code": "E3",
      "quantity_entered": 125,
      "unit_entered": "L",
      "status": "exceeds_limit",
      "reason": "125 L exceeds the LQ limit of 500 ml per inner packaging"
    },
    {
      "un_number": "3082",
      "substance": "ENVIRONMENTALLY HAZARDOUS SUBSTANCE, LIQUID, N.O.S.",
      "class": "9",
      "packing_group": "III",
      "lq_limit": "5 L",
      "lq_limit_value": 5,
      "lq_limit_unit": "L",
      "eq_code": "E1",
      "quantity_entered": 1000,
      "unit_entered": "L",
      "status": "exceeds_limit",
      "reason": "1000 L exceeds the LQ limit of 5 L per inner packaging"
    }
  ],
  "summary": { "total_items": 2, "qualifying": 0, "failing": 2 }
}
```

**Workflow note:** the `total_quantity` (per-package × package-count) is sent as the `quantity` field. For UN 1263 PAINT the input is 5 × 25 L drums = 125 L; the LQ limit is per inner packaging, and 25 L per drum already vastly exceeds the 500 ml LQ limit, so the consignment fails LQ regardless. The workflow surfaces this as `qualifies_for_lq: false`.

## 5. `adr_exemption_calculator` — 1.1.3.6 consignment exemption

`POST /api/adr-calculator` with body:

```json
{
  "items": [
    { "un_number": "1263", "quantity": 125 },
    { "un_number": "3082", "quantity": 1000 }
  ]
}
```

Response:

```json
{
  "items": [
    {
      "un_number": "1263",
      "proper_shipping_name": "PAINT (…)",
      "class": "3",
      "transport_category": "1",
      "quantity": 125,
      "multiplier": 50,
      "points": 6250
    },
    {
      "un_number": "3082",
      "proper_shipping_name": "ENVIRONMENTALLY HAZARDOUS SUBSTANCE, LIQUID, N.O.S.",
      "class": "9",
      "transport_category": "3",
      "quantity": 1000,
      "multiplier": 1,
      "points": 1000
    }
  ],
  "total_points": 7250,
  "threshold": 1000,
  "exempt": false,
  "has_category_zero": false,
  "has_quantity_exceedance": true,
  "warnings": [
    "UN1263 (Category 1): 125 exceeds the 20 kg/L maximum for Transport Category 1"
  ],
  "message": "Per-substance quantity limit exceeded — full ADR compliance required"
}
```

The workflow's `Compose Output` Code node maps:
- `total_points` → `aggregate.total_transport_category_points`
- `exempt` → drives `aggregate.exemption_113_6_status` and `vehicle_marking_required`
- `warnings` → `aggregate.notes`
- `has_category_zero` → forces `exemption_113_6_status` to `mixed_categories_check_required`

## Workflow now uses the native FreightUtils node (v0.3.0+)

This template originally used **HTTP Request** nodes for `/api/adr/lq-check` and `/api/adr-calculator` because `n8n-nodes-freightutils@0.2.0` only exposed the single-substance form of `adrExemption`. The workflow has since been updated (alongside `n8n-nodes-freightutils@0.3.0` published 2026-05-01) to use three native node operations:

- **ADR Lookup** — `dangerousGoods → adrLookup` (per item, in the loop)
- **ADR LQ Check** — `dangerousGoods → adrLqCheck` (consignment-level, multi-item; existed in v0.2.0)
- **ADR 1.1.3.6 Exemption** — `dangerousGoods → adrExemptionConsignment` (consignment-level, multi-item; **new in v0.3.0**)

The wire shape captured in this document (input bodies + responses) is unchanged — only the workflow's invocation pattern moved from raw HTTP requests to the n8n custom node. Output is byte-identical to the prior HTTP-Request-based version, verified post-swap by replaying the live API responses through the unchanged Compose Output Code node.

**Parity audit at v0.3.0 release:** the same multi-item exemption gap was found in the Zapier and Make integrations and patched in the same release window (Zapier `adrExemptionConsignment` + `adrLqCheckConsignment` actions; Make modules of the same names). The MCP server already supported the multi-item form via `adr_exemption_calculator` and `adr_lq_eq_check` tools.
