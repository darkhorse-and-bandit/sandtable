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
} from '../common/cortex.js';
import {
	CortexConfigKeys,
	ChatConfigKeys,
	CORTEX_DEFAULT_ENDPOINT,
	CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS,
} from '../common/cortexConfiguration.js';

// Import configuration side-effects to ensure settings are registered
import '../common/cortexConfiguration.js';

/**
 * Browser-side implementation of ICortexService.
 * Manages the CortexClient, health check polling, connection status events,
 * and provides all service methods defined in the interface.
 */
export class CortexService extends Disposable implements ICortexService {

	declare readonly _serviceBrand: undefined;

	private readonly _client: CortexClient;
	private _connectionStatus: CortexConnectionStatus = 'disconnected';
	private _healthCheckTimer: ReturnType<typeof setInterval> | undefined;
	private _modelCount: number = 0;
	private _isDisposed: boolean = false;

	// ─── Events ───────────────────────────────────────────────────────────

	private readonly _onConnectionStatusChanged = this._register(new Emitter<CortexConnectionStatus>());
	readonly onConnectionStatusChanged: Event<CortexConnectionStatus> = this._onConnectionStatusChanged.event;

	// ─── Constructor ──────────────────────────────────────────────────────

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Initialize client with current configuration
		const endpoint = this.configurationService.getValue<string>(CortexConfigKeys.Endpoint) || CORTEX_DEFAULT_ENDPOINT;
		const apiKey = this.configurationService.getValue<string>(CortexConfigKeys.ApiKey) || '';

		this._client = new CortexClient(endpoint, apiKey);

		// Watch for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CortexConfigKeys.Endpoint)) {
				const newEndpoint = this.configurationService.getValue<string>(CortexConfigKeys.Endpoint) || CORTEX_DEFAULT_ENDPOINT;
				this._client.updateEndpoint(newEndpoint);
				this.logService.info(`[CortexService] Endpoint updated to: ${newEndpoint}`);
				// Re-check health immediately on endpoint change
				this._performHealthCheck();
			}
			if (e.affectsConfiguration(CortexConfigKeys.ApiKey)) {
				const newApiKey = this.configurationService.getValue<string>(CortexConfigKeys.ApiKey) || '';
				this._client.updateApiKey(newApiKey);
				this.logService.info('[CortexService] API key updated');
			}
			if (e.affectsConfiguration(CortexConfigKeys.HealthCheckIntervalMs)) {
				this._restartHealthCheckPolling();
			}
		}));

		// Start health check polling
		this._startHealthCheckPolling();

		this.logService.info(`[CortexService] Initialized with endpoint: ${endpoint}`);
	}

	// ─── Connection Management ────────────────────────────────────────────

	getConnectionStatus(): CortexConnectionStatus {
		return this._connectionStatus;
	}

	getModelCount(): number {
		return this._modelCount;
	}

	async checkHealth(): Promise<CortexHealthResult> {
		const result = await this._client.checkHealth();
		this._modelCount = result.modelCount;
		this._updateConnectionStatus(result.healthy ? 'connected' : 'disconnected');
		return result;
	}

	private _updateConnectionStatus(newStatus: CortexConnectionStatus): void {
		if (this._connectionStatus !== newStatus) {
			const oldStatus = this._connectionStatus;
			this._connectionStatus = newStatus;
			this._onConnectionStatusChanged.fire(newStatus);
			this.logService.info(`[CortexService] Connection status changed: ${oldStatus} -> ${newStatus}`);
		}
	}

	// ─── Health Check Polling ─────────────────────────────────────────────

	private _startHealthCheckPolling(): void {
		// Mark as connecting on startup
		this._updateConnectionStatus('connecting');

		// Perform initial health check immediately
		this._performHealthCheck();

		// Set up periodic polling
		const interval = this.configurationService.getValue<number>(CortexConfigKeys.HealthCheckIntervalMs) || CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS;
		this._healthCheckTimer = setInterval(() => this._performHealthCheck(), interval);
	}

	private _restartHealthCheckPolling(): void {
		if (this._healthCheckTimer !== undefined) {
			clearInterval(this._healthCheckTimer);
			this._healthCheckTimer = undefined;
		}
		const interval = this.configurationService.getValue<number>(CortexConfigKeys.HealthCheckIntervalMs) || CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS;
		this._healthCheckTimer = setInterval(() => this._performHealthCheck(), interval);
		this.logService.info(`[CortexService] Health check interval updated to ${interval}ms`);
	}

	private async _performHealthCheck(): Promise<void> {
		if (this._isDisposed) {
			return;
		}
		try {
			await this.checkHealth();
		} catch (err) {
			this.logService.warn(`[CortexService] Health check failed: ${err}`);
			this._updateConnectionStatus('disconnected');
		}
	}

	// ─── Inference ────────────────────────────────────────────────────────

	async chatCompletion(request: ICortexChatRequest): Promise<ICortexChatResponse> {
		return this._client.chatCompletion(request);
	}

	async chatCompletionStream(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult> {
		const abortController = new AbortController();

		// Wire up cancellation token to abort controller
		let disposable: { dispose(): void } | undefined;
		if (cancellation) {
			disposable = cancellation.onCancellationRequested(() => {
				abortController.abort();
			});
		}

		try {
			return await this._client.streamChatCompletion(request, onToken, abortController.signal);
		} finally {
			disposable?.dispose();
		}
	}

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
			disposable = cancellation.onCancellationRequested(() => {
				abortController.abort();
			});
		}

		try {
			return await this._client.streamTextCompletion(request, onToken, abortController.signal);
		} finally {
			disposable?.dispose();
		}
	}

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
			disposable = cancellation.onCancellationRequested(() => {
				abortController.abort();
			});
		}

		try {
			return await this._client.streamFimCompletion(request, onToken, abortController.signal);
		} finally {
			disposable?.dispose();
		}
	}

	// ─── Model Discovery ──────────────────────────────────────────────────

	async listRunningModels(): Promise<ICortexModel[]> {
		return this._client.listRunningModels();
	}

	async getModelConstraints(modelName: string): Promise<ICortexModelConstraints> {
		return this._client.getModelConstraints(modelName);
	}

	// ─── IDE Status ───────────────────────────────────────────────────────

	async getIDEStatus(): Promise<ICortexIDEStatus> {
		return this._client.getIDEStatus();
	}

	// ─── Admin (Model Management) ─────────────────────────────────────────

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

	private _adminSessionPromise: Promise<boolean> | undefined;

	private async _ensureAdminSession(): Promise<void> {
		// Avoid duplicate login attempts
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
		this._isDisposed = true;
		if (this._healthCheckTimer !== undefined) {
			clearInterval(this._healthCheckTimer);
			this._healthCheckTimer = undefined;
		}
		super.dispose();
	}
}

// Register the service as a delayed singleton
registerSingleton(ICortexService, CortexService, InstantiationType.Delayed);
