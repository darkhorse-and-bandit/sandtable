/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IProviderRegistryService } from '../common/providerRegistry.js';
import { ILLMProvider } from '../common/llmProvider.js';
import { ICortexLLMProvider } from '../common/cortexLLMProvider.js';
import {
	IProviderConfig, IUnifiedModel, IProviderHealthResult,
	IAggregateHealthResult, IModelIdentifier,
} from '../common/cortexProviderTypes.js';
import { parseModelReference } from '../common/modelResolver.js';
import { CortexLLMProvider } from './cortexLLMProviderImpl.js';
import { OpenAICompatibleProvider } from './openAICompatibleProviderImpl.js';
import {
	CortexConfigKeys, ProviderConfigKeys,
	CORTEX_DEFAULT_ENDPOINT, CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS,
} from '../common/cortexConfiguration.js';

// Import configuration side-effects to ensure settings are registered
import '../common/cortexConfiguration.js';

// ─── ProviderRegistryService ──────────────────────────────────────────────────

/**
 * Manages multiple LLM providers, reads configuration from settings,
 * performs per-provider health polling, and provides unified model listing.
 */
export class ProviderRegistryService extends Disposable implements IProviderRegistryService {

	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ILLMProvider>();
	private readonly _providerHealth = new Map<string, IProviderHealthResult>();
	private readonly _providerConfigs = new Map<string, IProviderConfig>();
	private readonly _checkedProviders = new Set<string>();
	private _healthTimer: ReturnType<typeof setInterval> | undefined;
	private _isDisposed = false;

	// ─── Events ───────────────────────────────────────────────────────────

	private readonly _onProvidersChanged = this._register(new Emitter<void>());
	readonly onProvidersChanged: Event<void> = this._onProvidersChanged.event;

	private readonly _onProviderHealthChanged = this._register(new Emitter<IProviderHealthResult>());
	readonly onProviderHealthChanged: Event<IProviderHealthResult> = this._onProviderHealthChanged.event;

	private readonly _onModelsChanged = this._register(new Emitter<void>());
	readonly onModelsChanged: Event<void> = this._onModelsChanged.event;

	// ─── Constructor ──────────────────────────────────────────────────────

	constructor(
		@IConfigurationService private readonly configService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._initializeProviders();
		this._watchConfigChanges();
		this._startHealthPolling();
		this.logService.info('[ProviderRegistryService] Initialized');
	}

	// ─── Provider Management ──────────────────────────────────────────────

	getProviders(): ILLMProvider[] {
		return Array.from(this._providers.values());
	}

	getActiveProviders(): ILLMProvider[] {
		return Array.from(this._providers.values()).filter(p => {
			const config = this._providerConfigs.get(p.id);
			if (config?.enabled === false) {
				return false;
			}
			// Include providers that are connected OR haven't completed their
			// first health check yet (optimistic inclusion to avoid timing gaps
			// where models are discoverable but the chat panel says "no models").
			return p.isConnected || !this._checkedProviders.has(p.id);
		});
	}

	getProvider(providerId: string): ILLMProvider | undefined {
		return this._providers.get(providerId);
	}

	getCortexProvider(): ICortexLLMProvider | undefined {
		for (const provider of this._providers.values()) {
			if ('isCortex' in provider && (provider as ICortexLLMProvider).isCortex === true) {
				return provider as ICortexLLMProvider;
			}
		}
		return undefined;
	}

	async addProvider(config: IProviderConfig): Promise<ILLMProvider> {
		const provider = this._createProvider(config);
		this._providerConfigs.set(config.id, config);
		this._providers.set(config.id, provider);
		this._persistProviderConfigs();
		this._onProvidersChanged.fire();

		// Perform initial health check
		const health = await provider.checkHealth();
		this._providerHealth.set(config.id, health);
		this._onProviderHealthChanged.fire(health);
		this._onModelsChanged.fire();

		this.logService.info(`[ProviderRegistryService] Added provider "${config.displayName}" (${config.type})`);
		return provider;
	}

	removeProvider(providerId: string): void {
		const provider = this._providers.get(providerId);
		if (provider) {
			provider.dispose();
			this._providers.delete(providerId);
			this._providerConfigs.delete(providerId);
			this._providerHealth.delete(providerId);
			this._checkedProviders.delete(providerId);
			this._persistProviderConfigs();
			this._onProvidersChanged.fire();
			this._onModelsChanged.fire();
			this.logService.info(`[ProviderRegistryService] Removed provider "${providerId}"`);
		}
	}

