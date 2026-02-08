/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IProviderConfig, LLMProviderType, IProviderHealthResult, IModelParameterOverrides } from '../../../../platform/cortex/common/cortexProviderTypes.js';
import { IProviderRegistryService } from '../../../../platform/cortex/common/providerRegistry.js';

const $ = dom.$;

// ─── Events ───────────────────────────────────────────────────────────────────

export interface IProviderEditorSaveEvent {
	config: IProviderConfig;
	isNew: boolean;
}

// ─── SandtableProviderEditor ──────────────────────────────────────────────────

/**
 * Inline form for adding or editing an LLM provider configuration.
 * Rendered inside the Providers section of the settings page.
 */
export class SandtableProviderEditor extends Disposable {

	private readonly _onSave = this._register(new Emitter<IProviderEditorSaveEvent>());
	readonly onSave: Event<IProviderEditorSaveEvent> = this._onSave.event;

	private readonly _onCancel = this._register(new Emitter<void>());
	readonly onCancel: Event<void> = this._onCancel.event;

	private readonly _container: HTMLElement;
	private _nameInput!: HTMLInputElement;
	private _typeSelect!: HTMLSelectElement;
	private _endpointInput!: HTMLInputElement;
	private _apiKeyInput!: HTMLInputElement;
	private _priorityInput!: HTMLInputElement;
	private _usernameInput!: HTMLInputElement;
	private _passwordInput!: HTMLInputElement;
	private _cortexFieldsContainer!: HTMLElement;
	private _testResultsEl!: HTMLElement;

	private readonly _isNew: boolean;
	private readonly _originalId: string;

	constructor(
		parent: HTMLElement,
		private readonly _registry: IProviderRegistryService,
		existingConfig?: IProviderConfig,
	) {
		super();

		this._isNew = !existingConfig;
		this._originalId = existingConfig?.id ?? '';

		this._container = dom.append(parent, $('.sandtable-provider-editor'));
		this._buildForm(existingConfig);
	}

