/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
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
} from '../../chat/common/tools/languageModelToolsService.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

// ─── Tool Data Definitions ────────────────────────────────────────────────────

const SANDTABLE_TOOL_SOURCE: typeof ToolDataSource.Internal = { type: 'internal', label: 'Sandtable' };

const readFileToolData: IToolData = {
	id: 'sandtable_read_file',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Read File',
	modelDescription: 'Read the contents of a file in the workspace. Returns the file text with line numbers.',
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
};

const editFileToolData: IToolData = {
	id: 'sandtable_edit_file',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Edit File',
	modelDescription: 'Replace a specific text string in a file. The old_text must match exactly. Use read_file first to see the current content.',
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
};

const createFileToolData: IToolData = {
	id: 'sandtable_create_file',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Create File',
	modelDescription: 'Create a new file with the given contents. Will fail if the file already exists.',
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
};

const runCommandToolData: IToolData = {
	id: 'sandtable_run_command',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Run Command',
	modelDescription: 'Run a shell command in the workspace terminal. Returns stdout and stderr.',
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
};

const searchFilesToolData: IToolData = {
	id: 'sandtable_search_files',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Search Files',
	modelDescription: 'Search for text across files in the workspace using regex. Returns matching file paths and line numbers.',
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
};

const listDirectoryToolData: IToolData = {
	id: 'sandtable_list_directory',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'List Directory',
	modelDescription: 'List files and directories at a given path. Returns names with file/directory indicators.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Relative path to list. Use "." for workspace root.' },
		},
		required: ['path'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

// ─── Tool Implementations ─────────────────────────────────────────────────────

function textResult(value: string): IToolResult {
	return { content: [{ kind: 'text', value } satisfies IToolResultTextPart] };
}

function errorResult(message: string): IToolResult {
	return { content: [{ kind: 'text', value: `Error: ${message}` } satisfies IToolResultTextPart], toolResultError: message };
}

class ReadFileTool implements IToolImpl {
	constructor(
		private readonly fileService: IFileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

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

class ListDirectoryTool implements IToolImpl {
	constructor(
		private readonly fileService: IFileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

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

		// Run Command -- note: we register the tool data but the implementation
		// requires ITerminalService which has complex lifecycle. For now, register
		// with a placeholder that instructs the user to use the terminal.
		this._register(this.toolsService.registerTool(
			runCommandToolData,
			{
				async invoke(_invocation, _countTokens, _progress, _token): Promise<IToolResult> {
					// TODO: Implement via ITerminalService when ready
					return textResult('Command execution is not yet available through the chat panel. Please use the integrated terminal.');
				}
			}
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

		this.logService.info('[Sandtable Tools] 6 workspace tools registered');
	}
}

registerWorkbenchContribution2(
	SandtableToolsContribution.ID,
	SandtableToolsContribution,
	WorkbenchPhase.AfterRestored
);
