/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ICortexService, ICortexModel } from '../../../../platform/cortex/common/cortex.js';
import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';

/**
 * Dropdown model selector widget for the chat panel.
 * Queries running models from Cortex and allows the user to select one.
 */
export class SandtableChatModelSelector extends Disposable {

	private readonly _onDidSelectModel = this._register(new Emitter<string>());
	readonly onDidSelectModel: Event<string> = this._onDidSelectModel.event;

	private _selectedModel: string = '';
	private _models: ICortexModel[] = [];
	private readonly _container: HTMLElement;
	private readonly _selectElement: HTMLSelectElement;

	constructor(
		parent: HTMLElement,
		private readonly cortexService: ICortexService,
	) {
		super();

		this._container = dom.append(parent, dom.$('.sandtable-chat-model-selector'));

		const label = dom.append(this._container, dom.$('label.sandtable-chat-model-label'));
		label.textContent = nls.localize('sandtable.chat.model', "Model:");

		this._selectElement = dom.append(this._container, dom.$('select.sandtable-chat-model-select')) as HTMLSelectElement;
		this._selectElement.title = nls.localize('sandtable.chat.selectModel', "Select a model for chat");

		this._register(dom.addDisposableListener(this._selectElement, 'change', () => {
			this._selectedModel = this._selectElement.value;
			this._onDidSelectModel.fire(this._selectedModel);
		}));

		// Refresh models on connection status change
		this._register(this.cortexService.onConnectionStatusChanged(() => {
			this.refreshModels();
		}));

		// Initial load
		this.refreshModels();
	}

	get selectedModel(): string {
		return this._selectedModel;
	}

	async refreshModels(): Promise<void> {
		try {
			this._models = await this.cortexService.listRunningModels();
		} catch {
			this._models = [];
		}

		this._updateSelectOptions();
	}

	private _updateSelectOptions(): void {
		// Clear existing options
		while (this._selectElement.firstChild) {
			this._selectElement.removeChild(this._selectElement.firstChild);
		}

		if (this._models.length === 0) {
			const option = dom.append(this._selectElement, dom.$('option')) as HTMLOptionElement;
			option.value = '';
			option.textContent = nls.localize('sandtable.chat.noModels', "No models available");
			this._selectElement.disabled = true;
			this._selectedModel = '';
			return;
		}

		this._selectElement.disabled = false;

		// Group models by provider using the :: separator in served_model_name
		const grouped = new Map<string, ICortexModel[]>();
		for (const model of this._models) {
			const separatorIdx = model.served_model_name.indexOf('::');
			const providerName = separatorIdx > 0 ? model.served_model_name.substring(0, separatorIdx) : 'Default';
			if (!grouped.has(providerName)) {
				grouped.set(providerName, []);
			}
			grouped.get(providerName)!.push(model);
		}

		// Render optgroups per provider
		for (const [providerName, models] of grouped) {
			const optgroup = document.createElement('optgroup');
			optgroup.label = providerName;
			this._selectElement.appendChild(optgroup);

			for (const model of models) {
				const option = document.createElement('option');
				option.value = model.served_model_name;
				// Display the bare model name (strip provider prefix) with engine type
				const displayName = model.served_model_name.includes('::')
					? model.served_model_name.split('::')[1]
					: model.served_model_name;
				option.textContent = `${displayName} (${model.engine_type})`;
				optgroup.appendChild(option);
			}
		}

		// Select the first model if none selected or previous selection no longer available
		if (!this._selectedModel || !this._models.some(m => m.served_model_name === this._selectedModel)) {
			this._selectedModel = this._models[0].served_model_name;
			this._selectElement.value = this._selectedModel;
			this._onDidSelectModel.fire(this._selectedModel);
		} else {
			this._selectElement.value = this._selectedModel;
		}
	}

	setSelectedModel(modelName: string): void {
		if (this._models.some(m => m.served_model_name === modelName)) {
			this._selectedModel = modelName;
			this._selectElement.value = modelName;
		}
	}
}
