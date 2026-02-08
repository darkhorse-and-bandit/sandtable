/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IPosition, Position } from '../../../../editor/common/core/position.js';
import { ITextModel } from '../../../../editor/common/model.js';
import {
	InlineCompletion,
	InlineCompletionContext,
	InlineCompletions,
	InlineCompletionsProvider,
	InlineCompletionsDisposeReason,
} from '../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICortexService } from '../../../../platform/cortex/common/cortex.js';
import {
	CompletionConfigKeys,
	COMPLETION_DEFAULT_DEBOUNCE_MS,
	COMPLETION_DEFAULT_MAX_TOKENS,
	COMPLETION_DEFAULT_TEMPERATURE,
	COMPLETION_DEFAULT_CONTEXT_LINES,
} from '../../../../platform/cortex/common/cortexConfiguration.js';
import { extractFimContext, buildInsertionRange } from './sandtableFimPromptBuilder.js';
import { SandtableCompletionCache } from './sandtableCompletionCache.js';

// ─── Completion Result Type ───────────────────────────────────────────────────

/**
 * Wrapper around InlineCompletions that holds our completion items.
 * VS Code calls `disposeInlineCompletions` when it's done with these.
 */
interface SandtableInlineCompletions extends InlineCompletions {
	readonly items: readonly InlineCompletion[];
}

// ─── Provider Implementation ──────────────────────────────────────────────────

/**
 * Provides inline code completions (ghost text) powered by Cortex FIM inference.
 *
 * When the user pauses typing, VS Code calls `provideInlineCompletionItems`.
 * This provider:
 * 1. Checks if completion is enabled
 * 2. Checks the cache for a previously computed completion
 * 3. Extracts FIM context (prefix/suffix) from the editor
 * 4. Calls the Cortex FIM endpoint via streaming
 * 5. Caches the result for subsequent requests
 * 6. Returns the completion as ghost text
 *
 * The provider also handles:
 * - Debouncing via the built-in `debounceDelayMs` property
 * - Cancellation of in-flight requests when a new keystroke arrives
 * - Graceful error handling when the FIM endpoint is unavailable
 */
export class SandtableInlineCompletionProvider implements InlineCompletionsProvider<SandtableInlineCompletions> {

	/** Display name shown in VS Code UI */
	readonly displayName = 'Sandtable';

	/** Completion cache to avoid redundant API calls */
	private readonly _cache: SandtableCompletionCache;

	/** Whether the first request has been logged (to avoid log spam) */
	private _hasLoggedFirstRequest = false;

	/** Whether a FIM endpoint error has already been logged (to avoid log spam) */
	private _hasLoggedFimUnavailable = false;

	constructor(
		private readonly _cortexService: ICortexService,
		private readonly _configService: IConfigurationService,
		private readonly _logService: ILogService,
	) {
		this._cache = new SandtableCompletionCache();

		this._logService.info('[Sandtable Completion] Provider initialized');
	}

	/** Built-in VS Code debounce -- provider won't be called until this delay passes.
	 *  Implemented as a getter so changes to the setting take effect immediately. */
	get debounceDelayMs(): number {
		return this._configService.getValue<number>(CompletionConfigKeys.DebounceMs) ?? COMPLETION_DEFAULT_DEBOUNCE_MS;
	}

	// ─── InlineCompletionsProvider Interface ──────────────────────────────

	/**
	 * Called by VS Code when inline completions are requested.
	 * This is the core method that orchestrates the FIM completion flow.
	 */
	async provideInlineCompletions(
		model: ITextModel,
		position: Position,
		_context: InlineCompletionContext,
		token: CancellationToken,
	): Promise<SandtableInlineCompletions> {
		const emptyResult: SandtableInlineCompletions = { items: [] };

		// 0. Check if completion is enabled
		const enabled = this._configService.getValue<boolean>(CompletionConfigKeys.Enabled) ?? true;
		if (!enabled) {
			return emptyResult;
		}

		// 1. Check if Cortex is connected
		const connectionStatus = this._cortexService.getConnectionStatus();
		if (connectionStatus !== 'connected') {
			return emptyResult;
		}

		// 2. Extract FIM context from the editor
		const maxContextLines = this._configService.getValue<number>(CompletionConfigKeys.ContextLines) ?? COMPLETION_DEFAULT_CONTEXT_LINES;
		const fimContext = extractFimContext(model, position, maxContextLines);

		// Skip if prefix is too short (e.g., blank file with just whitespace)
		if (fimContext.prefix.trim().length < 2) {
			return emptyResult;
		}

		// 3. Check cache for a previously computed completion
		const cachedCompletion = this._cache.get(fimContext.prefix, fimContext.suffix, position);
		if (cachedCompletion) {
			this._logService.trace('[Sandtable Completion] Cache hit');
			return this._buildResult(cachedCompletion, position);
		}

		// 4. Early exit if already cancelled (user kept typing)
		if (token.isCancellationRequested) {
			return emptyResult;
		}

		// 5. Determine which model to use
		const completionModel = await this._resolveModel();
		if (!completionModel) {
			return emptyResult;
		}

		// 6. Call Cortex FIM endpoint
		const maxTokens = this._configService.getValue<number>(CompletionConfigKeys.MaxTokens) ?? COMPLETION_DEFAULT_MAX_TOKENS;
		const temperature = this._configService.getValue<number>(CompletionConfigKeys.Temperature) ?? COMPLETION_DEFAULT_TEMPERATURE;

		if (!this._hasLoggedFirstRequest) {
			this._logService.info(`[Sandtable Completion] First FIM request: model=${completionModel}, lang=${fimContext.language}, line=${fimContext.lineNumber}`);
			this._hasLoggedFirstRequest = true;
		}

		try {
			let completionText = '';

			await this._cortexService.fimCompletionStream(
				{
					model: completionModel,
					prefix: fimContext.prefix,
					suffix: fimContext.suffix,
					max_tokens: maxTokens,
					temperature: temperature,
					stream: true,
				},
				(text: string) => {
					completionText += text;
				},
				token,
			);

			// Check if cancelled during streaming
			if (token.isCancellationRequested) {
				return emptyResult;
			}

			// Trim trailing whitespace-only completions
			completionText = this._cleanCompletion(completionText);

			if (!completionText) {
				return emptyResult;
			}

			// 7. Cache the result
			this._cache.set(fimContext.prefix, fimContext.suffix, completionText, position, completionModel);

			// Reset the "FIM unavailable" flag since it worked
			this._hasLoggedFimUnavailable = false;

			this._logService.trace(`[Sandtable Completion] Generated ${completionText.length} chars from ${completionModel}`);

			// 8. Return as InlineCompletionItem
			return this._buildResult(completionText, position);

		} catch (err: unknown) {
			// Handle cancellation (expected during rapid typing)
			if (this._isCancellationError(err)) {
				return emptyResult;
			}

			// Log FIM endpoint errors (only once to avoid spam)
			if (!this._hasLoggedFimUnavailable) {
				const message = err instanceof Error ? err.message : String(err);
				this._logService.warn(`[Sandtable Completion] FIM request failed: ${message}. The Cortex FIM endpoint (POST /v1/fim/completions) may not be available yet.`);
				this._hasLoggedFimUnavailable = true;
			}

			return emptyResult;
		}
	}

