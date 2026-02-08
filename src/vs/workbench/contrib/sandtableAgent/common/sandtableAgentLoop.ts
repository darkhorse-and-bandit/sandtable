/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import {
	ICortexService,
	ICortexMessage,
	ICortexToolCall,
	ICortexToolDefinition,
} from '../../../../platform/cortex/common/cortex.js';
import { ALL_AGENT_TOOLS, AGENT_SYSTEM_PROMPT, getToolDisplayLabel } from './sandtableAgentTools.js';
import { requiresConfirmation, parseToolCallArgs, TOOL_DECLINED_MESSAGE } from './sandtableAgentSafety.js';
import { estimateMessagesTokens, calculateContextBudget, pruneMessages } from './sandtableAgentContext.js';

// ─── Agent Event Types ────────────────────────────────────────────────────────

export interface IAgentEvent {
	type: 'message' | 'tool_executing' | 'tool_executed' | 'tool_confirmation' | 'iteration' | 'max_iterations' | 'stopped' | 'error' | 'no_tool_model';
}

export interface IAgentMessageEvent extends IAgentEvent {
	type: 'message';
	content: string;
}

export interface IAgentToolExecutingEvent extends IAgentEvent {
	type: 'tool_executing';
	toolCall: ICortexToolCall;
	label: string;
}

export interface IAgentToolExecutedEvent extends IAgentEvent {
	type: 'tool_executed';
	toolCall: ICortexToolCall;
	result: string;
	label: string;
}

export interface IAgentToolConfirmationEvent extends IAgentEvent {
	type: 'tool_confirmation';
	toolCall: ICortexToolCall;
	parsedArgs: Record<string, unknown>;
	resolve: (accepted: boolean) => void;
}

export interface IAgentIterationEvent extends IAgentEvent {
	type: 'iteration';
	current: number;
	max: number;
}

export interface IAgentMaxIterationsEvent extends IAgentEvent {
	type: 'max_iterations';
	iterations: number;
}

export interface IAgentStoppedEvent extends IAgentEvent {
	type: 'stopped';
}

export interface IAgentErrorEvent extends IAgentEvent {
	type: 'error';
	message: string;
}

export interface IAgentNoToolModelEvent extends IAgentEvent {
	type: 'no_tool_model';
	message: string;
}

export type AgentEvent =
	| IAgentMessageEvent
	| IAgentToolExecutingEvent
	| IAgentToolExecutedEvent
	| IAgentToolConfirmationEvent
	| IAgentIterationEvent
	| IAgentMaxIterationsEvent
	| IAgentStoppedEvent
	| IAgentErrorEvent
	| IAgentNoToolModelEvent;

// ─── Tool Executor Interface ──────────────────────────────────────────────────

/**
 * Interface for executing agent tools. Implemented in the browser/ layer
 * since tool execution needs access to VS Code workspace APIs.
 */
export interface IAgentToolExecutor {
	executeTool(toolName: string, args: Record<string, unknown>): Promise<string>;
}

// ─── Agent Loop Result ────────────────────────────────────────────────────────

export interface IAgentLoopResult {
	success: boolean;
	iterations: number;
	reason?: 'completed' | 'max_iterations' | 'stopped' | 'error' | 'no_tool_model';
}

export type ModelSelectionReason = 'configured' | 'auto_tool' | 'auto_fallback' | 'no_models' | 'no_running';

export interface IModelSelectionResult {
	model: string | undefined;
	reason: ModelSelectionReason;
}

// ─── Agent Loop ───────────────────────────────────────────────────────────────

/**
 * Core agent loop. Sends messages with tools to Cortex, parses responses,
 * executes tool calls, collects results, and repeats until the model
 * returns a text-only response or max iterations are reached.
 *
 * This class lives in common/ and does not depend on browser APIs.
 * Tool execution is delegated to an IAgentToolExecutor implementation.
 */
export class SandtableAgentLoop extends Disposable {

	private readonly _onEvent = this._register(new Emitter<AgentEvent>());
	readonly onEvent: Event<AgentEvent> = this._onEvent.event;

	private _isRunning = false;
	private _cancelled = false;

