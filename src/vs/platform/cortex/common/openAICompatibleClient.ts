/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CortexApiError,
	ICortexChatRequest,
	ICortexChatResponse,
	ICortexCompletionRequest,
	ICortexCompletionResponse,
	ICortexStreamChunk,
	ICortexStreamResult,
	ICortexUsage,
} from './cortex.js';
import { IProviderHealthResult, IModelParameterOverrides } from './cortexProviderTypes.js';

// ─── Request Options ──────────────────────────────────────────────────────────

interface RequestOptions {
	method?: string;
	body?: unknown;
	abortSignal?: AbortSignal;
}

// ─── OpenAI Models Response ───────────────────────────────────────────────────

interface OpenAIModelsResponse {
	data: Array<{ id: string; object?: string; owned_by?: string }>;
}

// ─── OpenAICompatibleClient ───────────────────────────────────────────────────

/**
 * HTTP client for communicating with any OpenAI-compatible endpoint.
 * Supports /v1/models, /v1/chat/completions (streaming + non-streaming).
 * Uses the standard fetch API -- no external dependencies.
 *
 * This client mirrors the CortexClient pattern but targets the standard
 * OpenAI API, covering Ollama, vLLM, LM Studio, cloud APIs, etc.
 */
export class OpenAICompatibleClient {

	private _endpoint: string;
	private _apiKey: string;

	constructor(endpoint: string, apiKey: string) {
		this._endpoint = this._normalizeEndpoint(endpoint);
		this._apiKey = apiKey;
	}

	// ─── Configuration ────────────────────────────────────────────────────

	updateEndpoint(endpoint: string): void {
		this._endpoint = this._normalizeEndpoint(endpoint);
	}

	/**
	 * Normalizes an endpoint URL: strips trailing slashes and removes a
	 * trailing /v1 path if present (since the client prepends /v1/ to all paths).
	 * This prevents URL duplication like "http://host:8084/v1/v1/models".
	 */
	private _normalizeEndpoint(endpoint: string): string {
		let normalized = endpoint.replace(/\/+$/, '');
		// Strip trailing /v1 to prevent path duplication
		if (normalized.endsWith('/v1')) {
			normalized = normalized.slice(0, -3);
		}
		return normalized;
	}

	updateApiKey(apiKey: string): void {
		this._apiKey = apiKey;
	}

	get endpoint(): string {
		return this._endpoint;
	}

	// ─── Generic Request ──────────────────────────────────────────────────

	async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
		const url = `${this._endpoint}${path}`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		if (this._apiKey) {
			headers['Authorization'] = `Bearer ${this._apiKey}`;
		}

		const response = await fetch(url, {
			method: options.method || 'GET',
			headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
			signal: options.abortSignal,
		});

		if (!response.ok) {
			let errorMessage = response.statusText;
			let responseBody: unknown;
			try {
				responseBody = await response.json();
				const errObj = responseBody as { error?: { message?: string }; detail?: string };
				errorMessage = errObj.error?.message || errObj.detail || errorMessage;
			} catch {
				// Response body was not JSON; use status text
			}
			throw new CortexApiError(response.status, errorMessage, responseBody);
		}

		// Handle 204 No Content
		if (response.status === 204) {
			return undefined as unknown as T;
		}

