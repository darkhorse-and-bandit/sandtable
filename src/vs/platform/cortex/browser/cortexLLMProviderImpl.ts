/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ILogService } from '../../log/common/log.js';
import { CortexClient } from '../common/cortexClient.js';
import { ICortexLLMProvider } from '../common/cortexLLMProvider.js';
import { IProviderConfig, IUnifiedModel, IProviderHealthResult, IModelCapabilities } from '../common/cortexProviderTypes.js';
import { formatModelReference } from '../common/modelResolver.js';
import {
	ICortexChatRequest, ICortexChatResponse,
	ICortexCompletionRequest, ICortexCompletionResponse,
	ICortexFimRequest,
	ICortexStreamChunk, ICortexStreamResult,
	ICortexModelConstraints,
	ICortexModelDetail, ICortexDryRunResult,
	ICortexGPUMetric, ICortexSystemSummary, ICortexThroughput,
	ICortexIDEStatus,
	ICortexChatSession, ICortexChatSessionDetail,
	ICortexCreateSessionRequest, ICortexSessionMessage,
} from '../common/cortex.js';

// ─── CortexLLMProvider ────────────────────────────────────────────────────────

/**
 * ILLMProvider implementation for Cortex, the primary provider.
 * Wraps the existing CortexClient and adds admin session management.
 * This is the only provider that supports admin APIs, GPU monitoring,
 * model lifecycle, FIM completion, and chat sessions.
 */
export class CortexLLMProvider extends Disposable implements ICortexLLMProvider {

	readonly isCortex = true as const;
	readonly type = 'cortex' as const;
	readonly supportsTextCompletion = true;
	readonly supportsFimCompletion = true;

	private readonly _client: CortexClient;
	private readonly _config: IProviderConfig;
	private _isConnected = false;
	private _adminSessionPromise: Promise<boolean> | undefined;

	private readonly _onConnectionChanged = this._register(new Emitter<boolean>());
	readonly onConnectionChanged: Event<boolean> = this._onConnectionChanged.event;

	constructor(
		config: IProviderConfig,
		private readonly logService: ILogService,
	) {
		super();
		this._config = config;
		this._client = new CortexClient(config.endpoint, config.apiKey);
		this.logService.info(`[CortexLLMProvider] Initialized provider "${config.displayName}" at ${config.endpoint}`);
	}

	// ─── Identity ─────────────────────────────────────────────────────────

	get id(): string { return this._config.id; }
	get displayName(): string { return this._config.displayName; }
	get isConnected(): boolean { return this._isConnected; }
	get config(): IProviderConfig { return this._config; }

	// ─── Health ───────────────────────────────────────────────────────────

