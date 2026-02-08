/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ─── Provider Types ───────────────────────────────────────────────────────────

/**
 * LLM provider types supported by Sandtable.
 * - 'cortex': Full-featured provider with admin, monitoring, FIM, sessions.
 * - 'openai-compatible': Inference-only provider using standard OpenAI API.
 */
export type LLMProviderType = 'cortex' | 'openai-compatible';

/**
 * Serializable provider configuration stored in `sandtable.providers` setting.
 */
export interface IProviderConfig {
	/** Unique identifier for this provider (user-assigned or auto-generated) */
	id: string;
	/** Human-readable display name */
	displayName: string;
	/** Provider type determines API behavior and capabilities */
	type: LLMProviderType;
	/** Base URL of the provider's API (e.g., http://localhost:8084) */
	endpoint: string;
	/** API key for authentication (empty string if none required) */
	apiKey: string;
	/** Whether this provider is active */
	enabled: boolean;
	/** Priority for model resolution when the same model exists on multiple providers (lower = higher priority) */
	priority: number;
	/** Cortex-specific: admin username */
	username?: string;
	/** Cortex-specific: admin password */
	password?: string;
	/** Per-model parameter overrides, keyed by model name or glob pattern (e.g., "gpt-5*") */
	modelOverrides?: Record<string, IModelParameterOverrides>;
}

// ─── Model Parameter Overrides ────────────────────────────────────────────────

/**
 * Per-model parameter override configuration.
 * Allows administrators to customize, drop, rename, or inject request parameters
 * for specific models (or model patterns using * wildcards).
 *
 * This handles the reality that different LLM models reject parameters that
 * others require. For example, GPT-5 rejects `temperature` and `max_tokens`,
 * while Ollama models require them.
 *
 * Inspired by LiteLLM's `drop_params` and per-model config pattern.
 */
export interface IModelParameterOverrides {
	/** Parameters to drop (remove from request body before sending).
	 *  Example: ["temperature", "top_p"] for reasoning models that reject sampling params. */
	dropParams?: string[];
	/** Parameters to rename before sending.
	 *  Example: { "max_tokens": "max_completion_tokens" } for newer OpenAI models. */
	renameParams?: Record<string, string>;
	/** Parameters to force to a specific value, overwriting whatever the consumer sent.
	 *  Example: { "temperature": 1 } for models that only accept temperature=1. */
	forceParams?: Record<string, unknown>;
	/** Additional parameters to inject into every request for this model.
	 *  Only injected if the parameter is not already present in the request.
	 *  Example: { "reasoning_effort": "medium", "verbosity": "low" } for GPT-5. */
	extraParams?: Record<string, unknown>;
}

// ─── Model Identity ───────────────────────────────────────────────────────────

/**
 * Compound model identifier: providerId + modelName.
 * Parsed from strings like "cortex-local::gpt-oss-120b".
 */
export interface IModelIdentifier {
	providerId: string;
	modelName: string;
}

// ─── Model Capabilities ───────────────────────────────────────────────────────

/**
 * Model capabilities detected from the provider.
 */
export interface IModelCapabilities {
	/** Supports /v1/chat/completions */
	chat: boolean;
	/** Supports /v1/completions (text completion) */
	completion: boolean;
	/** Supports /v1/fim/completions (fill-in-the-middle -- typically Cortex only) */
	fim: boolean;
	/** Supports the tools parameter in chat completions */
	toolCalling: boolean;
	/** Supports stream: true in requests */
	streaming: boolean;
	/** Supports system role messages */
	systemPrompt: boolean;
}

// ─── Unified Model ────────────────────────────────────────────────────────────

/**
 * Unified model representation that includes provider context.
 * Used throughout the UI to show models from all providers in a single list.
 */
export interface IUnifiedModel {
	/** The model name as known to its provider */
	modelName: string;
	/** Compound ID: "providerId::modelName" */
	qualifiedName: string;
	/** Provider this model belongs to */
	providerId: string;
	/** Human-readable provider name */
	providerName: string;
	/** Provider type */
	providerType: LLMProviderType;
	/** Model state (Cortex models have lifecycle state; external models are always 'available') */
	state: 'running' | 'available' | 'stopped' | 'starting' | 'loading' | 'failed';
	/** Detected capabilities */
	capabilities: IModelCapabilities;
	/** Engine type (Cortex models have vllm/llamacpp; external models have 'external') */
	engineType: string;
	/** Task type if known (e.g., 'generate', 'chat') */
	task?: string;
}

// ─── Health Types ─────────────────────────────────────────────────────────────

/**
 * Health check result for a single provider.
 */
export interface IProviderHealthResult {
	providerId: string;
	providerName: string;
	healthy: boolean;
	modelCount: number;
	latencyMs: number;
	error?: string;
}

/**
 * Aggregate health status across all providers.
 */
export interface IAggregateHealthResult {
	totalProviders: number;
	healthyProviders: number;
	totalModels: number;
	providers: IProviderHealthResult[];
}

// ─── Provider Info (lightweight for consumers) ────────────────────────────────

/**
 * Lightweight provider info for consumers like the status bar.
 */
export interface IProviderInfo {
	id: string;
	displayName: string;
	type: string;
	healthy: boolean;
	modelCount: number;
}
