/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';
import { ILLMProvider } from './llmProvider.js';
import { ICortexLLMProvider } from './cortexLLMProvider.js';
import {
	IProviderConfig, IUnifiedModel, IProviderHealthResult,
	IAggregateHealthResult, IModelIdentifier,
} from './cortexProviderTypes.js';

// ─── Service Decorator ────────────────────────────────────────────────────────

export const IProviderRegistryService = createDecorator<IProviderRegistryService>('providerRegistryService');

// ─── Service Interface ────────────────────────────────────────────────────────

export interface IProviderRegistryService {
	readonly _serviceBrand: undefined;

	// --- Events ---
	/** Fires when the provider list changes (add/remove/enable/disable) */
	readonly onProvidersChanged: Event<void>;
	/** Fires when any provider's health status changes */
	readonly onProviderHealthChanged: Event<IProviderHealthResult>;
	/** Fires when the unified model list changes */
	readonly onModelsChanged: Event<void>;

	// --- Provider Management ---
	/** Get all configured providers (enabled and disabled) */
	getProviders(): ILLMProvider[];
	/** Get only enabled and healthy providers */
	getActiveProviders(): ILLMProvider[];
	/** Get a specific provider by ID */
	getProvider(providerId: string): ILLMProvider | undefined;
	/** Get the first Cortex provider (or undefined if none configured) */
	getCortexProvider(): ICortexLLMProvider | undefined;

	/** Add a new provider from configuration */
	addProvider(config: IProviderConfig): Promise<ILLMProvider>;
	/** Remove a provider by ID */
	removeProvider(providerId: string): void;
	/** Update a provider's configuration */
	updateProvider(providerId: string, updates: Partial<IProviderConfig>): void;
	/** Test connectivity to a provider without adding it */
	testConnection(config: IProviderConfig): Promise<IProviderHealthResult>;

	// --- Model Resolution ---
	/** Get unified model list from all active providers */
	listAllModels(): Promise<IUnifiedModel[]>;
	/** Resolve a model string to a provider + model name */
	resolveModel(modelRef: string): IModelIdentifier | undefined;
	/** Get the provider for a specific model */
	getProviderForModel(modelRef: string): ILLMProvider | undefined;

	// --- Health ---
	/** Get aggregate health across all providers */
	getAggregateHealth(): IAggregateHealthResult;
	/** Get health for a specific provider */
	getProviderHealth(providerId: string): IProviderHealthResult | undefined;
}
