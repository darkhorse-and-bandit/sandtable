/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICortexModelDetail } from '../../../../platform/cortex/common/cortex.js';

const $ = dom.$;

export interface IModelAction {
	modelId: number;
	modelName: string;
	action: 'start' | 'stop';
}

export interface IModelSelection {
	modelId: number;
	modelName: string;
}

/**
 * Displays all models from Cortex with state indicators
 * (green=running, gray=stopped, yellow=starting/loading, red=failed).
 * Start/Stop buttons per model. Clicking a model selects it for the log viewer.
 */
export class SandtableModelsList extends Disposable {

	private readonly _container: HTMLElement;
	private _list!: HTMLElement;
	private _selectedModelId: number | undefined;

	private readonly _onDidRequestAction = this._register(new Emitter<IModelAction>());
	readonly onDidRequestAction: Event<IModelAction> = this._onDidRequestAction.event;

	private readonly _onDidSelectModel = this._register(new Emitter<IModelSelection>());
	readonly onDidSelectModel: Event<IModelSelection> = this._onDidSelectModel.event;

	constructor(parent: HTMLElement) {
		super();

		this._container = dom.append(parent, $('.sandtable-models-section'));

		const header = dom.append(this._container, $('.sandtable-models-section-header'));
		const titleEl = dom.append(header, $('h3.sandtable-models-section-title'));
		titleEl.textContent = 'Models';

		this._list = dom.append(this._container, $('.sandtable-models-list'));
	}

	/**
	 * Update the model list with new data.
	 */
	update(models: ICortexModelDetail[]): void {
		dom.clearNode(this._list);

		if (models.length === 0) {
			const empty = dom.append(this._list, $('span.sandtable-models-list-empty'));
			empty.textContent = 'No models configured';
			return;
		}

		for (const model of models) {
			this._renderModelItem(model);
		}
	}

	/**
	 * Show empty / placeholder state.
	 */
	showEmpty(): void {
		dom.clearNode(this._list);
		const empty = dom.append(this._list, $('span.sandtable-models-list-empty'));
		empty.textContent = 'No model data available';
	}

	/**
	 * Get the currently selected model ID.
	 */
	get selectedModelId(): number | undefined {
		return this._selectedModelId;
	}

	private _renderModelItem(model: ICortexModelDetail): void {
		const item = dom.append(this._list, $('.sandtable-models-item'));

		if (model.id === this._selectedModelId) {
			item.classList.add('sandtable-models-item-selected');
		}

		// State indicator dot
		const stateDot = dom.append(item, $('span.sandtable-models-state-dot'));
		stateDot.classList.add(`sandtable-models-state-${model.state}`);
		stateDot.title = model.state.charAt(0).toUpperCase() + model.state.slice(1);

		// Model name
		const nameEl = dom.append(item, $('span.sandtable-models-item-name'));
		nameEl.textContent = model.served_model_name;
		nameEl.title = `${model.model_path || model.served_model_name}`;

		// Engine badge
		const engineEl = dom.append(item, $('span.sandtable-models-item-engine'));
		engineEl.textContent = model.engine_type === 'llamacpp' ? 'llama.cpp' : model.engine_type;

		// Served name (if different from display name)
		if (model.served_model_name !== model.model_path) {
			const servedEl = dom.append(item, $('span.sandtable-models-item-served'));
			servedEl.textContent = model.task;
			servedEl.title = `Task: ${model.task}`;
		}

		// Action buttons
		const actions = dom.append(item, $('.sandtable-models-item-actions'));
		this._renderActionButtons(actions, model);

		// Click to select
		this._register(dom.addDisposableListener(item, 'click', (e: MouseEvent) => {
			// Don't select if clicking a button
			if ((e.target as HTMLElement).closest('.sandtable-models-action-btn')) {
				return;
			}
			this._selectedModelId = model.id;
			this._onDidSelectModel.fire({
				modelId: model.id,
				modelName: model.served_model_name,
			});

			// Update selected state visually
			const items = this._list.querySelectorAll('.sandtable-models-item');
			items.forEach(i => i.classList.remove('sandtable-models-item-selected'));
			item.classList.add('sandtable-models-item-selected');
		}));
	}

	private _renderActionButtons(parent: HTMLElement, model: ICortexModelDetail): void {
		switch (model.state) {
			case 'running': {
				const stopBtn = dom.append(parent, $('button.sandtable-models-action-btn.sandtable-models-btn-stop'));
				stopBtn.textContent = 'Stop';
				stopBtn.title = `Stop ${model.served_model_name}`;
				this._register(dom.addDisposableListener(stopBtn, 'click', (e: MouseEvent) => {
					e.stopPropagation();
					this._onDidRequestAction.fire({ modelId: model.id, modelName: model.served_model_name, action: 'stop' });
				}));
				break;
			}
			case 'stopped': {
				const startBtn = dom.append(parent, $('button.sandtable-models-action-btn.sandtable-models-btn-start'));
				startBtn.textContent = 'Start';
				startBtn.title = `Start ${model.served_model_name}`;
				this._register(dom.addDisposableListener(startBtn, 'click', (e: MouseEvent) => {
					e.stopPropagation();
					this._onDidRequestAction.fire({ modelId: model.id, modelName: model.served_model_name, action: 'start' });
				}));
				break;
			}
			case 'failed': {
				const retryBtn = dom.append(parent, $('button.sandtable-models-action-btn.sandtable-models-btn-start'));
				retryBtn.textContent = 'Retry';
				retryBtn.title = `Retry starting ${model.served_model_name}`;
				this._register(dom.addDisposableListener(retryBtn, 'click', (e: MouseEvent) => {
					e.stopPropagation();
					this._onDidRequestAction.fire({ modelId: model.id, modelName: model.served_model_name, action: 'start' });
				}));

				const stopBtn = dom.append(parent, $('button.sandtable-models-action-btn.sandtable-models-btn-stop'));
				stopBtn.textContent = 'Stop';
				stopBtn.title = `Stop ${model.served_model_name}`;
				this._register(dom.addDisposableListener(stopBtn, 'click', (e: MouseEvent) => {
					e.stopPropagation();
					this._onDidRequestAction.fire({ modelId: model.id, modelName: model.served_model_name, action: 'stop' });
				}));
				break;
			}
			case 'starting':
			case 'loading': {
				const stopBtn = dom.append(parent, $('button.sandtable-models-action-btn.sandtable-models-btn-stop'));
				stopBtn.textContent = 'Stop';
				stopBtn.title = `Stop ${model.served_model_name}`;
				this._register(dom.addDisposableListener(stopBtn, 'click', (e: MouseEvent) => {
					e.stopPropagation();
					this._onDidRequestAction.fire({ modelId: model.id, modelName: model.served_model_name, action: 'stop' });
				}));
				break;
			}
		}
	}

	get element(): HTMLElement {
		return this._container;
	}
}
