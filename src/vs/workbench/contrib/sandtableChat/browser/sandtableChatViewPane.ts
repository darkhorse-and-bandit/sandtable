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
import { ICortexService, ICortexMessage, ICortexChatSession, CortexConnectionStatus } from '../../../../platform/cortex/common/cortex.js';
import { ChatConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { SandtableChatModelSelector } from './sandtableChatModelSelector.js';
import { SandtableChatInput } from './sandtableChatInput.js';
import { SandtableChatMessageList, IChatMessage } from './sandtableChatMessageList.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';

import './sandtableChat.css';

/**
 * Main chat view pane for Sandtable.
 * Composes a model selector, message list, and input widget.
 * Manages chat sessions and streaming inference.
 */
export class SandtableChatViewPane extends ViewPane {

	static readonly ID = 'sandtable.chatView';

	private _modelSelector!: SandtableChatModelSelector;
	private _messageList!: SandtableChatMessageList;
	private _chatInput!: SandtableChatInput;
	private _sessionSidebar!: HTMLElement;
	private _chatContainer!: HTMLElement;

	private _conversationMessages: ICortexMessage[] = [];
	private _currentSessionId: string | undefined;
	private _sessions: ICortexChatSession[] = [];
	private _streamingTokenSource: CancellationTokenSource | undefined;

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
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const rootEl = dom.append(container, dom.$('.sandtable-chat-root'));

		// ─── Session Sidebar ──────────────────────────────────────────────
		this._sessionSidebar = dom.append(rootEl, dom.$('.sandtable-chat-session-sidebar'));
		this._buildSessionSidebar();

		// ─── Chat Container ───────────────────────────────────────────────
		this._chatContainer = dom.append(rootEl, dom.$('.sandtable-chat-container'));

		// Model selector
		this._modelSelector = this._register(new SandtableChatModelSelector(this._chatContainer, this.cortexService));

		// Message list
		this._messageList = this._register(new SandtableChatMessageList(this._chatContainer, this.openerService));

		// Input area
		this._chatInput = this._register(new SandtableChatInput(this._chatContainer));

		// ─── Event Wiring ─────────────────────────────────────────────────

		// Handle message submission
		this._register(this._chatInput.onDidSubmit(text => {
			this._handleSendMessage(text);
		}));

		// Handle stop request
		this._register(this._chatInput.onDidRequestStop(() => {
			this._cancelStreaming();
		}));

		// Handle connection status changes
		this._register(this.cortexService.onConnectionStatusChanged((status: CortexConnectionStatus) => {
			this._updateConnectionState(status);
		}));

		// Set initial state based on current connection
		this._updateConnectionState(this.cortexService.getConnectionStatus());

		// Load sessions
		this._loadSessions();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		// The CSS flexbox layout handles the internal sizing
	}

	// ─── Session Sidebar ──────────────────────────────────────────────────

	private _buildSessionSidebar(): void {
		dom.clearNode(this._sessionSidebar);

		// New Chat button
		const newChatBtn = dom.append(this._sessionSidebar, dom.$('button.sandtable-chat-new-session-btn'));
		newChatBtn.textContent = nls.localize('sandtable.chat.newChat', "New Chat");
		newChatBtn.title = nls.localize('sandtable.chat.newChatTooltip', "Start a new chat session");
		this._register(dom.addDisposableListener(newChatBtn, 'click', () => {
			this._startNewChat();
		}));

		// Session list
		const sessionListEl = dom.append(this._sessionSidebar, dom.$('.sandtable-chat-session-list'));

		for (const session of this._sessions) {
			const sessionEl = dom.append(sessionListEl, dom.$('.sandtable-chat-session-item'));
			if (session.id === this._currentSessionId) {
				sessionEl.classList.add('active');
			}

			const titleEl = dom.append(sessionEl, dom.$('.sandtable-chat-session-title'));
			titleEl.textContent = session.title || nls.localize('sandtable.chat.untitled', "Untitled Chat");
			titleEl.title = `${session.model} · ${session.message_count} messages`;

			const deleteBtn = dom.append(sessionEl, dom.$('button.sandtable-chat-session-delete'));
			deleteBtn.textContent = '\u00d7'; // × symbol
			deleteBtn.title = nls.localize('sandtable.chat.deleteSession', "Delete session");

			this._register(dom.addDisposableListener(sessionEl, 'click', () => {
				this._switchToSession(session.id);
			}));

			this._register(dom.addDisposableListener(deleteBtn, 'click', (e: MouseEvent) => {
				e.stopPropagation();
				this._deleteSession(session.id);
			}));
		}
	}

	private async _loadSessions(): Promise<void> {
		try {
			this._sessions = await this.cortexService.listChatSessions();
		} catch {
			this._sessions = [];
		}
		this._buildSessionSidebar();
	}

	private async _switchToSession(sessionId: string): Promise<void> {
		try {
			const session = await this.cortexService.getChatSession(sessionId);
			this._currentSessionId = sessionId;
			this._conversationMessages = session.messages.map(m => ({
				role: m.role,
				content: m.content,
			}));

			// Load messages into the message list
			const chatMessages: IChatMessage[] = session.messages
				.filter(m => m.role !== 'system')
				.map(m => ({
					role: m.role as IChatMessage['role'],
					content: m.content,
				}));
			this._messageList.loadMessages(chatMessages);

			// Update model selector
			this._modelSelector.setSelectedModel(session.model);

			this._buildSessionSidebar();
		} catch {
			// Failed to load session -- ignore
		}
	}

	private async _deleteSession(sessionId: string): Promise<void> {
		try {
			await this.cortexService.deleteChatSession(sessionId);
			if (this._currentSessionId === sessionId) {
				this._currentSessionId = undefined;
				this._conversationMessages = [];
				this._messageList.clearMessages();
			}
			await this._loadSessions();
		} catch {
			// Failed to delete -- ignore
		}
	}

	private async _startNewChat(): Promise<void> {
		this._currentSessionId = undefined;
		this._conversationMessages = [];
		this._messageList.clearMessages();
		this._chatInput.focus();
		this._buildSessionSidebar();
	}

	// ─── Message Sending ──────────────────────────────────────────────────

	private async _handleSendMessage(text: string): Promise<void> {
		const model = this._modelSelector.selectedModel;
		if (!model) {
			this._messageList.addMessage({
				role: 'system',
				content: nls.localize('sandtable.chat.noModelSelected', "No model selected. Please select a model from the dropdown above."),
			});
			return;
		}

		// Add user message to the conversation
		const userMessage: ICortexMessage = { role: 'user', content: text };
		this._conversationMessages.push(userMessage);

		// Display user message
		this._messageList.addMessage({ role: 'user', content: text });

		// Create session if not exists
		if (!this._currentSessionId) {
			const systemPrompt = this.configurationService.getValue<string>(ChatConfigKeys.SystemPrompt) || 'You are a helpful coding assistant.';

			// Always add system prompt to conversation, even if session persistence fails
			if (!this._conversationMessages.some(m => m.role === 'system')) {
				this._conversationMessages.unshift({ role: 'system', content: systemPrompt });
			}

			try {
				const session = await this.cortexService.createChatSession({
					title: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
					model,
					system_prompt: systemPrompt,
				});
				this._currentSessionId = session.id;

				// Persist the user message to the session
				await this.cortexService.addMessageToSession(session.id, {
					role: 'user',
					content: text,
				});
			} catch {
				// Session creation failed -- proceed without persistence
				// Chat will still work via the provider registry
			}
		} else {
			// Persist user message
			try {
				await this.cortexService.addMessageToSession(this._currentSessionId, {
					role: 'user',
					content: text,
				});
			} catch {
				// Persistence failed -- continue anyway
			}
		}

		// Send to Cortex
		await this._sendToCortex(model);

		// Refresh session list
		await this._loadSessions();
	}

	private async _sendToCortex(model: string): Promise<void> {
		const streamingEnabled = this.configurationService.getValue<boolean>(ChatConfigKeys.StreamingEnabled) ?? true;
		const maxTokens = this.configurationService.getValue<number>(ChatConfigKeys.MaxTokens) || 2048;
		const temperature = this.configurationService.getValue<number>(ChatConfigKeys.Temperature) ?? 0.7;

		const request = {
			model,
			messages: this._conversationMessages,
			max_tokens: maxTokens,
			temperature,
		};

		if (streamingEnabled) {
			await this._sendStreaming(request);
		} else {
			await this._sendNonStreaming(request);
		}
	}

	private async _sendStreaming(request: { model: string; messages: ICortexMessage[]; max_tokens: number; temperature: number }): Promise<void> {
		this._chatInput.setStreaming(true);

		// Begin streaming message display
		this._messageList.beginStreamingMessage();

		const startTime = Date.now();
		this._streamingTokenSource = new CancellationTokenSource();
		let totalTokens = 0;

		try {
			const result = await this.cortexService.chatCompletionStream(
				request,
				(chunk) => {
					if (chunk.content) {
						this._messageList.appendStreamingContent(chunk.content);
						totalTokens++;
					}
				},
				this._streamingTokenSource.token
			);

			totalTokens = result.totalTokens || totalTokens;
			const elapsedMs = Date.now() - startTime;
			const tokensPerSecond = totalTokens > 0 ? (totalTokens / (elapsedMs / 1000)) : 0;

			this._messageList.finalizeStreamingMessage({
				tokensPerSecond,
				totalTokens,
			});

			// Reconstruct the full assistant message for conversation history
			// We need to collect it from the streaming content
			const assistantContent = this._collectLastAssistantContent();
			if (assistantContent) {
				this._conversationMessages.push({ role: 'assistant', content: assistantContent });

				// Persist assistant message
				if (this._currentSessionId) {
					try {
						await this.cortexService.addMessageToSession(this._currentSessionId, {
							role: 'assistant',
							content: assistantContent,
						});
					} catch {
						// Persistence failed
					}
				}
			}
		} catch (err) {
			this._messageList.finalizeStreamingMessage();

			if (err instanceof Error && err.name === 'AbortError') {
				this._messageList.addMessage({
					role: 'system',
					content: nls.localize('sandtable.chat.aborted', "Generation stopped."),
				});
			} else {
				const errorMsg = err instanceof Error ? err.message : String(err);
				this._messageList.addMessage({
					role: 'system',
					content: nls.localize('sandtable.chat.error', "Error: {0}", errorMsg),
				});
			}
		} finally {
			this._chatInput.setStreaming(false);
			this._streamingTokenSource?.dispose();
			this._streamingTokenSource = undefined;
		}
	}

	private async _sendNonStreaming(request: { model: string; messages: ICortexMessage[]; max_tokens: number; temperature: number }): Promise<void> {
		this._chatInput.setStreaming(true);
		this._messageList.beginStreamingMessage();

		try {
			const response = await this.cortexService.chatCompletion(request);
			const assistantContent = response.choices?.[0]?.message?.content || '';

			this._messageList.finalizeStreamingMessage();
			this._messageList.addMessage({ role: 'assistant', content: assistantContent });

			this._conversationMessages.push({ role: 'assistant', content: assistantContent });

			// Persist
			if (this._currentSessionId) {
				try {
					await this.cortexService.addMessageToSession(this._currentSessionId, {
						role: 'assistant',
						content: assistantContent,
					});
				} catch {
					// Persistence failed
				}
			}
		} catch (err) {
			this._messageList.finalizeStreamingMessage();
			const errorMsg = err instanceof Error ? err.message : String(err);
			this._messageList.addMessage({
				role: 'system',
				content: nls.localize('sandtable.chat.error', "Error: {0}", errorMsg),
			});
		} finally {
			this._chatInput.setStreaming(false);
		}
	}

	// ─── Streaming Control ────────────────────────────────────────────────

	private _cancelStreaming(): void {
		this._streamingTokenSource?.cancel();
	}

	// ─── Connection State ─────────────────────────────────────────────────

	private _updateConnectionState(status: CortexConnectionStatus): void {
		const connected = status === 'connected';
		this._chatInput?.setEnabled(connected);
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	/**
	 * Collects the content of the last assistant message that was streamed.
	 * This is a workaround since we don't capture the full text during streaming.
	 */
	private _collectLastAssistantContent(): string {
		// Walk the message elements to find the last assistant message content
		const allMessages = this._chatContainer?.querySelectorAll('.sandtable-chat-message-assistant .sandtable-chat-message-content');
		if (allMessages && allMessages.length > 0) {
			const lastAssistant = allMessages[allMessages.length - 1];
			return lastAssistant.textContent || '';
		}
		return '';
	}

	override dispose(): void {
		this._cancelStreaming();
		super.dispose();
	}
}

// ─── Helper: Disposable event registration ────────────────────────────────────
// Not needed here -- ViewPane already extends Disposable via Pane
