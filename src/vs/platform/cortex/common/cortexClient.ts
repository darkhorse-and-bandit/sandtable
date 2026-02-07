/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CortexApiError,
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
	ICortexSessionMessage,
	ICortexStreamChunk,
	ICortexStreamResult,
	ICortexSystemSummary,
	ICortexThroughput,
} from './cortex.js';

// ─── Request Options ──────────────────────────────────────────────────────────

interface RequestOptions {
	method?: string;
	body?: unknown;
	abortSignal?: AbortSignal;
	/** If true, use session cookie auth instead of API key */
	useSessionAuth?: boolean;
}

// ─── CortexClient ─────────────────────────────────────────────────────────────

/**
 * HTTP client for communicating with Cortex gateway.
 * Handles both standard request/response and SSE streaming patterns.
 * Uses the standard fetch API -- no external dependencies.
 */
export class CortexClient {

	private _endpoint: string;
	private _apiKey: string;
	private _sessionCookie: string | undefined;

	constructor(endpoint: string, apiKey: string) {
		this._endpoint = endpoint.replace(/\/+$/, ''); // Strip trailing slashes
		this._apiKey = apiKey;
	}

	// ─── Configuration ────────────────────────────────────────────────────

	updateEndpoint(endpoint: string): void {
		this._endpoint = endpoint.replace(/\/+$/, '');
	}

	updateApiKey(apiKey: string): void {
		this._apiKey = apiKey;
	}

