# n8n-nodes-freightutils

n8n community node for [FreightUtils](https://www.freightutils.com) — free freight calculators, ADR 2025 dangerous-goods lookup, HS 2022 codes, UK import duty, UN/LOCODE, and more. One node, 19 operations, four resources.

## Install

Inside n8n:

1. Open **Settings → Community Nodes**
2. Click **Install**
3. Enter `n8n-nodes-freightutils`
4. Confirm

Manual install (self-hosted, if the UI is disabled):

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-freightutils
```

Restart n8n. The node appears as **FreightUtils** under the **Transform** group.

## Credentials

1. Generate a free API key at <https://www.freightutils.com/api-docs> (you get **100 requests/day** on the free tier).
2. In n8n → **Credentials → Create New**, pick **FreightUtils API**.
3. Paste the key. Leave **Base URL** as `https://www.freightutils.com/api` unless you're pointing at a preview deployment.
4. Save. n8n tests the credential by hitting `/api/health` — you should see a green tick.

## Rate limits

| Tier | Limit | Pricing |
|------|-------|---------|
| Anonymous (no key) | 25/day per IP | Free |
| Free key | 100/day | Free |
| Pro key | 50,000/month | £19/month |

See <https://www.freightutils.com/pricing> for Pro access. Every response includes `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers.

## Operations

**Freight Ops** — CBM · LDM · Chargeable Weight · Pallet Fitting · Unit Converter · Consignment

**Dangerous Goods** — ADR Lookup · ADR LQ/EQ Check · ADR Exemption Calculator

**Customs & Trade** — HS Code Lookup · Incoterms Lookup · UK Duty Calculator

**Reference Data** — Airline · UN/LOCODE · ULD · Container · Vehicle · Health Ping · List Tools

## Example A — Chargeable weight on an incoming air-freight booking

Trigger: a webhook fires when a booking is created in your TMS.

1. **Webhook** → receives `{ length, width, height, grossWeight }` (cm, kg).
2. **FreightUtils** node → Resource `Freight Ops`, Operation `Calculate Chargeable Weight`.
3. Map webhook fields into `Length (cm)`, `Width (cm)`, `Height (cm)`, `Gross Weight (kg)`.
4. Downstream: write `chargeable_weight_kg` back to the booking record.

Example response:

```json
{
  "length_cm": 120,
  "width_cm": 80,
  "height_cm": 100,
  "gross_weight_kg": 500,
  "volumetric_weight_kg": 160,
  "chargeable_weight_kg": 500,
  "billing_basis": "actual"
}
```

## Example B — HS code + UK duty lookup from a SKU

Trigger: row added to a "SKU Imports" spreadsheet.

1. **Google Sheets trigger** → new row with `sku_description`, `country_of_origin`, `unit_value_gbp`.
2. **FreightUtils** node 1 → Resource `Customs & Trade`, Operation `HS Code Lookup`, `Query = {{ $json.sku_description }}`.
3. **Set** node → pick the top match's `commodity_code`.
4. **FreightUtils** node 2 → Resource `Customs & Trade`, Operation `UK Duty Calculator`, map `Commodity Code`, `Origin Country`, `Customs Value (GBP)`.
5. Write `duty_rate_percent` and `total_duty_gbp` back to the spreadsheet.

## Links

- FreightUtils: <https://www.freightutils.com>
- API docs: <https://www.freightutils.com/api-docs>
- Pricing: <https://www.freightutils.com/pricing>
- Changelog: <https://www.freightutils.com/changelog>
- Status: <https://www.freightutils.com/status>
- This repo: <https://github.com/SoapyRED/n8n-nodes-freightutils>
- npm package: <https://www.npmjs.com/package/n8n-nodes-freightutils>
- Issues: <https://github.com/SoapyRED/n8n-nodes-freightutils/issues>

## Licence

MIT — see [LICENSE.md](LICENSE.md).

Built by [Marius Cristoiu](https://www.linkedin.com/in/marius-cristoiu-a853812a2/), ADR-certified freight transport planner.
