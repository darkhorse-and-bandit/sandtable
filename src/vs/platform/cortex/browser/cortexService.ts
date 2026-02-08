/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { CortexClient } from '../common/cortexClient.js';
import {
	CortexConnectionStatus,
	CortexHealthResult,
	ICortexChatRequest,
	ICortexChatResponse,
	ICortexChatSession,
	ICortexChatSessionDetail,
	ICortexCompletionRequest,
	ICortexCompletionResponse,
	ICortexCreateSessionRequest,
	ICortexDryRunResult,
	ICortexFimRequest,
	ICortexGPUMetric,
	ICortexIDEStatus,
	ICortexModel,
	ICortexModelConstraints,
	ICortexModelDetail,
	ICortexService,
	ICortexSessionMessage,
	ICortexStreamChunk,
	ICortexStreamResult,
	ICortexSystemSummary,
	ICortexThroughput,
	CortexApiError,
} from '../common/cortex.js';
import {
	CortexConfigKeys,
	ChatConfigKeys,
	CORTEX_DEFAULT_ENDPOINT,
} from '../common/cortexConfiguration.js';
import { IProviderRegistryService } from '../common/providerRegistry.js';
import { ILLMProvider } from '../common/llmProvider.js';
import { IAggregateHealthResult, IProviderInfo, IUnifiedModel } from '../common/cortexProviderTypes.js';
import { parseModelReference, extractModelName } from '../common/modelResolver.js';

// Import configuration side-effects to ensure settings are registered
import '../common/cortexConfiguration.js';

/**
 * Browser-side implementation of ICortexService.
 *
 * Phase 4.5 evolution: This service now acts as a routing facade that delegates
 * inference requests to the correct provider via IProviderRegistryService.
 * Admin and monitoring methods are delegated to the Cortex provider specifically.
 * A direct CortexClient is kept as a fallback for when the registry is not ready.
 */
export class CortexService extends Disposable implements ICortexService {

	declare readonly _serviceBrand: undefined;

	private readonly _client: CortexClient;
	private _connectionStatus: CortexConnectionStatus = 'disconnected';
	private _modelCount: number = 0;

	// ─── Events ───────────────────────────────────────────────────────────

	private readonly _onConnectionStatusChanged = this._register(new Emitter<CortexConnectionStatus>());
	readonly onConnectionStatusChanged: Event<CortexConnectionStatus> = this._onConnectionStatusChanged.event;

