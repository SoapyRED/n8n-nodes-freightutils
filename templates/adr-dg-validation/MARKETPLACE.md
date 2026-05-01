# Creator hub upload metadata — adr-dg-validation

## Short description (one line, max 140 chars)

> Validate dangerous goods consignments against ADR 2025: per-item lookup, LQ/EQ eligibility, 1.1.3.6 exemption math.

## Long description (markdown, displayed on the listing page)

A reusable sub-workflow for validating multi-item dangerous goods consignments against ADR 2025 road transport regulations.

Takes a structured consignment (header + items array) and returns:

- Per-item ADR data: class, packing group, transport category, tunnel restrictions, hazard ID
- Per-item LQ (Limited Quantity) and EQ (Excepted Quantity) eligibility check
- Aggregate transport-category points calculation against the 1000-point 1.1.3.6 exemption threshold
- Vehicle marking requirement, tunnel restrictions, driver ADR certificate requirement
- Per-item warnings and errors (failed lookups populate `validation.items_with_errors[]` rather than halting the workflow)

Designed as a sub-workflow callable via Execute Workflow. Drop it into any pipeline that needs ADR compliance validation — booking confirmation, manifest generation, automated freight forwarder responses.

### How it works

1. Receives consignment + items array
2. Looks up each item against ADR 2025 dataset (2,939 entries, sourced from UNECE)
3. Checks LQ/EQ eligibility per item against current quantity and packaging
4. Aggregates transport-category points across the consignment
5. Determines 1.1.3.6 exemption status, vehicle marking, tunnel restrictions, driver cert requirement
6. Returns full validated structure for downstream nodes

### Requirements

- `n8n-nodes-freightutils` >= 0.3.1 (community node)
- FreightUtils API key (free tier 100 req/day, Pro tier 50K/month — get one at freightutils.com)

### Limitations (v1)

- ADR road transport only — sea (IMDG) and air (IATA DGR) variants not in scope
- Exemption calculation uses 1.1.3.6 (transport category points) — other exemption routes (3.4 LQ-aggregated, 3.5 EQ-aggregated) checked per-item but not consignment-aggregated
- Assumes a single transport unit (single vehicle / single trailer)

## Tags (n8n.io Creator hub asks for tags, comma-separated)

> dangerous goods, adr, freight, logistics, compliance, validation, freightutils, hazardous materials

## Category

> Logistics & Operations
> (Fallback if that category isn't offered: Productivity, then Other)

## Screenshot guidance

n8n.io may request a screenshot of the workflow graph. Capture from inside n8n's editor with all 9 nodes visible:

1. Execute Workflow Trigger
2. Validate Input
3. Split Items
4. ADR Lookup
5. Merge ADR Data Into Item
6. Aggregate Items
7. ADR LQ Check (Consignment)
8. ADR 1.1.3.6 Exemption (Consignment)
9. Compose Output

Recommended dimensions per n8n.io guidance: 1280x720 minimum, light theme preferred for marketplace consistency.

## Linked references

- Source workflow: [`workflow.json`](./workflow.json)
- README: [`README.md`](./README.md)
- Schema: [`schema.md`](./schema.md)
- Sample I/O: [`example-input.json`](./example-input.json) + [`example-output.json`](./example-output.json)
- E2E evidence: [`_e2e-evidence/`](./_e2e-evidence/)
- Audit trail: [`docs/audits/2026-05-01-n8n-template-e2e.md`](../../docs/audits/2026-05-01-n8n-template-e2e.md)
- Upstream contribution: https://github.com/n8n-io/n8n/issues/29619
