import { config } from '@n8n/node-cli/eslint';

export default [
	...config,
	{
		// FreightUtils.node.ts uses SI unit symbols (cm, kg, L) per ISO 80000
		// in displayNames — n8n-nodes-base's node-param-display-name-miscased
		// rule wants Title Case, which would force incorrect symbol case
		// (Cm, Kg). The rule has no config schema (eslint-plugin-n8n-nodes-base
		// `node-param-display-name-miscased.js` declares `schema: []`), so we
		// disable it at file scope rather than scattering per-line directives.
		// Same logic for the action-miscased rule on "Calculate a multi-item
		// consignment" compound-modifier hyphen.
		files: ['nodes/FreightUtils/FreightUtils.node.ts'],
		rules: {
			'n8n-nodes-base/node-param-display-name-miscased': 'off',
			'n8n-nodes-base/node-param-operation-option-action-miscased': 'off',
		},
	},
];
