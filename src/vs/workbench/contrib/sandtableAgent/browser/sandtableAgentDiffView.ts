/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import * as dom from '../../../../base/browser/dom.js';

const $ = dom.$;

// ─── Diff Types ───────────────────────────────────────────────────────────────

interface IDiffLine {
	type: 'removed' | 'added' | 'context';
	text: string;
}

// ─── Inline Diff View ─────────────────────────────────────────────────────────

/**
 * Renders an inline diff showing old_text vs new_text with red (removed)
 * and green (added) lines, plus Accept/Reject buttons.
 */
export class SandtableAgentDiffView extends Disposable {

	private readonly _rootEl: HTMLElement;
	private _resolveCallback: ((accepted: boolean) => void) | undefined;

	constructor(
		parent: HTMLElement,
		filePath: string,
		oldText: string,
		newText: string,
		onResolve: (accepted: boolean) => void,
	) {
		super();

		this._resolveCallback = onResolve;
		this._rootEl = dom.append(parent, $('.sandtable-agent-diff'));

		// Header
		const header = dom.append(this._rootEl, $('.sandtable-agent-diff-header'));
		const title = dom.append(header, $('span.sandtable-agent-diff-title'));
		title.textContent = `Agent wants to edit ${filePath}`;

		// Diff content
		const diffContent = dom.append(this._rootEl, $('.sandtable-agent-diff-content'));
		const diffLines = this._computeDiff(oldText, newText);
		this._renderDiffLines(diffContent, diffLines);

		// Buttons
		const buttonsRow = dom.append(this._rootEl, $('.sandtable-agent-diff-buttons'));

		const rejectBtn = dom.append(buttonsRow, $('button.sandtable-agent-btn.sandtable-agent-btn-reject'));
		rejectBtn.textContent = 'Reject';
		this._register(dom.addDisposableListener(rejectBtn, 'click', () => {
			this._resolve(false);
		}));

		const acceptBtn = dom.append(buttonsRow, $('button.sandtable-agent-btn.sandtable-agent-btn-accept'));
		acceptBtn.textContent = 'Accept';
		this._register(dom.addDisposableListener(acceptBtn, 'click', () => {
			this._resolve(true);
		}));
	}

	private _resolve(accepted: boolean): void {
		if (this._resolveCallback) {
			const cb = this._resolveCallback;
			this._resolveCallback = undefined;

			// Update visual state
			this._rootEl.classList.add(accepted ? 'sandtable-agent-diff-accepted' : 'sandtable-agent-diff-rejected');

			// Disable buttons
			const buttons = this._rootEl.querySelectorAll('button');
			buttons.forEach(b => (b as HTMLButtonElement).disabled = true);

			// Add result indicator
			const indicator = dom.append(this._rootEl, $('.sandtable-agent-diff-result'));
			indicator.textContent = accepted ? 'Change accepted' : 'Change rejected';

			cb(accepted);
		}
	}

	/**
	 * Compute a simple line-based diff between old and new text.
	 */
	private _computeDiff(oldText: string, newText: string): IDiffLine[] {
		const oldLines = oldText.split('\n');
		const newLines = newText.split('\n');
		const result: IDiffLine[] = [];

		// Simple diff: show removed lines then added lines
		// For a more sophisticated diff, we'd use a proper diff algorithm,
		// but this approach is clear and functional for code review.

		// Find the longest common prefix and suffix
		let prefixLen = 0;
		const minLen = Math.min(oldLines.length, newLines.length);
		while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
			prefixLen++;
		}

		let suffixLen = 0;
		while (
			suffixLen < (minLen - prefixLen) &&
			oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
		) {
			suffixLen++;
		}

		// Context lines at the start (up to 3)
		const contextStart = Math.max(0, prefixLen - 3);
		for (let i = contextStart; i < prefixLen; i++) {
			result.push({ type: 'context', text: oldLines[i] });
		}

		// Removed lines
		const oldEndIdx = oldLines.length - suffixLen;
		for (let i = prefixLen; i < oldEndIdx; i++) {
			result.push({ type: 'removed', text: oldLines[i] });
		}