	async checkHealth(): Promise<IProviderHealthResult> {
		const startTime = Date.now();
		try {
			// Cortex requires session auth for model endpoints -- ensure login first
			await this._ensureAdminSession();
			const health = await this._client.checkHealth();
			const latencyMs = Date.now() - startTime;
			const wasConnected = this._isConnected;
			this._isConnected = health.healthy;
			if (wasConnected !== this._isConnected) {
				this._onConnectionChanged.fire(this._isConnected);
			}
			return {
				providerId: this.id,
				providerName: this.displayName,
				healthy: health.healthy,
				modelCount: health.modelCount,
				latencyMs,
			};
		} catch (err) {
			const latencyMs = Date.now() - startTime;
			if (this._isConnected) {
				this._isConnected = false;
				this._onConnectionChanged.fire(false);
			}
			return {
				providerId: this.id,
				providerName: this.displayName,
				healthy: false,
				modelCount: 0,
				latencyMs,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	// ─── Model Discovery ──────────────────────────────────────────────────

	async listModels(): Promise<IUnifiedModel[]> {
		try {
			await this._ensureAdminSession();
			const models = await this._client.listRunningModels();
			return models.map(m => ({
				modelName: m.served_model_name,
				qualifiedName: formatModelReference(this.id, m.served_model_name),
				providerId: this.id,
				providerName: this.displayName,
				providerType: this.type,
				state: m.state === 'running' ? 'running' as const : m.state as IUnifiedModel['state'],
				capabilities: {
					chat: true,
					completion: true,
					fim: true,
					toolCalling: false, // Refined per-model via getModelConstraints
					streaming: true,
					systemPrompt: true,
				},
				engineType: m.engine_type,
				task: m.task,
			}));
		} catch (err) {
			this.logService.warn(`[CortexLLMProvider] Failed to list models for "${this.displayName}": ${err}`);
			return [];
		}
	}

	async getModelCapabilities(modelName: string): Promise<IModelCapabilities> {
		try {
			await this._ensureAdminSession();
			const constraints = await this._client.getModelConstraints(modelName);
			return {
				chat: true,
				completion: true,
				fim: true,
				toolCalling: constraints.supports_tool_calling ?? false,
				streaming: constraints.supports_streaming,
				systemPrompt: constraints.supports_system_prompt,
			};
		} catch {
			// Fallback defaults
			return {
				chat: true,
				completion: true,
				fim: true,
				toolCalling: false,
				streaming: true,
				systemPrompt: true,
			};
		}
	}

	// ─── Chat Inference ───────────────────────────────────────────────────

	async chatCompletion(request: ICortexChatRequest): Promise<ICortexChatResponse> {
		return this._client.chatCompletion(request);
	}

	async chatCompletionStream(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const abortController = new AbortController();
		let disposable: { dispose(): void } | undefined;
		if (cancellation) {
			disposable = cancellation.onCancellationRequested(() => abortController.abort());
		}
		try {
			return await this._client.streamChatCompletion(request, onToken, abortController.signal);
		} finally {
			disposable?.dispose();
		}
	}

	// ─── Text Completion ──────────────────────────────────────────────────

	async textCompletion(request: ICortexCompletionRequest): Promise<ICortexCompletionResponse> {
		return this._client.textCompletion(request);
	}

	async textCompletionStream(
		request: ICortexCompletionRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const abortController = new AbortController();
		let disposable: { dispose(): void } | undefined;
		if (cancellation) {
			disposable = cancellation.onCancellationRequested(() => abortController.abort());
		}
		try {
			return await this._client.streamTextCompletion(request, onToken, abortController.signal);
		} finally {
			disposable?.dispose();
		}
	}

	// ─── FIM Completion ───────────────────────────────────────────────────

	async fimCompletion(request: ICortexFimRequest): Promise<ICortexCompletionResponse> {
		return this._client.fimCompletion(request);
	}

	async fimCompletionStream(
		request: ICortexFimRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const abortController = new AbortController();
		let disposable: { dispose(): void } | undefined;
		if (cancellation) {
			disposable = cancellation.onCancellationRequested(() => abortController.abort());
		}
		try {
			return await this._client.streamFimCompletion(request, onToken, abortController.signal);
		} finally {
			disposable?.dispose();
		}
	}

	// ─── Model Constraints ────────────────────────────────────────────────

	async getModelConstraints(modelName: string): Promise<ICortexModelConstraints> {
		await this._ensureAdminSession();
		return this._client.getModelConstraints(modelName);
	}

	// ─── Admin: Model Management ──────────────────────────────────────────

	async listAllModels(): Promise<ICortexModelDetail[]> {
		await this._ensureAdminSession();
		return this._client.listAllModels();
	}

	async startModel(modelId: number): Promise<void> {
		await this._ensureAdminSession();
		return this._client.startModel(modelId);
	}

	async stopModel(modelId: number): Promise<void> {
		await this._ensureAdminSession();
		return this._client.stopModel(modelId);
	}

	async getModelLogs(modelId: number, diagnose?: boolean): Promise<string> {
		await this._ensureAdminSession();
		return this._client.getModelLogs(modelId, diagnose);
	}

	async dryRunModel(modelId: number): Promise<ICortexDryRunResult> {
		await this._ensureAdminSession();
		return this._client.dryRunModel(modelId);
	}

	// ─── System Monitoring ────────────────────────────────────────────────

	async getSystemSummary(): Promise<ICortexSystemSummary> {
		await this._ensureAdminSession();
		return this._client.getSystemSummary();
	}

	async getGPUMetrics(): Promise<ICortexGPUMetric[]> {
		await this._ensureAdminSession();
		return this._client.getGPUMetrics();
	}

	async getThroughputMetrics(): Promise<ICortexThroughput> {
		await this._ensureAdminSession();
		return this._client.getThroughputMetrics();
	}

	async getIDEStatus(): Promise<ICortexIDEStatus> {
		await this._ensureAdminSession();
		return this._client.getIDEStatus();
	}

	// ─── Chat Sessions ────────────────────────────────────────────────────

	async listChatSessions(): Promise<ICortexChatSession[]> {
		await this._ensureAdminSession();
		return this._client.listChatSessions();
	}

	async getChatSession(sessionId: string): Promise<ICortexChatSessionDetail> {
		await this._ensureAdminSession();
		return this._client.getChatSession(sessionId);
	}

	async createChatSession(request: ICortexCreateSessionRequest): Promise<ICortexChatSession> {
		await this._ensureAdminSession();
		return this._client.createChatSession(request);
	}

	async addMessageToSession(sessionId: string, message: ICortexSessionMessage): Promise<void> {
		await this._ensureAdminSession();
		return this._client.addMessageToSession(sessionId, message);
	}

	async deleteChatSession(sessionId: string): Promise<void> {
		await this._ensureAdminSession();
		return this._client.deleteChatSession(sessionId);
	}

	// ─── Admin Session Management ─────────────────────────────────────────

	private async _ensureAdminSession(): Promise<void> {
		if (this._adminSessionPromise) {
			await this._adminSessionPromise;
			return;
		}

		const username = this._config.username || 'admin';
		const password = this._config.password || '';

		if (!password) {
			this.logService.warn(`[CortexLLMProvider] No admin password configured for "${this.displayName}". Admin endpoints may fail.`);
			return;
		}

		this._adminSessionPromise = this._client.login(username, password);
		try {
			const success = await this._adminSessionPromise;
			if (!success) {
				this.logService.warn(`[CortexLLMProvider] Admin login failed for "${this.displayName}".`);
			}
		} finally {
			this._adminSessionPromise = undefined;
		}
	}
}
