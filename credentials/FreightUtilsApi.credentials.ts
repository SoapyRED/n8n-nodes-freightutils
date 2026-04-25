import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FreightUtilsApi implements ICredentialType {
	name = 'freightUtilsApi';

	displayName = 'FreightUtils API';

	icon: Icon = { light: 'file:../icons/freightutils.svg', dark: 'file:../icons/freightutils.dark.svg' };

	documentationUrl = 'https://www.freightutils.com/api-docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Generate a free key (100 req/day) at https://www.freightutils.com/api-docs. Pro tier (50,000 req/month, £19) available on request.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://www.freightutils.com/api',
			description:
				'Override the API base URL. Leave as default unless pointing at a preview deployment.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/auth/whoami',
			method: 'GET',
		},
	};
}