	/**
	 * Called by VS Code when an InlineCompletions result is no longer needed.
	 * Required by the InlineCompletionsProvider interface.
	 */
	disposeInlineCompletions(_completions: SandtableInlineCompletions, _reason: InlineCompletionsDisposeReason): void {
		// Nothing to dispose -- our completions are simple data objects
	}

	// ─── Private Helpers ──────────────────────────────────────────────────

	/**
	 * Resolves the model to use for FIM completions.
	 * Uses the configured model if set, otherwise auto-detects from running models.
	 *
	 * Multi-provider aware: prefers Cortex models (which support FIM) over
	 * external providers. Supports compound model names (e.g., "cortex::codestral").
	 */
	private async _resolveModel(): Promise<string | null> {
		// Check if user explicitly configured a model (supports compound names)
		const configuredModel = this._configService.getValue<string>(CompletionConfigKeys.Model);
		if (configuredModel) {
			return configuredModel;
		}

		// Auto-detect: pick the best FIM-capable model across all providers
		try {
			const models = await this._cortexService.listRunningModels();
			if (models.length === 0) {
				return null;
			}

			// Prefer Cortex models (non-external) since they support the FIM endpoint
			const cortexModels = models.filter(m => m.engine_type !== 'external');
			const searchPool = cortexModels.length > 0 ? cortexModels : models;

			// Prefer models that are likely FIM-capable (by name heuristic)
			const fimPreferred = ['codestral', 'deepseek-coder', 'starcoder', 'qwen-coder', 'fim'];
			for (const model of searchPool) {
				const name = model.served_model_name.toLowerCase();
				if (fimPreferred.some(hint => name.includes(hint))) {
					return model.served_model_name;
				}
			}

			// Fallback to the first model in the search pool
			return searchPool[0].served_model_name;
		} catch {
			return null;
		}
	}

	/**
	 * Builds an InlineCompletions result from completion text.
	 */
	private _buildResult(completionText: string, position: IPosition): SandtableInlineCompletions {
		const range = buildInsertionRange(position);

		const item: InlineCompletion = {
			insertText: completionText,
			range,
		};

		return {
			items: [item],
			// Enable forward stability: if the user types characters that match the
			// beginning of the suggestion, the suggestion remains stable rather than
			// being re-fetched.
			enableForwardStability: true,
		};
	}

	/**
	 * Cleans up a raw completion from the model.
	 * Removes trailing whitespace-only content and trims excessive blank lines.
	 */
	private _cleanCompletion(text: string): string {
		if (!text) {
			return '';
		}

		// Remove trailing whitespace-only lines (but keep trailing newline if there's content)
		let cleaned = text.replace(/\n\s*$/, '');

		// If the completion is purely whitespace, discard it
		if (!cleaned.trim()) {
			return '';
		}

		// Limit to a reasonable number of lines (avoid runaway completions)
		const lines = cleaned.split('\n');
		if (lines.length > 15) {
			// Find a natural stopping point (end of a block, blank line, etc.)
			let cutoff = 15;
			for (let i = 10; i < lines.length && i <= 15; i++) {
				const trimmed = lines[i].trim();
				if (trimmed === '' || trimmed === '}' || trimmed === ')' || trimmed === ']') {
					cutoff = i + 1;
					break;
				}
			}
			cleaned = lines.slice(0, cutoff).join('\n');
		}

		return cleaned;
	}

	/**
	 * Checks if an error is a cancellation/abort error (expected during rapid typing).
	 */
	private _isCancellationError(err: unknown): boolean {
		if (err instanceof Error) {
			return err.name === 'AbortError' || err.name === 'CancellationError' || err.message.includes('cancelled') || err.message.includes('aborted');
		}
		return false;
	}
}