	setSessionCookie(cookie: string | undefined): void {
		this._sessionCookie = cookie;
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

		if (options.useSessionAuth && this._sessionCookie) {
			headers['Cookie'] = `cortex_session=${this._sessionCookie}`;
		} else if (this._apiKey) {
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

	// ─── SSE Streaming ────────────────────────────────────────────────────

	/**
	 * Performs an SSE streaming chat completion request.
	 * Parses Server-Sent Events line by line, emitting tokens via the onToken callback.
	 * Handles partial JSON across chunk boundaries via buffering.
	 */
	async streamChatCompletion(
		request: ICortexChatRequest,
		onToken: (chunk: ICortexStreamChunk) => void,
		abortSignal?: AbortSignal
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

		return this._parseSSEStream(response.body, onToken);
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

	/**
	 * Performs an SSE streaming FIM completion request.
	 */
	async streamFimCompletion(
		request: ICortexFimRequest,
		onToken: (text: string) => void,
		abortSignal?: AbortSignal
	): Promise<ICortexStreamResult> {
		const url = `${this._endpoint}/v1/fim/completions`;
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

	// ─── SSE Parsing Helpers ──────────────────────────────────────────────

	/**
	 * Parses an SSE stream for chat completions (delta.content format).
	 */
	private async _parseSSEStream(
		body: ReadableStream<Uint8Array>,
		onToken: (chunk: ICortexStreamChunk) => void
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

		return { totalTokens };
	}

	/**
	 * Parses an SSE stream for text/FIM completions (choices[0].text format).
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

	async checkHealth(): Promise<CortexHealthResult> {
		const startTime = Date.now();
		try {
			const models = await this.listRunningModels();
			const latencyMs = Date.now() - startTime;
			return {
				healthy: true,
				modelCount: models.length,
				latencyMs,
			};
		} catch {
			const latencyMs = Date.now() - startTime;
			return {
				healthy: false,
				modelCount: 0,
				latencyMs,
			};
		}
	}

	// ─── Model Discovery ──────────────────────────────────────────────────

	async listRunningModels(): Promise<ICortexModel[]> {
		return this.request<ICortexModel[]>('/v1/models/running');
	}

	async getModelConstraints(modelName: string): Promise<ICortexModelConstraints> {
		return this.request<ICortexModelConstraints>(`/v1/models/${encodeURIComponent(modelName)}/constraints`);
	}

	// ─── IDE Status ───────────────────────────────────────────────────────

	async getIDEStatus(): Promise<ICortexIDEStatus> {
		return this.request<ICortexIDEStatus>('/v1/ide/status');
	}

	// ─── Inference (non-streaming) ────────────────────────────────────────

	async chatCompletion(request: ICortexChatRequest): Promise<ICortexChatResponse> {
		return this.request<ICortexChatResponse>('/v1/chat/completions', {
			method: 'POST',
			body: { ...request, stream: false },
		});
	}

	async textCompletion(request: ICortexCompletionRequest): Promise<ICortexCompletionResponse> {
		return this.request<ICortexCompletionResponse>('/v1/completions', {
			method: 'POST',
			body: { ...request, stream: false },
		});
	}

	async fimCompletion(request: ICortexFimRequest): Promise<ICortexCompletionResponse> {
		return this.request<ICortexCompletionResponse>('/v1/fim/completions', {
			method: 'POST',
			body: { ...request, stream: false },
		});
	}

	// ─── Admin API ────────────────────────────────────────────────────────

	async listAllModels(): Promise<ICortexModelDetail[]> {
		return this.request<ICortexModelDetail[]>('/admin/models', { useSessionAuth: true });
	}

	async startModel(modelId: number): Promise<void> {
		await this.request<void>(`/admin/models/${modelId}/start`, {
			method: 'POST',
			useSessionAuth: true,
		});
	}

	async stopModel(modelId: number): Promise<void> {
		await this.request<void>(`/admin/models/${modelId}/stop`, {
			method: 'POST',
			useSessionAuth: true,
		});
	}

	async getModelLogs(modelId: number, diagnose?: boolean): Promise<string> {
		const query = diagnose ? '?diagnose=true' : '';
		return this.request<string>(`/admin/models/${modelId}/logs${query}`, { useSessionAuth: true });
	}

	async dryRunModel(modelId: number): Promise<ICortexDryRunResult> {
		return this.request<ICortexDryRunResult>(`/admin/models/${modelId}/dry-run`, {
			method: 'POST',
			useSessionAuth: true,
		});
	}

	// ─── System Monitoring ────────────────────────────────────────────────

	async getSystemSummary(): Promise<ICortexSystemSummary> {
		return this.request<ICortexSystemSummary>('/admin/system/summary', { useSessionAuth: true });
	}

	async getGPUMetrics(): Promise<ICortexGPUMetric[]> {
		return this.request<ICortexGPUMetric[]>('/admin/system/gpus', { useSessionAuth: true });
	}

	async getThroughputMetrics(): Promise<ICortexThroughput> {
		return this.request<ICortexThroughput>('/admin/system/throughput', { useSessionAuth: true });
	}

	// ─── Chat Sessions ────────────────────────────────────────────────────

	async listChatSessions(): Promise<ICortexChatSession[]> {
		return this.request<ICortexChatSession[]>('/v1/chat/sessions', { useSessionAuth: true });
	}

	async getChatSession(sessionId: string): Promise<ICortexChatSessionDetail> {
		return this.request<ICortexChatSessionDetail>(`/v1/chat/sessions/${encodeURIComponent(sessionId)}`, { useSessionAuth: true });
	}

	async createChatSession(createRequest: ICortexCreateSessionRequest): Promise<ICortexChatSession> {
		return this.request<ICortexChatSession>('/v1/chat/sessions', {
			method: 'POST',
			body: createRequest,
			useSessionAuth: true,
		});
	}

	async addMessageToSession(sessionId: string, message: ICortexSessionMessage): Promise<void> {
		await this.request<void>(`/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
			method: 'POST',
			body: message,
			useSessionAuth: true,
		});
	}

	async deleteChatSession(sessionId: string): Promise<void> {
		await this.request<void>(`/v1/chat/sessions/${encodeURIComponent(sessionId)}`, {
			method: 'DELETE',
			useSessionAuth: true,
		});
	}

	// ─── Admin Authentication ─────────────────────────────────────────────

	/**
	 * Logs in to Cortex admin API and stores the session cookie.
	 * Returns true on success, false on failure.
	 */
	async login(username: string, password: string): Promise<boolean> {
		try {
			const url = `${this._endpoint}/auth/login`;
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password }),
				credentials: 'include',
			});

			if (!response.ok) {
				this._sessionCookie = undefined;
				return false;
			}

			// Extract session cookie from Set-Cookie header
			const setCookie = response.headers.get('set-cookie');
			if (setCookie) {
				const match = setCookie.match(/cortex_session=([^;]+)/);
				if (match) {
					this._sessionCookie = match[1];
					return true;
				}
			}

			// Fallback: try to get token from response body
			try {
				const body = await response.json() as { session_token?: string };
				if (body.session_token) {
					this._sessionCookie = body.session_token;
					return true;
				}
			} catch {
				// No JSON body
			}

			return false;
		} catch {
			this._sessionCookie = undefined;
			return false;
		}
	}
}
