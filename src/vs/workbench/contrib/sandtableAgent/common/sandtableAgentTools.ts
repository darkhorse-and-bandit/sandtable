/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICortexToolDefinition } from '../../../../platform/cortex/common/cortex.js';

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const AGENT_TOOL_READ_FILE: ICortexToolDefinition = {
	type: 'function',
	function: {
		name: 'read_file',
		description: 'Read the contents of a file in the workspace. Returns the file text with line numbers.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Relative path to the file from workspace root (e.g., \'src/utils/auth.ts\')',
				},
				start_line: {
					type: 'integer',
					description: 'Optional starting line number (1-indexed). If omitted, reads from beginning.',
				},
				end_line: {
					type: 'integer',
					description: 'Optional ending line number (inclusive). If omitted, reads to end.',
				},
			},
			required: ['path'],
		},
	},
};

export const AGENT_TOOL_EDIT_FILE: ICortexToolDefinition = {
	type: 'function',
	function: {
		name: 'edit_file',
		description: 'Replace a specific text string in a file. The old_text must match exactly (including whitespace and indentation). Use read_file first to see the current content.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Relative path to the file from workspace root',
				},
				old_text: {
					type: 'string',
					description: 'The exact text to find and replace. Must be unique within the file.',
				},
				new_text: {
					type: 'string',
					description: 'The replacement text',
				},
			},
			required: ['path', 'old_text', 'new_text'],
		},
	},
};

export const AGENT_TOOL_CREATE_FILE: ICortexToolDefinition = {
	type: 'function',
	function: {
		name: 'create_file',
		description: 'Create a new file with the given contents. Will fail if the file already exists.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Relative path for the new file from workspace root',
				},
				contents: {
					type: 'string',
					description: 'The full contents of the new file',
				},
			},
			required: ['path', 'contents'],
		},
	},
};

export const AGENT_TOOL_RUN_COMMAND: ICortexToolDefinition = {
	type: 'function',
	function: {
		name: 'run_command',
		description: 'Run a shell command in the workspace terminal. Returns stdout and stderr. Use for running tests, installing packages, checking git status, etc.',
		parameters: {
			type: 'object',
			properties: {
				command: {
					type: 'string',
					description: 'The shell command to execute',
				},
				working_directory: {
					type: 'string',
					description: 'Optional working directory relative to workspace root. Defaults to workspace root.',
				},
			},
			required: ['command'],
		},
	},
};

export const AGENT_TOOL_SEARCH_FILES: ICortexToolDefinition = {
	type: 'function',
	function: {
		name: 'search_files',
		description: 'Search for text across files in the workspace using regex. Returns matching file paths and line numbers.',
		parameters: {
			type: 'object',
			properties: {
				pattern: {
					type: 'string',
					description: 'Regex pattern to search for',
				},
				file_glob: {
					type: 'string',
					description: 'Optional glob pattern to filter files (e.g., \'**/*.ts\', \'src/**/*.py\'). Defaults to all files.',
				},
				max_results: {
					type: 'integer',
					description: 'Maximum number of results to return. Default: 20.',
				},
			},
			required: ['pattern'],
		},
	},
};

export const AGENT_TOOL_LIST_DIRECTORY: ICortexToolDefinition = {
	type: 'function',
	function: {
		name: 'list_directory',
		description: 'List files and directories at a given path. Returns names with file/directory indicators.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Relative path to list. Use \'.\' or \'\' for workspace root.',
				},
			},
			required: ['path'],
		},
	},
};

/**
 * All agent tool definitions, ready to pass to the tools parameter
 * in a chatCompletion request.
 */
export const ALL_AGENT_TOOLS: ICortexToolDefinition[] = [
	AGENT_TOOL_READ_FILE,
	AGENT_TOOL_EDIT_FILE,
	AGENT_TOOL_CREATE_FILE,
	AGENT_TOOL_RUN_COMMAND,
	AGENT_TOOL_SEARCH_FILES,
	AGENT_TOOL_LIST_DIRECTORY,
];

// ─── Destructive Tool Names ───────────────────────────────────────────────────

/**
 * Tools that modify the workspace or run commands.
 * These require user confirmation when `sandtable.agent.confirmDestructive` is true.
 */
export const DESTRUCTIVE_TOOL_NAMES = new Set<string>([
	'edit_file',
	'create_file',
	'run_command',
]);

/**
 * Tools that only read data and are safe to execute without confirmation.
 */
export const READ_ONLY_TOOL_NAMES = new Set<string>([
	'read_file',
	'search_files',
	'list_directory',
]);

// ─── Tool Argument Interfaces ─────────────────────────────────────────────────

export interface IReadFileArgs {
	path: string;
	start_line?: number;
	end_line?: number;
}

export interface IEditFileArgs {
	path: string;
	old_text: string;
	new_text: string;
}

export interface ICreateFileArgs {
	path: string;
	contents: string;
}

export interface IRunCommandArgs {
	command: string;
	working_directory?: string;
}

export interface ISearchFilesArgs {
	pattern: string;
	file_glob?: string;
	max_results?: number;
}

export interface IListDirectoryArgs {
	path: string;
}

// ─── Agent System Prompt ──────────────────────────────────────────────────────

export const AGENT_SYSTEM_PROMPT = `You are MAGE, an AI coding agent integrated into the Sandtable IDE. You help developers by reading, writing, and modifying code in their workspace.

Rules:
1. Always read a file before editing it to understand the current state.
2. Make minimal, targeted changes. Do not rewrite entire files unless asked.
3. When editing, use exact text matching -- include enough context to be unique.
4. Explain what you are doing and why before making changes.
5. If you are unsure about something, ask the user rather than guessing.
6. After making changes, verify them by reading the file again if needed.
7. When running commands, prefer non-destructive operations. Never run rm -rf or similar without explicit user request.`;

// ─── Tool Result Helpers ──────────────────────────────────────────────────────

/**
 * Get a user-friendly label for a tool execution indicator.
 */
export function getToolDisplayLabel(toolName: string, args: Record<string, unknown>): string {
	switch (toolName) {
		case 'read_file':
			return `Reading ${args['path'] ?? 'file'}...`;
		case 'edit_file':
			return `Editing ${args['path'] ?? 'file'}...`;
		case 'create_file':
			return `Creating ${args['path'] ?? 'file'}...`;
		case 'run_command':
			return `Running \`${truncate(String(args['command'] ?? ''), 60)}\`...`;
		case 'search_files':
			return `Searching for ${args['pattern'] ?? 'pattern'}...`;
		case 'list_directory':
			return `Listing ${args['path'] ?? '.'}...`;
		default:
			return `Executing ${toolName}...`;
	}
}

function truncate(str: string, maxLen: number): string {
	return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}
