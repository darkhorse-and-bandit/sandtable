/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ISearchService, QueryType, ITextQuery } from '../../../services/search/common/search.js';
import {
	ILanguageModelToolsService,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolResult,
	IToolResultTextPart,
	ToolDataSource,
	CountTokensCallback,
	ToolProgress,
	IPreparedToolInvocation,
	IToolInvocationPreparationContext,
} from '../../chat/common/tools/languageModelToolsService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { PersonaConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { ICuratedPersona, BUILTIN_PERSONAS, generatePersonaId } from '../../../../platform/cortex/common/personaTypes.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { ICommandDetectionCapability, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';

// ─── Tool Data Definitions ────────────────────────────────────────────────────

const SANDTABLE_TOOL_SOURCE: typeof ToolDataSource.Internal = { type: 'internal', label: 'Sandtable' };

const readFileToolData: IToolData = {
	id: 'sandtable_read_file',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Read File',
	userDescription: 'Reads a file from the workspace',
	modelDescription: 'Read the contents of a file in the workspace. Returns the file text with line numbers.',
	tags: ['workspace', 'file'],
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Relative path to the file from workspace root' },
			start_line: { type: 'integer', description: 'Optional starting line number (1-indexed)' },
			end_line: { type: 'integer', description: 'Optional ending line number (inclusive)' },
		},
		required: ['path'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	alwaysDisplayInputOutput: true,
};

const editFileToolData: IToolData = {
	id: 'sandtable_edit_file',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Edit File',
	userDescription: 'Edits text in a file',
	modelDescription: 'Replace a specific text string in a file. The old_text must match exactly. Use read_file first to see the current content.',
	tags: ['workspace', 'file'],
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Relative path to the file from workspace root' },
			old_text: { type: 'string', description: 'The exact text to find and replace' },
			new_text: { type: 'string', description: 'The replacement text' },
		},
		required: ['path', 'old_text', 'new_text'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	alwaysDisplayInputOutput: true,
};

const createFileToolData: IToolData = {
	id: 'sandtable_create_file',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Create File',
	userDescription: 'Creates a new file',
	modelDescription: 'Create a new file with the given contents. Will fail if the file already exists.',
	tags: ['workspace', 'file'],
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Relative path for the new file from workspace root' },
			contents: { type: 'string', description: 'The full contents of the new file' },
		},
		required: ['path', 'contents'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	alwaysDisplayInputOutput: true,
};

const runCommandToolData: IToolData = {
	id: 'sandtable_run_command',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Run Command',
	userDescription: 'Runs a shell command',
	modelDescription: 'Run a shell command in the workspace terminal. Returns stdout and stderr.',
	tags: ['workspace', 'terminal'],
	inputSchema: {
		type: 'object',
		properties: {
			command: { type: 'string', description: 'The shell command to execute' },
			working_directory: { type: 'string', description: 'Optional working directory relative to workspace root' },
		},
		required: ['command'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	alwaysDisplayInputOutput: true,
};

const searchFilesToolData: IToolData = {
	id: 'sandtable_search_files',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Search Files',
	userDescription: 'Searches across workspace files',
	modelDescription: 'Search for text across files in the workspace using regex. Returns matching file paths and line numbers.',
	tags: ['workspace', 'search'],
	inputSchema: {
		type: 'object',
		properties: {
			pattern: { type: 'string', description: 'Regex pattern to search for' },
			file_glob: { type: 'string', description: 'Optional glob pattern to filter files' },
			max_results: { type: 'integer', description: 'Maximum results to return (default: 20)' },
		},
		required: ['pattern'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	alwaysDisplayInputOutput: true,
};

const listDirectoryToolData: IToolData = {
	id: 'sandtable_list_directory',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'List Directory',
	userDescription: 'Lists directory contents',
	modelDescription: 'List files and directories at a given path. Returns names with file/directory indicators.',
	tags: ['workspace', 'filesystem'],
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Relative path to list. Use "." for workspace root.' },
		},
		required: ['path'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
	alwaysDisplayInputOutput: true,
};

const createPersonaToolData: IToolData = {
	id: 'sandtable_create_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Create Agent Persona',
	userDescription: 'Creates an agent persona',
	tags: ['persona'],
	modelDescription: 'Create a new agent persona for the Agent Portfolio. Drafts a named AI persona with a system prompt, role, behavioral guidelines, and inference parameters. The persona will be saved and available for selection in the chat panel. Use this when the user asks you to create, design, or generate an agent persona.',
	inputSchema: {
		type: 'object',
		properties: {
			name: { type: 'string', description: 'Persona display name (e.g., "Cyber Red Team Lead")' },
			role: { type: 'string', description: 'Short role/title (e.g., "Offensive Cybersecurity Specialist")' },
			systemPrompt: { type: 'string', description: 'Full system prompt text defining the persona behavior, expertise, and response format. Should be detailed and specific.' },
			guidelines: { type: 'string', description: 'Short behavioral guidelines appended to the system prompt (e.g., "Always cite sources. Flag uncertainty.")' },
			temperature: { type: 'number', description: 'Temperature for inference (0.0-2.0). Lower = more deterministic, higher = more creative.' },
			topP: { type: 'number', description: 'Top-p / nucleus sampling (0.0-1.0).' },
			maxTokens: { type: 'integer', description: 'Maximum tokens per response (e.g., 4096).' },
			icon: { type: 'string', description: 'Codicon icon name. Options: shield, telescope, beaker, lock, megaphone, mortar-board, person, flame, bug, globe, lightbulb, heart, star, zap, target, compass, book, briefcase, rocket' },
		},
		required: ['name', 'role', 'systemPrompt'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const listPersonasToolData: IToolData = {
	id: 'sandtable_list_personas',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'List Agent Personas',
	userDescription: 'Lists all available personas',
	tags: ['persona'],
	modelDescription: 'List all available agent personas in the Agent Portfolio. Returns each persona\'s name, role, icon, temperature, whether it is built-in, and whether it is the currently active persona. Use this when the user asks "What personas are available?", "Show me my agents", "List all personas", "Who can I talk to?", or wants to see what personas exist before activating or editing one.',
	inputSchema: {
		type: 'object',
		properties: {},
		required: [],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const getPersonaToolData: IToolData = {
	id: 'sandtable_get_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Get Persona Details',
	userDescription: 'Gets full details of a persona',
	tags: ['persona'],
	modelDescription: 'Get the full details of a specific agent persona, including its complete system prompt, behavioral guidelines, all inference parameters, and timestamps. Supports lookup by ID or by name (case-insensitive partial match). Use this when the user asks to see a persona\'s full prompt, wants to know what a specific persona does, or asks "Show me the Red Team Commander\'s full prompt", "What does the research analyst do?".',
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The persona ID (UUID). Use this for exact lookup.' },
			name: { type: 'string', description: 'Optional persona name for fuzzy case-insensitive partial matching. Used as fallback when id is not provided or not found.' },
		},
		required: [],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const editPersonaToolData: IToolData = {
	id: 'sandtable_edit_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Edit Agent Persona',
	userDescription: 'Updates a persona\'s fields',
	tags: ['persona'],
	modelDescription: 'Update one or more fields of an existing agent persona. Only the fields you provide will be changed — omitted fields remain unchanged. Use this when the user asks to change a persona\'s temperature, update its system prompt, modify guidelines, rename it, or says things like "Change the temperature to 0.9", "Update the system prompt", "Make it more aggressive", "Rename the Red Team Commander".',
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The persona ID (UUID) to edit. Required.' },
			name: { type: 'string', description: 'New display name' },
			role: { type: 'string', description: 'New role/title' },
			systemPrompt: { type: 'string', description: 'New system prompt text' },
			guidelines: { type: 'string', description: 'New behavioral guidelines' },
			temperature: { type: 'number', description: 'New temperature (0.0-2.0)' },
			topP: { type: 'number', description: 'New top-p (0.0-1.0)' },
			maxTokens: { type: 'integer', description: 'New max tokens (1-32768)' },
			icon: { type: 'string', description: 'New codicon icon name' },
			model: { type: 'string', description: 'New preferred model (compound ID like "cortex::deepseek-v3")' },
		},
		required: ['id'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const deletePersonaToolData: IToolData = {
	id: 'sandtable_delete_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Delete Agent Persona',
	userDescription: 'Deletes a custom persona',
	tags: ['persona'],
	modelDescription: 'Delete a custom agent persona from the Agent Portfolio. Built-in personas cannot be deleted. If the deleted persona was the active persona, it will be deactivated. Use this when the user asks to delete, remove, or get rid of a persona.',
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The persona ID (UUID) to delete. Required.' },
		},
		required: ['id'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const activatePersonaToolData: IToolData = {
	id: 'sandtable_activate_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Activate Agent Persona',
	userDescription: 'Activates or deactivates a persona',
	tags: ['persona'],
	modelDescription: 'Activate or deactivate an agent persona. When activated, the persona\'s system prompt, model preference, and inference parameters will be used for subsequent responses. To deactivate (return to default), call with no id and no name. Supports lookup by ID or by name (case-insensitive partial match). Use this when the user says "Switch to Red Team Commander", "Use the research analyst", "Activate the exercise facilitator", "Go back to default", "Deactivate the persona", "Stop using a persona".',
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The persona ID (UUID) to activate. Omit or leave empty to deactivate the current persona.' },
			name: { type: 'string', description: 'Optional persona name for fuzzy case-insensitive partial matching. Used as fallback when id is not provided.' },
		},
		required: [],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const duplicatePersonaToolData: IToolData = {
	id: 'sandtable_duplicate_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Duplicate Agent Persona',
	userDescription: 'Clones a persona with modifications',
	tags: ['persona'],
	modelDescription: 'Clone an existing agent persona with optional modifications. Creates a new persona based on an existing one, optionally overriding specific fields. The new persona is always a custom (non-built-in) persona. Use this when the user says "Create a version of Red Team Commander focused on cyber attacks", "Clone the research analyst with higher temperature", "Make a copy of this persona".',
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The source persona ID (UUID) to clone. Required.' },
			name: { type: 'string', description: 'New name for the clone. Defaults to "SOURCE_NAME (Copy)" if not provided.' },
			role: { type: 'string', description: 'Override role/title' },
			systemPrompt: { type: 'string', description: 'Override system prompt text' },
			guidelines: { type: 'string', description: 'Override behavioral guidelines' },
			temperature: { type: 'number', description: 'Override temperature (0.0-2.0)' },
			topP: { type: 'number', description: 'Override top-p (0.0-1.0)' },
			maxTokens: { type: 'integer', description: 'Override max tokens (1-32768)' },
			icon: { type: 'string', description: 'Override codicon icon name' },
			model: { type: 'string', description: 'Override preferred model' },
		},
		required: ['id'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const exportPersonaToolData: IToolData = {
	id: 'sandtable_export_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Export Agent Persona',
	userDescription: 'Exports personas as JSON',
	tags: ['persona'],
	modelDescription: 'Export one or all agent personas as a JSON string for sharing or backup. The JSON can be pasted back using the import tool. Use this when the user asks to "Export the Red Team Commander", "Give me all my personas as JSON", "Export personas for sharing", "Back up my personas".',
	inputSchema: {
		type: 'object',
		properties: {
			id: { type: 'string', description: 'The persona ID (UUID) to export. If omitted, exports all personas.' },
		},
		required: [],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

const importPersonaToolData: IToolData = {
	id: 'sandtable_import_persona',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Import Agent Persona',
	userDescription: 'Imports personas from JSON',
	tags: ['persona'],
	modelDescription: 'Import one or more agent personas from a JSON string. Accepts either a single persona object or an array of persona objects. Each imported persona gets a new unique ID and is saved as a custom (non-built-in) persona. Use this when the user pastes JSON persona data and wants to import it, or says "Import this persona", "Add these personas from JSON".',
	inputSchema: {
		type: 'object',
		properties: {
			json: { type: 'string', description: 'JSON string containing a single persona object or an array of persona objects. Each must have at least name, role, and systemPrompt fields.' },
		},
		required: ['json'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: false,
};

// ─── Tool Implementations ─────────────────────────────────────────────────────

function textResult(value: string): IToolResult {
	return { content: [{ kind: 'text', value } satisfies IToolResultTextPart] };
}

function errorResult(message: string): IToolResult {
	return { content: [{ kind: 'text', value: `Error: ${message}` } satisfies IToolResultTextPart], toolResultError: message };
}

/**
 * Load personas from configuration with built-in fallback.
 * Returns stored personas if any exist, otherwise returns a copy of the built-in templates.
 */
function getPersonas(configurationService: IConfigurationService): ICuratedPersona[] {
	const stored = configurationService.getValue<ICuratedPersona[]>(PersonaConfigKeys.Personas) ?? [];
	return stored.length > 0 ? stored : [...BUILTIN_PERSONAS];
}

/**
 * Find a persona by exact ID match, with optional fuzzy name fallback.
 * Returns the persona if found, or undefined.
 */
function findPersona(
	personas: ICuratedPersona[],
	id?: string,
	name?: string,
): ICuratedPersona | undefined {
	// Try exact ID match first
	if (id) {
		const byId = personas.find(p => p.id === id);
		if (byId) {
			return byId;
		}
	}
	// Fuzzy name fallback: case-insensitive partial match
	if (name) {
		const needle = name.toLowerCase();
		return personas.find(p => p.name.toLowerCase().includes(needle));
	}
	return undefined;
}

class ReadFileTool implements IToolImpl {
	constructor(
		private readonly fileService: IFileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { path?: string; start_line?: number; end_line?: number };
		const filePath = params?.path || 'file';
		const rangeStr = params?.start_line ? ` (lines ${params.start_line}-${params.end_line || 'end'})` : '';
		return {
			invocationMessage: `Reading \`${filePath}\`${rangeStr}`,
			pastTenseMessage: `Read \`${filePath}\`${rangeStr}`,
			toolSpecificData: { kind: 'input', rawInput: context.parameters },
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const { path: filePath, start_line, end_line } = invocation.parameters as { path: string; start_line?: number; end_line?: number };
		this.logService.debug(`[Sandtable Tool] read_file: ${filePath}`);

		try {
			const workspaceFolder = this.workspaceService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				return errorResult('No workspace folder open');
			}

			const fileUri = URI.joinPath(workspaceFolder.uri, filePath);
			const content = await this.fileService.readFile(fileUri);
			let lines = content.value.toString().split('\n');

			// Apply line range if specified
			const startIdx = start_line ? Math.max(0, start_line - 1) : 0;
			const endIdx = end_line ? Math.min(lines.length, end_line) : lines.length;
			lines = lines.slice(startIdx, endIdx);

			// Add line numbers
			const numbered = lines.map((line, i) => `${startIdx + i + 1}| ${line}`).join('\n');
			return textResult(numbered);
		} catch (e) {
			return errorResult(`Failed to read file "${filePath}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class EditFileTool implements IToolImpl {
	constructor(
		private readonly fileService: IFileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { path?: string };
		const filePath = params?.path || 'file';
		return {
			invocationMessage: `Editing \`${filePath}\``,
			pastTenseMessage: `Edited \`${filePath}\``,
			toolSpecificData: { kind: 'input', rawInput: context.parameters },
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const { path: filePath, old_text, new_text } = invocation.parameters as { path: string; old_text: string; new_text: string };
		this.logService.debug(`[Sandtable Tool] edit_file: ${filePath}`);

		try {
			const workspaceFolder = this.workspaceService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				return errorResult('No workspace folder open');
			}

			const fileUri = URI.joinPath(workspaceFolder.uri, filePath);
			const content = await this.fileService.readFile(fileUri);
			const text = content.value.toString();

			if (!text.includes(old_text)) {
				return errorResult(`Could not find the specified text in "${filePath}". Use read_file to verify the exact content.`);
			}

			const occurrences = text.split(old_text).length - 1;
			if (occurrences > 1) {
				return errorResult(`Found ${occurrences} occurrences of the text in "${filePath}". The old_text must be unique. Include more surrounding context to make it unique.`);
			}

			const newContent = text.replace(old_text, new_text);
			await this.fileService.writeFile(fileUri, VSBuffer.fromString(newContent));

			return textResult(`Successfully edited "${filePath}". Replaced ${old_text.length} characters with ${new_text.length} characters.`);
		} catch (e) {
			return errorResult(`Failed to edit file "${filePath}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class CreateFileTool implements IToolImpl {
	constructor(
		private readonly fileService: IFileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { path?: string };
		const filePath = params?.path || 'file';
		return {
			invocationMessage: `Creating \`${filePath}\``,
			pastTenseMessage: `Created \`${filePath}\``,
			toolSpecificData: { kind: 'input', rawInput: context.parameters },
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const { path: filePath, contents } = invocation.parameters as { path: string; contents: string };
		this.logService.debug(`[Sandtable Tool] create_file: ${filePath}`);

		try {
			const workspaceFolder = this.workspaceService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				return errorResult('No workspace folder open');
			}

			const fileUri = URI.joinPath(workspaceFolder.uri, filePath);

			// Check if file exists
			try {
				await this.fileService.resolve(fileUri);
				return errorResult(`File "${filePath}" already exists. Use edit_file to modify it.`);
			} catch {
				// File doesn't exist, good
			}

			await this.fileService.writeFile(fileUri, VSBuffer.fromString(contents));
			return textResult(`Successfully created "${filePath}" (${contents.length} characters).`);
		} catch (e) {
			return errorResult(`Failed to create file "${filePath}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class SearchFilesTool implements IToolImpl {
	constructor(
		private readonly searchService: ISearchService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { pattern?: string; file_glob?: string };
		const pattern = params?.pattern || 'pattern';
		const scopeStr = params?.file_glob ? ` in \`${params.file_glob}\`` : '';
		return {
			invocationMessage: `Searching for \`${pattern}\`${scopeStr}`,
			pastTenseMessage: `Searched for \`${pattern}\`${scopeStr}`,
			toolSpecificData: { kind: 'input', rawInput: context.parameters },
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const { pattern, file_glob, max_results } = invocation.parameters as { pattern: string; file_glob?: string; max_results?: number };
		this.logService.debug(`[Sandtable Tool] search_files: ${pattern}`);

		try {
			const workspaceFolder = this.workspaceService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				return errorResult('No workspace folder open');
			}

			const limit = max_results ?? 20;
			const query: ITextQuery = {
				type: QueryType.Text,
				contentPattern: { pattern, isRegExp: true },
				folderQueries: [{ folder: workspaceFolder.uri }],
				maxResults: limit,
			};

			if (file_glob) {
				query.folderQueries[0].includePattern = { [file_glob]: true };
			}

			const results = await this.searchService.textSearch(query, token);
			const lines: string[] = [];

			for (const result of results.results) {
				const relPath = result.resource.path.replace(workspaceFolder.uri.path + '/', '');
				for (const match of result.results ?? []) {
					const lineNum = 'lineNumber' in match ? (match as any).lineNumber : '?';
					const preview = 'preview' in match && (match as any).preview?.text ? (match as any).preview.text.trim() : '';
					lines.push(`${relPath}:${lineNum}: ${preview}`);
				}
			}

			if (lines.length === 0) {
				return textResult(`No matches found for pattern "${pattern}"`);
			}

			return textResult(`Found ${lines.length} match(es):\n${lines.join('\n')}`);
		} catch (e) {
			return errorResult(`Search failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

// ─── Run Command Tool ─────────────────────────────────────────────────────────

/** Maximum time (ms) to wait for a command to finish before returning partial output */
const RUN_COMMAND_TIMEOUT_MS = 30_000;
/** Maximum output size (characters) to return to the LLM to avoid context overflow */
const RUN_COMMAND_MAX_OUTPUT_CHARS = 60_000;

class RunCommandTool implements IToolImpl {
	/** Reusable terminal instance for agent commands */
	private _agentTerminalId: number | undefined;

	constructor(
		private readonly terminalService: ITerminalService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { command?: string };
		const command = params?.command || 'command';
		// Truncate long commands for display
		const displayCmd = command.length > 80 ? command.substring(0, 77) + '...' : command;
		return {
			invocationMessage: `Running \`${displayCmd}\``,
			pastTenseMessage: `Ran \`${displayCmd}\``,
			toolSpecificData: { kind: 'input', rawInput: context.parameters },
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const { command, working_directory } = invocation.parameters as { command: string; working_directory?: string };
		this.logService.debug(`[Sandtable Tool] run_command: ${command}`);

		if (!command || command.trim().length === 0) {
			return errorResult('No command provided.');
		}

		try {
			const workspaceFolder = this.workspaceService.getWorkspace().folders[0];

			// Determine working directory
			let cwd: URI | string | undefined;
			if (working_directory && workspaceFolder) {
				cwd = URI.joinPath(workspaceFolder.uri, working_directory);
			} else if (workspaceFolder) {
				cwd = workspaceFolder.uri;
			}

			// Get or create a terminal instance for agent commands
			const instance = await this._getOrCreateTerminal(cwd);

			// Try to capture output using shell integration (rich path)
			const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
			if (commandDetection) {
				return await this._executeWithShellIntegration(instance, command, commandDetection, token);
			}

			// Fallback: basic execution without shell integration
			return await this._executeBasic(instance, command, token);
		} catch (e) {
			if (token.isCancellationRequested) {
				return errorResult('Command execution was cancelled.');
			}
			return errorResult(`Failed to execute command: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/**
	 * Get or create a reusable terminal instance for agent commands.
	 */
	private async _getOrCreateTerminal(cwd?: URI | string): Promise<ITerminalInstance> {
		// Try to reuse existing agent terminal
		if (this._agentTerminalId !== undefined) {
			const existing = this.terminalService.getInstanceFromId(this._agentTerminalId);
			if (existing) {
				return existing;
			}
			this._agentTerminalId = undefined;
		}

		// Create a new terminal
		const instance = await this.terminalService.createTerminal({
			config: {
				name: 'Sandtable Agent',
				isFeatureTerminal: true,
			},
			cwd,
			location: TerminalLocation.Panel,
		});

		this._agentTerminalId = instance.instanceId;
		return instance;
	}

	/**
	 * Execute a command with shell integration and capture the output via command detection.
	 */
	private async _executeWithShellIntegration(
		instance: ITerminalInstance,
		command: string,
		commandDetection: ICommandDetectionCapability,
		token: CancellationToken,
	): Promise<IToolResult> {
		const disposables = new DisposableStore();

		try {
			// Wait for the command to finish or timeout
			const resultPromise = new Promise<{ output: string; exitCode: number | undefined }>((resolve) => {
				// Listen for command completion
				disposables.add(commandDetection.onCommandFinished((finishedCommand) => {
					const output = finishedCommand.getOutput() ?? '';
					resolve({
						output: output,
						exitCode: finishedCommand.exitCode,
					});
				}));

				// Timeout after RUN_COMMAND_TIMEOUT_MS
				const timeoutId = setTimeout(() => {
					resolve({
						output: '[Command timed out after ' + (RUN_COMMAND_TIMEOUT_MS / 1000) + ' seconds. The command may still be running in the terminal.]',
						exitCode: undefined,
					});
				}, RUN_COMMAND_TIMEOUT_MS);

				disposables.add({ dispose: () => clearTimeout(timeoutId) });

				// Cancellation support
				if (token.isCancellationRequested) {
					resolve({ output: '[Cancelled]', exitCode: undefined });
				} else {
					disposables.add(token.onCancellationRequested(() => {
						resolve({ output: '[Cancelled]', exitCode: undefined });
					}));
				}
			});

			// Send the command
			await instance.sendText(command, true);

			const result = await resultPromise;
			return this._formatResult(command, result.output, result.exitCode);
		} finally {
			disposables.dispose();
		}
	}

	/**
	 * Basic execution path without shell integration -- sends the command and
	 * collects raw terminal data for a fixed period.
	 */
	private async _executeBasic(
		instance: ITerminalInstance,
		command: string,
		token: CancellationToken,
	): Promise<IToolResult> {
		const disposables = new DisposableStore();

		try {
			let capturedOutput = '';
			let idleTimer: ReturnType<typeof setTimeout> | undefined;
			const IDLE_TIMEOUT_MS = 3000; // Consider command done after 3s of no output
			const MAX_WAIT_MS = RUN_COMMAND_TIMEOUT_MS;

			const resultPromise = new Promise<string>((resolve) => {
				// Capture raw terminal output data
				disposables.add(instance.onData((data: string) => {
					capturedOutput += data;
					// Reset idle timer on each data event
					if (idleTimer !== undefined) {
						clearTimeout(idleTimer);
					}
					idleTimer = setTimeout(() => {
						resolve(capturedOutput);
					}, IDLE_TIMEOUT_MS);
				}));

				// Absolute timeout
				const maxTimer = setTimeout(() => {
					resolve(capturedOutput + '\n[Command timed out after ' + (MAX_WAIT_MS / 1000) + ' seconds]');
				}, MAX_WAIT_MS);
				disposables.add({ dispose: () => clearTimeout(maxTimer) });

				// Cancellation
				if (token.isCancellationRequested) {
					resolve('[Cancelled]');
				} else {
					disposables.add(token.onCancellationRequested(() => {
						resolve(capturedOutput + '\n[Cancelled]');
					}));
				}
			});

			// Send the command
			await instance.sendText(command, true);

			const output = await resultPromise;

			// Clean ANSI escape sequences for readability
			const cleanedOutput = this._stripAnsiCodes(output);
			return this._formatResult(command, cleanedOutput, undefined);
		} finally {
			if (disposables) {
				disposables.dispose();
			}
		}
	}

	/**
	 * Format the final tool result with command, output, and exit code.
	 */
	private _formatResult(command: string, output: string, exitCode: number | undefined): IToolResult {
		let truncated = output;
		let wasTruncated = false;
		if (truncated.length > RUN_COMMAND_MAX_OUTPUT_CHARS) {
			truncated = truncated.substring(0, RUN_COMMAND_MAX_OUTPUT_CHARS);
			wasTruncated = true;
		}

		const parts: string[] = [];
		parts.push(`$ ${command}`);
		if (truncated.trim().length > 0) {
			parts.push(truncated.trim());
		} else {
			parts.push('(no output)');
		}
		if (exitCode !== undefined) {
			parts.push(`\nExit code: ${exitCode}`);
		}
		if (wasTruncated) {
			parts.push(`\n[Output truncated at ${RUN_COMMAND_MAX_OUTPUT_CHARS} characters]`);
		}

		return textResult(parts.join('\n'));
	}

	/**
	 * Strip ANSI escape sequences from terminal output for cleaner LLM consumption.
	 */
	private _stripAnsiCodes(text: string): string {
		// eslint-disable-next-line no-control-regex
		return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
	}
}

// ─── Create Persona Tool ──────────────────────────────────────────────────────

class CreatePersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { name?: string };
		const name = params?.name || 'persona';
		return {
			invocationMessage: `Creating persona **${name}**`,
			pastTenseMessage: `Created persona **${name}**`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			name: string;
			role: string;
			systemPrompt: string;
			guidelines?: string;
			temperature?: number;
			topP?: number;
			maxTokens?: number;
			icon?: string;
		};

		this.logService.debug(`[Sandtable Tool] create_persona: ${params.name}`);

		// Validate required fields
		if (!params.name || !params.name.trim()) {
			return errorResult('Persona name is required.');
		}
		if (!params.systemPrompt || !params.systemPrompt.trim()) {
			return errorResult('System prompt is required.');
		}

		// Build the persona object
		const now = new Date().toISOString();
		const persona: ICuratedPersona = {
			id: generatePersonaId(),
			name: params.name.trim(),
			role: (params.role || params.name).trim(),
			systemPrompt: params.systemPrompt.trim(),
			guidelines: params.guidelines?.trim() || undefined,
			temperature: params.temperature !== undefined ? Math.max(0, Math.min(2, params.temperature)) : undefined,
			topP: params.topP !== undefined ? Math.max(0, Math.min(1, params.topP)) : undefined,
			maxTokens: params.maxTokens !== undefined ? Math.max(1, Math.min(32768, params.maxTokens)) : undefined,
			icon: params.icon?.trim() || 'person',
			isBuiltIn: false,
			createdAt: now,
			updatedAt: now,
		};

		// Read existing personas and add the new one
		const stored = this.configurationService.getValue<ICuratedPersona[]>(PersonaConfigKeys.Personas) ?? [];
		const existing = stored.length > 0 ? [...stored] : [...BUILTIN_PERSONAS];
		existing.push(persona);

		// Save to configuration
		await this.configurationService.updateValue(PersonaConfigKeys.Personas, existing, ConfigurationTarget.USER);

		this.logService.info(`[Sandtable Tool] Created persona "${persona.name}" (${persona.id})`);

		// Return a formatted summary card
		const parts: string[] = [];
		parts.push(`**Created persona "${persona.name}"**`);
		parts.push('');
		parts.push(`| Property | Value |`);
		parts.push(`|----------|-------|`);
		parts.push(`| **Name** | ${persona.name} |`);
		parts.push(`| **Role** | ${persona.role} |`);
		if (persona.temperature !== undefined) { parts.push(`| **Temperature** | ${persona.temperature} |`); }
		if (persona.topP !== undefined) { parts.push(`| **Top-P** | ${persona.topP} |`); }
		if (persona.maxTokens !== undefined) { parts.push(`| **Max Tokens** | ${persona.maxTokens} |`); }
		if (persona.icon) { parts.push(`| **Icon** | ${persona.icon} |`); }
		if (persona.guidelines) { parts.push(`| **Guidelines** | ${persona.guidelines} |`); }
		parts.push('');
		parts.push('**System Prompt:**');
		const promptPreview = persona.systemPrompt.length > 300
			? persona.systemPrompt.substring(0, 300) + '...'
			: persona.systemPrompt;
		parts.push(`> ${promptPreview.replace(/\n/g, '\n> ')}`);
		parts.push('');
		parts.push('The persona has been added to the Agent Portfolio. You can activate it from the person icon in the chat panel or the status bar.');

		return textResult(parts.join('\n'));
	}
}

class ListDirectoryTool implements IToolImpl {
	constructor(
		private readonly fileService: IFileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { path?: string };
		const dirPath = params?.path || '.';
		return {
			invocationMessage: `Listing \`${dirPath}\``,
			pastTenseMessage: `Listed \`${dirPath}\``,
			toolSpecificData: { kind: 'input', rawInput: context.parameters },
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const { path: dirPath } = invocation.parameters as { path: string };
		this.logService.debug(`[Sandtable Tool] list_directory: ${dirPath}`);

		try {
			const workspaceFolder = this.workspaceService.getWorkspace().folders[0];
			if (!workspaceFolder) {
				return errorResult('No workspace folder open');
			}

			const dirUri = (!dirPath || dirPath === '.' || dirPath === '')
				? workspaceFolder.uri
				: URI.joinPath(workspaceFolder.uri, dirPath);

			const stat = await this.fileService.resolve(dirUri);
			if (!stat.children) {
				return textResult(`${dirPath || '.'} is not a directory or is empty`);
			}

			const entries = stat.children.map(child => {
				const indicator = child.isDirectory ? '/' : '';
				return `${child.name}${indicator}`;
			});

			return textResult(entries.join('\n'));
		} catch (e) {
			return errorResult(`Failed to list directory "${dirPath}": ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

// ─── Persona Management Tools ─────────────────────────────────────────────────

class ListPersonasTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: 'Listing personas',
			pastTenseMessage: 'Listed personas',
		};
	}

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		this.logService.debug('[Sandtable Tool] list_personas');

		const personas = getPersonas(this.configurationService);
		const activeId = this.configurationService.getValue<string>(PersonaConfigKeys.ActivePersona) || '';

		if (personas.length === 0) {
			return textResult('No personas available.');
		}

		const lines: string[] = [];
		lines.push(`**Agent Personas** (${personas.length} total)`);
		lines.push('');
		lines.push('| # | Name | Role | Icon | Temp | Built-in | Active |');
		lines.push('|---|------|------|------|------|----------|--------|');

		for (let i = 0; i < personas.length; i++) {
			const p = personas[i];
			const isActive = p.id === activeId;
			const tempStr = p.temperature !== undefined ? p.temperature.toFixed(1) : '-';
			const builtInStr = p.isBuiltIn ? 'Yes' : 'No';
			const activeStr = isActive ? '**ACTIVE**' : '';
			const iconStr = p.icon || '-';
			lines.push(`| ${i + 1} | ${p.name} | ${p.role} | ${iconStr} | ${tempStr} | ${builtInStr} | ${activeStr} |`);
		}

		lines.push('');
		if (activeId) {
			const activeName = personas.find(p => p.id === activeId)?.name || 'Unknown';
			lines.push(`Currently active: **${activeName}**`);
		} else {
			lines.push('No persona is currently active (using default settings).');
		}

		return textResult(lines.join('\n'));
	}
}

class GetPersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { id?: string; name?: string };
		const label = params?.name || params?.id || 'persona';
		return {
			invocationMessage: `Getting persona details for **${label}**`,
			pastTenseMessage: `Got persona details for **${label}**`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const { id, name } = invocation.parameters as { id?: string; name?: string };
		this.logService.debug(`[Sandtable Tool] get_persona: id=${id || '(none)'}, name=${name || '(none)'}`);

		if (!id && !name) {
			return errorResult('Either "id" or "name" must be provided to look up a persona.');
		}

		const personas = getPersonas(this.configurationService);
		const persona = findPersona(personas, id, name);

		if (!persona) {
			return errorResult(`No persona found matching ${id ? `id "${id}"` : ''}${id && name ? ' or ' : ''}${name ? `name "${name}"` : ''}.`);
		}

		const activeId = this.configurationService.getValue<string>(PersonaConfigKeys.ActivePersona) || '';
		const isActive = persona.id === activeId;

		const parts: string[] = [];
		parts.push(`**${persona.name}** ${isActive ? '(ACTIVE)' : ''}`);
		parts.push('');
		parts.push('| Property | Value |');
		parts.push('|----------|-------|');
		parts.push(`| **ID** | ${persona.id} |`);
		parts.push(`| **Name** | ${persona.name} |`);
		parts.push(`| **Role** | ${persona.role} |`);
		parts.push(`| **Icon** | ${persona.icon || '-'} |`);
		parts.push(`| **Built-in** | ${persona.isBuiltIn ? 'Yes' : 'No'} |`);
		if (persona.model) { parts.push(`| **Model** | ${persona.model} |`); }
		parts.push(`| **Temperature** | ${persona.temperature !== undefined ? persona.temperature : '-'} |`);
		parts.push(`| **Top-P** | ${persona.topP !== undefined ? persona.topP : '-'} |`);
		parts.push(`| **Max Tokens** | ${persona.maxTokens !== undefined ? persona.maxTokens : '-'} |`);
		if (persona.createdAt) { parts.push(`| **Created** | ${persona.createdAt} |`); }
		if (persona.updatedAt) { parts.push(`| **Updated** | ${persona.updatedAt} |`); }

		if (persona.guidelines) {
			parts.push('');
			parts.push('**Guidelines:**');
			parts.push(`> ${persona.guidelines.replace(/\n/g, '\n> ')}`);
		}

		parts.push('');
		parts.push('**System Prompt:**');
		parts.push(`> ${persona.systemPrompt.replace(/\n/g, '\n> ')}`);

		return textResult(parts.join('\n'));
	}
}

class EditPersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: 'Editing persona',
			pastTenseMessage: 'Edited persona',
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			id: string;
			name?: string;
			role?: string;
			systemPrompt?: string;
			guidelines?: string;
			temperature?: number;
			topP?: number;
			maxTokens?: number;
			icon?: string;
			model?: string;
		};

		this.logService.debug(`[Sandtable Tool] edit_persona: ${params.id}`);

		if (!params.id) {
			return errorResult('Persona ID is required for editing.');
		}

		const personas = getPersonas(this.configurationService);
		const index = personas.findIndex(p => p.id === params.id);

		if (index === -1) {
			return errorResult(`No persona found with id "${params.id}". Use sandtable_list_personas to see available personas and their IDs.`);
		}

		const persona = personas[index];
		const changes: string[] = [];

		// Apply each provided field
		if (params.name !== undefined && params.name.trim()) {
			changes.push(`Name: "${persona.name}" → "${params.name.trim()}"`);
			persona.name = params.name.trim();
		}
		if (params.role !== undefined && params.role.trim()) {
			changes.push(`Role: "${persona.role}" → "${params.role.trim()}"`);
			persona.role = params.role.trim();
		}
		if (params.systemPrompt !== undefined && params.systemPrompt.trim()) {
			const oldPreview = persona.systemPrompt.substring(0, 80) + (persona.systemPrompt.length > 80 ? '...' : '');
			const newPreview = params.systemPrompt.trim().substring(0, 80) + (params.systemPrompt.trim().length > 80 ? '...' : '');
			changes.push(`System Prompt: "${oldPreview}" → "${newPreview}"`);
			persona.systemPrompt = params.systemPrompt.trim();
		}
		if (params.guidelines !== undefined) {
			changes.push(`Guidelines: "${persona.guidelines || '(none)'}" → "${params.guidelines.trim() || '(none)'}"`);
			persona.guidelines = params.guidelines.trim() || undefined;
		}
		if (params.temperature !== undefined) {
			const clamped = Math.max(0, Math.min(2, params.temperature));
			changes.push(`Temperature: ${persona.temperature ?? '-'} → ${clamped}`);
			persona.temperature = clamped;
		}
		if (params.topP !== undefined) {
			const clamped = Math.max(0, Math.min(1, params.topP));
			changes.push(`Top-P: ${persona.topP ?? '-'} → ${clamped}`);
			persona.topP = clamped;
		}
		if (params.maxTokens !== undefined) {
			const clamped = Math.max(1, Math.min(32768, params.maxTokens));
			changes.push(`Max Tokens: ${persona.maxTokens ?? '-'} → ${clamped}`);
			persona.maxTokens = clamped;
		}
		if (params.icon !== undefined && params.icon.trim()) {
			changes.push(`Icon: ${persona.icon || '-'} → ${params.icon.trim()}`);
			persona.icon = params.icon.trim();
		}
		if (params.model !== undefined) {
			changes.push(`Model: ${persona.model || '-'} → ${params.model.trim() || '(default)'}`);
			persona.model = params.model.trim() || undefined;
		}

		if (changes.length === 0) {
			return errorResult('No fields were provided to update. Provide at least one field to change (name, role, systemPrompt, guidelines, temperature, topP, maxTokens, icon, or model).');
		}

		// Update timestamp
		persona.updatedAt = new Date().toISOString();
		personas[index] = persona;

		// Save back to configuration
		await this.configurationService.updateValue(PersonaConfigKeys.Personas, personas, ConfigurationTarget.USER);

		this.logService.info(`[Sandtable Tool] Edited persona "${persona.name}" (${persona.id}): ${changes.length} field(s) changed`);

		const parts: string[] = [];
		parts.push(`**Updated persona "${persona.name}"** (${changes.length} field(s) changed)`);
		parts.push('');
		for (const change of changes) {
			parts.push(`- ${change}`);
		}
		parts.push('');
		parts.push(`Updated at: ${persona.updatedAt}`);

		return textResult(parts.join('\n'));
	}
}

class DeletePersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: 'Deleting persona',
			pastTenseMessage: 'Deleted persona',
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const { id } = invocation.parameters as { id: string };
		this.logService.debug(`[Sandtable Tool] delete_persona: ${id}`);

		if (!id) {
			return errorResult('Persona ID is required for deletion.');
		}

		const personas = getPersonas(this.configurationService);
		const index = personas.findIndex(p => p.id === id);

		if (index === -1) {
			return errorResult(`No persona found with id "${id}". Use sandtable_list_personas to see available personas and their IDs.`);
		}

		const persona = personas[index];

		// Guard: cannot delete built-in personas
		if (persona.isBuiltIn) {
			return errorResult(`Cannot delete built-in persona "${persona.name}". Built-in personas are templates that ship with Sandtable and cannot be removed. You can edit them instead using sandtable_edit_persona.`);
		}

		// Remove the persona
		const deletedName = persona.name;
		personas.splice(index, 1);

		// Save back to configuration
		await this.configurationService.updateValue(PersonaConfigKeys.Personas, personas, ConfigurationTarget.USER);

		// If the deleted persona was active, clear the active persona
		const activeId = this.configurationService.getValue<string>(PersonaConfigKeys.ActivePersona) || '';
		if (activeId === id) {
			await this.configurationService.updateValue(PersonaConfigKeys.ActivePersona, '', ConfigurationTarget.USER);
			this.logService.info(`[Sandtable Tool] Cleared active persona (deleted "${deletedName}")`);
			return textResult(`Deleted persona "${deletedName}" and deactivated it (it was the active persona). Now using default settings.`);
		}

		this.logService.info(`[Sandtable Tool] Deleted persona "${deletedName}" (${id})`);
		return textResult(`Deleted persona "${deletedName}".`);
	}
}

class ActivatePersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { id?: string; name?: string };
		if ((!params?.id || !params.id.trim()) && (!params?.name || !params.name.trim())) {
			return {
				invocationMessage: 'Deactivating persona',
				pastTenseMessage: 'Deactivated persona',
			};
		}
		const label = params?.name || 'persona';
		return {
			invocationMessage: `Activating persona **${label}**`,
			pastTenseMessage: `Activated persona **${label}**`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const { id, name } = invocation.parameters as { id?: string; name?: string };
		this.logService.debug(`[Sandtable Tool] activate_persona: id=${id || '(none)'}, name=${name || '(none)'}`);

		// Deactivate: no id and no name provided
		if ((!id || !id.trim()) && (!name || !name.trim())) {
			await this.configurationService.updateValue(PersonaConfigKeys.ActivePersona, '', ConfigurationTarget.USER);
			this.logService.info('[Sandtable Tool] Deactivated persona');
			return textResult('Deactivated persona. Using default settings. The next response will use the default system prompt and parameters.');
		}

		const personas = getPersonas(this.configurationService);
		const persona = findPersona(personas, id, name);

		if (!persona) {
			return errorResult(`No persona found matching ${id ? `id "${id}"` : ''}${id && name ? ' or ' : ''}${name ? `name "${name}"` : ''}. Use sandtable_list_personas to see available personas.`);
		}

		await this.configurationService.updateValue(PersonaConfigKeys.ActivePersona, persona.id, ConfigurationTarget.USER);
		this.logService.info(`[Sandtable Tool] Activated persona "${persona.name}" (${persona.id})`);

		const parts: string[] = [];
		parts.push(`**Activated persona: ${persona.name}** (${persona.role})`);
		parts.push('');
		if (persona.temperature !== undefined) { parts.push(`- Temperature: ${persona.temperature}`); }
		if (persona.topP !== undefined) { parts.push(`- Top-P: ${persona.topP}`); }
		if (persona.maxTokens !== undefined) { parts.push(`- Max Tokens: ${persona.maxTokens}`); }
		if (persona.model) { parts.push(`- Preferred Model: ${persona.model}`); }
		parts.push('');
		parts.push('The next response will use this persona\'s system prompt and parameters.');

		return textResult(parts.join('\n'));
	}
}

class DuplicatePersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: 'Duplicating persona',
			pastTenseMessage: 'Duplicated persona',
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			id: string;
			name?: string;
			role?: string;
			systemPrompt?: string;
			guidelines?: string;
			temperature?: number;
			topP?: number;
			maxTokens?: number;
			icon?: string;
			model?: string;
		};

		this.logService.debug(`[Sandtable Tool] duplicate_persona: ${params.id}`);

		if (!params.id) {
			return errorResult('Source persona ID is required for duplication.');
		}

		const personas = getPersonas(this.configurationService);
		const source = personas.find(p => p.id === params.id);

		if (!source) {
			return errorResult(`No persona found with id "${params.id}". Use sandtable_list_personas to see available personas and their IDs.`);
		}

		// Create the clone
		const now = new Date().toISOString();
		const clone: ICuratedPersona = {
			...source,
			id: generatePersonaId(),
			name: params.name?.trim() || `${source.name} (Copy)`,
			isBuiltIn: false,
			createdAt: now,
			updatedAt: now,
		};

		// Apply overrides
		if (params.role !== undefined && params.role.trim()) { clone.role = params.role.trim(); }
		if (params.systemPrompt !== undefined && params.systemPrompt.trim()) { clone.systemPrompt = params.systemPrompt.trim(); }
		if (params.guidelines !== undefined) { clone.guidelines = params.guidelines.trim() || undefined; }
		if (params.temperature !== undefined) { clone.temperature = Math.max(0, Math.min(2, params.temperature)); }
		if (params.topP !== undefined) { clone.topP = Math.max(0, Math.min(1, params.topP)); }
		if (params.maxTokens !== undefined) { clone.maxTokens = Math.max(1, Math.min(32768, params.maxTokens)); }
		if (params.icon !== undefined && params.icon.trim()) { clone.icon = params.icon.trim(); }
		if (params.model !== undefined) { clone.model = params.model.trim() || undefined; }

		// Save
		personas.push(clone);
		await this.configurationService.updateValue(PersonaConfigKeys.Personas, personas, ConfigurationTarget.USER);

		this.logService.info(`[Sandtable Tool] Duplicated persona "${source.name}" → "${clone.name}" (${clone.id})`);

		const parts: string[] = [];
		parts.push(`**Duplicated "${source.name}" → "${clone.name}"**`);
		parts.push('');
		parts.push('| Property | Value |');
		parts.push('|----------|-------|');
		parts.push(`| **Name** | ${clone.name} |`);
		parts.push(`| **Role** | ${clone.role} |`);
		if (clone.temperature !== undefined) { parts.push(`| **Temperature** | ${clone.temperature} |`); }
		if (clone.topP !== undefined) { parts.push(`| **Top-P** | ${clone.topP} |`); }
		if (clone.maxTokens !== undefined) { parts.push(`| **Max Tokens** | ${clone.maxTokens} |`); }
		if (clone.icon) { parts.push(`| **Icon** | ${clone.icon} |`); }
		if (clone.guidelines) { parts.push(`| **Guidelines** | ${clone.guidelines} |`); }
		parts.push('');
		parts.push('**System Prompt:**');
		const promptPreview = clone.systemPrompt.length > 300
			? clone.systemPrompt.substring(0, 300) + '...'
			: clone.systemPrompt;
		parts.push(`> ${promptPreview.replace(/\n/g, '\n> ')}`);
		parts.push('');
		parts.push('The new persona has been added to the Agent Portfolio. You can activate it with sandtable_activate_persona.');

		return textResult(parts.join('\n'));
	}
}

class ExportPersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { id?: string };
		return {
			invocationMessage: params?.id ? 'Exporting persona' : 'Exporting all personas',
			pastTenseMessage: params?.id ? 'Exported persona' : 'Exported all personas',
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const { id } = invocation.parameters as { id?: string };
		this.logService.debug(`[Sandtable Tool] export_persona: ${id || '(all)'}`);

		const personas = getPersonas(this.configurationService);

		if (id) {
			const persona = personas.find(p => p.id === id);
			if (!persona) {
				return errorResult(`No persona found with id "${id}". Use sandtable_list_personas to see available personas and their IDs.`);
			}

			const json = JSON.stringify(persona, null, 2);
			this.logService.info(`[Sandtable Tool] Exported persona "${persona.name}"`);

			const parts: string[] = [];
			parts.push(`**Exported persona: ${persona.name}**`);
			parts.push('');
			parts.push('```json');
			parts.push(json);
			parts.push('```');
			parts.push('');
			parts.push('Copy the JSON above and use sandtable_import_persona to import it elsewhere.');

			return textResult(parts.join('\n'));
		}

		// Export all personas
		const json = JSON.stringify(personas, null, 2);
		this.logService.info(`[Sandtable Tool] Exported all ${personas.length} personas`);

		const parts: string[] = [];
		parts.push(`**Exported all ${personas.length} persona(s)**`);
		parts.push('');
		parts.push('```json');
		parts.push(json);
		parts.push('```');
		parts.push('');
		parts.push('Copy the JSON above and use sandtable_import_persona to import it elsewhere.');

		return textResult(parts.join('\n'));
	}
}

class ImportPersonaTool implements IToolImpl {
	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: 'Importing persona(s)',
			pastTenseMessage: 'Imported persona(s)',
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const { json } = invocation.parameters as { json: string };
		this.logService.debug('[Sandtable Tool] import_persona');

		if (!json || !json.trim()) {
			return errorResult('JSON string is required. Provide a persona object or array of persona objects.');
		}

		// Parse JSON
		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch (e) {
			return errorResult(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
		}

		// Normalize to array
		const rawPersonas: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

		if (rawPersonas.length === 0) {
			return errorResult('The JSON array is empty. Provide at least one persona object.');
		}

		// Validate and build personas
		const now = new Date().toISOString();
		const imported: ICuratedPersona[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rawPersonas.length; i++) {
			const raw = rawPersonas[i] as Record<string, unknown>;

			// Validate required fields
			if (!raw || typeof raw !== 'object') {
				errors.push(`Item ${i + 1}: Not a valid object.`);
				continue;
			}
			if (!raw.name || typeof raw.name !== 'string' || !raw.name.trim()) {
				errors.push(`Item ${i + 1}: Missing or empty "name" field.`);
				continue;
			}
			if (!raw.role || typeof raw.role !== 'string' || !raw.role.trim()) {
				errors.push(`Item ${i + 1}: Missing or empty "role" field.`);
				continue;
			}
			if (!raw.systemPrompt || typeof raw.systemPrompt !== 'string' || !raw.systemPrompt.trim()) {
				errors.push(`Item ${i + 1}: Missing or empty "systemPrompt" field.`);
				continue;
			}

			const persona: ICuratedPersona = {
				id: generatePersonaId(),
				name: String(raw.name).trim(),
				role: String(raw.role).trim(),
				systemPrompt: String(raw.systemPrompt).trim(),
				guidelines: typeof raw.guidelines === 'string' ? raw.guidelines.trim() || undefined : undefined,
				temperature: typeof raw.temperature === 'number' ? Math.max(0, Math.min(2, raw.temperature)) : undefined,
				topP: typeof raw.topP === 'number' ? Math.max(0, Math.min(1, raw.topP)) : undefined,
				maxTokens: typeof raw.maxTokens === 'number' ? Math.max(1, Math.min(32768, Math.round(raw.maxTokens))) : undefined,
				model: typeof raw.model === 'string' ? raw.model.trim() || undefined : undefined,
				icon: typeof raw.icon === 'string' ? raw.icon.trim() || 'person' : 'person',
				isBuiltIn: false,
				createdAt: now,
				updatedAt: now,
			};

			imported.push(persona);
		}

		if (imported.length === 0) {
			return errorResult(`No valid personas found in the JSON.\n${errors.join('\n')}`);
		}

		// Save
		const existing = getPersonas(this.configurationService);
		existing.push(...imported);
		await this.configurationService.updateValue(PersonaConfigKeys.Personas, existing, ConfigurationTarget.USER);

		this.logService.info(`[Sandtable Tool] Imported ${imported.length} persona(s)`);

		const parts: string[] = [];
		parts.push(`**Imported ${imported.length} persona(s)**`);
		parts.push('');
		for (const p of imported) {
			parts.push(`- **${p.name}** (${p.role})`);
		}

		if (errors.length > 0) {
			parts.push('');
			parts.push(`**${errors.length} item(s) skipped due to validation errors:**`);
			for (const err of errors) {
				parts.push(`- ${err}`);
			}
		}

		parts.push('');
		parts.push('The imported personas are now available in the Agent Portfolio.');

		return textResult(parts.join('\n'));
	}
}

// ─── Workbench Contribution ───────────────────────────────────────────────────

/**
 * Registers Sandtable workspace tools with VS Code's ILanguageModelToolsService.
 * These tools are available to the Sandtable chat agent and any other agents
 * in the built-in Chat panel.
 */
class SandtableToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableTools';

	constructor(
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ISearchService private readonly searchService: ISearchService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.logService.info('[Sandtable Tools] Registering workspace tools');

		// Read File
		this._register(this.toolsService.registerTool(
			readFileToolData,
			new ReadFileTool(this.fileService, this.workspaceService, this.logService)
		));

		// Edit File
		this._register(this.toolsService.registerTool(
			editFileToolData,
			new EditFileTool(this.fileService, this.workspaceService, this.logService)
		));

		// Create File
		this._register(this.toolsService.registerTool(
			createFileToolData,
			new CreateFileTool(this.fileService, this.workspaceService, this.logService)
		));

		// Run Command -- executes via ITerminalService with shell integration
		// output capture when available, falls back to raw data capture
		this._register(this.toolsService.registerTool(
			runCommandToolData,
			new RunCommandTool(this.terminalService, this.workspaceService, this.logService)
		));

		// Search Files
		this._register(this.toolsService.registerTool(
			searchFilesToolData,
			new SearchFilesTool(this.searchService, this.workspaceService, this.logService)
		));

		// List Directory
		this._register(this.toolsService.registerTool(
			listDirectoryToolData,
			new ListDirectoryTool(this.fileService, this.workspaceService, this.logService)
		));

		// Create Persona -- allows the LLM to draft and save agent personas
		// to the Agent Portfolio when users ask it to create agents
		this._register(this.toolsService.registerTool(
			createPersonaToolData,
			new CreatePersonaTool(this.configurationService, this.logService)
		));

		// List Personas -- enumerate all personas with active indicator
		this._register(this.toolsService.registerTool(
			listPersonasToolData,
			new ListPersonasTool(this.configurationService, this.logService)
		));

		// Get Persona -- full details of a specific persona by ID or name
		this._register(this.toolsService.registerTool(
			getPersonaToolData,
			new GetPersonaTool(this.configurationService, this.logService)
		));

		// Edit Persona -- update fields on an existing persona
		this._register(this.toolsService.registerTool(
			editPersonaToolData,
			new EditPersonaTool(this.configurationService, this.logService)
		));

		// Delete Persona -- remove a custom persona (built-ins protected)
		this._register(this.toolsService.registerTool(
			deletePersonaToolData,
			new DeletePersonaTool(this.configurationService, this.logService)
		));

		// Activate Persona -- switch to a persona or deactivate
		this._register(this.toolsService.registerTool(
			activatePersonaToolData,
			new ActivatePersonaTool(this.configurationService, this.logService)
		));

		// Duplicate Persona -- clone-and-modify an existing persona
		this._register(this.toolsService.registerTool(
			duplicatePersonaToolData,
			new DuplicatePersonaTool(this.configurationService, this.logService)
		));

		// Export Persona -- serialize one or all personas to JSON
		this._register(this.toolsService.registerTool(
			exportPersonaToolData,
			new ExportPersonaTool(this.configurationService, this.logService)
		));

		// Import Persona -- deserialize personas from JSON string
		this._register(this.toolsService.registerTool(
			importPersonaToolData,
			new ImportPersonaTool(this.configurationService, this.logService)
		));

		this.logService.info('[Sandtable Tools] 15 workspace tools registered');
	}
}

registerWorkbenchContribution2(
	SandtableToolsContribution.ID,
	SandtableToolsContribution,
	WorkbenchPhase.AfterRestored
);
