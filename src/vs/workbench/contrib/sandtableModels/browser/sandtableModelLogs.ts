/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICortexService } from '../../../../platform/cortex/common/cortex.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const $ = dom.$;

const LOG_REFRESH_INTERVAL_MS = 3000;

/**
 * Shows container logs for the selected model.
 * Auto-scrolls, refreshes every 3s while visible, has Copy button.
 */
export class SandtableModelLogs extends Disposable {

	private readonly _container: HTMLElement;
	private _logContainer!: HTMLElement;
	private _modelNameEl!: HTMLElement;
	private _selectedModelId: number | undefined;
	private _selectedModelName: string | undefined;
	private _pollTimer: ReturnType<typeof setInterval> | undefined;
	private _isVisible = true;

	constructor(
		parent: HTMLElement,
		private readonly _cortexService: ICortexService,
		private readonly _logService: ILogService,
	) {
		super();

		this._container = dom.append(parent, $('.sandtable-models-section.sandtable-models-log-section'));

		// Header
		const header = dom.append(this._container, $('.sandtable-models-log-header'));

		const titleArea = dom.append(header, $('div'));
		const titleEl = dom.append(titleArea, $('span.sandtable-models-log-title'));
		titleEl.textContent = 'Log Viewer';
		this._modelNameEl = dom.append(titleArea, $('span.sandtable-models-log-model-name'));
		this._modelNameEl.textContent = '';

		// Action buttons
		const actions = dom.append(header, $('.sandtable-models-log-actions'));

		const clearBtn = dom.append(actions, $('button.sandtable-models-log-btn'));
		clearBtn.textContent = 'Clear';
		clearBtn.title = 'Clear log display';
		this._register(dom.addDisposableListener(clearBtn, 'click', () => {
			this._clearDisplay();
		}));

		const copyBtn = dom.append(actions, $('button.sandtable-models-log-btn'));
		copyBtn.textContent = 'Copy';
		copyBtn.title = 'Copy logs to clipboard';
		this._register(dom.addDisposableListener(copyBtn, 'click', () => {
			this._copyToClipboard();
		}));

		// Log content
		this._logContainer = dom.append(this._container, $('.sandtable-models-log-container'));
		this._showEmptyMessage();
	}

	/**
	 * Set the model to display logs for. Starts polling.
	 */
	selectModel(modelId: number, modelName: string): void {
		this._selectedModelId = modelId;
		this._selectedModelName = modelName;
		this._modelNameEl.textContent = `(${modelName})`;
		this._clearDisplay();
		this._fetchLogs();
		this._startPolling();
	}

	/**
	 * Clear the selected model and stop polling.
	 */
	clearSelection(): void {
		this._selectedModelId = undefined;
		this._selectedModelName = undefined;
		this._modelNameEl.textContent = '';
		this._stopPolling();
		this._clearDisplay();
		this._showEmptyMessage();
	}

	/**
	 * Set visibility. Polling pauses when not visible.
	 */
	setVisible(visible: boolean): void {
		this._isVisible = visible;
		if (visible && this._selectedModelId !== undefined) {
			this._fetchLogs();
			this._startPolling();
		} else if (!visible) {
			this._stopPolling();
		}
	}

	private _showEmptyMessage(): void {
		dom.clearNode(this._logContainer);
		const empty = dom.append(this._logContainer, $('span.sandtable-models-log-empty'));
		empty.textContent = 'Select a model to view its logs';
	}

	private _clearDisplay(): void {
		dom.clearNode(this._logContainer);
	}

	private async _fetchLogs(): Promise<void> {
		if (this._selectedModelId === undefined) {
			return;
		}

		try {
			const logs = await this._cortexService.getModelLogs(this._selectedModelId, true);
			this._renderLogs(logs);
		} catch (err) {
			this._logService.warn('[SandtableModelLogs] Failed to fetch logs:', err);
			dom.clearNode(this._logContainer);
			const errorEl = dom.append(this._logContainer, $('span.sandtable-models-log-empty'));
			errorEl.textContent = `Failed to load logs for ${this._selectedModelName || 'model'}`;
		}
	}

	private _renderLogs(logs: string): void {
		dom.clearNode(this._logContainer);

		if (!logs || logs.trim().length === 0) {
			const empty = dom.append(this._logContainer, $('span.sandtable-models-log-empty'));
			empty.textContent = 'No log output yet';
			return;
		}

		const lines = logs.split('\n');
		for (const line of lines) {
			if (line.trim().length === 0) {
				continue;
			}
			const lineEl = dom.append(this._logContainer, $('span.sandtable-models-log-line'));
			lineEl.textContent = line;

			// Color code based on content
			const lowerLine = line.toLowerCase();
			if (lowerLine.includes('error') || lowerLine.includes('fatal') || lowerLine.includes('exception')) {
				lineEl.classList.add('sandtable-models-log-line-error');
			} else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
				lineEl.classList.add('sandtable-models-log-line-warning');
			} else if (lowerLine.includes('info') || lowerLine.includes('diagnostic')) {
				lineEl.classList.add('sandtable-models-log-line-info');
			}
		}

		// Auto-scroll to bottom
		this._logContainer.scrollTop = this._logContainer.scrollHeight;
	}

	private _startPolling(): void {
		this._stopPolling();
		if (this._selectedModelId !== undefined && this._isVisible) {
			this._pollTimer = setInterval(() => {
				if (this._isVisible && this._selectedModelId !== undefined) {
					this._fetchLogs();
				}
			}, LOG_REFRESH_INTERVAL_MS);
		}
	}

	private _stopPolling(): void {
		if (this._pollTimer !== undefined) {
			clearInterval(this._pollTimer);
			this._pollTimer = undefined;
		}
	}

	private _copyToClipboard(): void {
		const text = this._logContainer.textContent || '';
		if (text.trim().length > 0) {
			navigator.clipboard.writeText(text).catch(err => {
				this._logService.warn('[SandtableModelLogs] Failed to copy to clipboard:', err);
			});
		}
	}

	get element(): HTMLElement {
		return this._container;
	}

	override dispose(): void {
		this._stopPolling();
		super.dispose();
	}
}