	// ─── Constructor ──────────────────────────────────────────────────────

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IProviderRegistryService private readonly _registry: IProviderRegistryService,
	) {
		super();

		// Initialize direct client as fallback
		const endpoint = this.configurationService.getValue<string>(CortexConfigKeys.Endpoint) || CORTEX_DEFAULT_ENDPOINT;
		const apiKey = this.configurationService.getValue<string>(CortexConfigKeys.ApiKey) || '';
		this._client = new CortexClient(endpoint, apiKey);

		// Watch for legacy configuration changes (still used for fallback client)
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CortexConfigKeys.Endpoint)) {
				const newEndpoint = this.configurationService.getValue<string>(CortexConfigKeys.Endpoint) || CORTEX_DEFAULT_ENDPOINT;
				this._client.updateEndpoint(newEndpoint);
				this.logService.info(`[CortexService] Fallback endpoint updated to: ${newEndpoint}`);
			}
			if (e.affectsConfiguration(CortexConfigKeys.ApiKey)) {
				const newApiKey = this.configurationService.getValue<string>(CortexConfigKeys.ApiKey) || '';
				this._client.updateApiKey(newApiKey);
			}
		}));

		// Subscribe to registry health events for connection status updates
		this._register(this._registry.onProviderHealthChanged(() => {
			this._updateConnectionStatusFromRegistry();
		}));

		this._register(this._registry.onModelsChanged(() => {
			const health = this._registry.getAggregateHealth();
			this._modelCount = health.totalModels;
		}));

		// Set initial status
		this._updateConnectionStatus('connecting');
		this.logService.info(`[CortexService] Initialized with provider registry`);
	}

	// ─── Connection Management ────────────────────────────────────────────

	getConnectionStatus(): CortexConnectionStatus {
		return this._connectionStatus;
	}

	getModelCount(): number {
		return this._modelCount;
	}

	async checkHealth(): Promise<CortexHealthResult> {
		const aggregate = this._registry.getAggregateHealth();
		const healthy = aggregate.healthyProviders > 0;
		this._modelCount = aggregate.totalModels;
		this._updateConnectionStatus(healthy ? 'connected' : 'disconnected');
		return {
			healthy,
			modelCount: aggregate.totalModels,
			latencyMs: aggregate.providers.length > 0
				? Math.round(aggregate.providers.reduce((sum, p) => sum + p.latencyMs, 0) / aggregate.providers.length)
				: 0,
		};
	}

	// ─── Multi-Provider (Phase 4.5) ───────────────────────────────────────

	listProviders(): IProviderInfo[] {
		const providers = this._registry.getProviders();
		return providers.map(p => {
			const health = this._registry.getProviderHealth(p.id);
			return {
				id: p.id,
				displayName: p.displayName,
				type: p.type,
				healthy: health?.healthy ?? false,
				modelCount: health?.modelCount ?? 0,
			};
		});
	}

	getAggregateHealth(): IAggregateHealthResult {
		return this._registry.getAggregateHealth();
	}

	// ─── Inference (routed via provider registry) ─────────────────────────

	async chatCompletion(request: ICortexChatRequest): Promise<ICortexChatResponse> {
		const { provider, routedRequest } = this._routeRequest(request);
		return provider.chatCompletion(routedRequest);
	}

	async chatCompletionStream(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const { provider, routedRequest } = this._routeRequest(request);
		return provider.chatCompletionStream(routedRequest, onToken, cancellation);
	}

	async textCompletion(request: ICortexCompletionRequest): Promise<ICortexCompletionResponse> {
		const { provider, routedRequest } = this._routeTextRequest(request);
		if (!provider.supportsTextCompletion || !provider.textCompletion) {
			throw new CortexApiError(501, `Provider "${provider.displayName}" does not support text completions`);
		}
		return provider.textCompletion(routedRequest);
	}

	async textCompletionStream(
		request: ICortexCompletionRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const { provider, routedRequest } = this._routeTextRequest(request);
		if (!provider.supportsTextCompletion || !provider.textCompletionStream) {
			throw new CortexApiError(501, `Provider "${provider.displayName}" does not support text completion streaming`);
		}
		return provider.textCompletionStream(routedRequest, onToken, cancellation);
	}

	async fimCompletion(request: ICortexFimRequest): Promise<ICortexCompletionResponse> {
		const { provider, routedRequest } = this._routeFimRequest(request);
		if (!provider.supportsFimCompletion || !provider.fimCompletion) {
			throw new CortexApiError(501, `Provider "${provider.displayName}" does not support FIM completions`);
		}
		return provider.fimCompletion(routedRequest);
	}

	async fimCompletionStream(
		request: ICortexFimRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const { provider, routedRequest } = this._routeFimRequest(request);
		if (!provider.supportsFimCompletion || !provider.fimCompletionStream) {
			throw new CortexApiError(501, `Provider "${provider.displayName}" does not support FIM completion streaming`);
		}
		return provider.fimCompletionStream(routedRequest, onToken, cancellation);
	}

	// ─── Model Discovery (aggregated from all providers) ──────────────────

	async listRunningModels(): Promise<ICortexModel[]> {
		try {
			const unifiedModels = await this._registry.listAllModels();
			return this._mapUnifiedToLegacy(unifiedModels);
		} catch (err) {
			this.logService.warn(`[CortexService] Failed to list models from registry, falling back to direct client: ${err}`);
			return this._client.listRunningModels();
		}
	}

	async getModelConstraints(modelName: string): Promise<ICortexModelConstraints> {
		// Try to route to the correct provider
		const provider = this._registry.getProviderForModel(modelName);
		if (provider?.getModelConstraints) {
			const bareModel = extractModelName(modelName);
			return provider.getModelConstraints(bareModel);
		}
		// Fallback to direct client
		return this._client.getModelConstraints(extractModelName(modelName));
	}

	// ─── IDE Status (Cortex-specific) ─────────────────────────────────────

	async getIDEStatus(): Promise<ICortexIDEStatus> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.getIDEStatus();
		}
		return this._client.getIDEStatus();
	}

	// ─── Admin (delegated to Cortex provider) ─────────────────────────────

	async listAllModels(): Promise<ICortexModelDetail[]> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.listAllModels();
		}
		await this._ensureAdminSession();
		return this._client.listAllModels();
	}

	async startModel(modelId: number): Promise<void> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.startModel(modelId);
		}
		await this._ensureAdminSession();
		return this._client.startModel(modelId);
	}

	async stopModel(modelId: number): Promise<void> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.stopModel(modelId);
		}
		await this._ensureAdminSession();
		return this._client.stopModel(modelId);
	}

	async getModelLogs(modelId: number, diagnose?: boolean): Promise<string> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.getModelLogs(modelId, diagnose);
		}
		await this._ensureAdminSession();
		return this._client.getModelLogs(modelId, diagnose);
	}

	async dryRunModel(modelId: number): Promise<ICortexDryRunResult> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.dryRunModel(modelId);
		}
		await this._ensureAdminSession();
		return this._client.dryRunModel(modelId);
	}

	// ─── System Monitoring (Cortex-specific) ──────────────────────────────

	async getSystemSummary(): Promise<ICortexSystemSummary> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.getSystemSummary();
		}
		await this._ensureAdminSession();
		return this._client.getSystemSummary();
	}

	async getGPUMetrics(): Promise<ICortexGPUMetric[]> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.getGPUMetrics();
		}
		await this._ensureAdminSession();
		return this._client.getGPUMetrics();
	}

	async getThroughputMetrics(): Promise<ICortexThroughput> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.getThroughputMetrics();
		}
		await this._ensureAdminSession();
		return this._client.getThroughputMetrics();
	}

	// ─── Chat Sessions (Cortex-specific) ──────────────────────────────────

	async listChatSessions(): Promise<ICortexChatSession[]> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.listChatSessions();
		}
		await this._ensureAdminSession();
		return this._client.listChatSessions();
	}

	async getChatSession(sessionId: string): Promise<ICortexChatSessionDetail> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.getChatSession(sessionId);
		}
		await this._ensureAdminSession();
		return this._client.getChatSession(sessionId);
	}

	async createChatSession(request: ICortexCreateSessionRequest): Promise<ICortexChatSession> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.createChatSession(request);
		}
		await this._ensureAdminSession();
		return this._client.createChatSession(request);
	}

	async addMessageToSession(sessionId: string, message: ICortexSessionMessage): Promise<void> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.addMessageToSession(sessionId, message);
		}
		await this._ensureAdminSession();
		return this._client.addMessageToSession(sessionId, message);
	}

	async deleteChatSession(sessionId: string): Promise<void> {
		const cortex = this._registry.getCortexProvider();
		if (cortex) {
			return cortex.deleteChatSession(sessionId);
		}
		await this._ensureAdminSession();
		return this._client.deleteChatSession(sessionId);
	}

	// ─── Routing Helpers ──────────────────────────────────────────────────

	private _routeRequest(request: ICortexChatRequest): { provider: ILLMProvider; routedRequest: ICortexChatRequest } {
		const provider = this._resolveProviderForModel(request.model);
		const bareModel = extractModelName(request.model);
		return {
			provider,
			routedRequest: { ...request, model: bareModel },
		};
	}

	private _routeTextRequest(request: ICortexCompletionRequest): { provider: ILLMProvider; routedRequest: ICortexCompletionRequest } {
		const provider = this._resolveProviderForModel(request.model);
		const bareModel = extractModelName(request.model);
		return {
			provider,
			routedRequest: { ...request, model: bareModel },
		};
	}

	private _routeFimRequest(request: ICortexFimRequest): { provider: ILLMProvider; routedRequest: ICortexFimRequest } {
		const provider = this._resolveProviderForModel(request.model);
		const bareModel = extractModelName(request.model);
		return {
			provider,
			routedRequest: { ...request, model: bareModel },
		};
	}

	private _resolveProviderForModel(modelRef: string): ILLMProvider {
		const provider = this._registry.getProviderForModel(modelRef);
		if (provider) {
			return provider;
		}

		// If model has a compound ref but provider not found, throw descriptive error
		const parsed = parseModelReference(modelRef);
		if (parsed) {
			throw new CortexApiError(404, `Provider "${parsed.providerId}" not found for model "${parsed.modelName}"`);
		}

		// Bare model name, no active providers -- throw error
		throw new CortexApiError(503, `No active providers available to serve model "${modelRef}"`);
	}

	/**
	 * Maps IUnifiedModel[] to ICortexModel[] for backward compatibility.
	 * Consumers that use listRunningModels() get compound names as served_model_name.
	 */
	private _mapUnifiedToLegacy(models: IUnifiedModel[]): ICortexModel[] {
		return models
			.filter(m => m.state === 'running' || m.state === 'available')
			.map(m => ({
				served_model_name: m.qualifiedName,
				task: m.task || 'generate',
				engine_type: (m.engineType === 'vllm' || m.engineType === 'llamacpp' || m.engineType === 'external')
					? m.engineType as ICortexModel['engine_type']
					: 'external' as const,
				state: m.state === 'available' ? 'running' as const : m.state as ICortexModel['state'],
			}));
	}

	// ─── Connection Status ────────────────────────────────────────────────

	private _updateConnectionStatusFromRegistry(): void {
		const aggregate = this._registry.getAggregateHealth();
		this._modelCount = aggregate.totalModels;
		if (aggregate.healthyProviders > 0) {
			this._updateConnectionStatus('connected');
		} else if (aggregate.totalProviders > 0) {
			this._updateConnectionStatus('disconnected');
		} else {
			this._updateConnectionStatus('disconnected');
		}
	}

	private _updateConnectionStatus(newStatus: CortexConnectionStatus): void {
		if (this._connectionStatus !== newStatus) {
			const oldStatus = this._connectionStatus;
			this._connectionStatus = newStatus;
			this._onConnectionStatusChanged.fire(newStatus);
			this.logService.info(`[CortexService] Connection status changed: ${oldStatus} -> ${newStatus}`);
		}
	}

	// ─── Fallback Admin Session (for direct client) ───────────────────────

	private _adminSessionPromise: Promise<boolean> | undefined;

	private async _ensureAdminSession(): Promise<void> {
		if (this._adminSessionPromise) {
			await this._adminSessionPromise;
			return;
		}

		const username = this.configurationService.getValue<string>(CortexConfigKeys.Username) || 'admin';
		const password = this.configurationService.getValue<string>(CortexConfigKeys.Password) || '';

		if (!password) {
			this.logService.warn('[CortexService] No admin password configured. Admin endpoints may fail.');
			return;
		}

		this._adminSessionPromise = this._client.login(username, password);
		try {
			const success = await this._adminSessionPromise;
			if (!success) {
				this.logService.warn('[CortexService] Admin login failed.');
			}
		} finally {
			this._adminSessionPromise = undefined;
		}
	}

	// ─── Chat Configuration Helpers ───────────────────────────────────────

	getDefaultModel(): string {
		return this.configurationService.getValue<string>(ChatConfigKeys.DefaultModel) || '';
	}

	isStreamingEnabled(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfigKeys.StreamingEnabled) ?? true;
	}

	getSystemPrompt(): string {
		return this.configurationService.getValue<string>(ChatConfigKeys.SystemPrompt) || 'You are a helpful coding assistant.';
	}

	getChatMaxTokens(): number {
		return this.configurationService.getValue<number>(ChatConfigKeys.MaxTokens) || 2048;
	}

	getChatTemperature(): number {
		return this.configurationService.getValue<number>(ChatConfigKeys.Temperature) ?? 0.7;
	}

	// ─── Disposal ─────────────────────────────────────────────────────────

	override dispose(): void {
		super.dispose();
	}
}

// Register the service as a delayed singleton
registerSingleton(ICortexService, CortexService, InstantiationType.Delayed);
