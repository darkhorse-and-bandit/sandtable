/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';

// ─── Message Types ────────────────────────────────────────────────────────────

export interface IChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: Date;
}

// ─── Message List Widget ──────────────────────────────────────────────────────

/**
 * Scrollable message list that renders chat messages with markdown support.
 * Supports streaming: assistant messages can be appended to incrementally.
 */
export class SandtableChatMessageList extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _messageElements: Map<number, HTMLElement> = new Map();
	private _messageCount: number = 0;
	private _currentStreamingElement: HTMLElement | null = null;
	private _currentStreamingContent: string = '';
	private _renderBatchTimeout: ReturnType<typeof setTimeout> | undefined;
	private _pendingRender: boolean = false;

	constructor(
		parent: HTMLElement,
		private readonly openerService: IOpenerService,
	) {
		super();

		this._container = dom.append(parent, dom.$('.sandtable-chat-messages'));
		this._container.setAttribute('role', 'log');
		this._container.setAttribute('aria-label', nls.localize('sandtable.chat.messageList', "Chat messages"));
	}

	// ─── Message Management ───────────────────────────────────────────────

	addMessage(message: IChatMessage): number {
		const index = this._messageCount++;
		const messageEl = this._createMessageElement(message);
		this._messageElements.set(index, messageEl);
		this._container.appendChild(messageEl);
		this._scrollToBottom();
		return index;
	}

	/**
	 * Begins a new streaming assistant message.
	 * Returns the index of the message for subsequent appendContent calls.
	 */
	beginStreamingMessage(): number {
		const index = this._messageCount++;
		const messageEl = this._createMessageElement({ role: 'assistant', content: '' });
		messageEl.classList.add('sandtable-chat-message-streaming');

		// Add typing indicator
		const typingIndicator = dom.append(messageEl.querySelector('.sandtable-chat-message-content')!, dom.$('.sandtable-chat-typing-indicator'));
		typingIndicator.innerHTML = '<span></span><span></span><span></span>';

		this._messageElements.set(index, messageEl);
		this._container.appendChild(messageEl);
		this._currentStreamingElement = messageEl;
		this._currentStreamingContent = '';
		this._scrollToBottom();
		return index;
	}

	/**
	 * Appends content to the current streaming message.
	 * Batches markdown rendering every 100ms for performance.
	 */
	appendStreamingContent(content: string): void {
		if (!this._currentStreamingElement) {
			return;
		}

		this._currentStreamingContent += content;
		this._pendingRender = true;

		// Batch rendering to avoid re-parsing markdown on every token
		if (!this._renderBatchTimeout) {
			this._renderBatchTimeout = setTimeout(() => {
				this._flushStreamingRender();
				this._renderBatchTimeout = undefined;
			}, 100);
		}
	}

	/**
	 * Finalizes the streaming message -- performs final markdown render.
	 */
	finalizeStreamingMessage(metrics?: { tokensPerSecond?: number; totalTokens?: number }): void {
		if (this._renderBatchTimeout) {
			clearTimeout(this._renderBatchTimeout);
			this._renderBatchTimeout = undefined;
		}

		this._flushStreamingRender();

		if (this._currentStreamingElement) {
			this._currentStreamingElement.classList.remove('sandtable-chat-message-streaming');

			// Remove typing indicator
			const typingIndicator = this._currentStreamingElement.querySelector('.sandtable-chat-typing-indicator');
			typingIndicator?.remove();

			// Add metrics footer if available
			if (metrics) {
				const metricsEl = dom.append(this._currentStreamingElement, dom.$('.sandtable-chat-message-metrics'));
				const parts: string[] = [];
				if (metrics.tokensPerSecond !== undefined) {
					parts.push(`${metrics.tokensPerSecond.toFixed(1)} tok/s`);
				}
				if (metrics.totalTokens !== undefined) {
					parts.push(`${metrics.totalTokens} tokens`);
				}
				metricsEl.textContent = parts.join(' · ');
			}
		}

		this._currentStreamingElement = null;
		this._currentStreamingContent = '';
		this._scrollToBottom();
	}

	private _flushStreamingRender(): void {
		if (!this._pendingRender || !this._currentStreamingElement) {
			return;
		}
		this._pendingRender = false;

		const contentEl = this._currentStreamingElement.querySelector('.sandtable-chat-message-content');
		if (!contentEl) {
			return;
		}

		// Remove typing indicator during render
		const typingIndicator = contentEl.querySelector('.sandtable-chat-typing-indicator');

		// Render markdown
		const md = new MarkdownString(this._currentStreamingContent, { supportHtml: false });
		md.isTrusted = false;

		const rendered = renderMarkdown(md, {
			actionHandler: (link: string) => {
				this.openerService.open(link, { allowCommands: false });
			}
		});

		dom.clearNode(contentEl as HTMLElement);
		(contentEl as HTMLElement).appendChild(rendered.element);

		// Re-add typing indicator
		if (typingIndicator) {
			(contentEl as HTMLElement).appendChild(typingIndicator);
		}

		this._scrollToBottom();
	}

	// ─── Clear ────────────────────────────────────────────────────────────

	clearMessages(): void {
		dom.clearNode(this._container);
		this._messageElements.clear();
		this._messageCount = 0;
		this._currentStreamingElement = null;
		this._currentStreamingContent = '';
		if (this._renderBatchTimeout) {
			clearTimeout(this._renderBatchTimeout);
			this._renderBatchTimeout = undefined;
		}
	}

	/**
	 * Loads a list of messages into the message list (e.g., from a restored session).
	 */
	loadMessages(messages: IChatMessage[]): void {
		this.clearMessages();
		for (const msg of messages) {
			this.addMessage(msg);
		}
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	private _createMessageElement(message: IChatMessage): HTMLElement {
		const messageEl = dom.$('.sandtable-chat-message');
		messageEl.classList.add(`sandtable-chat-message-${message.role}`);

		// Role label
		const roleEl = dom.append(messageEl, dom.$('.sandtable-chat-message-role'));
		roleEl.textContent = message.role === 'user'
			? nls.localize('sandtable.chat.you', "You")
			: message.role === 'assistant'
				? nls.localize('sandtable.chat.assistant', "Assistant")
				: nls.localize('sandtable.chat.system', "System");

		// Content area
		const contentEl = dom.append(messageEl, dom.$('.sandtable-chat-message-content'));

		if (message.content) {
			if (message.role === 'user') {
				// User messages: render as plain text (with line breaks)
				contentEl.textContent = message.content;
				contentEl.style.whiteSpace = 'pre-wrap';
			} else {
				// Assistant/system messages: render as markdown
				const md = new MarkdownString(message.content, { supportHtml: false });
				md.isTrusted = false;

				const rendered = renderMarkdown(md, {
					actionHandler: (link: string) => {
						this.openerService.open(link, { allowCommands: false });
					}
				});
				contentEl.appendChild(rendered.element);
			}
		}

		return messageEl;
	}

	private _scrollToBottom(): void {
		// Use requestAnimationFrame to ensure DOM has updated
		requestAnimationFrame(() => {
			this._container.scrollTop = this._container.scrollHeight;
		});
	}

	override dispose(): void {
		if (this._renderBatchTimeout) {
			clearTimeout(this._renderBatchTimeout);
			this._renderBatchTimeout = undefined;
		}
		super.dispose();
	}
}
