/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICortexToolCall } from '../../../../platform/cortex/common/cortex.js';
import { DESTRUCTIVE_TOOL_NAMES } from './sandtableAgentTools.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Describes a pending confirmation request for a destructive tool call.
 */
export interface IAgentConfirmationRequest {
	/** The tool call that needs approval */
	readonly toolCall: ICortexToolCall;
	/** Parsed arguments for display */
	readonly parsedArgs: Record<string, unknown>;
	/** Resolve with true = accepted, false = rejected */
	resolve: (accepted: boolean) => void;
}

/**
 * Describes the type of confirmation UI to display.
 */
export type ConfirmationDisplayType = 'diff' | 'file-preview' | 'command';

// ─── Safety Functions ─────────────────────────────────────────────────────────

/**
 * Determines whether a tool call requires user confirmation.
 * @param toolName The name of the tool
 * @param confirmDestructive Whether the user has enabled destructive confirmations
 * @returns true if the tool needs user approval before execution
 */
export function requiresConfirmation(toolName: string, confirmDestructive: boolean): boolean {
	// run_command always requires confirmation regardless of setting
	if (toolName === 'run_command') {
		return true;
	}

	// edit_file and create_file require confirmation when the setting is enabled
	if (confirmDestructive && DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
		return true;
	}

	return false;
}

/**
 * Determines the type of confirmation display to use for a tool.
 */
export function getConfirmationDisplayType(toolName: string): ConfirmationDisplayType {
	switch (toolName) {
		case 'edit_file':
			return 'diff';
		case 'create_file':
			return 'file-preview';
		case 'run_command':
			return 'command';
		default:
			return 'command';
	}
}

/**
 * Safely parse tool call arguments from JSON string.
 * Returns an empty object if parsing fails.
 */
export function parseToolCallArgs(toolCall: ICortexToolCall): Record<string, unknown> {
	try {
		return JSON.parse(toolCall.function.arguments);
	} catch {
		return {};
	}
}

/**
 * Get a user-readable description of a tool call for the confirmation dialog.
 */
export function getConfirmationTitle(toolName: string, args: Record<string, unknown>): string {
	switch (toolName) {
		case 'edit_file':
			return `Agent wants to edit ${args['path'] ?? 'a file'}`;
		case 'create_file':
			return `Agent wants to create ${args['path'] ?? 'a file'}`;
		case 'run_command':
			return 'Agent wants to run a command';
		default:
			return `Agent wants to execute ${toolName}`;
	}
}

/**
 * The message added to tool results when a user declines an action.
 */
export const TOOL_DECLINED_MESSAGE = 'User declined this action.';