	updateProvider(providerId: string, updates: Partial<IProviderConfig>): void {
		const existingConfig = this._providerConfigs.get(providerId);
		if (!existingConfig) {
			return;
		}

		const newConfig = { ...existingConfig, ...updates };
		this._providerConfigs.set(providerId, newConfig);

		// Recreate provider if endpoint/apiKey/type changed
		const needsRecreate = updates.endpoint !== undefined || updates.apiKey !== undefined || updates.type !== undefined;
		if (needsRecreate) {
			const oldProvider = this._providers.get(providerId);
			if (oldProvider) {
				oldProvider.dispose();
			}
			const newProvider = this._createProvider(newConfig);
			this._providers.set(providerId, newProvider);
		}

		this._persistProviderConfigs();
		this._onProvidersChanged.fire();
		this.logService.info(`[ProviderRegistryService] Updated provider "${providerId}"`);
	}

	async testConnection(config: IProviderConfig): Promise<IProviderHealthResult> {
		// Create a temporary provider, test it, then dispose
		const tempProvider = this._createProvider(config);
		try {
			return await tempProvider.checkHealth();
		} finally {
			tempProvider.dispose();
		}
	}

	// ─── Model Resolution ─────────────────────────────────────────────────

	async listAllModels(): Promise<IUnifiedModel[]> {
		const allModels: IUnifiedModel[] = [];
		const activeProviders = this.getActiveProviders();

		const promises = activeProviders.map(async (provider) => {
			try {
				const models = await provider.listModels();
				allModels.push(...models);
			} catch (err) {
				this.logService.warn(`[ProviderRegistryService] Failed to list models from "${provider.displayName}": ${err}`);
			}
		});

		await Promise.allSettled(promises);

		// Sort by provider priority, then by model name
		return allModels.sort((a, b) => {
			const pa = this._getProviderPriority(a.providerId);
			const pb = this._getProviderPriority(b.providerId);
			if (pa !== pb) { return pa - pb; }
			return a.modelName.localeCompare(b.modelName);
		});
	}

	resolveModel(modelRef: string): IModelIdentifier | undefined {
		// 1. Try compound ID first
		const parsed = parseModelReference(modelRef);
		if (parsed) {
			const provider = this._providers.get(parsed.providerId);
			if (provider) {
				return parsed;
			}
			// Provider not found -- fall through to bare name search
			return undefined;
		}

		// 2. Bare name -- check default provider first
		const defaultProviderId = this.configService.getValue<string>(ProviderConfigKeys.DefaultProvider) || '';
		if (defaultProviderId) {
			const defaultProvider = this._providers.get(defaultProviderId);
			if (defaultProvider) {
				return { providerId: defaultProviderId, modelName: modelRef };
			}
		}

		// 3. Bare name -- use first enabled provider by priority
		const configs = Array.from(this._providerConfigs.values())
			.filter(c => c.enabled)
			.sort((a, b) => a.priority - b.priority);

		if (configs.length > 0) {
			return { providerId: configs[0].id, modelName: modelRef };
		}

		return undefined;
	}

	getProviderForModel(modelRef: string): ILLMProvider | undefined {
		const resolved = this.resolveModel(modelRef);
		if (!resolved) {
			return undefined;
		}
		return this._providers.get(resolved.providerId);
	}

	// ─── Health ───────────────────────────────────────────────────────────

	getAggregateHealth(): IAggregateHealthResult {
		const providers = Array.from(this._providerHealth.values());
		return {
			totalProviders: this._providers.size,
			healthyProviders: providers.filter(p => p.healthy).length,
			totalModels: providers.reduce((sum, p) => sum + p.modelCount, 0),
			providers,
		};
	}

	getProviderHealth(providerId: string): IProviderHealthResult | undefined {
		return this._providerHealth.get(providerId);
	}

	// ─── Initialization ───────────────────────────────────────────────────

	private _initializeProviders(): void {
		const configs = this._getProviderConfigs();
		for (const config of configs) {
			this._providerConfigs.set(config.id, config);
			if (config.enabled) {
				const provider = this._createProvider(config);
				this._providers.set(config.id, provider);
			}
		}
		this.logService.info(`[ProviderRegistryService] Initialized ${this._providers.size} providers from configuration`);
	}

	private _getProviderConfigs(): IProviderConfig[] {
		const providers = this.configService.getValue<IProviderConfig[]>(ProviderConfigKeys.Providers);
		if (providers && Array.isArray(providers) && providers.length > 0) {
			return providers;
		}
		// Legacy migration: create config from sandtable.cortex.* settings
		return [this._buildLegacyCortexConfig()];
	}

