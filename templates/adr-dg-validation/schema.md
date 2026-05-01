# ADR DG Validation — input + output schemas

## Input

The sub-workflow accepts a single JSON object with two top-level keys: `consignment` (header) and `items` (1+ DG items).

```json
{
  "consignment": {
    "booking_reference": "string, optional",
    "shipper": "string",
    "consignee": "string",
    "transport_mode": "road | air | sea",
    "origin_country": "ISO-2",
    "destination_country": "ISO-2",
    "route_notes": "string, optional"
  },
  "items": [
    {
      "un_number": "string, 1-4 digits, e.g. \"1263\"",
      "proper_shipping_name": "string, optional — FU enriches if missing",
      "class": "string, optional — FU enriches",
      "packing_group": "I | II | III, optional — FU enriches",
      "quantity_per_package": "number > 0",
      "quantity_unit": "L | kg | mL | g",
      "package_count": "integer > 0",
      "packaging_type": "drums | IBC | jerricans | boxes | bags | other",
      "special_handling": "string, optional"
    }
  ]
}
```

### Required fields (per item)
- `un_number`
- `quantity_per_package`
- `quantity_unit`
- `package_count`
- `packaging_type`

The Validate Input Code node fails fast (throws) if any required field is missing.

### Quantity normalisation

The workflow computes `total_quantity = quantity_per_package × package_count` per item before calling the FreightUtils API. Units are passed through as-is (mL → mL, kg → kg, etc). Mixed-unit consignments are supported per item; the FU `/api/adr-calculator` endpoint handles the unit-aware total internally.

## Output

```json
{
  "consignment": { "...echo of input header" },
  "validation": {
    "all_items_recognized": true,
    "items_validated": 2,
    "items_with_warnings": [
      { "index": 0, "reasons": ["LQ exceeds limit"] }
    ],
    "items_with_errors": []
  },
  "items": [
    {
      "input": { "...echo of input item" },
      "adr_data": {
        "un_number": "1263",
        "proper_shipping_name": "PAINT...",
        "class": "3",
        "packing_group": "I",
        "transport_category": "1",
        "tunnel_restriction_code": "(D/E)",
        "labels": "3",
        "limited_quantity": "500 ml",
        "excepted_quantity": "E3",
        "hazard_identification_number": "33",
        "variant_index": 0
      },
      "lq_eq_check": {
        "qualifies_for_lq": false,
        "qualifies_for_eq": false,
        "max_lq": "500 ml",
        "max_eq": "E3"
      },
      "transport_category_points": 6250
    }
  ],
  "aggregate": {
    "total_transport_category_points": 7250,
    "exemption_113_6_status": "exceeds_threshold",
    "vehicle_marking_required": true,
    "tunnel_restrictions": ["(D/E)"],
    "driver_adr_certificate_required": true,
    "notes": [
      "UN1263 (Category 1): 125 exceeds the 20 kg/L maximum for Transport Category 1"
    ]
  }
}
```

### `exemption_113_6_status` values
- `exempt` — total points ≤ 1000, no Category 0 substances, no per-substance overage
- `exceeds_threshold` — total points > 1000 OR any per-substance overage
- `mixed_categories_check_required` — Category 0 present (1.1.3.6 cannot be used)

### `vehicle_marking_required`
`true` whenever exemption fails (full ADR placarding, orange-plate marking required).
`false` only when the consignment qualifies for 1.1.3.6 exemption.

### `tunnel_restrictions`
Array of unique tunnel restriction codes from the items, ordered by restrictiveness (most restrictive first). Tunnel category letter alphabetic order (E > D > C > B > A > "-"). The narrowest applicable category is the first element.

### `driver_adr_certificate_required`
Heuristic: `true` when exemption fails OR any item has transport_category in {0, 1}. Mirrors UK DfT guidance on ADR licence requirements above the 1.1.3.6 threshold.

### `notes`
Free-form regulatory annotations passed through from `/api/adr-calculator.warnings` plus any heuristics the Compose Output node adds.
