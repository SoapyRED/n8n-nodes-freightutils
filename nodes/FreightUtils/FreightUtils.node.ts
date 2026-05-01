import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type INodeProperties,
} from 'n8n-workflow';

// ─── Resource selector ───────────────────────────────────────────

const resourceOptions: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			// eslint-disable-next-line n8n-nodes-base/node-param-resource-with-plural-option
			name: 'Freight Ops',
			value: 'freightOps',
			description: 'CBM, LDM, chargeable weight, pallet fitting, unit conversion, consignment totals',
		},
		{
				name: 'Dangerous Goods',
			value: 'dangerousGoods',
			description: 'ADR 2025 lookup, LQ/EQ check, exemption calculator',
		},
		{
			name: 'Customs & Trade',
			value: 'customsTrade',
			description: 'HS code lookup, Incoterms lookup, UK import duty and VAT',
		},
		{
			name: 'Reference Data',
			value: 'referenceData',
			description: 'Airlines, UN/LOCODE, ULDs, containers, vehicles, platform meta',
		},
	],
	default: 'freightOps',
};

// ─── Freight Ops operations (6) ──────────────────────────────────

const freightOpsOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['freightOps'] } },
	default: 'cbm',
	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
	options: [
		{
			name: 'Calculate CBM',
			value: 'cbm',
			action: 'Calculate cubic metres',
			description: 'Cubic metres for one item',
			routing: { request: { method: 'GET', url: '/cbm' } },
		},
		{
			name: 'Calculate LDM',
			value: 'ldm',
			action: 'Calculate loading metres',
			description: 'Loading metres from a pallet preset and quantity',
			routing: { request: { method: 'GET', url: '/ldm' } },
		},
		{
			name: 'Calculate Chargeable Weight',
			value: 'chargeableWeight',
			action: 'Calculate chargeable weight',
			description: 'Air or sea chargeable weight',
			routing: { request: { method: 'GET', url: '/chargeable-weight' } },
		},
		{
			name: 'Calculate Pallet Fitting',
			value: 'pallet',
			action: 'Calculate pallet fitting',
			description: 'How many boxes of a given size fit a pallet',
			routing: { request: { method: 'GET', url: '/pallet' } },
		},
		{
			name: 'Convert Units',
			value: 'convert',
			action: 'Convert units',
			description: 'Kilograms to pounds, metres to feet, and similar freight unit conversions',
			routing: { request: { method: 'GET', url: '/convert' } },
		},
		{
			name: 'Calculate Consignment',
			value: 'consignment',
			action: 'Calculate a multi-item consignment',
			description: 'Totals (CBM, weight, LDM, chargeable) across mixed items',
			routing: {
				request: {
					method: 'POST',
					url: '/consignment',
					body: {
						mode: '={{$parameter.mode}}',
						// /api/consignment input parser only accepts camelCase aliases on items.
							// Map snake_case (n8n) -> camelCase (wire) until the website parser adds aliases.
							items: '={{$parameter.items.itemValues.map(i => ({ length: i.length, width: i.width, height: i.height, quantity: i.quantity, grossWeight: i.gross_weight }))}}',
					},
				},
			},
		},
	],
};

const dimensionFields: INodeProperties[] = [
	{
		displayName: 'Length (cm)',
		name: 'l',
		type: 'number',
		required: true,
		default: 120,
		displayOptions: { show: { resource: ['freightOps'], operation: ['cbm', 'chargeableWeight'] } },
		routing: { send: { property: 'l', type: 'query' } },
	},
	{
		displayName: 'Width (cm)',
		name: 'w',
		type: 'number',
		required: true,
		default: 80,
		displayOptions: { show: { resource: ['freightOps'], operation: ['cbm', 'chargeableWeight'] } },
		routing: { send: { property: 'w', type: 'query' } },
	},
	{
		displayName: 'Height (cm)',
		name: 'h',
		type: 'number',
		required: true,
		default: 100,
		displayOptions: { show: { resource: ['freightOps'], operation: ['cbm', 'chargeableWeight'] } },
		routing: { send: { property: 'h', type: 'query' } },
	},
	{
		displayName: 'Gross Weight (kg)',
		name: 'gw',
		type: 'number',
		required: true,
		default: 500,
		displayOptions: { show: { resource: ['freightOps'], operation: ['chargeableWeight'] } },
		routing: { send: { property: 'gw', type: 'query' } },
	},
];