	private _buildForm(config?: IProviderConfig): void {
		// Title
		const titleEl = dom.append(this._container, $('h3.sandtable-provider-editor-title'));
		titleEl.textContent = this._isNew
			? nls.localize('sandtable.providerEditor.addTitle', "Add Provider")
			: nls.localize('sandtable.providerEditor.editTitle', "Edit Provider");

		// Display Name
		this._nameInput = this._createTextInput(
			nls.localize('sandtable.providerEditor.displayName', "Display Name"),
			config?.displayName ?? '',
			nls.localize('sandtable.providerEditor.displayNamePlaceholder', "e.g., Ollama Local"),
		);

		// Provider Type
		const typeRow = dom.append(this._container, $('.sandtable-provider-editor-row'));
		const typeLabel = dom.append(typeRow, $('label.sandtable-settings-label'));
		typeLabel.textContent = nls.localize('sandtable.providerEditor.type', "Provider Type");
		this._typeSelect = dom.append(typeRow, $('select.sandtable-settings-input')) as HTMLSelectElement;
		const optCortex = dom.append(this._typeSelect, $('option')) as HTMLOptionElement;
		optCortex.value = 'cortex';
		optCortex.textContent = 'Cortex';
		const optOpenAI = dom.append(this._typeSelect, $('option')) as HTMLOptionElement;
		optOpenAI.value = 'openai-compatible';
		optOpenAI.textContent = 'OpenAI-Compatible';
		this._typeSelect.value = config?.type ?? 'openai-compatible';

		// Endpoint URL
		this._endpointInput = this._createTextInput(
			nls.localize('sandtable.providerEditor.endpoint', "Endpoint URL"),
			config?.endpoint ?? '',
			nls.localize('sandtable.providerEditor.endpointPlaceholder', "http://localhost:11434"),
		);

		// API Key
		this._apiKeyInput = this._createTextInput(
			nls.localize('sandtable.providerEditor.apiKey', "API Key"),
			config?.apiKey ?? '',
			nls.localize('sandtable.providerEditor.apiKeyPlaceholder', "Leave empty if not required"),
			'password',
		);

		// Priority
		const priorityRow = dom.append(this._container, $('.sandtable-provider-editor-row'));
		const priorityLabel = dom.append(priorityRow, $('label.sandtable-settings-label'));
		priorityLabel.textContent = nls.localize('sandtable.providerEditor.priority', "Priority (lower = higher)");
		this._priorityInput = dom.append(priorityRow, $('input.sandtable-settings-input')) as HTMLInputElement;
		this._priorityInput.type = 'number';
		this._priorityInput.min = '1';
		this._priorityInput.max = '100';
		this._priorityInput.value = String(config?.priority ?? 10);

		// Cortex-specific fields
		this._cortexFieldsContainer = dom.append(this._container, $('.sandtable-provider-editor-cortex-fields'));
		const cortexHeader = dom.append(this._cortexFieldsContainer, $('div.sandtable-provider-editor-cortex-header'));
		cortexHeader.textContent = nls.localize('sandtable.providerEditor.cortexOnly', "Cortex Only");

		this._usernameInput = this._createTextInput(
			nls.localize('sandtable.providerEditor.username', "Admin Username"),
			config?.username ?? 'admin',
			'admin',
			'text',
			this._cortexFieldsContainer,
		);

		this._passwordInput = this._createTextInput(
			nls.localize('sandtable.providerEditor.password', "Admin Password"),
			config?.password ?? '',
			'',
			'password',
			this._cortexFieldsContainer,
		);

		// Show/hide Cortex fields based on type
		this._updateCortexFieldsVisibility();
		this._register(dom.addDisposableListener(this._typeSelect, 'change', () => {
			this._updateCortexFieldsVisibility();
		}));

		// NOTE: Model Parameter Overrides have been moved to the Models settings page
		// where they are configured per-curated-model instead of per-provider.

		// Test Connection button
		const actionsRow = dom.append(this._container, $('.sandtable-provider-editor-actions'));
		const testBtn = dom.append(actionsRow, $('button.sandtable-provider-editor-test-btn'));
		testBtn.textContent = nls.localize('sandtable.providerEditor.testConnection', "Test Connection");
		this._register(dom.addDisposableListener(testBtn, 'click', () => this._testConnection()));

		// Test results area
		this._testResultsEl = dom.append(this._container, $('.sandtable-provider-editor-test-results'));

		// Save / Cancel buttons
		const buttonsRow = dom.append(this._container, $('.sandtable-provider-editor-buttons'));
		const cancelBtn = dom.append(buttonsRow, $('button.sandtable-provider-editor-cancel-btn'));
		cancelBtn.textContent = nls.localize('sandtable.providerEditor.cancel', "Cancel");
		this._register(dom.addDisposableListener(cancelBtn, 'click', () => this._onCancel.fire()));

		const saveBtn = dom.append(buttonsRow, $('button.sandtable-provider-editor-save-btn'));
		saveBtn.textContent = nls.localize('sandtable.providerEditor.save', "Save Provider");
		this._register(dom.addDisposableListener(saveBtn, 'click', () => this._save()));
	}

	private _createTextInput(label: string, value: string, placeholder: string, type = 'text', parent?: HTMLElement): HTMLInputElement {
		const container = parent ?? this._container;
		const row = dom.append(container, $('.sandtable-provider-editor-row'));
		const labelEl = dom.append(row, $('label.sandtable-settings-label'));
		labelEl.textContent = label;
		const input = dom.append(row, $('input.sandtable-settings-input')) as HTMLInputElement;
		input.type = type;
		input.value = value;
		input.placeholder = placeholder;
		return input;
	}

	/**
	 * Model overrides have been moved to the Models settings page.
	 * Always returns undefined -- overrides are now per-curated-model, not per-provider.
	 */
	private _collectModelOverrides(): Record<string, IModelParameterOverrides> | undefined {
		return undefined;
	}