		return response.json();
	}

	// ─── Model Discovery ──────────────────────────────────────────────────

	/**
	 * Lists available models from the /v1/models endpoint.
	 * Handles both standard OpenAI format ({data: [...]}) and
	 * Ollama's format (which may return an array directly).
	 */
	async listModels(): Promise<Array<{ id: string }>> {
		try {
			const response = await this.request<OpenAIModelsResponse | Array<{ id: string; name?: string }>>('/v1/models');
			// Standard OpenAI format: { data: [...] }
			if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
				return response.data;
			}
			// Fallback: raw array
			if (Array.isArray(response)) {
				return response.map(m => ({ id: ('id' in m ? m.id : (m as { name?: string }).name) || 'unknown' }));
			}
			return [];
		} catch {
			return [];
		}
	}

	// ─── Chat Completions ─────────────────────────────────────────────────

	async chatCompletion(request: ICortexChatRequest, overrides?: IModelParameterOverrides): Promise<ICortexChatResponse> {
		return this.request<ICortexChatResponse>('/v1/chat/completions', {
			method: 'POST',
			body: { ...this.normalizeChatBody(request, overrides), stream: false },
		});
	}

	// ─── Text Completions ─────────────────────────────────────────────────

	async textCompletion(request: ICortexCompletionRequest): Promise<ICortexCompletionResponse> {
		return this.request<ICortexCompletionResponse>('/v1/completions', {
			method: 'POST',
			body: { ...request, stream: false },
		});
	}

	// ─── SSE Streaming ────────────────────────────────────────────────────

	/**
	 * Performs an SSE streaming chat completion request.
	 * Parses Server-Sent Events line by line, emitting tokens via the onToken callback.
	 */
	async streamChatCompletion(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		abortSignal?: AbortSignal,
		overrides?: IModelParameterOverrides
	): Promise<ICortexStreamResult> {
		const url = `${this._endpoint}/v1/chat/completions`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (this._apiKey) {
			headers['Authorization'] = `Bearer ${this._apiKey}`;
		}

		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify({ ...this.normalizeChatBody(request, overrides), stream: true, stream_options: { include_usage: true } }),
			signal: abortSignal,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => response.statusText);
			throw new CortexApiError(response.status, errorText);
		}

		if (!response.body) {
			throw new CortexApiError(0, 'Response body is null -- streaming is not supported');
		}

		return this._parseSSEStreamChat(response.body, onToken);
	}

	/**
	 * Performs an SSE streaming text completion request.
	 */
	async streamTextCompletion(
		request: ICortexCompletionRequest,
		onToken: (text: string) => void,
		abortSignal?: AbortSignal
	): Promise<ICortexStreamResult> {
		const url = `${this._endpoint}/v1/completions`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (this._apiKey) {
			headers['Authorization'] = `Bearer ${this._apiKey}`;
		}

		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify({ ...request, stream: true }),
			signal: abortSignal,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => response.statusText);
			throw new CortexApiError(response.status, errorText);
		}

		if (!response.body) {
			throw new CortexApiError(0, 'Response body is null -- streaming is not supported');
		}

		return this._parseSSEStreamText(response.body, onToken);
	}

	// ─── Request Normalization ────────────────────────────────────────────

	/**
	 * Known reasoning model patterns that require special parameter handling.
	 * These models reject standard sampling params (temperature, top_p, etc.)
	 * and require max_completion_tokens instead of max_tokens.
	 */
	private static readonly REASONING_MODEL_PATTERNS: RegExp[] = [
		/^gpt-5/i,          // gpt-5, gpt-5-mini, gpt-5-nano
		/^o1/i,             // o1, o1-mini, o1-preview
		/^o3/i,             // o3, o3-mini
	];

	/**
	 * Parameters that reasoning models (GPT-5, o1, o3) do not support.
	 * These are automatically stripped when a reasoning model is detected.
	 */
	private static readonly REASONING_DROP_PARAMS: string[] = [
		'temperature',
		'top_p',
		'frequency_penalty',
		'presence_penalty',
	];

	/**
	 * Normalizes a chat completion request body for maximum API compatibility.
	 *
	 * Two-layer approach:
	 *   1. Auto-detection: Known reasoning models (gpt-5*, o1*, o3*) have
	 *      unsupported params stripped and max_tokens renamed automatically.
	 *   2. Admin overrides: Per-model overrides from provider config are applied
	 *      on top (dropParams, renameParams, forceParams, extraParams).
	 *      Admin overrides always win over auto-detection.
	 *
	 * @param request - The original chat completion request
	 * @param overrides - Optional per-model overrides from provider config
	 */
	normalizeChatBody(request: ICortexChatRequest, overrides?: IModelParameterOverrides): Record<string, unknown> {
		const body: Record<string, unknown> = { ...request };
		const modelName = (body.model as string) || '';

		// ── Layer 1: Auto-detection for known reasoning models ────────────
		const isReasoningModel = OpenAICompatibleClient.REASONING_MODEL_PATTERNS.some(p => p.test(modelName));

		// Rename max_tokens -> max_completion_tokens (applies to all external providers)
		if (body.max_tokens !== undefined) {
			body.max_completion_tokens = body.max_tokens;
			delete body.max_tokens;
		}

		// Strip unsupported sampling params for reasoning models
		if (isReasoningModel) {
			for (const param of OpenAICompatibleClient.REASONING_DROP_PARAMS) {
				delete body[param];
			}
		}

		// ── Layer 2: Admin-configured per-model overrides ─────────────────
		if (overrides) {
			// Drop params
			if (overrides.dropParams) {
				for (const param of overrides.dropParams) {
					delete body[param];
				}
			}

			// Rename params
			if (overrides.renameParams) {
				for (const [oldName, newName] of Object.entries(overrides.renameParams)) {
					if (body[oldName] !== undefined) {
						body[newName] = body[oldName];
						delete body[oldName];
					}
				}
			}

			// Force params to specific values
			if (overrides.forceParams) {
				for (const [param, value] of Object.entries(overrides.forceParams)) {
					body[param] = value;
				}
			}

			// Inject extra params
			if (overrides.extraParams) {
				for (const [param, value] of Object.entries(overrides.extraParams)) {
					if (body[param] === undefined) {
						body[param] = value;
					}
				}
			}
		}

		return body;
	}

	// ─── SSE Parsing Helpers ──────────────────────────────────────────────

	/**
	 * Parses an SSE stream for chat completions (delta.content format).
	 * Same pattern as CortexClient._parseSSEStream().
	 */
	private async _parseSSEStreamChat(
		body: ReadableStream<Uint8Array>,
		onToken: (chunk: ICortexStreamChunk) => void
	): Promise<ICortexStreamResult> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let totalTokens = 0;
		let capturedUsage: ICortexUsage | undefined;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}

					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const parsed = JSON.parse(data);

						// Capture usage from the final SSE chunk (when stream_options.include_usage was honored).
						// The final chunk has a usage object with prompt_tokens, completion_tokens, total_tokens.
						if (parsed.usage) {
							capturedUsage = {
								prompt_tokens: parsed.usage.prompt_tokens ?? 0,
								completion_tokens: parsed.usage.completion_tokens ?? 0,
								total_tokens: parsed.usage.total_tokens ?? 0,
							};
						}

						const choice = parsed.choices?.[0];
						const delta = choice?.delta;
						if (delta?.content) {
							totalTokens++;
							onToken({
								content: delta.content,
								finish_reason: choice.finish_reason ?? null,
							});
						} else if (choice?.finish_reason) {
							onToken({
								content: '',
								finish_reason: choice.finish_reason,
							});
						}
					} catch {
						// Malformed JSON chunk -- skip and continue
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		return { totalTokens, usage: capturedUsage };
	}

	/**
	 * Parses an SSE stream for text completions (choices[0].text format).
	 */
	private async _parseSSEStreamText(
		body: ReadableStream<Uint8Array>,
		onToken: (text: string) => void
	): Promise<ICortexStreamResult> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let totalTokens = 0;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}

					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const parsed = JSON.parse(data);
						const text = parsed.choices?.[0]?.text;
						if (text) {
							totalTokens++;
							onToken(text);
						}
					} catch {
						// Malformed JSON chunk -- skip and continue
					}
				}
			}
		} finally {
			reader.releaseLock();
		}

		return { totalTokens };
	}

	// ─── Health Check ─────────────────────────────────────────────────────

	/**
	 * Performs a health check by fetching the models endpoint directly.
	 * Unlike listModels(), this does NOT swallow errors -- a failed request
	 * correctly reports the provider as unhealthy.
	 */
	async checkHealth(providerId: string, providerName: string): Promise<IProviderHealthResult> {
		const startTime = Date.now();
		try {
			// Use request() directly so errors propagate (listModels() swallows them)
			const response = await this.request<OpenAIModelsResponse | Array<{ id: string }>>('/v1/models');
			let modelCount = 0;
			if (response && typeof response === 'object' && 'data' in response && Array.isArray((response as OpenAIModelsResponse).data)) {
				modelCount = (response as OpenAIModelsResponse).data.length;
			} else if (Array.isArray(response)) {
				modelCount = response.length;
			}
			const latencyMs = Date.now() - startTime;
			return {
				providerId,
				providerName,
				healthy: true,
				modelCount,
				latencyMs,
			};
		} catch (err) {
			const latencyMs = Date.now() - startTime;
			return {
				providerId,
				providerName,
				healthy: false,
				modelCount: 0,
				latencyMs,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}