const ldmFields: INodeProperties[] = [
	{
		displayName: 'Pallet Type',
		name: 'pallet',
		type: 'options',
		required: true,
		default: 'euro',
		options: [
			{ name: 'Euro (1200×800)', value: 'euro' },
			{ name: 'UK Standard (1200×1000)', value: 'uk-standard' },
			{ name: 'Half Pallet (800×600)', value: 'half' },
			{ name: 'Quarter Pallet (600×400)', value: 'quarter' },
		],
		displayOptions: { show: { resource: ['freightOps'], operation: ['ldm'] } },
		routing: { send: { property: 'pallet', type: 'query' } },
	},
	{
		displayName: 'Quantity',
		name: 'qty',
		type: 'number',
		required: true,
		default: 10,
		displayOptions: { show: { resource: ['freightOps'], operation: ['ldm'] } },
		routing: { send: { property: 'qty', type: 'query' } },
	},
];

const palletFields: INodeProperties[] = [
	{
		displayName: 'Pallet Length (cm)',
		name: 'pl',
		type: 'number',
		required: true,
		default: 120,
		displayOptions: { show: { resource: ['freightOps'], operation: ['pallet'] } },
		routing: { send: { property: 'pl', type: 'query' } },
	},
	{
		displayName: 'Pallet Width (cm)',
		name: 'pw',
		type: 'number',
		required: true,
		default: 80,
		displayOptions: { show: { resource: ['freightOps'], operation: ['pallet'] } },
		routing: { send: { property: 'pw', type: 'query' } },
	},
	{
		displayName: 'Pallet Max Height (cm)',
		name: 'pmh',
		type: 'number',
		required: true,
		default: 220,
		displayOptions: { show: { resource: ['freightOps'], operation: ['pallet'] } },
		routing: { send: { property: 'pmh', type: 'query' } },
	},
	{
		displayName: 'Box Length (cm)',
		name: 'bl',
		type: 'number',
		required: true,
		default: 40,
		displayOptions: { show: { resource: ['freightOps'], operation: ['pallet'] } },
		routing: { send: { property: 'bl', type: 'query' } },
	},
	{
		displayName: 'Box Width (cm)',
		name: 'bw',
		type: 'number',
		required: true,
		default: 30,
		displayOptions: { show: { resource: ['freightOps'], operation: ['pallet'] } },
		routing: { send: { property: 'bw', type: 'query' } },
	},
	{
		displayName: 'Box Height (cm)',
		name: 'bh',
		type: 'number',
		required: true,
		default: 25,
		displayOptions: { show: { resource: ['freightOps'], operation: ['pallet'] } },
		routing: { send: { property: 'bh', type: 'query' } },
	},
];

const convertFields: INodeProperties[] = [
	{
		displayName: 'Value',
		name: 'value',
		type: 'number',
		required: true,
		default: 100,
		displayOptions: { show: { resource: ['freightOps'], operation: ['convert'] } },
		routing: { send: { property: 'value', type: 'query' } },
	},
	{
		displayName: 'From Unit',
		name: 'from_unit',
		type: 'string',
		required: true,
		default: 'kg',
		description:
			'Source unit code: kg, lbs, g, oz, m, ft, cm, in, m3, ft3, l, gal-us, gal-uk — see /api-docs for full list',
		displayOptions: { show: { resource: ['freightOps'], operation: ['convert'] } },
		routing: { send: { property: 'from', type: 'query' } },
	},
	{
		displayName: 'To Unit',
		name: 'to_unit',
		type: 'string',
		required: true,
		default: 'lbs',
		description: 'Target unit code — must be the same dimension as From Unit (mass, length, volume)',
		displayOptions: { show: { resource: ['freightOps'], operation: ['convert'] } },
		routing: { send: { property: 'to', type: 'query' } },
	},
];