	constructor(
		private readonly cortexService: ICortexService,
	) {
		super();
	}

	get isRunning(): boolean {
		return this._isRunning;
	}

	/**
	 * Run the agent loop.
	 *
	 * @param userMessage The initial user message
	 * @param toolExecutor The executor that performs tool calls
	 * @param model The model name to use
	 * @param maxIterations Maximum iterations
	 * @param maxTokens Max tokens per response
	 * @param confirmDestructive Whether to require confirmation for destructive tools
	 * @param cancellation Cancellation token
	 */
	async run(
		userMessage: string,
		toolExecutor: IAgentToolExecutor,
		model: string,
		maxIterations: number,
		maxTokens: number,
		confirmDestructive: boolean,
		cancellation?: CancellationToken,
	): Promise<IAgentLoopResult> {
		if (this._isRunning) {
			return { success: false, iterations: 0, reason: 'error' };
		}

		this._isRunning = true;
		this._cancelled = false;

		try {
			return await this._runLoop(
				userMessage,
				toolExecutor,
				model,
				maxIterations,
				maxTokens,
				confirmDestructive,
				cancellation,
			);
		} finally {
			this._isRunning = false;
		}
	}

	/**
	 * Stop the agent loop.
	 */
	stop(): void {
		this._cancelled = true;
	}

	private async _runLoop(
		userMessage: string,
		toolExecutor: IAgentToolExecutor,
		model: string,
		maxIterations: number,
		maxTokens: number,
		confirmDestructive: boolean,
		cancellation?: CancellationToken,
	): Promise<IAgentLoopResult> {

		// Get model constraints for context budget
		let contextBudget = 128000 - maxTokens; // default fallback
		try {
			const constraints = await this.cortexService.getModelConstraints(model);
			contextBudget = calculateContextBudget(constraints.max_model_len, maxTokens);
		} catch {
			// Use default if constraints fetch fails
		}

		// Build initial messages
		const messages: ICortexMessage[] = [
			{ role: 'system', content: AGENT_SYSTEM_PROMPT },
			{ role: 'user', content: userMessage },
		];

		const tools: ICortexToolDefinition[] = ALL_AGENT_TOOLS;
		let iteration = 0;

		while (iteration < maxIterations) {
			// Check cancellation
			if (this._cancelled || cancellation?.isCancellationRequested) {
				this._onEvent.fire({ type: 'stopped' });
				return { success: false, iterations: iteration, reason: 'stopped' };
			}

			iteration++;
			this._onEvent.fire({ type: 'iteration', current: iteration, max: maxIterations });

			// Prune context if needed
			const prunedMessages = pruneMessages(messages, contextBudget);

			// Call Cortex
			let response;
			try {
				response = await this.cortexService.chatCompletion({
					model,
					messages: prunedMessages,
					tools,
					temperature: 0.3,
					max_tokens: maxTokens,
				});
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				this._onEvent.fire({ type: 'error', message: `Cortex API error: ${errorMsg}` });
				return { success: false, iterations: iteration, reason: 'error' };
			}

			// Check cancellation after API call
			if (this._cancelled || cancellation?.isCancellationRequested) {
				this._onEvent.fire({ type: 'stopped' });
				return { success: false, iterations: iteration, reason: 'stopped' };
			}

			const choice = response.choices?.[0];
			if (!choice) {
				this._onEvent.fire({ type: 'error', message: 'No response from model.' });
				return { success: false, iterations: iteration, reason: 'error' };
			}

			const assistantMessage = choice.message;
			const toolCalls = assistantMessage.tool_calls;

			if (toolCalls && toolCalls.length > 0) {
				// Response has tool calls -- execute them
				messages.push({
					role: 'assistant',
					content: assistantMessage.content || '',
					tool_calls: toolCalls,
				});

				// If there's text content alongside tool calls, emit it
				if (assistantMessage.content) {
					this._onEvent.fire({ type: 'message', content: assistantMessage.content });
				}

				for (const toolCall of toolCalls) {
					// Check cancellation before each tool
					if (this._cancelled || cancellation?.isCancellationRequested) {
						this._onEvent.fire({ type: 'stopped' });
						return { success: false, iterations: iteration, reason: 'stopped' };
					}

					const parsedArgs = parseToolCallArgs(toolCall);
					const toolName = toolCall.function.name;
					const displayLabel = getToolDisplayLabel(toolName, parsedArgs);

					// Check if tool needs confirmation
					if (requiresConfirmation(toolName, confirmDestructive)) {
						const accepted = await this._requestConfirmation(toolCall, parsedArgs);

						if (!accepted) {
							// User rejected the action
							messages.push({
								role: 'tool',
								content: TOOL_DECLINED_MESSAGE,
								tool_call_id: toolCall.id,
							});
							this._onEvent.fire({
								type: 'tool_executed',
								toolCall,
								result: TOOL_DECLINED_MESSAGE,
								label: displayLabel,
							});
							continue;
						}
					}

					// Execute the tool
					this._onEvent.fire({
						type: 'tool_executing',
						toolCall,
						label: displayLabel,
					});

					let result: string;
					try {
						result = await toolExecutor.executeTool(toolName, parsedArgs);
					} catch (err) {
						result = `Error executing ${toolName}: ${err instanceof Error ? err.message : String(err)}`;
					}

					// Add tool result to messages
					messages.push({
						role: 'tool',
						content: result,
						tool_call_id: toolCall.id,
					});

					this._onEvent.fire({
						type: 'tool_executed',
						toolCall,
						result,
						label: displayLabel,
					});
				}

			} else {
				// Text-only response -- agent is done
				const content = assistantMessage.content || '';
				if (content) {
					this._onEvent.fire({ type: 'message', content });
				}
				return { success: true, iterations: iteration, reason: 'completed' };
			}
		}

		// Max iterations reached
		this._onEvent.fire({
			type: 'max_iterations',
			iterations: maxIterations,
		});
		return { success: false, iterations: maxIterations, reason: 'max_iterations' };
	}

