/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ILogService } from '../../log/common/log.js';
import { OpenAICompatibleClient } from '../common/openAICompatibleClient.js';
import { ILLMProvider } from '../common/llmProvider.js';
import { IProviderConfig, IUnifiedModel, IProviderHealthResult, IModelCapabilities, IModelParameterOverrides } from '../common/cortexProviderTypes.js';
import { formatModelReference } from '../common/modelResolver.js';
import {
	ICortexChatRequest, ICortexChatResponse,
	ICortexStreamChunk, ICortexStreamResult,
} from '../common/cortex.js';

// ─── OpenAICompatibleProvider ─────────────────────────────────────────────────

/**
 * ILLMProvider implementation for any OpenAI-compatible endpoint.
 * Provides inference-only access (chat completions + model listing).
 * Does not support admin APIs, GPU monitoring, FIM, or chat sessions.
 *
 * Covers: Ollama, vLLM direct, LM Studio, cloud APIs (DeepSeek, Together, Groq, etc.)
 */
export class OpenAICompatibleProvider extends Disposable implements ILLMProvider {

	readonly type = 'openai-compatible' as const;
	readonly supportsTextCompletion = false;
	readonly supportsFimCompletion = false;

	private readonly _client: OpenAICompatibleClient;
	private readonly _config: IProviderConfig;
	private _isConnected = false;
	private _cachedModels: IUnifiedModel[] = [];

	private readonly _onConnectionChanged = this._register(new Emitter<boolean>());
	readonly onConnectionChanged: Event<boolean> = this._onConnectionChanged.event;

	constructor(
		config: IProviderConfig,
		private readonly logService: ILogService,
	) {
		super();
		this._config = config;
		this._client = new OpenAICompatibleClient(config.endpoint, config.apiKey);
		this.logService.info(`[OpenAICompatibleProvider] Initialized provider "${config.displayName}" at ${config.endpoint}`);
	}

	// ─── Identity ─────────────────────────────────────────────────────────

	get id(): string { return this._config.id; }
	get displayName(): string { return this._config.displayName; }
	get isConnected(): boolean { return this._isConnected; }
	get config(): IProviderConfig { return this._config; }

	// ─── Health ───────────────────────────────────────────────────────────

	async checkHealth(): Promise<IProviderHealthResult> {
		const result = await this._client.checkHealth(this.id, this.displayName);
		const wasConnected = this._isConnected;
		this._isConnected = result.healthy;
		if (wasConnected !== this._isConnected) {
			this._onConnectionChanged.fire(this._isConnected);
		}
		return result;
	}

	// ─── Model Discovery ──────────────────────────────────────────────────

	async listModels(): Promise<IUnifiedModel[]> {
		try {
			const rawModels = await this._client.listModels();
			this._cachedModels = rawModels.map(m => ({
				modelName: m.id,
				qualifiedName: formatModelReference(this.id, m.id),
				providerId: this.id,
				providerName: this.displayName,
				providerType: this.type,
				state: 'available' as const,
				capabilities: this._getDefaultCapabilities(),
				engineType: 'external',
			}));
			return this._cachedModels;
		} catch (err) {
			this.logService.warn(`[OpenAICompatibleProvider] Failed to list models for "${this.displayName}": ${err}`);
			return this._cachedModels; // Return last known good list
		}
	}

	async getModelCapabilities(_modelName: string): Promise<IModelCapabilities> {
		// OpenAI-compatible providers don't have a capabilities endpoint.
		// Return sensible defaults -- consumers can refine based on model behavior.
		return this._getDefaultCapabilities();
	}

	private _getDefaultCapabilities(): IModelCapabilities {
		return {
			chat: true,
			completion: false,
			fim: false,
			toolCalling: false,
			streaming: true,
			systemPrompt: true,
		};
	}

	// ─── Chat Inference ───────────────────────────────────────────────────

	async chatCompletion(request: ICortexChatRequest): Promise<ICortexChatResponse> {
		const overrides = this._resolveModelOverrides(request.model);
		return this._client.chatCompletion(request, overrides);
	}

	async chatCompletionStream(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const overrides = this._resolveModelOverrides(request.model);
		const abortController = new AbortController();
		let disposable: { dispose(): void } | undefined;
		if (cancellation) {
			disposable = cancellation.onCancellationRequested(() => abortController.abort());
		}
		try {
			return await this._client.streamChatCompletion(request, onToken, abortController.signal, overrides);
		} finally {
			disposable?.dispose();
		}
	}

	// ─── Model Override Resolution ────────────────────────────────────────

	/**
	 * Resolves parameter overrides for a specific model name by matching
	 * against the provider's modelOverrides config.
	 *
	 * Supports exact match and simple glob patterns (trailing * wildcard).
	 * For example, "gpt-5*" matches "gpt-5", "gpt-5-mini", "gpt-5-nano".
	 */
	private _resolveModelOverrides(modelName: string): IModelParameterOverrides | undefined {
		const overridesMap = this._config.modelOverrides;
		if (!overridesMap) {
			return undefined;
		}

		// Try exact match first
		if (overridesMap[modelName]) {
			return overridesMap[modelName];
		}

		// Try glob patterns (trailing * wildcard)
		for (const [pattern, overrides] of Object.entries(overridesMap)) {
			if (pattern.endsWith('*')) {
				const prefix = pattern.slice(0, -1);
				if (modelName.startsWith(prefix)) {
					return overrides;
				}
			}
		}

		return undefined;
	}
}
