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

export const enum CompletionConfigKeys {
	Enabled = 'sandtable.completion.enabled',
	Model = 'sandtable.completion.model',
	DebounceMs = 'sandtable.completion.debounceMs',
	MaxTokens = 'sandtable.completion.maxTokens',
	Temperature = 'sandtable.completion.temperature',
	ContextLines = 'sandtable.completion.contextLines',
}

export const enum ModelsConfigKeys {
	ShowInActivityBar = 'sandtable.models.showInActivityBar',
	GpuPollIntervalMs = 'sandtable.models.gpuPollIntervalMs',
}

export const enum AgentConfigKeys {
	Enabled = 'sandtable.agent.enabled',
	Model = 'sandtable.agent.model',
	ConfirmDestructive = 'sandtable.agent.confirmDestructive',
	MaxIterations = 'sandtable.agent.maxIterations',
	MaxTokens = 'sandtable.agent.maxTokens',
}

export const enum AppearanceConfigKeys {
	BackgroundImage = 'sandtable.appearance.backgroundImage',
	BackgroundOpacity = 'sandtable.appearance.backgroundOpacity',
	BackgroundOverlayColor = 'sandtable.appearance.backgroundOverlayColor',
	BackgroundBlur = 'sandtable.appearance.backgroundBlur',
	BackgroundSize = 'sandtable.appearance.backgroundSize',
	BackgroundPosition = 'sandtable.appearance.backgroundPosition',
	BackgroundCoverage = 'sandtable.appearance.backgroundCoverage',
}

// ─── Default Values ───────────────────────────────────────────────────────────

export const CORTEX_DEFAULT_ENDPOINT = 'http://localhost:8084';
export const CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS = 15000;
export const CHAT_DEFAULT_SYSTEM_PROMPT = 'You are a helpful coding assistant.';
export const CHAT_DEFAULT_MAX_TOKENS = 2048;
export const CHAT_DEFAULT_TEMPERATURE = 0.7;

export const COMPLETION_DEFAULT_DEBOUNCE_MS = 350;
export const COMPLETION_DEFAULT_MAX_TOKENS = 128;
export const COMPLETION_DEFAULT_TEMPERATURE = 0.2;
export const COMPLETION_DEFAULT_CONTEXT_LINES = 50;

export const MODELS_DEFAULT_GPU_POLL_INTERVAL_MS = 5000;

export const AGENT_DEFAULT_MAX_ITERATIONS = 25;
export const AGENT_DEFAULT_MAX_TOKENS = 4096;

