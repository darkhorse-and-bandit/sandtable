/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { LLMProviderType, IProviderConfig, IUnifiedModel, IProviderHealthResult, IModelCapabilities } from './cortexProviderTypes.js';
import {
	ICortexChatRequest, ICortexChatResponse,
	ICortexCompletionRequest, ICortexCompletionResponse,
	ICortexFimRequest,
	ICortexStreamChunk, ICortexStreamResult,
	ICortexModelConstraints,
} from './cortex.js';

// ─── ILLMProvider ─────────────────────────────────────────────────────────────

/**
 * Base interface for all LLM providers.
 * Covers inference and model discovery -- the minimum any provider must support.
 */
export interface ILLMProvider {
	/** Provider's unique identifier */
	readonly id: string;
	/** Human-readable display name */
	readonly displayName: string;
	/** Provider type */
	readonly type: LLMProviderType;
	/** Current connection state */
	readonly isConnected: boolean;
	/** Fires when connection health changes */
	readonly onConnectionChanged: Event<boolean>;
	/** The provider's configuration */
	readonly config: IProviderConfig;

	// --- Health ---
	checkHealth(): Promise<IProviderHealthResult>;

	// --- Model Discovery ---
	listModels(): Promise<IUnifiedModel[]>;
	getModelCapabilities(modelName: string): Promise<IModelCapabilities>;

	// --- Chat Inference (required) ---
	chatCompletion(request: ICortexChatRequest): Promise<ICortexChatResponse>;
	chatCompletionStream(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult>;

	// --- Text Completion (optional -- not all providers expose /v1/completions) ---
	readonly supportsTextCompletion: boolean;
	textCompletion?(request: ICortexCompletionRequest): Promise<ICortexCompletionResponse>;
	textCompletionStream?(
		request: ICortexCompletionRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult>;

	// --- FIM Completion (optional -- typically Cortex only) ---
	readonly supportsFimCompletion: boolean;
	fimCompletion?(request: ICortexFimRequest): Promise<ICortexCompletionResponse>;
	fimCompletionStream?(
		request: ICortexFimRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult>;

	// --- Model Constraints (optional) ---
	getModelConstraints?(modelName: string): Promise<ICortexModelConstraints>;

	// --- Lifecycle ---
	dispose(): void;
}
