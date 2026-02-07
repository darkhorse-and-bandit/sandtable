/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

// ─── Service Decorator ────────────────────────────────────────────────────────

export const ICortexService = createDecorator<ICortexService>('cortexService');

// ─── Service Interface ────────────────────────────────────────────────────────

export interface ICortexService {
	readonly _serviceBrand: undefined;

	// --- Connection ---
	readonly onConnectionStatusChanged: Event<CortexConnectionStatus>;
	checkHealth(): Promise<CortexHealthResult>;
	getConnectionStatus(): CortexConnectionStatus;

	// --- Inference ---
	chatCompletion(request: ICortexChatRequest): Promise<ICortexChatResponse>;
	chatCompletionStream(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult>;

	textCompletion(request: ICortexCompletionRequest): Promise<ICortexCompletionResponse>;
	textCompletionStream(
		request: ICortexCompletionRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult>;

	fimCompletion(request: ICortexFimRequest): Promise<ICortexCompletionResponse>;
	fimCompletionStream(
		request: ICortexFimRequest,
		onToken: (text: string) => void,
		cancellation?: CancellationToken
	): Promise<ICortexStreamResult>;

	// --- Model Discovery ---
	listRunningModels(): Promise<ICortexModel[]>;
	getModelConstraints(modelName: string): Promise<ICortexModelConstraints>;

	// --- IDE Status (combined endpoint) ---
	getIDEStatus(): Promise<ICortexIDEStatus>;

	// --- Admin (Model Management) ---
	listAllModels(): Promise<ICortexModelDetail[]>;
	startModel(modelId: number): Promise<void>;
	stopModel(modelId: number): Promise<void>;
	getModelLogs(modelId: number, diagnose?: boolean): Promise<string>;
	dryRunModel(modelId: number): Promise<ICortexDryRunResult>;

	// --- System Monitoring ---
	getSystemSummary(): Promise<ICortexSystemSummary>;
	getGPUMetrics(): Promise<ICortexGPUMetric[]>;
	getThroughputMetrics(): Promise<ICortexThroughput>;

	// --- Chat Sessions ---
	listChatSessions(): Promise<ICortexChatSession[]>;
	getChatSession(sessionId: string): Promise<ICortexChatSessionDetail>;
	createChatSession(request: ICortexCreateSessionRequest): Promise<ICortexChatSession>;
	addMessageToSession(sessionId: string, message: ICortexSessionMessage): Promise<void>;
	deleteChatSession(sessionId: string): Promise<void>;
}

// ─── Connection Types ─────────────────────────────────────────────────────────

export type CortexConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface CortexHealthResult {
	healthy: boolean;
	modelCount: number;
	latencyMs: number;
}

// ─── Inference Request/Response Types ─────────────────────────────────────────

export interface ICortexMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_calls?: ICortexToolCall[];
	tool_call_id?: string;
}

export interface ICortexChatRequest {
	model: string;
	messages: ICortexMessage[];
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	tools?: ICortexToolDefinition[];
	stop?: string[];
}

export interface ICortexChatResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: ICortexChatChoice[];
	usage?: ICortexUsage;
}

export interface ICortexChatChoice {
	index: number;
	message: ICortexMessage;
	finish_reason: string | null;
}

export interface ICortexUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface ICortexCompletionRequest {
	model: string;
	prompt: string;
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	stop?: string[];
}

export interface ICortexCompletionResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: ICortexCompletionChoice[];
	usage?: ICortexUsage;
}

export interface ICortexCompletionChoice {
	index: number;
	text: string;
	finish_reason: string | null;
}

export interface ICortexFimRequest {
	model: string;
	prefix: string;
	suffix: string;
	max_tokens?: number;
	temperature?: number;
	stop?: string[];
	stream?: boolean;
}

// ─── Streaming Types ──────────────────────────────────────────────────────────

export interface ICortexStreamChunk {
	content: string;
	finish_reason: string | null;
	metrics?: {
		tokens_per_second?: number;
		ttft_ms?: number;
	};
}

export interface ICortexStreamResult {
	totalTokens: number;
}

// ─── Model Types ──────────────────────────────────────────────────────────────

export interface ICortexModel {
	served_model_name: string;
	task: string;
	engine_type: 'vllm' | 'llamacpp';
	state: 'running' | 'stopped' | 'starting' | 'loading' | 'failed';
}

export interface ICortexModelConstraints {
	served_model_name: string;
	engine_type: string;
	task: string;
	context_size: number | null;
	max_model_len: number;
	max_tokens_default: number;
	supports_streaming: boolean;
	supports_system_prompt: boolean;
	supports_tool_calling?: boolean;
}

export interface ICortexModelDetail extends ICortexModel {
	id: number;
	model_path: string;
	gpu_ids: number[];
	quantization?: string;
	context_length?: number;
	created_at: string;
	updated_at: string;
}

// ─── Tool Types ───────────────────────────────────────────────────────────────

export interface ICortexToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface ICortexToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

// ─── IDE Status Types ─────────────────────────────────────────────────────────

export interface ICortexIDEStatus {
	running_models: ICortexModel[];
	system: {
		cpu_pct: number;
		ram_pct: number;
		disk_pct: number;
	};
	gpus: ICortexGPUMetric[];
	gateway_healthy: boolean;
}

export interface ICortexGPUMetric {
	index: number;
	name: string;
	mem_total_mb: number;
	mem_used_mb: number;
	compute_capability: string;
	architecture: string;
	flash_attention_supported: boolean;
	utilization_pct?: number;
	temperature_c?: number;
}

// ─── System Monitoring Types ──────────────────────────────────────────────────

export interface ICortexSystemSummary {
	cpu_pct: number;
	ram_total_mb: number;
	ram_used_mb: number;
	ram_pct: number;
	disk_total_gb: number;
	disk_used_gb: number;
	disk_pct: number;
}

export interface ICortexThroughput {
	tokens_per_second: number;
	requests_per_second: number;
	avg_latency_ms: number;
}

// ─── Dry Run Types ────────────────────────────────────────────────────────────

export interface ICortexDryRunResult {
	success: boolean;
	estimated_vram_mb: number;
	available_vram_mb: number;
	warnings: string[];
	errors: string[];
}

// ─── Chat Session Types ───────────────────────────────────────────────────────

export interface ICortexChatSession {
	id: string;
	title: string;
	model: string;
	created_at: string;
	updated_at: string;
	message_count: number;
}

export interface ICortexChatSessionDetail extends ICortexChatSession {
	messages: ICortexSessionMessage[];
}

export interface ICortexSessionMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
	created_at?: string;
}

export interface ICortexCreateSessionRequest {
	title: string;
	model: string;
	system_prompt?: string;
}

// ─── Error Types ──────────────────────────────────────────────────────────────

export class CortexApiError extends Error {
	constructor(
		public readonly statusCode: number,
		message: string,
		public readonly responseBody?: unknown
	) {
		super(`Cortex API error ${statusCode}: ${message}`);
		this.name = 'CortexApiError';
	}
}