		// Added lines
		const newEndIdx = newLines.length - suffixLen;
		for (let i = prefixLen; i < newEndIdx; i++) {
			result.push({ type: 'added', text: newLines[i] });
		}

		// Context lines at the end (up to 3)
		const contextEnd = Math.min(oldLines.length, oldEndIdx + 3);
		for (let i = oldEndIdx; i < contextEnd; i++) {
			result.push({ type: 'context', text: oldLines[i] });
		}

		return result;
	}

	/**
	 * Render diff lines into the container.
	 */
	private _renderDiffLines(container: HTMLElement, lines: IDiffLine[]): void {
		if (lines.length === 0) {
			const emptyLine = dom.append(container, $('div.sandtable-agent-diff-line.sandtable-agent-diff-context'));
			emptyLine.textContent = '(no differences)';
			return;
		}

		for (const line of lines) {
			const lineEl = dom.append(container, $('div.sandtable-agent-diff-line'));

			let prefix = ' ';
			switch (line.type) {
				case 'removed':
					lineEl.classList.add('sandtable-agent-diff-removed');
					prefix = '-';
					break;
				case 'added':
					lineEl.classList.add('sandtable-agent-diff-added');
					prefix = '+';
					break;
				case 'context':
					lineEl.classList.add('sandtable-agent-diff-context');
					prefix = ' ';
					break;
			}

			const prefixEl = dom.append(lineEl, $('span.sandtable-agent-diff-prefix'));
			prefixEl.textContent = prefix;

			const textEl = dom.append(lineEl, $('span.sandtable-agent-diff-text'));
			textEl.textContent = line.text;
		}
	}

	override dispose(): void {
		// If still pending, reject
		if (this._resolveCallback) {
			this._resolveCallback(false);
			this._resolveCallback = undefined;
		}
		super.dispose();
	}
}

// ─── File Preview ─────────────────────────────────────────────────────────────

/**
 * Renders a preview of a file to be created, with Accept/Reject buttons.
 */
export class SandtableAgentFilePreview extends Disposable {

	private readonly _rootEl: HTMLElement;
	private _resolveCallback: ((accepted: boolean) => void) | undefined;

	constructor(
		parent: HTMLElement,
		filePath: string,
		contents: string,
		onResolve: (accepted: boolean) => void,
	) {
		super();

		this._resolveCallback = onResolve;
		this._rootEl = dom.append(parent, $('.sandtable-agent-diff'));

		// Header
		const header = dom.append(this._rootEl, $('.sandtable-agent-diff-header'));
		const title = dom.append(header, $('span.sandtable-agent-diff-title'));
		title.textContent = `Agent wants to create ${filePath}`;

		// File content preview
		const preview = dom.append(this._rootEl, $('.sandtable-agent-diff-content'));
		const lines = contents.split('\n');
		const maxPreviewLines = 30;
		const displayLines = lines.slice(0, maxPreviewLines);

		for (const line of displayLines) {
			const lineEl = dom.append(preview, $('div.sandtable-agent-diff-line.sandtable-agent-diff-added'));
			const prefixEl = dom.append(lineEl, $('span.sandtable-agent-diff-prefix'));
			prefixEl.textContent = '+';
			const textEl = dom.append(lineEl, $('span.sandtable-agent-diff-text'));
			textEl.textContent = line;
		}

		if (lines.length > maxPreviewLines) {
			const moreEl = dom.append(preview, $('div.sandtable-agent-diff-line.sandtable-agent-diff-context'));
			moreEl.textContent = `  ... and ${lines.length - maxPreviewLines} more lines`;
		}

		// Buttons
		const buttonsRow = dom.append(this._rootEl, $('.sandtable-agent-diff-buttons'));

		const rejectBtn = dom.append(buttonsRow, $('button.sandtable-agent-btn.sandtable-agent-btn-reject'));
		rejectBtn.textContent = 'Reject';
		this._register(dom.addDisposableListener(rejectBtn, 'click', () => {
			this._resolve(false);
		}));

		const acceptBtn = dom.append(buttonsRow, $('button.sandtable-agent-btn.sandtable-agent-btn-accept'));
		acceptBtn.textContent = 'Accept';
		this._register(dom.addDisposableListener(acceptBtn, 'click', () => {
			this._resolve(true);
		}));
	}