	/**
	 * Request confirmation from the user for a destructive tool call.
	 * Emits a confirmation event and returns a promise that resolves
	 * when the user accepts or rejects.
	 */
	private _requestConfirmation(
		toolCall: ICortexToolCall,
		parsedArgs: Record<string, unknown>,
	): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this._onEvent.fire({
				type: 'tool_confirmation',
				toolCall,
				parsedArgs,
				resolve,
			});
		});
	}

	/**
	 * Select a model for the agent. Uses the configured model if set,
	 * otherwise scans running models across all providers for one that
	 * supports tool calling. Supports compound model names (e.g., "cortex::model").
	 * Returns a result with the selected model and the reason for the selection.
	 */
	async selectModel(configuredModel: string): Promise<IModelSelectionResult> {
		// If a specific model is configured, use it (supports compound names)
		if (configuredModel) {
			return { model: configuredModel, reason: 'configured' };
		}

		// Otherwise, scan running models from all providers
		try {
			const runningModels = await this.cortexService.listRunningModels();
			if (runningModels.length === 0) {
				return { model: undefined, reason: 'no_models' };
			}

			const running = runningModels.filter(m => m.state === 'running');
			if (running.length === 0) {
				return { model: undefined, reason: 'no_running' };
			}

			// Try to find one that supports tool calling across all providers
			for (const model of running) {
				try {
					const constraints = await this.cortexService.getModelConstraints(model.served_model_name);
					if (constraints.supports_tool_calling) {
						return { model: model.served_model_name, reason: 'auto_tool' };
					}
				} catch {
					// Skip if we can't get constraints (e.g., external providers)
				}
			}

			// Fallback: prefer Cortex models over external ones
			const cortexModels = running.filter(m => m.engine_type !== 'external');
			if (cortexModels.length > 0) {
				return { model: cortexModels[0].served_model_name, reason: 'auto_fallback' };
			}
			return { model: running[0].served_model_name, reason: 'auto_fallback' };

		} catch {
			return { model: undefined, reason: 'no_models' };
		}
	}

	// ─── Token Usage Info ─────────────────────────────────────────────────

	/**
	 * Get estimated token usage for a set of messages.
	 * Useful for UI display.
	 */
	estimateTokenUsage(messages: ICortexMessage[]): number {
		return estimateMessagesTokens(messages);
	}
}
