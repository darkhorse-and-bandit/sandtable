/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './sandtableSettings.css';

import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ICortexService } from '../../../../platform/cortex/common/cortex.js';
import { CortexConfigKeys, ChatConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SandtableSettingsInput } from './sandtableSettingsInput.js';

const $ = dom.$;

// ─── Section IDs ──────────────────────────────────────────────────────────────

type SectionId = 'general' | 'connection' | 'chat';

interface ISectionDescriptor {
	id: SectionId;
	label: string;
	icon: string;
}

const SECTIONS: ISectionDescriptor[] = [
	{ id: 'general', label: nls.localize('sandtable.settings.general', "General"), icon: '$(home)' },
	{ id: 'connection', label: nls.localize('sandtable.settings.connection', "Connection"), icon: '$(plug)' },
	{ id: 'chat', label: nls.localize('sandtable.settings.chat', "Chat"), icon: '$(comment-discussion)' },
];

// ─── SandtableSettingsPage ────────────────────────────────────────────────────

export class SandtableSettingsPage extends EditorPane {

	static readonly ID = 'sandtable.settingsPage';

	private container!: HTMLElement;
	private navContainer!: HTMLElement;
	private contentContainer!: HTMLElement;
	private activeSection: SectionId = 'general';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@ICortexService private readonly cortexService: ICortexService,
	) {
		super(SandtableSettingsPage.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.sandtable-settings'));

		// ─── Header ───────────────────────────────────────────────────────
		const header = dom.append(this.container, $('.sandtable-settings-header'));
		const titleEl = dom.append(header, $('h1.sandtable-settings-title'));
		titleEl.textContent = nls.localize('sandtable.settings.title', "Sandtable Settings");
		const subtitleEl = dom.append(header, $('p.sandtable-settings-subtitle'));
		subtitleEl.textContent = nls.localize('sandtable.settings.subtitle', "Configure your Sandtable workspace, Cortex connection, and chat preferences.");

		// ─── Body (nav + content) ─────────────────────────────────────────
		const body = dom.append(this.container, $('.sandtable-settings-body'));

		// Left navigation
		this.navContainer = dom.append(body, $('nav.sandtable-settings-nav'));
		this._buildNav();

		// Right content area
		this.contentContainer = dom.append(body, $('.sandtable-settings-content'));
		this._renderSection(this.activeSection);
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: object, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
	}

	override layout(dimension: dom.Dimension): void {
		// The CSS flexbox layout handles the internal sizing
	}

	// ─── Navigation ───────────────────────────────────────────────────────

	private _buildNav(): void {
		dom.clearNode(this.navContainer);

		for (const section of SECTIONS) {
			const navItem = dom.append(this.navContainer, $('button.sandtable-settings-nav-item'));
			navItem.setAttribute('data-section', section.id);

			if (section.id === this.activeSection) {
				navItem.classList.add('active');
			}

			const labelEl = dom.append(navItem, $('span.sandtable-settings-nav-label'));
			labelEl.textContent = section.label;

			this._register(dom.addDisposableListener(navItem, 'click', () => {
				this._switchSection(section.id);
			}));
		}
	}

	private _switchSection(sectionId: SectionId): void {
		if (this.activeSection === sectionId) {
			return;
		}
		this.activeSection = sectionId;

		// Update nav active state
		const navItems = this.navContainer.querySelectorAll('.sandtable-settings-nav-item');
		navItems.forEach(item => {
			item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
		});

		// Re-render content
		this._renderSection(sectionId);
	}

	// ─── Section Rendering ────────────────────────────────────────────────

	private _renderSection(sectionId: SectionId): void {
		dom.clearNode(this.contentContainer);

		switch (sectionId) {
			case 'general':
				this._renderGeneralSection();
				break;
			case 'connection':
				this._renderConnectionSection();
				break;
			case 'chat':
				this._renderChatSection();
				break;
		}
	}

	// ─── General Section ──────────────────────────────────────────────────

	private _renderGeneralSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		// Section title
		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.generalTitle', "General");

		// Version info card
		const infoCard = dom.append(section, $('.sandtable-settings-card'));

		const versionRow = dom.append(infoCard, $('.sandtable-settings-info-row'));
		const versionLabel = dom.append(versionRow, $('span.sandtable-settings-info-label'));
		versionLabel.textContent = nls.localize('sandtable.settings.version', "Version");
		const versionValue = dom.append(versionRow, $('span.sandtable-settings-info-value'));
		versionValue.textContent = this.productService.version || 'Unknown';

		const nameRow = dom.append(infoCard, $('.sandtable-settings-info-row'));
		const nameLabel = dom.append(nameRow, $('span.sandtable-settings-info-label'));
		nameLabel.textContent = nls.localize('sandtable.settings.appName', "Application");
		const nameValue = dom.append(nameRow, $('span.sandtable-settings-info-value'));
		nameValue.textContent = this.productService.nameLong || 'Sandtable';

		// Connection status card
		const statusCard = dom.append(section, $('.sandtable-settings-card'));
		const statusTitle = dom.append(statusCard, $('h3.sandtable-settings-card-title'));
		statusTitle.textContent = nls.localize('sandtable.settings.cortexStatus', "Cortex Connection Status");

		const statusRow = dom.append(statusCard, $('.sandtable-settings-info-row'));
		const statusLabel = dom.append(statusRow, $('span.sandtable-settings-info-label'));
		statusLabel.textContent = nls.localize('sandtable.settings.status', "Status");
		const statusValue = dom.append(statusRow, $('span.sandtable-settings-info-value'));
		const connectionStatus = this.cortexService.getConnectionStatus();
		statusValue.textContent = connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);
		statusValue.classList.add(`sandtable-settings-status-${connectionStatus}`);

		// Update status when it changes
		this._register(this.cortexService.onConnectionStatusChanged((newStatus) => {
			statusValue.textContent = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
			statusValue.className = 'sandtable-settings-info-value';
			statusValue.classList.add(`sandtable-settings-status-${newStatus}`);
		}));

		// Documentation links
		const linksCard = dom.append(section, $('.sandtable-settings-card'));
		const linksTitle = dom.append(linksCard, $('h3.sandtable-settings-card-title'));
		linksTitle.textContent = nls.localize('sandtable.settings.resources', "Resources");

		const linksList = dom.append(linksCard, $('ul.sandtable-settings-links'));

		const links = [
			{ label: nls.localize('sandtable.settings.github', "GitHub Repository"), url: 'https://github.com/darkhorse-and-bandit/sandtable' },
			{ label: nls.localize('sandtable.settings.cortexDocs', "Cortex Documentation"), url: 'https://aulendurforge.github.io/Cortex/' },
		];

		for (const link of links) {
			const li = dom.append(linksList, $('li'));
			const a = dom.append(li, $('a.sandtable-settings-link'));
			a.textContent = link.label;
			a.setAttribute('href', link.url);
			a.setAttribute('target', '_blank');
			a.setAttribute('rel', 'noopener noreferrer');
		}
	}

	// ─── Connection Section ───────────────────────────────────────────────

	private _renderConnectionSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.connectionTitle', "Cortex Connection");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.connectionDesc', "Configure how Sandtable connects to your Cortex inference gateway.");

		// Endpoint
		this._renderTextSetting(section, {
			key: CortexConfigKeys.Endpoint,
			label: nls.localize('sandtable.settings.endpoint', "Endpoint URL"),
			description: nls.localize('sandtable.settings.endpointDesc', "The URL of your Cortex gateway (e.g., http://192.168.1.100:8084)."),
			placeholder: 'http://localhost:8084',
		});

		// API Key
		this._renderTextSetting(section, {
			key: CortexConfigKeys.ApiKey,
			label: nls.localize('sandtable.settings.apiKey', "API Key"),
			description: nls.localize('sandtable.settings.apiKeyDesc', "API key for authenticating with Cortex inference endpoints."),
			placeholder: nls.localize('sandtable.settings.apiKeyPlaceholder', "Enter your API key"),
			isPassword: true,
		});

		// Username
		this._renderTextSetting(section, {
			key: CortexConfigKeys.Username,
			label: nls.localize('sandtable.settings.username', "Admin Username"),
			description: nls.localize('sandtable.settings.usernameDesc', "Username for Cortex admin session authentication."),
			placeholder: 'admin',
		});

		// Password
		this._renderTextSetting(section, {
			key: CortexConfigKeys.Password,
			label: nls.localize('sandtable.settings.password', "Admin Password"),
			description: nls.localize('sandtable.settings.passwordDesc', "Password for Cortex admin session authentication."),
			placeholder: nls.localize('sandtable.settings.passwordPlaceholder', "Enter your password"),
			isPassword: true,
		});

		// Health Check Interval
		this._renderNumberSetting(section, {
			key: CortexConfigKeys.HealthCheckIntervalMs,
			label: nls.localize('sandtable.settings.healthCheckInterval', "Health Check Interval (ms)"),
			description: nls.localize('sandtable.settings.healthCheckIntervalDesc', "How often to poll Cortex health status (in milliseconds). Minimum: 5000, Maximum: 300000."),
			min: 5000,
			max: 300000,
			step: 1000,
		});
	}

	// ─── Chat Section ─────────────────────────────────────────────────────

	private _renderChatSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.chatTitle', "Chat");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.chatDesc', "Configure chat behavior, model defaults, and response parameters.");

		// Default Model
		this._renderTextSetting(section, {
			key: ChatConfigKeys.DefaultModel,
			label: nls.localize('sandtable.settings.defaultModel', "Default Model"),
			description: nls.localize('sandtable.settings.defaultModelDesc', "Default model for chat. Leave empty to auto-detect the first running model."),
			placeholder: nls.localize('sandtable.settings.defaultModelPlaceholder', "Auto-detect"),
		});

		// Streaming Enabled
		this._renderBooleanSetting(section, {
			key: ChatConfigKeys.StreamingEnabled,
			label: nls.localize('sandtable.settings.streaming', "Streaming Enabled"),
			description: nls.localize('sandtable.settings.streamingDesc', "When enabled, chat responses stream token by token. Disable for batch responses."),
		});

		// System Prompt
		this._renderTextareaSetting(section, {
			key: ChatConfigKeys.SystemPrompt,
			label: nls.localize('sandtable.settings.systemPrompt', "System Prompt"),
			description: nls.localize('sandtable.settings.systemPromptDesc', "System prompt sent with every chat request. Defines the assistant's behavior."),
			rows: 4,
		});

		// Max Tokens
		this._renderNumberSetting(section, {
			key: ChatConfigKeys.MaxTokens,
			label: nls.localize('sandtable.settings.maxTokens', "Max Tokens"),
			description: nls.localize('sandtable.settings.maxTokensDesc', "Maximum number of tokens in chat responses."),
			min: 1,
			max: 32768,
			step: 256,
		});

		// Temperature
		this._renderNumberSetting(section, {
			key: ChatConfigKeys.Temperature,
			label: nls.localize('sandtable.settings.temperature', "Temperature"),
			description: nls.localize('sandtable.settings.temperatureDesc', "Controls randomness. 0.0 = deterministic, 1.0 = creative, 2.0 = very random."),
			min: 0,
			max: 2,
			step: 0.1,
		});
	}

	// ─── Setting Renderers ────────────────────────────────────────────────

	private _renderTextSetting(parent: HTMLElement, opts: {
		key: string;
		label: string;
		description: string;
		placeholder?: string;
		isPassword?: boolean;
	}): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const labelEl = dom.append(card, $('label.sandtable-settings-label'));
		labelEl.textContent = opts.label;

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = opts.description;

		const input = dom.append(card, $(`input.sandtable-settings-input`)) as HTMLInputElement;
		input.type = opts.isPassword ? 'password' : 'text';
		input.placeholder = opts.placeholder || '';
		input.value = this.configurationService.getValue<string>(opts.key) || '';

		this._register(dom.addDisposableListener(input, 'change', () => {
			this.configurationService.updateValue(opts.key, input.value);
		}));

		// Keep in sync if changed externally
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(opts.key)) {
				const newVal = this.configurationService.getValue<string>(opts.key) || '';
				if (input.value !== newVal) {
					input.value = newVal;
				}
			}
		}));
	}

	private _renderTextareaSetting(parent: HTMLElement, opts: {
		key: string;
		label: string;
		description: string;
		rows?: number;
	}): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const labelEl = dom.append(card, $('label.sandtable-settings-label'));
		labelEl.textContent = opts.label;

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = opts.description;

		const textarea = dom.append(card, $('textarea.sandtable-settings-textarea')) as HTMLTextAreaElement;
		textarea.rows = opts.rows || 3;
		textarea.value = this.configurationService.getValue<string>(opts.key) || '';

		this._register(dom.addDisposableListener(textarea, 'change', () => {
			this.configurationService.updateValue(opts.key, textarea.value);
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(opts.key)) {
				const newVal = this.configurationService.getValue<string>(opts.key) || '';
				if (textarea.value !== newVal) {
					textarea.value = newVal;
				}
			}
		}));
	}

	private _renderNumberSetting(parent: HTMLElement, opts: {
		key: string;
		label: string;
		description: string;
		min?: number;
		max?: number;
		step?: number;
	}): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const labelEl = dom.append(card, $('label.sandtable-settings-label'));
		labelEl.textContent = opts.label;

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = opts.description;

		const inputRow = dom.append(card, $('.sandtable-settings-number-row'));

		const input = dom.append(inputRow, $('input.sandtable-settings-input.sandtable-settings-input-number')) as HTMLInputElement;
		input.type = 'number';
		if (opts.min !== undefined) { input.min = String(opts.min); }
		if (opts.max !== undefined) { input.max = String(opts.max); }
		if (opts.step !== undefined) { input.step = String(opts.step); }
		input.value = String(this.configurationService.getValue<number>(opts.key) ?? '');

		this._register(dom.addDisposableListener(input, 'change', () => {
			const parsed = parseFloat(input.value);
			if (!isNaN(parsed)) {
				this.configurationService.updateValue(opts.key, parsed);
			}
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(opts.key)) {
				const newVal = this.configurationService.getValue<number>(opts.key);
				const newStr = String(newVal ?? '');
				if (input.value !== newStr) {
					input.value = newStr;
				}
			}
		}));
	}

	private _renderBooleanSetting(parent: HTMLElement, opts: {
		key: string;
		label: string;
		description: string;
	}): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const row = dom.append(card, $('.sandtable-settings-toggle-row'));

		const checkbox = dom.append(row, $('input.sandtable-settings-checkbox')) as HTMLInputElement;
		checkbox.type = 'checkbox';
		checkbox.id = `sandtable-setting-${opts.key}`;
		checkbox.checked = this.configurationService.getValue<boolean>(opts.key) ?? false;

		const labelEl = dom.append(row, $('label.sandtable-settings-label.sandtable-settings-toggle-label')) as HTMLLabelElement;
		labelEl.textContent = opts.label;
		labelEl.htmlFor = checkbox.id;

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = opts.description;

		this._register(dom.addDisposableListener(checkbox, 'change', () => {
			this.configurationService.updateValue(opts.key, checkbox.checked);
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(opts.key)) {
				const newVal = this.configurationService.getValue<boolean>(opts.key) ?? false;
				if (checkbox.checked !== newVal) {
					checkbox.checked = newVal;
				}
			}
		}));
	}
}

// ─── Serializer ───────────────────────────────────────────────────────────────

export class SandtableSettingsInputSerializer implements IEditorSerializer {

	canSerialize(_editorInput: EditorInput): boolean {
		return true;
	}

	serialize(_editorInput: EditorInput): string {
		return '{}';
	}

	deserialize(_instantiationService: IInstantiationService): SandtableSettingsInput {
		return new SandtableSettingsInput();
	}
}