	private _resolve(accepted: boolean): void {
		if (this._resolveCallback) {
			const cb = this._resolveCallback;
			this._resolveCallback = undefined;
			this._rootEl.classList.add(accepted ? 'sandtable-agent-diff-accepted' : 'sandtable-agent-diff-rejected');
			const buttons = this._rootEl.querySelectorAll('button');
			buttons.forEach(b => (b as HTMLButtonElement).disabled = true);
			const indicator = dom.append(this._rootEl, $('.sandtable-agent-diff-result'));
			indicator.textContent = accepted ? 'File will be created' : 'File creation rejected';
			cb(accepted);
		}
	}

	override dispose(): void {
		if (this._resolveCallback) {
			this._resolveCallback(false);
			this._resolveCallback = undefined;
		}
		super.dispose();
	}
}

// ─── Command Preview ──────────────────────────────────────────────────────────

/**
 * Renders a command execution preview with Accept/Reject buttons.
 */
export class SandtableAgentCommandPreview extends Disposable {

	private readonly _rootEl: HTMLElement;
	private _resolveCallback: ((accepted: boolean) => void) | undefined;

	constructor(
		parent: HTMLElement,
		command: string,
		workingDirectory: string | undefined,
		onResolve: (accepted: boolean) => void,
	) {
		super();

		this._resolveCallback = onResolve;
		this._rootEl = dom.append(parent, $('.sandtable-agent-diff'));

		// Header
		const header = dom.append(this._rootEl, $('.sandtable-agent-diff-header'));
		const title = dom.append(header, $('span.sandtable-agent-diff-title'));
		title.textContent = 'Agent wants to run a command';

		// Command display
		const content = dom.append(this._rootEl, $('.sandtable-agent-diff-content'));

		const cmdLine = dom.append(content, $('div.sandtable-agent-command-line'));
		const prompt = dom.append(cmdLine, $('span.sandtable-agent-command-prompt'));
		prompt.textContent = '$ ';
		const cmdText = dom.append(cmdLine, $('span.sandtable-agent-command-text'));
		cmdText.textContent = command;

		if (workingDirectory) {
			const cwdLine = dom.append(content, $('div.sandtable-agent-command-cwd'));
			cwdLine.textContent = `Working directory: ${workingDirectory}`;
		}

		// Buttons
		const buttonsRow = dom.append(this._rootEl, $('.sandtable-agent-diff-buttons'));

		const rejectBtn = dom.append(buttonsRow, $('button.sandtable-agent-btn.sandtable-agent-btn-reject'));
		rejectBtn.textContent = 'Reject';
		this._register(dom.addDisposableListener(rejectBtn, 'click', () => {
			this._resolve(false);
		}));

		const acceptBtn = dom.append(buttonsRow, $('button.sandtable-agent-btn.sandtable-agent-btn-accept'));
		acceptBtn.textContent = 'Accept';
		this._register(dom.addDisposableListener(acceptBtn, 'click', () => {
			this._resolve(true);
		}));
	}

	private _resolve(accepted: boolean): void {
		if (this._resolveCallback) {
			const cb = this._resolveCallback;
			this._resolveCallback = undefined;
			this._rootEl.classList.add(accepted ? 'sandtable-agent-diff-accepted' : 'sandtable-agent-diff-rejected');
			const buttons = this._rootEl.querySelectorAll('button');
			buttons.forEach(b => (b as HTMLButtonElement).disabled = true);
			const indicator = dom.append(this._rootEl, $('.sandtable-agent-diff-result'));
			indicator.textContent = accepted ? 'Command approved' : 'Command rejected';
			cb(accepted);
		}
	}

	override dispose(): void {
		if (this._resolveCallback) {
			this._resolveCallback(false);
			this._resolveCallback = undefined;
		}
		super.dispose();
	}
}