const consignmentFields: INodeProperties[] = [
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		required: true,
		default: 'air',
		options: [
			{ name: 'Air', value: 'air' },
			{ name: 'Road', value: 'road' },
			{ name: 'Sea', value: 'sea' },
		],
		displayOptions: { show: { resource: ['freightOps'], operation: ['consignment'] } },
	},
	{
		displayName: 'Consignment Items',
		name: 'items',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		placeholder: 'Add Item',
		displayOptions: { show: { resource: ['freightOps'], operation: ['consignment'] } },
		options: [
			{
				displayName: 'Item',
				name: 'itemValues',
				values: [
					{
						displayName: 'Gross Weight (kg)',
						name: 'gross_weight',
						type: 'number',
						default: 25
					},
					{
						displayName: 'Height (cm)',
						name: 'height',
						type: 'number',
						default: 30
					},
					{
						displayName: 'Length (cm)',
						name: 'length',
						type: 'number',
						default: 60
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						default: 1
					},
					{
						displayName: 'Width (cm)',
						name: 'width',
						type: 'number',
						default: 40
					},
				],
			},
		],
	},
];

// ─── Dangerous Goods operations (3) ──────────────────────────────

const dangerousGoodsOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['dangerousGoods'] } },
	default: 'adrLookup',
	options: [
		{
			name: 'ADR Lookup',
			value: 'adrLookup',
			action: 'Look up an ADR UN number',
			description: 'UNECE ADR 2025 entry by UN number — 2,939 substances',
			routing: { request: { method: 'GET', url: '/adr' } },
		},
		{
			name: 'ADR LQ/EQ Check',
			value: 'adrLqCheck',
			action: 'Check LQ or EQ eligibility',
			description: 'Limited Quantity / Excepted Quantity eligibility for a mixed consignment',
			routing: {
				request: {
					method: 'POST',
					url: '/adr/lq-check',
					body: {
						mode: '={{$parameter.mode}}',
						items: '={{$parameter.items.itemValues}}',
					},
				},
			},
		},
		{
			name: 'ADR Exemption Calculator',
			value: 'adrExemption',
			action: 'Calculate ADR 1.1.3.6 exemption',
			description: 'Calculate transport-category points for a single substance against the 1000-point threshold',
			routing: { request: { method: 'GET', url: '/adr-calculator' } },
		},
		{
			name: 'ADR Exemption Calculator (Consignment)',
			value: 'adrExemptionConsignment',
			action: 'Calculate ADR 1.1.3.6 exemption for a multi-item consignment',
			description: 'Calculate aggregated transport-category points across multiple substances against the 1000-point threshold',
			routing: {
				request: {
					method: 'POST',
					url: '/adr-calculator',
					body: {
						items: '={{$parameter.items.itemValues.map(i => ({un_number: i.un_number, quantity: i.quantity}))}}',
					},
				},
			},
		},
	],
};

const dangerousGoodsFields: INodeProperties[] = [
	{
		displayName: 'UN Number',
		name: 'un',
		type: 'string',
		required: true,
		default: '1203',
		description: 'UN number (1–4 digits), e.g. 1203 for petrol',
		displayOptions: { show: { resource: ['dangerousGoods'], operation: ['adrLookup', 'adrExemption'] } },
		routing: { send: { property: 'un', type: 'query' } },
	},
	{
		displayName: 'Quantity (kg or L)',
		name: 'qty',
		type: 'number',
		required: true,
		default: 200,
		description: 'Quantity of the substance on the vehicle',
		displayOptions: { show: { resource: ['dangerousGoods'], operation: ['adrExemption'] } },
		routing: { send: { property: 'qty', type: 'query' } },
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		required: true,
		default: 'lq',
		options: [
			{ name: 'Limited Quantity (LQ)', value: 'lq' },
			{ name: 'Excepted Quantity (EQ)', value: 'eq' },
		],
		displayOptions: { show: { resource: ['dangerousGoods'], operation: ['adrLqCheck'] } },
	},
	{
		displayName: 'Dangerous Goods Items',
		name: 'items',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		placeholder: 'Add Item',
		displayOptions: {
			show: {
				resource: ['dangerousGoods'],
				operation: ['adrLqCheck', 'adrExemptionConsignment'],
			},
		},
		options: [
			{
				displayName: 'Item',
				name: 'itemValues',
				values: [
					{ displayName: 'UN Number', name: 'un_number', type: 'string', default: '1203' },
					{ displayName: 'Quantity', name: 'quantity', type: 'number', default: 0.5 },
					{
						displayName: 'Unit',
						name: 'unit',
						type: 'options',
						default: 'L',
						description:
							'Unit of measurement (used by adrLqCheck — adrExemptionConsignment ignores this field and computes by raw quantity)',
						options: [
							{ name: 'Litres (L)', value: 'L' },
							{ name: 'Kilograms (kg)', value: 'kg' },
						],
					},
				],
			},
		],
	},
];