export const APPEARANCE_DEFAULT_BACKGROUND_OPACITY = 0.08;
export const APPEARANCE_DEFAULT_BACKGROUND_BLUR = 0;
export const APPEARANCE_DEFAULT_BACKGROUND_SIZE = 'cover';
export const APPEARANCE_DEFAULT_BACKGROUND_POSITION = 'center';
export const APPEARANCE_DEFAULT_BACKGROUND_COVERAGE = 'full';

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

		// ─── Inline Code Completion Settings ──────────────────────────────
		[CompletionConfigKeys.Enabled]: {
			type: 'boolean',
			default: true,
			description: nls.localize('sandtable.completion.enabled', "Enable inline code completion (ghost text suggestions while typing)."),
		},
		[CompletionConfigKeys.Model]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.completion.model', "Model to use for code completions (empty = auto-detect first running FIM-capable model)."),
		},
		[CompletionConfigKeys.DebounceMs]: {
			type: 'number',
			default: COMPLETION_DEFAULT_DEBOUNCE_MS,
			minimum: 50,
			maximum: 2000,
			description: nls.localize('sandtable.completion.debounceMs', "Delay in milliseconds after typing stops before requesting a completion."),
		},
		[CompletionConfigKeys.MaxTokens]: {
			type: 'number',
			default: COMPLETION_DEFAULT_MAX_TOKENS,
			minimum: 1,
			maximum: 1024,
			description: nls.localize('sandtable.completion.maxTokens', "Maximum tokens to generate per inline completion."),
		},
		[CompletionConfigKeys.Temperature]: {
			type: 'number',
			default: COMPLETION_DEFAULT_TEMPERATURE,
			minimum: 0.0,
			maximum: 1.0,
			description: nls.localize('sandtable.completion.temperature', "Temperature for code completions (lower = more deterministic)."),
		},
		[CompletionConfigKeys.ContextLines]: {
			type: 'number',
			default: COMPLETION_DEFAULT_CONTEXT_LINES,
			minimum: 5,
			maximum: 200,
			description: nls.localize('sandtable.completion.contextLines', "Number of lines of prefix context to include when building FIM prompts."),
		},

		// ─── Model Manager Settings ──────────────────────────────────────
		[ModelsConfigKeys.ShowInActivityBar]: {
			type: 'boolean',
			default: true,
			description: nls.localize('sandtable.models.showInActivityBar', "Show the Model Manager panel in the Activity Bar."),
		},
		[ModelsConfigKeys.GpuPollIntervalMs]: {
			type: 'number',
			default: MODELS_DEFAULT_GPU_POLL_INTERVAL_MS,
			minimum: 2000,
			maximum: 60000,
			description: nls.localize('sandtable.models.gpuPollIntervalMs', "How often to poll GPU and system metrics when the Model Manager is visible (in milliseconds)."),
		},

		// ─── Agent Settings ─────────────────────────────────────────────
		[AgentConfigKeys.Enabled]: {
			type: 'boolean',
			default: true,
			description: nls.localize('sandtable.agent.enabled', "Enable the autonomous coding agent that can read, write, and modify code using tool calls."),
		},
		[AgentConfigKeys.Model]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.agent.model', "Model to use for the agent (must support tool calling). Leave empty to auto-detect a suitable running model."),
		},
		[AgentConfigKeys.ConfirmDestructive]: {
			type: 'boolean',
			default: true,
			description: nls.localize('sandtable.agent.confirmDestructive', "Require user approval before the agent executes destructive operations (edit_file, create_file, run_command)."),
		},
		[AgentConfigKeys.MaxIterations]: {
			type: 'number',
			default: AGENT_DEFAULT_MAX_ITERATIONS,
			minimum: 1,
			maximum: 100,
			description: nls.localize('sandtable.agent.maxIterations', "Maximum number of tool-call iterations the agent can perform per task before stopping."),
		},
		[AgentConfigKeys.MaxTokens]: {
			type: 'number',
			default: AGENT_DEFAULT_MAX_TOKENS,
			minimum: 256,
			maximum: 32768,
			description: nls.localize('sandtable.agent.maxTokens', "Maximum tokens per agent response."),
		},

		// ─── Appearance Settings ─────────────────────────────────────────
		[AppearanceConfigKeys.BackgroundImage]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.appearance.backgroundImage', "Background image for the editor area. Use a file path or a bundled image name (e.g., bundled:topo-lines). Leave empty for no background image."),
		},
		[AppearanceConfigKeys.BackgroundOpacity]: {
			type: 'number',
			default: APPEARANCE_DEFAULT_BACKGROUND_OPACITY,
			minimum: 0.0,
			maximum: 1.0,
			description: nls.localize('sandtable.appearance.backgroundOpacity', "Opacity of the background image (0.0 = invisible, 1.0 = fully visible). Low values like 0.05-0.15 create a subtle watermark effect."),
		},
		[AppearanceConfigKeys.BackgroundOverlayColor]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.appearance.backgroundOverlayColor', "Semi-transparent color overlay between the image and text (e.g., rgba(0,0,0,0.85)). Leave empty to auto-derive from your current theme."),
		},
		[AppearanceConfigKeys.BackgroundBlur]: {
			type: 'number',
			default: APPEARANCE_DEFAULT_BACKGROUND_BLUR,
			minimum: 0,
			maximum: 20,
			description: nls.localize('sandtable.appearance.backgroundBlur', "Blur in pixels applied to the background image. Softens busy images into gentle textures."),
		},
		[AppearanceConfigKeys.BackgroundSize]: {
			type: 'string',
			default: APPEARANCE_DEFAULT_BACKGROUND_SIZE,
			enum: ['cover', 'contain', 'auto'],
			enumDescriptions: [
				nls.localize('sandtable.appearance.backgroundSize.cover', "Scale the image to cover the entire editor area (may crop edges)."),
				nls.localize('sandtable.appearance.backgroundSize.contain', "Scale the image to fit entirely within the editor area (may leave gaps)."),
				nls.localize('sandtable.appearance.backgroundSize.auto', "Use the image's natural size."),
			],
			description: nls.localize('sandtable.appearance.backgroundSize', "How the background image is sized within the editor area."),
		},
		[AppearanceConfigKeys.BackgroundPosition]: {
			type: 'string',
			default: APPEARANCE_DEFAULT_BACKGROUND_POSITION,
			description: nls.localize('sandtable.appearance.backgroundPosition', "CSS background-position value (e.g., center, top left, 50% 50%)."),
		},
		[AppearanceConfigKeys.BackgroundCoverage]: {
			type: 'string',
			default: APPEARANCE_DEFAULT_BACKGROUND_COVERAGE,
			enum: ['content', 'content-and-gutter', 'full'],
			enumDescriptions: [
				nls.localize('sandtable.appearance.backgroundCoverage.content', "Image appears behind code content only."),
				nls.localize('sandtable.appearance.backgroundCoverage.contentAndGutter', "Image extends behind code content and line numbers."),
				nls.localize('sandtable.appearance.backgroundCoverage.full', "Image extends behind code, line numbers, and minimap."),
			],
			description: nls.localize('sandtable.appearance.backgroundCoverage', "How much of the editor area the background image covers."),
		},
	}
});