	private _updateCortexFieldsVisibility(): void {
		const isCortex = this._typeSelect.value === 'cortex';
		this._cortexFieldsContainer.style.display = isCortex ? '' : 'none';
	}

	private async _testConnection(): Promise<void> {
		dom.clearNode(this._testResultsEl);
		this._testResultsEl.className = 'sandtable-provider-editor-test-results';

		const loadingEl = dom.append(this._testResultsEl, $('div'));
		loadingEl.textContent = nls.localize('sandtable.providerEditor.testing', "Testing connection...");

		try {
			const config = this._buildConfig();
			const result: IProviderHealthResult = await this._registry.testConnection(config);

			dom.clearNode(this._testResultsEl);

			if (result.healthy) {
				this._testResultsEl.classList.add('sandtable-provider-test-success');
				const header = dom.append(this._testResultsEl, $('div.sandtable-provider-test-header'));
				header.textContent = nls.localize('sandtable.providerEditor.testSuccess', "Connected! Found {0} models.", result.modelCount);
				const latency = dom.append(this._testResultsEl, $('div.sandtable-provider-test-latency'));
				latency.textContent = nls.localize('sandtable.providerEditor.latency', "Latency: {0}ms", result.latencyMs);
			} else {
				this._testResultsEl.classList.add('sandtable-provider-test-failure');
				const header = dom.append(this._testResultsEl, $('div.sandtable-provider-test-header'));
				header.textContent = nls.localize('sandtable.providerEditor.testFailed', "Connection failed");
				if (result.error) {
					const error = dom.append(this._testResultsEl, $('div.sandtable-provider-test-error'));
					error.textContent = result.error;
				}
			}
		} catch (err) {
			dom.clearNode(this._testResultsEl);
			this._testResultsEl.classList.add('sandtable-provider-test-failure');
			const errorEl = dom.append(this._testResultsEl, $('div'));
			errorEl.textContent = nls.localize('sandtable.providerEditor.testError', "Error: {0}", err instanceof Error ? err.message : String(err));
		}
	}

	private _buildConfig(): IProviderConfig {
		const id = this._isNew
			? this._generateId(this._nameInput.value)
			: this._originalId;

		return {
			id,
			displayName: this._nameInput.value.trim() || 'Unnamed Provider',
			type: this._typeSelect.value as LLMProviderType,
			endpoint: this._endpointInput.value.trim(),
			apiKey: this._apiKeyInput.value,
			enabled: true,
			priority: parseInt(this._priorityInput.value, 10) || 10,
			username: this._typeSelect.value === 'cortex' ? this._usernameInput.value.trim() : undefined,
			password: this._typeSelect.value === 'cortex' ? this._passwordInput.value : undefined,
			modelOverrides: this._collectModelOverrides(),
		};
	}

	private _generateId(name: string): string {
		const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'provider';
		return `${base}-${Date.now().toString(36)}`;
	}

	private _save(): void {
		const config = this._buildConfig();

		// Basic validation
		if (!config.displayName || config.displayName === 'Unnamed Provider') {
			this._showValidationError(nls.localize('sandtable.providerEditor.nameRequired', "Display name is required."));
			return;
		}
		if (!config.endpoint) {
			this._showValidationError(nls.localize('sandtable.providerEditor.endpointRequired', "Endpoint URL is required."));
			return;
		}

		this._onSave.fire({ config, isNew: this._isNew });
	}

	private _showValidationError(message: string): void {
		dom.clearNode(this._testResultsEl);
		this._testResultsEl.className = 'sandtable-provider-editor-test-results sandtable-provider-test-failure';
		const errorEl = dom.append(this._testResultsEl, $('div'));
		errorEl.textContent = message;
	}

	override dispose(): void {
		this._container.remove();
		super.dispose();
	}
}