// ─── Customs & Trade operations (3) ──────────────────────────────

const customsTradeOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['customsTrade'] } },
	default: 'hsLookup',
	options: [
		{
			name: 'HS Code Lookup',
			value: 'hsLookup',
			action: 'Look up HS codes',
			description: 'Free-text search against WCO HS 2022 nomenclature — 6,940 codes',
			routing: { request: { method: 'GET', url: '/hs' } },
		},
		{
			name: 'Incoterms Lookup',
			value: 'incotermsLookup',
			action: 'Look up an incoterm',
			description: 'INCOTERMS 2020 definition by 3-letter code',
			routing: { request: { method: 'GET', url: '/incoterms' } },
		},
		{
			name: 'UK Duty Calculator',
			value: 'dutyCalculator',
			action: 'Calculate UK import duty and VAT',
			description: 'UK duty + VAT for a commodity code using live GOV.UK Trade Tariff data',
			routing: {
				request: {
					method: 'POST',
					url: '/duty',
					body: {
						commodity_code: '={{$parameter.commodity_code}}',
						origin_country: '={{$parameter.origin_country}}',
						customs_value: '={{$parameter.customs_value}}',
					},
				},
			},
		},
	],
};

const customsTradeFields: INodeProperties[] = [
	{
		displayName: 'HS Code or Keyword',
		name: 'q',
		type: 'string',
		required: true,
		default: 'coffee',
		description: 'Enter a numeric HS code (e.g. 8517) or a keyword (e.g. telephones). Both patterns work.',
		displayOptions: { show: { resource: ['customsTrade'], operation: ['hsLookup'] } },
		routing: { send: { property: 'q', type: 'query' } },
	},
	{
		displayName: 'Incoterm Code',
		name: 'code',
		type: 'options',
		required: true,
		default: 'FOB',
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{ name: 'EXW — Ex Works', value: 'EXW' },
			{ name: 'FCA — Free Carrier', value: 'FCA' },
			{ name: 'CPT — Carriage Paid To', value: 'CPT' },
			{ name: 'CIP — Carriage and Insurance Paid To', value: 'CIP' },
			{ name: 'DAP — Delivered at Place', value: 'DAP' },
			{ name: 'DPU — Delivered at Place Unloaded', value: 'DPU' },
			{ name: 'DDP — Delivered Duty Paid', value: 'DDP' },
			{ name: 'FAS — Free Alongside Ship', value: 'FAS' },
			{ name: 'FOB — Free on Board', value: 'FOB' },
			{ name: 'CFR — Cost and Freight', value: 'CFR' },
			{ name: 'CIF — Cost, Insurance, Freight', value: 'CIF' },
		],
		displayOptions: { show: { resource: ['customsTrade'], operation: ['incotermsLookup'] } },
		routing: { send: { property: 'code', type: 'query' } },
	},
	{
		displayName: 'Commodity Code',
		name: 'commodity_code',
		type: 'string',
		required: true,
		default: '0901110000',
		description: '10-digit HS commodity code',
		displayOptions: { show: { resource: ['customsTrade'], operation: ['dutyCalculator'] } },
	},
	{
		displayName: 'Origin Country (ISO Alpha-2)',
		name: 'origin_country',
		type: 'string',
		required: true,
		default: 'BR',
		description: 'ISO 3166-1 alpha-2 country code, e.g. BR, CN, US',
		displayOptions: { show: { resource: ['customsTrade'], operation: ['dutyCalculator'] } },
	},
	{
		displayName: 'Customs Value (GBP)',
		name: 'customs_value',
		type: 'number',
		required: true,
		default: 5000,
		displayOptions: { show: { resource: ['customsTrade'], operation: ['dutyCalculator'] } },
	},
];

// ─── Reference Data operations (7) ───────────────────────────────

const referenceDataOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['referenceData'] } },
	default: 'airlineLookup',
	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
	options: [
		{
			name: 'Airline Lookup',
			value: 'airlineLookup',
			action: 'Look up an airline',
			description: 'Airline by 3-digit AWB prefix — 6,352 entries, 390 cargo carriers',
			routing: { request: { method: 'GET', url: '/airlines' } },
		},
		{
			name: 'UN/LOCODE Lookup',
			value: 'unlocodeLookup',
			action: 'Look up a UN LOCODE location',
			description: 'UNECE UN/LOCODE 2024-2 — 116,000+ transport locations',
			routing: { request: { method: 'GET', url: '/unlocode' } },
		},
		{
			name: 'ULD Lookup',
			value: 'uldLookup',
			action: 'Look up a unit load device',
			description: 'Air-cargo ULD by type code (AKE, PMC, PLA, etc.) — 15 types',
			routing: { request: { method: 'GET', url: '/uld' } },
		},
		{
			name: 'Container Lookup',
			value: 'containerLookup',
			action: 'Look up a sea freight container',
			description: 'Sea-freight container by slug — dimensions, capacity, weight limits',
			routing: { request: { method: 'GET', url: '/containers' } },
		},
		{
			name: 'Vehicle Lookup',
			value: 'vehicleLookup',
			action: 'Look up a road vehicle',
			description: 'Road vehicle / trailer type — 17 types including curtainsiders, rigids, vans',
			routing: { request: { method: 'GET', url: '/vehicles' } },
		},
		{
			name: 'Health Ping',
			value: 'healthPing',
			action: 'Ping the API',
			description: 'Lightweight health check — returns status, version, tool count',
			routing: { request: { method: 'GET', url: '/health' } },
		},
		{
			name: 'List Tools',
			value: 'toolsList',
			action: 'List all freight utils tools',
			description: 'Enumerate every tool exposed by the FreightUtils platform',
			routing: { request: { method: 'GET', url: '/tools' } },
		},
	],
};

const referenceDataFields: INodeProperties[] = [
	{
		displayName: 'AWB Prefix',
		name: 'prefix',
		type: 'string',
		required: true,
		default: '176',
		description: '3-digit IATA AWB prefix (numeric only, e.g. 176 for Emirates SkyCargo). An empty results array means no airline holds that prefix.',
		displayOptions: { show: { resource: ['referenceData'], operation: ['airlineLookup'] } },
		routing: { send: { property: 'prefix', type: 'query' } },
	},
	{
		displayName: 'Query',
		name: 'q',
		type: 'string',
		required: true,
		default: 'rotterdam',
		description: 'Location name, partial code, or country-subdivision',
		displayOptions: { show: { resource: ['referenceData'], operation: ['unlocodeLookup'] } },
		routing: { send: { property: 'q', type: 'query' } },
	},
	{
		displayName: 'ULD Type',
		name: 'uld_type',
		type: 'string',
		required: true,
		default: 'AKE',
		description: 'ULD type code, e.g. AKE (LD3), PMC, PLA',
		displayOptions: { show: { resource: ['referenceData'], operation: ['uldLookup'] } },
		routing: { send: { property: 'type', type: 'query' } },
	},
	{
		displayName: 'Container Type',
		name: 'container_type',
		type: 'string',
		required: true,
		default: '40ft-high-cube',
		description: 'Container slug, e.g. 20ft-standard, 40ft-standard, 40ft-high-cube',
		displayOptions: { show: { resource: ['referenceData'], operation: ['containerLookup'] } },
		routing: { send: { property: 'type', type: 'query' } },
	},
	{
		displayName: 'Category',
		name: 'vehicle_category',
		type: 'options',
		required: true,
		default: 'van',
		options: [
			{ name: 'Van', value: 'van' },
			{ name: 'Rigid', value: 'rigid' },
			{ name: 'Articulated', value: 'articulated' },
			{ name: 'Trailer', value: 'trailer' },
		],
		displayOptions: { show: { resource: ['referenceData'], operation: ['vehicleLookup'] } },
		routing: { send: { property: 'category', type: 'query' } },
	},
];

// ─── Node class ──────────────────────────────────────────────────

export class FreightUtils implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FreightUtils',
		name: 'freightUtils',
		icon: { light: 'file:../../icons/freightutils.svg', dark: 'file:../../icons/freightutils.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}} ({{$parameter["resource"]}})',
		description: 'Freight calculators, dangerous-goods lookup, HS codes, UK duty — via the free FreightUtils API',
		defaults: {
			name: 'FreightUtils',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'freightUtilsApi', required: true }],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			resourceOptions,
			freightOpsOperations,
			...dimensionFields,
			...ldmFields,
			...palletFields,
			...convertFields,
			...consignmentFields,
			dangerousGoodsOperations,
			...dangerousGoodsFields,
			customsTradeOperations,
			...customsTradeFields,
			referenceDataOperations,
			...referenceDataFields,
		],
	};
}