	/**
	 * Builds a Cortex provider config from legacy sandtable.cortex.* settings.
	 * This ensures zero-friction upgrade for existing users.
	 */
	private _buildLegacyCortexConfig(): IProviderConfig {
		const endpoint = this.configService.getValue<string>(CortexConfigKeys.Endpoint) || CORTEX_DEFAULT_ENDPOINT;
		const apiKey = this.configService.getValue<string>(CortexConfigKeys.ApiKey) || '';
		const username = this.configService.getValue<string>(CortexConfigKeys.Username) || 'admin';
		const password = this.configService.getValue<string>(CortexConfigKeys.Password) || '';

		return {
			id: 'cortex-default',
			displayName: 'Cortex',
			type: 'cortex',
			endpoint,
			apiKey,
			enabled: true,
			priority: 1,
			username,
			password,
		};
	}

	private _createProvider(config: IProviderConfig): ILLMProvider {
		if (config.type === 'cortex') {
			return new CortexLLMProvider(config, this.logService);
		}
		return new OpenAICompatibleProvider(config, this.logService);
	}

	// ─── Configuration Watching ───────────────────────────────────────────

	private _watchConfigChanges(): void {
		this._register(this.configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ProviderConfigKeys.Providers)) {
				this._reconcileProviders();
			}
		}));
	}

	/**
	 * Reconciles the provider map with the current configuration.
	 * Adds new providers, removes deleted ones, updates changed ones.
	 */
	private _reconcileProviders(): void {
		const configs = this._getProviderConfigs();
		const configMap = new Map(configs.map(c => [c.id, c]));

		// Remove providers that no longer exist in config
		for (const [id, provider] of this._providers) {
			if (!configMap.has(id)) {
				provider.dispose();
				this._providers.delete(id);
				this._providerConfigs.delete(id);
				this._providerHealth.delete(id);
			}
		}

		// Add/update providers from config
		for (const config of configs) {
			this._providerConfigs.set(config.id, config);

			if (!config.enabled) {
				// Disable: remove active provider if it exists
				const existing = this._providers.get(config.id);
				if (existing) {
					existing.dispose();
					this._providers.delete(config.id);
				}
				continue;
			}

			const existingProvider = this._providers.get(config.id);
			if (!existingProvider) {
				// New enabled provider: create it
				const provider = this._createProvider(config);
				this._providers.set(config.id, provider);
			}
			// Note: for existing providers, we don't recreate on every config change.
			// Only addProvider/updateProvider explicitly handle recreation.
		}

		this._onProvidersChanged.fire();
		this._onModelsChanged.fire();
		this.logService.info(`[ProviderRegistryService] Reconciled providers: ${this._providers.size} active`);
	}

	// ─── Health Polling ───────────────────────────────────────────────────

	private _startHealthPolling(): void {
		// Perform initial health checks
		this._performHealthChecks();

		// Set up periodic polling
		const interval = this.configService.getValue<number>(CortexConfigKeys.HealthCheckIntervalMs)
			|| CORTEX_DEFAULT_HEALTH_CHECK_INTERVAL_MS;
		this._healthTimer = setInterval(() => this._performHealthChecks(), interval);
	}

	private async _performHealthChecks(): Promise<void> {
		if (this._isDisposed) {
			return;
		}

		const providers = Array.from(this._providers.values());
		const promises = providers.map(async (provider) => {
			try {
				const health = await provider.checkHealth();
				const previous = this._providerHealth.get(provider.id);
				this._providerHealth.set(provider.id, health);
				this._checkedProviders.add(provider.id);

				// Fire event if health changed
				if (!previous || previous.healthy !== health.healthy || previous.modelCount !== health.modelCount) {
					this._onProviderHealthChanged.fire(health);
					this._onModelsChanged.fire();
				}
			} catch (err) {
				this._checkedProviders.add(provider.id);
				this.logService.warn(`[ProviderRegistryService] Health check failed for "${provider.displayName}": ${err}`);
			}
		});

		await Promise.allSettled(promises);
	}

	// ─── Configuration Persistence ────────────────────────────────────────

	private _persistProviderConfigs(): void {
		const configs = Array.from(this._providerConfigs.values());
		this.configService.updateValue(ProviderConfigKeys.Providers, configs);
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	private _getProviderPriority(providerId: string): number {
		const config = this._providerConfigs.get(providerId);
		return config?.priority ?? 10;
	}

	// ─── Disposal ─────────────────────────────────────────────────────────

	override dispose(): void {
		this._isDisposed = true;
		if (this._healthTimer !== undefined) {
			clearInterval(this._healthTimer);
			this._healthTimer = undefined;
		}
		for (const provider of this._providers.values()) {
			provider.dispose();
		}
		this._providers.clear();
		super.dispose();
	}
}

// Register the service as a delayed singleton
registerSingleton(IProviderRegistryService, ProviderRegistryService, InstantiationType.Delayed);
