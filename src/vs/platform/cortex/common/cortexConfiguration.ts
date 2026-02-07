/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import * as nls from '../../../nls.js';

// ─── Setting Keys ─────────────────────────────────────────────────────────────

export const enum CortexConfigKeys {
	Endpoint = 'sandtable.cortex.endpoint',
	ApiKey = 'sandtable.cortex.apiKey',
	Username = 'sandtable.cortex.username',
	Password = 'sandtable.cortex.password',
	HealthCheckIntervalMs = 'sandtable.cortex.healthCheckIntervalMs',
}

export const enum ChatConfigKeys {
	DefaultModel = 'sandtable.chat.defaultModel',
	StreamingEnabled = 'sandtable.chat.streamingEnabled',
	SystemPrompt = 'sandtable.chat.systemPrompt',
	MaxTokens = 'sandtable.chat.maxTokens',
	Temperature = 'sandtable.chat.temperature',
}

// ─── Default Values ───────────────────────────────────────────────────────────

export const CORTEX_DEFAULT_ENDPOINT = 'http://localhost:8084';
export const CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS = 15000;
export const CHAT_DEFAULT_SYSTEM_PROMPT = 'You are a helpful coding assistant.';
export const CHAT_DEFAULT_MAX_TOKENS = 2048;
export const CHAT_DEFAULT_TEMPERATURE = 0.7;

// ─── Configuration Registration ───────────────────────────────────────────────

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'sandtable',
	order: 110,
	title: nls.localize('sandtableConfigurationTitle', "Sandtable"),
	type: 'object',
	properties: {
		[CortexConfigKeys.Endpoint]: {
			type: 'string',
			default: CORTEX_DEFAULT_ENDPOINT,
			description: nls.localize('sandtable.cortex.endpoint', "URL of the Cortex gateway (e.g., http://192.168.1.100:8084)."),
		},
		[CortexConfigKeys.ApiKey]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.cortex.apiKey', "API key for authenticating with Cortex inference endpoints."),
		},
		[CortexConfigKeys.Username]: {
			type: 'string',
			default: 'admin',
			description: nls.localize('sandtable.cortex.username', "Username for Cortex admin session authentication."),
		},
		[CortexConfigKeys.Password]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.cortex.password', "Password for Cortex admin session authentication."),
		},
		[CortexConfigKeys.HealthCheckIntervalMs]: {
			type: 'number',
			default: CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS,
			minimum: 5000,
			maximum: 300000,
			description: nls.localize('sandtable.cortex.healthCheckIntervalMs', "How often to poll Cortex health status (in milliseconds)."),
		},
		[ChatConfigKeys.DefaultModel]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.chat.defaultModel', "Default model for chat (empty = auto-detect first running model)."),
		},
		[ChatConfigKeys.StreamingEnabled]: {
			type: 'boolean',
			default: true,
			description: nls.localize('sandtable.chat.streamingEnabled', "Enable streaming responses in chat."),
		},
		[ChatConfigKeys.SystemPrompt]: {
			type: 'string',
			default: CHAT_DEFAULT_SYSTEM_PROMPT,
			description: nls.localize('sandtable.chat.systemPrompt', "System prompt sent with every chat request."),
		},
		[ChatConfigKeys.MaxTokens]: {
			type: 'number',
			default: CHAT_DEFAULT_MAX_TOKENS,
			minimum: 1,
			maximum: 32768,
			description: nls.localize('sandtable.chat.maxTokens', "Maximum tokens in chat responses."),
		},
		[ChatConfigKeys.Temperature]: {
			type: 'number',
			default: CHAT_DEFAULT_TEMPERATURE,
			minimum: 0.0,
			maximum: 2.0,
			description: nls.localize('sandtable.chat.temperature', "Temperature for chat responses (0.0 = deterministic, 1.0 = creative)."),
		},
	}
});
