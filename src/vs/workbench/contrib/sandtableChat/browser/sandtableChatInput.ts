/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';

/**
 * Chat input widget with a multi-line text area and Send button.
 * Supports Shift+Enter for newlines and Enter to send.
 */
export class SandtableChatInput extends Disposable {

	private readonly _onDidSubmit = this._register(new Emitter<string>());
	readonly onDidSubmit: Event<string> = this._onDidSubmit.event;

	private readonly _onDidRequestStop = this._register(new Emitter<void>());
	readonly onDidRequestStop: Event<void> = this._onDidRequestStop.event;

	private readonly _container: HTMLElement;
	private readonly _textArea: HTMLTextAreaElement;
	private readonly _buttonContainer: HTMLElement;
	private readonly _sendButton: HTMLButtonElement;
	private readonly _stopButton: HTMLButtonElement;
	private _isStreaming: boolean = false;

	constructor(parent: HTMLElement) {
		super();

		this._container = dom.append(parent, dom.$('.sandtable-chat-input-container'));

		// Text area
		this._textArea = dom.append(this._container, dom.$('textarea.sandtable-chat-input-textarea')) as HTMLTextAreaElement;
		this._textArea.placeholder = nls.localize('sandtable.chat.inputPlaceholder', "Type a message... (Enter to send, Shift+Enter for newline)");
		this._textArea.rows = 3;

		// Button container
		this._buttonContainer = dom.append(this._container, dom.$('.sandtable-chat-input-buttons'));

		// Send button
		this._sendButton = dom.append(this._buttonContainer, dom.$('button.sandtable-chat-send-button')) as HTMLButtonElement;
		this._sendButton.textContent = nls.localize('sandtable.chat.send', "Send");
		this._sendButton.title = nls.localize('sandtable.chat.sendTooltip', "Send message (Enter)");

		// Stop button (hidden by default)
		this._stopButton = dom.append(this._buttonContainer, dom.$('button.sandtable-chat-stop-button')) as HTMLButtonElement;
		this._stopButton.textContent = nls.localize('sandtable.chat.stop', "Stop");
		this._stopButton.title = nls.localize('sandtable.chat.stopTooltip', "Stop generation");
		this._stopButton.style.display = 'none';

		// Event handlers
		this._register(dom.addDisposableListener(this._textArea, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this._submit();
			}
		}));

		this._register(dom.addDisposableListener(this._textArea, 'input', () => {
			this._autoResize();
		}));

		this._register(dom.addDisposableListener(this._sendButton, 'click', () => {
			this._submit();
		}));

		this._register(dom.addDisposableListener(this._stopButton, 'click', () => {
			this._onDidRequestStop.fire();
		}));
	}

	private _submit(): void {
		const text = this._textArea.value.trim();
		if (!text || this._isStreaming) {
			return;
		}
		this._textArea.value = '';
		this._autoResize();
		this._onDidSubmit.fire(text);
	}

	private _autoResize(): void {
		this._textArea.style.height = 'auto';
		const scrollHeight = this._textArea.scrollHeight;
		const maxHeight = 150; // Max 150px height
		this._textArea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
	}

	setStreaming(streaming: boolean): void {
		this._isStreaming = streaming;
		this._textArea.disabled = streaming;
		this._sendButton.disabled = streaming;
		this._sendButton.style.display = streaming ? 'none' : '';
		this._stopButton.style.display = streaming ? '' : 'none';
	}

	focus(): void {
		this._textArea.focus();
	}

	setEnabled(enabled: boolean): void {
		this._textArea.disabled = !enabled;
		this._sendButton.disabled = !enabled;
	}
}
