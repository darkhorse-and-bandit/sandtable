/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ICortexService, CortexConnectionStatus } from '../../../../platform/cortex/common/cortex.js';
import { AgentConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import * as dom from '../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { ISearchService, QueryType, ITextQuery, resultIsMatch, ITextSearchMatch } from '../../../services/search/common/search.js';

import { SandtableAgentLoop, IAgentToolExecutor, AgentEvent, IModelSelectionResult } from '../common/sandtableAgentLoop.js';
import { IEditFileArgs, ICreateFileArgs, IReadFileArgs, IRunCommandArgs, ISearchFilesArgs, IListDirectoryArgs } from '../common/sandtableAgentTools.js';
import { getConfirmationDisplayType } from '../common/sandtableAgentSafety.js';
import { SandtableAgentDiffView, SandtableAgentFilePreview, SandtableAgentCommandPreview } from './sandtableAgentDiffView.js';

import './sandtableAgent.css';

const $ = dom.$;

// ─── Agent Panel ──────────────────────────────────────────────────────────────

/**
 * Main ViewPane for the Agent conversation. Renders user messages, assistant
 * text, tool execution indicators, confirmation dialogs, and provides input
 * and stop controls.
 */
export class SandtableAgentPanel extends ViewPane implements IAgentToolExecutor {

	static readonly ID = 'sandtable.agentView';

	private _rootEl!: HTMLElement;
	private _disconnectedEl!: HTMLElement;
	private _disabledEl!: HTMLElement;
	private _contentEl!: HTMLElement;
	private _headerEl!: HTMLElement;
	private _messagesEl!: HTMLElement;
	private _welcomeEl!: HTMLElement;
	private _inputContainer!: HTMLElement;
	private _textarea!: HTMLTextAreaElement;
	private _sendBtn!: HTMLButtonElement;
	private _stopBtn!: HTMLButtonElement;
	private _iterationEl!: HTMLElement;

	private _agentLoop!: SandtableAgentLoop;
	private _isConnected = false;
	private _isEnabled = true;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService protected override readonly openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ICortexService private readonly cortexService: ICortexService,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ISearchService private readonly searchService: ISearchService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._agentLoop = this._register(new SandtableAgentLoop(this.cortexService));
		this._register(this._agentLoop.onEvent((event) => this._handleAgentEvent(event)));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._rootEl = dom.append(container, $('.sandtable-agent-root'));

		// ─── Disconnected State ──────────────────────────────────────────
		this._disconnectedEl = dom.append(this._rootEl, $('.sandtable-agent-disconnected'));
		const disconnectedIcon = dom.append(this._disconnectedEl, $('.sandtable-agent-disconnected-icon'));
		disconnectedIcon.textContent = '\u26A0'; // ⚠
		const disconnectedTitle = dom.append(this._disconnectedEl, $('.sandtable-agent-disconnected-title'));
		disconnectedTitle.textContent = 'Cortex Disconnected';
		const disconnectedMsg = dom.append(this._disconnectedEl, $('.sandtable-agent-disconnected-message'));
		disconnectedMsg.textContent = 'The Agent requires an active connection to Cortex. Check your connection settings and ensure Cortex is running.';

		// ─── Disabled State ──────────────────────────────────────────────
		this._disabledEl = dom.append(this._rootEl, $('.sandtable-agent-disabled'));
		this._disabledEl.style.display = 'none';
		const disabledIcon = dom.append(this._disabledEl, $('.sandtable-agent-disabled-icon'));
		disabledIcon.textContent = '\u2B50'; // ⭐
		const disabledTitle = dom.append(this._disabledEl, $('.sandtable-agent-disabled-title'));
		disabledTitle.textContent = 'Agent Disabled';
		const disabledMsg = dom.append(this._disabledEl, $('.sandtable-agent-disabled-message'));
		disabledMsg.textContent = 'The Agent is currently disabled. Enable it in Sandtable Settings > Agent to use autonomous coding features.';

		// ─── Connected Content ───────────────────────────────────────────
		this._contentEl = dom.append(this._rootEl, $('div'));
		this._contentEl.style.display = 'none';
		this._contentEl.style.flexDirection = 'column';
		this._contentEl.style.height = '100%';
		this._contentEl.style.cssText = 'display: none; flex-direction: column; height: 100%;';

		// Header with title, iteration counter, and stop button
		this._headerEl = dom.append(this._contentEl, $('.sandtable-agent-header'));

		const headerTitle = dom.append(this._headerEl, $('span.sandtable-agent-header-title'));
		headerTitle.textContent = 'Agent';

		const headerActions = dom.append(this._headerEl, $('.sandtable-agent-header-actions'));

		this._iterationEl = dom.append(headerActions, $('span.sandtable-agent-iteration-counter'));
		this._iterationEl.style.display = 'none';

		this._stopBtn = dom.append(headerActions, $('button.sandtable-agent-stop-btn')) as HTMLButtonElement;
		this._stopBtn.textContent = 'Stop';
		this._stopBtn.disabled = true;
		this._register(dom.addDisposableListener(this._stopBtn, 'click', () => {
			this._stopAgent();
		}));

		// Messages area
		this._messagesEl = dom.append(this._contentEl, $('.sandtable-agent-messages'));

		// Welcome state
		this._welcomeEl = dom.append(this._messagesEl, $('.sandtable-agent-welcome'));
		const welcomeIcon = dom.append(this._welcomeEl, $('div.sandtable-agent-welcome-icon'));
		welcomeIcon.textContent = '\u2728'; // ✨
		const welcomeTitle = dom.append(this._welcomeEl, $('div.sandtable-agent-welcome-title'));
		welcomeTitle.textContent = 'Sandtable Agent';
		const welcomeDesc = dom.append(this._welcomeEl, $('div.sandtable-agent-welcome-desc'));
		welcomeDesc.textContent = 'Describe a coding task and the agent will read files, write code, and run commands to accomplish it. The agent will ask for your approval before making any changes.';

		// Input area
		this._inputContainer = dom.append(this._contentEl, $('.sandtable-agent-input-container'));

		this._textarea = dom.append(this._inputContainer, $('textarea.sandtable-agent-input-textarea')) as HTMLTextAreaElement;
		this._textarea.placeholder = 'Describe a coding task...';
		this._textarea.rows = 3;

		const inputButtons = dom.append(this._inputContainer, $('.sandtable-agent-input-buttons'));
		this._sendBtn = dom.append(inputButtons, $('button.sandtable-agent-send-btn')) as HTMLButtonElement;
		this._sendBtn.textContent = 'Send';
		this._sendBtn.disabled = true;

		// ─── Event Wiring ────────────────────────────────────────────────

		this._register(dom.addDisposableListener(this._sendBtn, 'click', () => {
			this._handleSend();
		}));

		this._register(dom.addDisposableListener(this._textarea, 'keydown', (e: KeyboardEvent) => {
			// Enter sends, Shift+Enter adds newline
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this._handleSend();
			}
		}));

		this._register(dom.addDisposableListener(this._textarea, 'input', () => {
			this._updateSendButtonState();
		}));

		// Connection status
		this._register(this.cortexService.onConnectionStatusChanged((status: CortexConnectionStatus) => {
			this._updateConnectionState(status);
		}));

		// Enabled setting
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentConfigKeys.Enabled)) {
				this._updateEnabledState();
			}
		}));

		// Visibility awareness for initial state
		this._register(this.onDidChangeBodyVisibility((visible: boolean) => {
			if (visible) {
				this._updateEnabledState();
				this._updateConnectionState(this.cortexService.getConnectionStatus());
			}
		}));

		// Set initial state
		this._updateEnabledState();
		this._updateConnectionState(this.cortexService.getConnectionStatus());
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	// ─── Enabled State ────────────────────────────────────────────────────

	private _updateEnabledState(): void {
		this._isEnabled = this.configurationService.getValue<boolean>(AgentConfigKeys.Enabled) ?? true;
		this._updateVisibility();
	}

	// ─── Connection State ─────────────────────────────────────────────────

	private _updateConnectionState(status: CortexConnectionStatus): void {
		this._isConnected = status === 'connected';
		this._updateVisibility();
	}

	/**
	 * Manage visibility of the three mutually-exclusive states:
	 * disabled, disconnected, and connected content.
	 */
	private _updateVisibility(): void {
		if (!this._isEnabled) {
			// Agent disabled -- show disabled message, hide everything else
			this._disabledEl.style.display = '';
			this._disconnectedEl.style.display = 'none';
			this._contentEl.style.cssText = 'display: none; flex-direction: column; height: 100%;';
		} else if (!this._isConnected) {
			// Agent enabled but Cortex disconnected
			this._disabledEl.style.display = 'none';
			this._disconnectedEl.style.display = '';
			this._contentEl.style.cssText = 'display: none; flex-direction: column; height: 100%;';
		} else {
			// Agent enabled and connected -- show the main content
			this._disabledEl.style.display = 'none';
			this._disconnectedEl.style.display = 'none';
			this._contentEl.style.cssText = 'display: flex; flex-direction: column; height: 100%;';
			this._updateSendButtonState();
		}
	}

	// ─── Send Message ─────────────────────────────────────────────────────

	private async _handleSend(): Promise<void> {
		const text = this._textarea.value.trim();
		if (!text || this._agentLoop.isRunning) {
			return;
		}

		// Hide welcome
		this._welcomeEl.style.display = 'none';

		// Display user message
		this._addUserMessage(text);

		// Clear input
		this._textarea.value = '';
		this._updateSendButtonState();

		// Get agent settings
		const configuredModel = this.configurationService.getValue<string>(AgentConfigKeys.Model) || '';
		const maxIterations = this.configurationService.getValue<number>(AgentConfigKeys.MaxIterations) || 25;
		const maxTokens = this.configurationService.getValue<number>(AgentConfigKeys.MaxTokens) || 4096;
		const confirmDestructive = this.configurationService.getValue<boolean>(AgentConfigKeys.ConfirmDestructive) ?? true;

		// Select a model
		const selection: IModelSelectionResult = await this._agentLoop.selectModel(configuredModel);
		if (!selection.model) {
			if (selection.reason === 'no_running') {
				this._addSystemMessage('No running models found. Start a model in the Model Manager panel.');
			} else {
				this._addSystemMessage('No models available. Start a model that supports tool calling (e.g., DeepSeek V3, Qwen3-Coder, Llama 3.1+).');
			}
			return;
		}

		// Warn when falling back to a model that may not support tool calling
		if (selection.reason === 'auto_fallback') {
			this._addWarningMessage(`Using ${selection.model} which may not support tool calling. For best results, start a model like DeepSeek V3, Qwen3-Coder, or Llama 3.1+.`);
		}

		// Set UI to running state
		this._setRunningState(true);

		// Run the agent loop
		const result = await this._agentLoop.run(
			text,
			this, // this panel is the tool executor
			selection.model,
			maxIterations,
			maxTokens,
			confirmDestructive,
		);

		// Set UI to idle state
		this._setRunningState(false);

		this.logService.info(`[SandtableAgentPanel] Agent loop completed: ${result.reason}, iterations: ${result.iterations}`);
	}

	// ─── Agent Event Handling ─────────────────────────────────────────────

	private _handleAgentEvent(event: AgentEvent): void {
		switch (event.type) {
			case 'message':
				this._addAssistantMessage(event.content);
				break;

			case 'tool_executing':
				this._addToolIndicator(event.label, false);
				break;

			case 'tool_executed':
				this._updateLastToolIndicator(event.label, true);
				break;

			case 'tool_confirmation':
				this._showConfirmation(event);
				break;

			case 'iteration':
				this._updateIteration(event.current, event.max);
				break;

			case 'max_iterations':
				this._addWarningMessage(`Agent stopped after ${event.iterations} iterations (maximum reached).`);
				break;

			case 'stopped':
				this._addSystemMessage('Agent stopped.');
				break;

			case 'error':
				this._addSystemMessage(`Error: ${event.message}`);
				break;

			case 'no_tool_model':
				this._addSystemMessage(event.message);
				break;
		}
	}

	// ─── Confirmation Handling ────────────────────────────────────────────

	private _showConfirmation(event: { toolCall: { function: { name: string } }; parsedArgs: Record<string, unknown>; resolve: (accepted: boolean) => void }): void {
		const displayType = getConfirmationDisplayType(event.toolCall.function.name);

		switch (displayType) {
			case 'diff': {
				const args = event.parsedArgs as unknown as IEditFileArgs;
				this._register(new SandtableAgentDiffView(
					this._messagesEl,
					args.path || 'unknown',
					args.old_text || '',
					args.new_text || '',
					(accepted) => event.resolve(accepted),
				));
				break;
			}

			case 'file-preview': {
				const args = event.parsedArgs as unknown as ICreateFileArgs;
				this._register(new SandtableAgentFilePreview(
					this._messagesEl,
					args.path || 'unknown',
					args.contents || '',
					(accepted) => event.resolve(accepted),
				));
				break;
			}

			case 'command': {
				const args = event.parsedArgs as unknown as IRunCommandArgs;
				this._register(new SandtableAgentCommandPreview(
					this._messagesEl,
					args.command || 'unknown',
					args.working_directory,
					(accepted) => event.resolve(accepted),
				));
				break;
			}
		}

		this._scrollToBottom();
	}

	// ─── UI State Management ──────────────────────────────────────────────

	private _setRunningState(running: boolean): void {
		this._stopBtn.disabled = !running;
		this._sendBtn.disabled = running;
		this._textarea.disabled = running;

		if (!running) {
			this._iterationEl.style.display = 'none';
		}
	}

	private _updateSendButtonState(): void {
		const hasText = this._textarea.value.trim().length > 0;
		this._sendBtn.disabled = !hasText || this._agentLoop.isRunning || !this._isConnected || !this._isEnabled;
	}

	private _updateIteration(current: number, max: number): void {
		this._iterationEl.textContent = `Step ${current}/${max}`;
		this._iterationEl.style.display = '';
	}

	private _stopAgent(): void {
		this._agentLoop.stop();
	}

	// ─── Message Rendering ────────────────────────────────────────────────

	private _addUserMessage(content: string): void {
		const msgEl = dom.append(this._messagesEl, $('div.sandtable-agent-message.sandtable-agent-message-user'));
		const role = dom.append(msgEl, $('div.sandtable-agent-message-role'));
		role.textContent = 'YOU';
		const contentEl = dom.append(msgEl, $('div.sandtable-agent-message-content'));
		contentEl.textContent = content;
		this._scrollToBottom();
	}

	private _addAssistantMessage(content: string): void {
		const msgEl = dom.append(this._messagesEl, $('div.sandtable-agent-message.sandtable-agent-message-assistant'));
		const role = dom.append(msgEl, $('div.sandtable-agent-message-role'));
		role.textContent = 'AGENT';
		const contentEl = dom.append(msgEl, $('div.sandtable-agent-message-content'));

		// Render markdown for assistant messages
		const md = new MarkdownString(content, { supportHtml: false });
		md.isTrusted = false;
		const rendered = this._register(renderMarkdown(md, {
			actionHandler: (link: string) => { this.openerService.open(link, { allowCommands: false }); },
		}));
		contentEl.appendChild(rendered.element);

		this._scrollToBottom();
	}

	private _addSystemMessage(content: string): void {
		const msgEl = dom.append(this._messagesEl, $('div.sandtable-agent-message.sandtable-agent-message-system'));
		const contentEl = dom.append(msgEl, $('div.sandtable-agent-message-content'));
		contentEl.textContent = content;
		this._scrollToBottom();
	}

	private _addWarningMessage(content: string): void {
		const msgEl = dom.append(this._messagesEl, $('div.sandtable-agent-warning'));
		msgEl.textContent = content;
		this._scrollToBottom();
	}

	private _addToolIndicator(label: string, done: boolean): void {
		const indicator = dom.append(this._messagesEl, $('div.sandtable-agent-tool-indicator'));
		indicator.setAttribute('data-tool-indicator', 'true');

		const icon = dom.append(indicator, $('span.sandtable-agent-tool-icon'));
		if (done) {
			icon.textContent = '\u2713'; // ✓
		} else {
			icon.textContent = '\u25CB'; // ○
			icon.classList.add('sandtable-agent-tool-icon-spinning');
		}

		const labelEl = dom.append(indicator, $('span.sandtable-agent-tool-label'));
		labelEl.textContent = label;

		if (done) {
			const doneEl = dom.append(indicator, $('span.sandtable-agent-tool-done'));
			doneEl.textContent = 'done';
		}

		this._scrollToBottom();
	}

	private _updateLastToolIndicator(label: string, done: boolean): void {
		// Find the last tool indicator
		const indicators = this._messagesEl.querySelectorAll('[data-tool-indicator="true"]');
		if (indicators.length === 0) {
			this._addToolIndicator(label, done);
			return;
		}

		const lastIndicator = indicators[indicators.length - 1] as HTMLElement;
		const icon = lastIndicator.querySelector('.sandtable-agent-tool-icon');
		if (icon) {
			icon.textContent = '\u2713'; // ✓
			icon.classList.remove('sandtable-agent-tool-icon-spinning');
		}

		const labelEl = lastIndicator.querySelector('.sandtable-agent-tool-label');
		if (labelEl) {
			// Update label to remove "..." and show final form
			const cleanLabel = label.replace(/\.\.\.+$/, '');
			labelEl.textContent = cleanLabel;
		}

		// Add done indicator
		if (done && !lastIndicator.querySelector('.sandtable-agent-tool-done')) {
			const doneEl = dom.append(lastIndicator, $('span.sandtable-agent-tool-done'));
			doneEl.textContent = 'done';
		}
	}

	private _scrollToBottom(): void {
		if (this._messagesEl) {
			this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
		}
	}

	// ─── Tool Executor Implementation ─────────────────────────────────────

	/**
	 * Execute a tool call. This is the IAgentToolExecutor implementation.
	 * Called by the agent loop for each tool.
	 */
	async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
		switch (toolName) {
			case 'read_file':
				return this._executeReadFile(args as unknown as IReadFileArgs);
			case 'edit_file':
				return this._executeEditFile(args as unknown as IEditFileArgs);
			case 'create_file':
				return this._executeCreateFile(args as unknown as ICreateFileArgs);
			case 'run_command':
				return this._executeRunCommand(args as unknown as IRunCommandArgs);
			case 'search_files':
				return this._executeSearchFiles(args as unknown as ISearchFilesArgs);
			case 'list_directory':
				return this._executeListDirectory(args as unknown as IListDirectoryArgs);
			default:
				return `Unknown tool: ${toolName}`;
		}
	}

	private _getWorkspaceUri(): URI | undefined {
		const folders = this.workspaceService.getWorkspace().folders;
		return folders.length > 0 ? folders[0].uri : undefined;
	}

	private async _executeReadFile(args: IReadFileArgs): Promise<string> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			return 'Error: No workspace folder open.';
		}

		try {
			const fileUri = URI.joinPath(workspaceUri, args.path);
			const content = await this.fileService.readFile(fileUri);
			const text = content.value.toString();
			const lines = text.split('\n');

			const startLine = args.start_line ? Math.max(1, args.start_line) : 1;
			const endLine = args.end_line ? Math.min(lines.length, args.end_line) : lines.length;

			const result: string[] = [];
			for (let i = startLine - 1; i < endLine; i++) {
				result.push(`${i + 1}|${lines[i]}`);
			}

			return result.join('\n');
		} catch (err) {
			return `Error reading ${args.path}: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	private async _executeEditFile(args: IEditFileArgs): Promise<string> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			return 'Error: No workspace folder open.';
		}

		try {
			const fileUri = URI.joinPath(workspaceUri, args.path);
			const content = await this.fileService.readFile(fileUri);
			const text = content.value.toString();

			if (!text.includes(args.old_text)) {
				return `Error: Could not find the specified text in ${args.path}. The old_text does not match any content in the file. Use read_file to check the current contents.`;
			}

			// Check for uniqueness
			const firstIndex = text.indexOf(args.old_text);
			const secondIndex = text.indexOf(args.old_text, firstIndex + 1);
			if (secondIndex !== -1) {
				return `Error: The old_text matches multiple locations in ${args.path}. Please provide more context to make the match unique.`;
			}

			const newText = text.replace(args.old_text, args.new_text);
			await this.fileService.writeFile(fileUri, VSBuffer.fromString(newText));

			return `Successfully edited ${args.path}.`;
		} catch (err) {
			return `Error editing ${args.path}: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	private async _executeCreateFile(args: ICreateFileArgs): Promise<string> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			return 'Error: No workspace folder open.';
		}

		try {
			const fileUri = URI.joinPath(workspaceUri, args.path);

			// Check if file already exists
			try {
				await this.fileService.readFile(fileUri);
				return `Error: File ${args.path} already exists. Use edit_file to modify existing files.`;
			} catch {
				// File doesn't exist -- good, we can create it
			}

			await this.fileService.createFile(fileUri, VSBuffer.fromString(args.contents));
			return `Successfully created ${args.path} (${args.contents.split('\n').length} lines).`;
		} catch (err) {
			return `Error creating ${args.path}: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	private async _executeRunCommand(args: IRunCommandArgs): Promise<string> {
		try {
			// Build the full command (prepend cd if working_directory is set)
			let fullCommand = args.command;
			if (args.working_directory) {
				fullCommand = `cd ${args.working_directory} && ${args.command}`;
			}

			// Create a terminal instance for the agent
			const workspaceUri = this._getWorkspaceUri();
			const instance = await this.terminalService.createTerminal({
				location: TerminalLocation.Panel,
				cwd: workspaceUri,
			});

			// Wait for xterm to be ready
			const xterm = await instance.xtermReadyPromise;
			if (!xterm) {
				return `Error: Terminal failed to initialize.`;
			}

			// Check for rich command detection capability
			const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);

			if (commandDetection) {
				// Rich path: use command detection events for reliable output capture
				const onDone: Promise<{ type: 'finished'; command: { getOutput(): string | undefined; exitCode: number | undefined } } | { type: 'timeout' }> = Promise.race([
					Event.toPromise(commandDetection.onCommandFinished).then(cmd => ({
						type: 'finished' as const,
						command: cmd,
					})),
					new Promise<{ type: 'timeout' }>(resolve => setTimeout(() => resolve({ type: 'timeout' }), 30000)),
				]);

				const startMarker = xterm.raw.registerMarker();
				instance.runCommand(fullCommand, true);

				const doneResult = await onDone;
				const endMarker = xterm.raw.registerMarker();

				let output: string | undefined;
				if (doneResult.type === 'finished') {
					output = doneResult.command.getOutput();
				}
				if (output === undefined) {
					try {
						output = xterm.getContentsAsText(startMarker, endMarker);
					} catch {
						output = '(could not capture output)';
					}
				}

				const exitCode = doneResult.type === 'finished' ? doneResult.command.exitCode : undefined;
				const lines: string[] = [];
				if (exitCode !== undefined) {
					lines.push(`Exit code: ${exitCode}`);
				}
				lines.push(`stdout:\n${output || '(no output)'}`);
				return lines.join('\n');

			} else {
				// Basic path: use markers and a timeout for output capture
				const startMarker = xterm.raw.registerMarker();
				await instance.sendText(fullCommand, true);

				// Wait for the command to produce output and settle
				await new Promise(resolve => setTimeout(resolve, 3000));

				const endMarker = xterm.raw.registerMarker();
				let output: string | undefined;
				try {
					output = xterm.getContentsAsText(startMarker, endMarker);
				} catch {
					output = '(could not capture output)';
				}

				return `stdout:\n${output || '(no output)'}`;
			}
		} catch (err) {
			return `Error running command: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	private async _executeSearchFiles(args: ISearchFilesArgs): Promise<string> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			return 'Error: No workspace folder open.';
		}

		try {
			const query: ITextQuery = {
				type: QueryType.Text,
				contentPattern: {
					pattern: args.pattern,
					isRegExp: true,
				},
				folderQueries: [{ folder: workspaceUri }],
				includePattern: args.file_glob ? { [args.file_glob]: true } : undefined,
				maxResults: args.max_results || 20,
			};

			const searchResult = await this.searchService.textSearch(query);
			const results: string[] = [];

			for (const fileMatch of searchResult.results) {
				const relativePath = this._getRelativePath(fileMatch.resource);
				if (fileMatch.results) {
					for (const match of fileMatch.results) {
						if (resultIsMatch(match)) {
							const textMatch = match as ITextSearchMatch;
							const lineNum = textMatch.rangeLocations?.[0]?.source?.startLineNumber;
							const lineStr = lineNum !== undefined ? `${lineNum + 1}` : '?';
							const preview = textMatch.previewText.trim();
							results.push(`${relativePath}:${lineStr}: ${preview}`);
						}
					}
				}
			}

			if (results.length === 0) {
				return `No matches found for pattern "${args.pattern}".`;
			}

			const limitNote = searchResult.limitHit ? '\n(results truncated -- increase max_results for more)' : '';
			return `Found ${results.length} match(es):\n\n${results.join('\n')}${limitNote}`;
		} catch (err) {
			return `Error searching: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	private _getRelativePath(resourceUri: URI): string {
		const workspaceUri = this._getWorkspaceUri();
		if (workspaceUri && resourceUri.path.startsWith(workspaceUri.path)) {
			return resourceUri.path.substring(workspaceUri.path.length + 1);
		}
		return resourceUri.path;
	}

	private async _executeListDirectory(args: IListDirectoryArgs): Promise<string> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			return 'Error: No workspace folder open.';
		}

		try {
			const dirPath = args.path === '.' || args.path === '' ? '' : args.path;
			const dirUri = dirPath ? URI.joinPath(workspaceUri, dirPath) : workspaceUri;

			const stat = await this.fileService.resolve(dirUri);
			if (!stat.children) {
				return `${args.path} is not a directory or is empty.`;
			}

			const entries = stat.children.map(child => {
				const type = child.isDirectory ? '[dir]' : '[file]';
				return `${type}  ${child.name}`;
			});

			entries.sort();

			return entries.join('\n');
		} catch (err) {
			return `Error listing ${args.path}: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	// ─── Public API ───────────────────────────────────────────────────────

	/**
	 * Start the agent with a message (callable from a command).
	 */
	async startAgent(message: string): Promise<void> {
		this._textarea.value = message;
		await this._handleSend();
	}

	/**
	 * Stop the running agent (callable from a command).
	 */
	stopAgent(): void {
		this._stopAgent();
	}

	// ─── Dispose ──────────────────────────────────────────────────────────

	override dispose(): void {
		this._agentLoop.stop();
		super.dispose();
	}
}
