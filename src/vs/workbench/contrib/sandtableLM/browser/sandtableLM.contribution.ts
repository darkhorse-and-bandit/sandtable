/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { AsyncIterableSource } from '../../../../base/common/async.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import {
	ILanguageModelsService,
	ILanguageModelChatProvider,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatInfoOptions,
	ILanguageModelChatResponse,
	IChatMessage,
	ChatMessageRole,
	ILanguageModelChatMetadata,
	IChatResponsePart,
} from '../../chat/common/languageModels.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ICortexService, ICortexStreamChunk, ICortexMessage } from '../../../../platform/cortex/common/cortex.js';
import { IProviderRegistryService } from '../../../../platform/cortex/common/providerRegistry.js';
import { IUnifiedModel } from '../../../../platform/cortex/common/cortexProviderTypes.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SANDTABLE_VENDOR = 'cortex';
const SANDTABLE_VENDOR_DISPLAY_NAME = 'Sandtable';
const SANDTABLE_EXTENSION_ID = new ExtensionIdentifier('sandtable.cortex');

// ─── Message Format Conversion ────────────────────────────────────────────────

function chatMessageRoleToString(role: ChatMessageRole): 'system' | 'user' | 'assistant' | 'tool' {
	switch (role) {
		case ChatMessageRole.System: return 'system';
		case ChatMessageRole.User: return 'user';
		case ChatMessageRole.Assistant: return 'assistant';
		default: return 'user';
	}
}

/**
 * Convert VS Code chat messages to Cortex message format.
 * Handles multipart messages by concatenating text parts.
 */
function convertMessages(messages: IChatMessage[]): ICortexMessage[] {
	return messages.map(msg => {
		let content = '';
		let tool_call_id: string | undefined;
		const tool_calls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];

		for (const part of msg.content) {
			switch (part.type) {
				case 'text':
					content += part.value;
					break;
				case 'tool_use':
					tool_calls.push({
						id: part.toolCallId,
						type: 'function',
						function: {
							name: part.name,
							arguments: typeof part.parameters === 'string' ? part.parameters : JSON.stringify(part.parameters),
						}
					});
					break;
				case 'tool_result':
					tool_call_id = part.toolCallId;
					for (const sub of part.value) {
						if (sub.type === 'text') {
							content += sub.value;
						}
					}
					break;
				case 'thinking':
					// Skip thinking parts -- not sent to LLM backend
					break;
			}
		}

		const cortexMsg: ICortexMessage = {
			role: tool_call_id ? 'tool' : chatMessageRoleToString(msg.role),
			content,
		};

		if (tool_calls.length > 0) {
			cortexMsg.tool_calls = tool_calls;
		}
		if (tool_call_id) {
			cortexMsg.tool_call_id = tool_call_id;
		}

		return cortexMsg;
	});
}

// ─── Language Model Provider ──────────────────────────────────────────────────

/**
 * Sandtable Language Model Provider.
 *
 * Bridges ALL configured providers (Cortex, OpenAI-compatible, etc.) to VS Code's
 * `ILanguageModelsService`, making models from all providers available in the
 * built-in Chat panel's model picker and inference pipeline.
 *
 * Uses `IProviderRegistryService` to discover models from all active providers,
 * not just Cortex. Model IDs use the provider-qualified format: "providerId::modelName".
 */
class SandtableLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly cortexService: ICortexService,
		private readonly providerRegistry: IProviderRegistryService,
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) {
		super();

		// Refresh model list when connection status changes
		this._register(this.cortexService.onConnectionStatusChanged(() => {
			this.logService.debug('[Sandtable LM] Connection status changed, refreshing models');
			this._onDidChange.fire();
		}));

		// Refresh model list when providers change
		this._register(this.providerRegistry.onProvidersChanged(() => {
			this.logService.debug('[Sandtable LM] Providers changed, refreshing models');
			this._onDidChange.fire();
		}));

		// Refresh when model list changes in the registry
		this._register(this.providerRegistry.onModelsChanged(() => {
			this.logService.debug('[Sandtable LM] Models changed in registry, refreshing');
			this._onDidChange.fire();
		}));

		// Refresh when curated model list changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('sandtable.models.curated')) {
				this.logService.debug('[Sandtable LM] Curated model list changed, refreshing');
				this._onDidChange.fire();
			}
		}));
	}

	async provideLanguageModelChatInfo(
		_options: ILanguageModelChatInfoOptions,
		_token: CancellationToken
	): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		try {
			// Query ALL models from ALL providers via the registry
			let allModels: IUnifiedModel[];
			try {
				allModels = await this.providerRegistry.listAllModels();
			} catch (e) {
				this.logService.warn('[Sandtable LM] Failed to query provider registry, falling back to Cortex:', e);
				// Fallback: try direct Cortex query
				try {
					const cortexModels = await this.cortexService.listRunningModels();
					allModels = cortexModels.map(m => ({
						modelName: m.served_model_name,
						qualifiedName: `cortex::${m.served_model_name}`,
						providerId: 'cortex',
						providerName: 'Cortex',
						providerType: 'cortex' as const,
						state: m.state === 'running' ? 'running' as const : 'available' as const,
						capabilities: { chat: true, completion: true, fim: false, toolCalling: false, streaming: true, systemPrompt: true },
						engineType: m.engine_type || 'cortex',
					}));
				} catch {
					allModels = [];
				}
			}

			this.logService.debug(`[Sandtable LM] Found ${allModels.length} total models from all providers`);

			// Filter to only running/available models
			const availableModels = allModels.filter(m => m.state === 'running' || m.state === 'available');

			// Apply curated model filter (if configured)
			const curatedList = this.configurationService.getValue<Array<{ qualifiedName: string; enabled: boolean }>>('sandtable.models.curated');
			let modelsToExpose: IUnifiedModel[];

			if (curatedList && curatedList.length > 0) {
				// Only expose models that are in the curated list and enabled
				const enabledNames = new Set(
					curatedList.filter(c => c.enabled !== false).map(c => c.qualifiedName)
				);
				modelsToExpose = availableModels.filter(m => enabledNames.has(m.qualifiedName));
				this.logService.debug(`[Sandtable LM] Filtered to ${modelsToExpose.length} curated models`);
			} else {
				// No curation: expose all available models
				modelsToExpose = availableModels;
			}

			const results: ILanguageModelChatMetadataAndIdentifier[] = [];
			let isFirst = true;

			for (const model of modelsToExpose) {
				const modelId = model.qualifiedName; // e.g., "openai::gpt-4o" or "cortex::deepseek-v3"

				const metadata: ILanguageModelChatMetadata = {
					extension: SANDTABLE_EXTENSION_ID,
					name: model.modelName,
					id: modelId,
					vendor: SANDTABLE_VENDOR,
					version: '1.0.0',
					family: model.engineType || model.providerType,
					maxInputTokens: 128000, // Default; could be refined with constraints query
					maxOutputTokens: 4096,
					isDefaultForLocation: isFirst ? { [ChatAgentLocation.Chat]: true } : {},
					isUserSelectable: true,
					tooltip: `${model.providerName} — ${model.modelName}`,
					modelPickerCategory: { label: model.providerName, order: model.providerType === 'cortex' ? 0 : 1 },
					capabilities: {
						toolCalling: model.capabilities?.toolCalling ?? false,
						agentMode: model.capabilities?.toolCalling ?? false,
					},
				};

				results.push({ metadata, identifier: modelId });
				isFirst = false;
			}

			this.logService.debug(`[Sandtable LM] Exposing ${results.length} models to VS Code chat panel`);
			return results;
		} catch (e) {
			this.logService.error('[Sandtable LM] Error listing models:', e);
			return [];
		}
	}

	async sendChatRequest(
		modelId: string,
		messages: IChatMessage[],
		_from: ExtensionIdentifier,
		options: { [name: string]: unknown },
		token: CancellationToken
	): Promise<ILanguageModelChatResponse> {
		// The modelId is provider-qualified (e.g., "openai::gpt-4o" or "cortex::deepseek-v3")
		// The CortexService handles routing to the correct provider via the registry
		const cortexModelName = modelId;
		const hasTools = Array.isArray(options['tools']) && options['tools'].length > 0;

		this.logService.debug(`[Sandtable LM] Sending chat request to model: ${cortexModelName} (tools: ${hasTools})`);

		// Convert VS Code chat messages to Cortex format
		const cortexMessages = convertMessages(messages);

		// Build the Cortex request
		const cortexRequest = {
			model: cortexModelName,
			messages: cortexMessages,
			temperature: typeof options['temperature'] === 'number' ? options['temperature'] : undefined,
			max_tokens: typeof options['max_tokens'] === 'number' ? options['max_tokens'] : undefined,
			stream: !hasTools, // Use non-streaming when tools are present (tool_calls are complex to parse from SSE)
			tools: options['tools'] as any[] | undefined,
		};

		// Create an async iterable for streaming
		const source = new AsyncIterableSource<IChatResponsePart>();

		const resultPromise = (async () => {
			try {
				if (hasTools) {
					// Non-streaming path: tool calls come as complete objects in the response
					const response = await this.cortexService.chatCompletion(cortexRequest);
					const choice = response.choices?.[0];

					if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
						// Emit tool_use parts for each tool call
						for (const toolCall of choice.message.tool_calls) {
							let parsedArgs: unknown;
							try {
								parsedArgs = JSON.parse(toolCall.function.arguments);
							} catch {
								parsedArgs = toolCall.function.arguments;
							}

							this.logService.debug(`[Sandtable LM] Tool call: ${toolCall.function.name}(${toolCall.function.arguments})`);
							source.emitOne({
								type: 'tool_use',
								name: toolCall.function.name,
								toolCallId: toolCall.id,
								parameters: parsedArgs,
							});
						}
					}

					// Also emit any text content alongside tool calls
					if (choice?.message?.content) {
						source.emitOne({ type: 'text', value: choice.message.content });
					}

					source.resolve();
					return { totalTokens: response.usage?.completion_tokens ?? 0 };
				} else {
					// Streaming path: text-only responses stream token by token
					const result = await this.cortexService.chatCompletionStream(
						cortexRequest,
						(chunk: ICortexStreamChunk) => {
							if (token.isCancellationRequested) {
								return;
							}
							if (chunk.content) {
								source.emitOne({ type: 'text', value: chunk.content });
							}
						},
						token
					);
					source.resolve();
					return result;
				}
			} catch (e) {
				if (!token.isCancellationRequested) {
					this.logService.error('[Sandtable LM] Chat request error:', e);
				}
				source.reject(e instanceof Error ? e : new Error(String(e)));
				throw e;
			}
		})();

		return {
			stream: source.asyncIterable,
			result: resultPromise,
		};
	}

	async provideTokenCount(
		_modelId: string,
		message: string | IChatMessage,
		_token: CancellationToken
	): Promise<number> {
		// Simple heuristic: ~4 characters per token (good enough for estimation)
		const text = typeof message === 'string'
			? message
			: message.content.map(p => p.type === 'text' ? p.value : '').join('');
		return Math.ceil(text.length / 4);
	}
}

