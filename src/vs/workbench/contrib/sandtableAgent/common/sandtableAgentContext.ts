/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICortexMessage } from '../../../../platform/cortex/common/cortex.js';

// ─── Token Estimation ─────────────────────────────────────────────────────────

/**
 * Rough token count estimation. Uses the common heuristic of ~4 characters per token.
 * This is an approximation -- exact tokenization varies by model.
 */
export function estimateTokenCount(text: string): number {
	if (!text) {
		return 0;
	}
	// ~4 characters per token for English text, slightly lower for code
	return Math.ceil(text.length / 3.5);
}

/**
 * Estimate the total token count for a message array.
 */
export function estimateMessagesTokens(messages: ICortexMessage[]): number {
	let total = 0;
	for (const msg of messages) {
		// Role + overhead ~4 tokens per message
		total += 4;
		total += estimateTokenCount(msg.content);

		// Tool calls in assistant messages
		if (msg.tool_calls) {
			for (const tc of msg.tool_calls) {
				total += 4; // overhead for tool call structure
				total += estimateTokenCount(tc.function.name);
				total += estimateTokenCount(tc.function.arguments);
			}
		}

		// Tool call ID
		if (msg.tool_call_id) {
			total += estimateTokenCount(msg.tool_call_id);
		}
	}
	return total;
}

// ─── Context Budget ───────────────────────────────────────────────────────────

/**
 * Calculates the available token budget for context (messages + tool results).
 * @param maxModelLen The model's maximum context window size
 * @param maxTokens The max_tokens reserved for the response
 * @returns Available tokens for the prompt/context
 */
export function calculateContextBudget(maxModelLen: number, maxTokens: number): number {
	const budget = maxModelLen - maxTokens;
	// Ensure at least some minimum context budget
	return Math.max(budget, 1024);
}

// ─── Context Pruning ──────────────────────────────────────────────────────────

/**
 * Prune the message history to fit within the token budget.
 *
 * Strategy:
 * 1. Always keep the system prompt (first message)
 * 2. Always keep the latest user message
 * 3. Summarize old tool results (replace full file contents with brief summaries)
 * 4. Never separate tool_call / tool_result pairs
 * 5. Remove oldest intermediate messages first
 */
export function pruneMessages(
	messages: ICortexMessage[],
	tokenBudget: number,
): ICortexMessage[] {
	// Fast path: if we're within budget, no pruning needed
	const currentTokens = estimateMessagesTokens(messages);
	if (currentTokens <= tokenBudget) {
		return messages;
	}

	const result = [...messages];

	// Phase 1: Summarize tool results that are too long
	// Tool results are role=tool messages. Shorten them.
	for (let i = 1; i < result.length - 1; i++) {
		const msg = result[i];
		if (msg.role === 'tool' && msg.content.length > 500) {
			const contentTokens = estimateTokenCount(msg.content);
			if (contentTokens > 200) {
				// Summarize the tool result
				const summary = summarizeToolResult(msg.content);
				result[i] = {
					...msg,
					content: summary,
				};
			}
		}

		// Check if we're within budget after each summarization
		if (estimateMessagesTokens(result) <= tokenBudget) {
			return result;
		}
	}

	// Phase 2: Remove old intermediate assistant text-only messages
	// Keep system (index 0) and latest user message, plus all tool call/result pairs
	// Walk from oldest (index 1) towards newest
	for (let i = 1; i < result.length - 2; i++) {
		const msg = result[i];

		// Don't remove tool messages (they must stay paired)
		if (msg.role === 'tool') {
			continue;
		}

		// Don't remove assistant messages that contain tool_calls (they pair with tool results)
		if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
			continue;
		}

		// Don't remove the last user message
		if (msg.role === 'user' && i === findLastUserMessageIndex(result)) {
			continue;
		}

		// Safe to summarize this assistant text message
		if (msg.role === 'assistant' && msg.content.length > 100) {
			result[i] = {
				...msg,
				content: '[Earlier assistant response summarized for context]',
			};
		}

		// Check budget
		if (estimateMessagesTokens(result) <= tokenBudget) {
			return result;
		}
	}

	// Phase 3: If still over budget, remove old tool call/result pairs
	// We need to remove them in pairs to keep consistency
	for (let i = 1; i < result.length - 2; i++) {
		const msg = result[i];

		if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
			// Find all corresponding tool result messages
			const toolCallIds = new Set(msg.tool_calls.map(tc => tc.id));
			const pairIndices = [i];

			for (let j = i + 1; j < result.length; j++) {
				if (result[j].role === 'tool' && result[j].tool_call_id && toolCallIds.has(result[j].tool_call_id!)) {
					pairIndices.push(j);
				}
			}

			// Summarize the entire pair
			const toolNames = msg.tool_calls.map(tc => tc.function.name).join(', ');
			result[i] = {
				role: 'assistant',
				content: `[Earlier step: called ${toolNames}]`,
			};

			// Remove the tool result messages (replace with empty markers that we'll filter)
			for (let k = 1; k < pairIndices.length; k++) {
				result[pairIndices[k]] = {
					role: 'tool',
					content: '',
					tool_call_id: result[pairIndices[k]].tool_call_id,
				};
			}

			// Check budget
			if (estimateMessagesTokens(result) <= tokenBudget) {
				break;
			}
		}
	}

	// Filter out empty tool results from Phase 3
	return result.filter(msg => !(msg.role === 'tool' && msg.content === ''));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Summarize a long tool result into a brief description.
 */
function summarizeToolResult(content: string): string {
	const lineCount = content.split('\n').length;

	// Check if it looks like file content (numbered lines)
	if (/^\s*\d+\|/.test(content)) {
		const firstLine = content.split('\n')[0];
		return `[File content: ${lineCount} lines. First line: ${firstLine.substring(0, 80)}...]`;
	}

	// Check if it looks like a directory listing
	if (content.includes('[dir]') || content.includes('[file]')) {
		const itemCount = content.split('\n').filter(l => l.trim()).length;
		return `[Directory listing: ${itemCount} items]`;
	}

	// Check if it looks like search results
	if (content.includes('matches found') || /\d+:/.test(content)) {
		return `[Search results: ${lineCount} lines of output]`;
	}

	// Check if it looks like command output
	if (content.startsWith('Exit code:') || content.includes('stdout:') || content.includes('stderr:')) {
		const truncated = content.substring(0, 200);
		return `[Command output truncated: ${truncated}...]`;
	}

	// Generic fallback
	return `[Tool output: ${lineCount} lines, ${content.length} chars. Preview: ${content.substring(0, 150)}...]`;
}

/**
 * Find the index of the last user message in the array.
 */
function findLastUserMessageIndex(messages: ICortexMessage[]): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user') {
			return i;
		}
	}
	return -1;
}