// ─── Workbench Contribution ───────────────────────────────────────────────────

/**
 * Registers Sandtable as a language model vendor and provider with VS Code's
 * built-in chat infrastructure. Queries the ProviderRegistryService for models
 * from ALL configured providers (Cortex, OpenAI-compatible, etc.) and exposes
 * them in the Chat panel's model picker.
 */
class SandtableLMContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableLM';

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ICortexService private readonly cortexService: ICortexService,
		@IProviderRegistryService private readonly providerRegistry: IProviderRegistryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.logService.info('[Sandtable LM] Initializing language model provider for all configured providers');

		// Step 1: Register the vendor descriptor so the service knows about "cortex"
		this.languageModelsService.deltaLanguageModelChatProviderDescriptors(
			[{ vendor: SANDTABLE_VENDOR, displayName: SANDTABLE_VENDOR_DISPLAY_NAME, configuration: undefined, managementCommand: undefined, when: undefined }],
			[]
		);

		// Step 2: Register the actual provider implementation
		const provider = this._register(new SandtableLanguageModelProvider(
			this.cortexService,
			this.providerRegistry,
			this.configurationService,
			this.logService,
		));
		this._register(this.languageModelsService.registerLanguageModelProvider(SANDTABLE_VENDOR, provider));

		this.logService.info('[Sandtable LM] Language model provider registered (queries all providers)');
	}
}

registerWorkbenchContribution2(
	SandtableLMContribution.ID,
	SandtableLMContribution,
	WorkbenchPhase.AfterRestored
);
