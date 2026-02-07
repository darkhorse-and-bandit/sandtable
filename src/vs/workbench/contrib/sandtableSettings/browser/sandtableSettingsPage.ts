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
import { CortexConfigKeys, ChatConfigKeys, CompletionConfigKeys, ModelsConfigKeys, AgentConfigKeys, AppearanceConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { BUNDLED_BACKGROUND_NAMES, BUNDLED_BACKGROUNDS } from '../../sandtableAppearance/browser/sandtableAppearance.contribution.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SandtableSettingsInput } from './sandtableSettingsInput.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { URI } from '../../../../base/common/uri.js';
import { FileAccess } from '../../../../base/common/network.js';
import { basename, join } from '../../../../base/common/path.js';

const $ = dom.$;

// ─── Section IDs ──────────────────────────────────────────────────────────────

type SectionId = 'general' | 'connection' | 'chat' | 'completion' | 'models' | 'agent' | 'appearance';

interface ISectionDescriptor {
	id: SectionId;
	label: string;
	icon: string;
}

const SECTIONS: ISectionDescriptor[] = [
	{ id: 'general', label: nls.localize('sandtable.settings.general', "General"), icon: '$(home)' },
	{ id: 'connection', label: nls.localize('sandtable.settings.connection', "Connection"), icon: '$(plug)' },
	{ id: 'chat', label: nls.localize('sandtable.settings.chat', "Chat"), icon: '$(comment-discussion)' },
	{ id: 'completion', label: nls.localize('sandtable.settings.completion', "Code Completion"), icon: '$(lightbulb)' },
	{ id: 'models', label: nls.localize('sandtable.settings.models', "Models"), icon: '$(server)' },
	{ id: 'agent', label: nls.localize('sandtable.settings.agent', "Agent"), icon: '$(sparkle)' },
	{ id: 'appearance', label: nls.localize('sandtable.settings.appearance', "Appearance"), icon: '$(paintcan)' },
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
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
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
			case 'completion':
				this._renderCompletionSection();
				break;
			case 'models':
				this._renderModelsSection();
				break;
			case 'agent':
				this._renderAgentSection();
				break;
			case 'appearance':
				this._renderAppearanceSection();
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

	// ─── Completion Section ──────────────────────────────────────────────

	private _renderCompletionSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.completionTitle', "Inline Code Completion");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.completionDesc', "Configure inline code completion (ghost text suggestions). Requires a FIM-capable model running on Cortex.");

		// Enabled
		this._renderBooleanSetting(section, {
			key: CompletionConfigKeys.Enabled,
			label: nls.localize('sandtable.settings.completionEnabled', "Enable Code Completion"),
			description: nls.localize('sandtable.settings.completionEnabledDesc', "When enabled, ghost text code suggestions appear while you type."),
		});

		// Model
		this._renderTextSetting(section, {
			key: CompletionConfigKeys.Model,
			label: nls.localize('sandtable.settings.completionModel', "Completion Model"),
			description: nls.localize('sandtable.settings.completionModelDesc', "Model to use for code completions. Leave empty to auto-detect the first FIM-capable running model."),
			placeholder: nls.localize('sandtable.settings.completionModelPlaceholder', "Auto-detect"),
		});

		// Debounce
		this._renderNumberSetting(section, {
			key: CompletionConfigKeys.DebounceMs,
			label: nls.localize('sandtable.settings.completionDebounce', "Debounce Delay (ms)"),
			description: nls.localize('sandtable.settings.completionDebounceDesc', "Delay in milliseconds after typing stops before requesting a completion. Lower values feel more responsive but increase server load."),
			min: 50,
			max: 2000,
			step: 50,
		});

		// Max Tokens
		this._renderNumberSetting(section, {
			key: CompletionConfigKeys.MaxTokens,
			label: nls.localize('sandtable.settings.completionMaxTokens', "Max Tokens"),
			description: nls.localize('sandtable.settings.completionMaxTokensDesc', "Maximum number of tokens to generate per completion. Higher values allow longer suggestions."),
			min: 1,
			max: 1024,
			step: 16,
		});

		// Temperature
		this._renderNumberSetting(section, {
			key: CompletionConfigKeys.Temperature,
			label: nls.localize('sandtable.settings.completionTemperature', "Temperature"),
			description: nls.localize('sandtable.settings.completionTemperatureDesc', "Controls randomness. Lower values (0.1-0.3) produce more deterministic, predictable completions. Higher values are more creative."),
			min: 0,
			max: 1,
			step: 0.05,
		});

		// Context Lines
		this._renderNumberSetting(section, {
			key: CompletionConfigKeys.ContextLines,
			label: nls.localize('sandtable.settings.completionContextLines', "Context Lines"),
			description: nls.localize('sandtable.settings.completionContextLinesDesc', "Number of lines of code before the cursor to include as context. More lines help the model understand the surrounding code, but increase request size."),
			min: 5,
			max: 200,
			step: 5,
		});
	}

	// ─── Models Section ──────────────────────────────────────────────────

	private _renderModelsSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.modelsTitle', "Model Manager");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.modelsDesc', "Configure the Model Manager panel that displays GPU metrics, model states, and container logs.");

		// Show in Activity Bar
		this._renderBooleanSetting(section, {
			key: ModelsConfigKeys.ShowInActivityBar,
			label: nls.localize('sandtable.settings.modelsShowInActivityBar', "Show in Activity Bar"),
			description: nls.localize('sandtable.settings.modelsShowInActivityBarDesc', "Show the Model Manager panel icon in the Activity Bar for quick access."),
		});

		// GPU Poll Interval
		this._renderNumberSetting(section, {
			key: ModelsConfigKeys.GpuPollIntervalMs,
			label: nls.localize('sandtable.settings.modelsGpuPollInterval', "GPU Poll Interval (ms)"),
			description: nls.localize('sandtable.settings.modelsGpuPollIntervalDesc', "How often to refresh GPU metrics and system status when the Model Manager panel is visible. Lower values provide more responsive updates but increase network traffic."),
			min: 2000,
			max: 60000,
			step: 1000,
		});
	}

	// ─── Agent Section ───────────────────────────────────────────────

	private _renderAgentSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.agentTitle', "Agent");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.agentDesc', "Configure the autonomous coding agent that can read files, write code, and run commands to accomplish multi-step coding tasks.");

		// Enabled
		this._renderBooleanSetting(section, {
			key: AgentConfigKeys.Enabled,
			label: nls.localize('sandtable.settings.agentEnabled', "Enable Agent"),
			description: nls.localize('sandtable.settings.agentEnabledDesc', "When enabled, the Agent panel is available in the sidebar for multi-step coding tasks."),
		});

		// Model
		this._renderTextSetting(section, {
			key: AgentConfigKeys.Model,
			label: nls.localize('sandtable.settings.agentModel', "Agent Model"),
			description: nls.localize('sandtable.settings.agentModelDesc', "Model to use for the agent. Must support tool/function calling (e.g., DeepSeek V3, Qwen3-Coder, Llama 3.1+). Leave empty to auto-detect a suitable running model."),
			placeholder: nls.localize('sandtable.settings.agentModelPlaceholder', "Auto-detect"),
		});

		// Confirm Destructive
		this._renderBooleanSetting(section, {
			key: AgentConfigKeys.ConfirmDestructive,
			label: nls.localize('sandtable.settings.agentConfirm', "Confirm Destructive Operations"),
			description: nls.localize('sandtable.settings.agentConfirmDesc', "Require user approval before the agent edits files, creates files, or runs commands. Recommended for safety."),
		});

		// Max Iterations
		this._renderNumberSetting(section, {
			key: AgentConfigKeys.MaxIterations,
			label: nls.localize('sandtable.settings.agentMaxIterations', "Max Iterations"),
			description: nls.localize('sandtable.settings.agentMaxIterationsDesc', "Maximum number of tool-call iterations the agent can perform per task. Prevents runaway loops."),
			min: 1,
			max: 100,
			step: 1,
		});

		// Max Tokens
		this._renderNumberSetting(section, {
			key: AgentConfigKeys.MaxTokens,
			label: nls.localize('sandtable.settings.agentMaxTokens', "Max Tokens per Response"),
			description: nls.localize('sandtable.settings.agentMaxTokensDesc', "Maximum number of tokens the model can generate per agent response. Higher values allow longer reasoning but use more context budget."),
			min: 256,
			max: 32768,
			step: 256,
		});
	}

	// ─── Appearance Section ──────────────────────────────────────────────

	private _renderAppearanceSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.appearanceTitle', "Appearance");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.appearanceDesc', "Customize the editor background with an image. Choose from bundled textures or add your own, then fine-tune opacity, blur, and overlay for perfect readability.");

		// ── Bundled Image Thumbnails ──────────────────────────────────────
		const thumbCard = dom.append(section, $('.sandtable-settings-card'));
		const thumbLabel = dom.append(thumbCard, $('label.sandtable-settings-label'));
		thumbLabel.textContent = nls.localize('sandtable.settings.bgBundled', "Bundled Backgrounds");

		const thumbDesc = dom.append(thumbCard, $('p.sandtable-settings-desc'));
		thumbDesc.textContent = nls.localize('sandtable.settings.bgBundledDesc', "Click a thumbnail to apply it as your editor background.");

		const thumbGrid = dom.append(thumbCard, $('.sandtable-bg-thumbnail-grid'));
		const currentImage = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundImage) || '';

		// "None" thumbnail
		const noneThumb = dom.append(thumbGrid, $('.sandtable-bg-thumbnail'));
		if (!currentImage) {
			noneThumb.classList.add('selected');
		}
		const nonePreview = dom.append(noneThumb, $('.sandtable-bg-thumbnail-preview'));
		nonePreview.style.display = 'flex';
		nonePreview.style.alignItems = 'center';
		nonePreview.style.justifyContent = 'center';
		nonePreview.style.fontSize = '20px';
		nonePreview.style.opacity = '0.4';
		nonePreview.textContent = '\u2205'; // Empty set symbol
		const noneLabel = dom.append(noneThumb, $('.sandtable-bg-thumbnail-label'));
		noneLabel.textContent = 'None';
		this._register(dom.addDisposableListener(noneThumb, 'click', () => {
			this.configurationService.updateValue(AppearanceConfigKeys.BackgroundImage, '');
		}));

		// Bundled image thumbnails
		const thumbElements: HTMLElement[] = [noneThumb];
		for (const name of BUNDLED_BACKGROUND_NAMES) {
			const thumb = dom.append(thumbGrid, $('.sandtable-bg-thumbnail'));
			const settingValue = `bundled:${name}`;
			if (currentImage === settingValue) {
				thumb.classList.add('selected');
			}

			const preview = dom.append(thumb, $('.sandtable-bg-thumbnail-preview'));
			// Resolve the bundled image URI for the thumbnail preview
			try {
				const resourcePath = BUNDLED_BACKGROUNDS[name];
				if (resourcePath) {
					const uri = FileAccess.asBrowserUri(resourcePath as `vs/${string}`);
					preview.style.backgroundImage = `url('${uri.toString(true)}')`;
				}
			} catch { /* fallback: no image in preview */ }

			const label = dom.append(thumb, $('.sandtable-bg-thumbnail-label'));
			label.textContent = name.replace(/-/g, ' ');

			thumbElements.push(thumb);

			this._register(dom.addDisposableListener(thumb, 'click', () => {
				this.configurationService.updateValue(AppearanceConfigKeys.BackgroundImage, settingValue);
			}));
		}

		// Keep thumbnail selection in sync
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AppearanceConfigKeys.BackgroundImage)) {
				const val = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundImage) || '';
				// Update "None" thumbnail
				noneThumb.classList.toggle('selected', !val);
				// Update bundled thumbnails
				let idx = 1;
				for (const name of BUNDLED_BACKGROUND_NAMES) {
					if (idx < thumbElements.length) {
						thumbElements[idx].classList.toggle('selected', val === `bundled:${name}`);
					}
					idx++;
				}
			}
		}));

		// ── User Image Library (from ~/.sandtable/backgrounds/) ──────────
		const userCard = dom.append(section, $('.sandtable-settings-card'));
		const userLabel = dom.append(userCard, $('label.sandtable-settings-label'));
		userLabel.textContent = nls.localize('sandtable.settings.bgUserLibrary', "Your Images");
		const userDesc = dom.append(userCard, $('p.sandtable-settings-desc'));
		userDesc.textContent = nls.localize('sandtable.settings.bgUserLibraryDesc', "Images you have previously added. Click one to use it.");

		const userGrid = dom.append(userCard, $('.sandtable-bg-thumbnail-grid'));
		const userThumbElements: { el: HTMLElement; path: string }[] = [];

		const loadUserImages = async () => {
			dom.clearNode(userGrid);
			userThumbElements.length = 0;

			try {
				const bgDir = join(this.environmentService.userDataPath, 'backgrounds');
				const bgDirUri = URI.file(bgDir);
				const stat = await this.fileService.resolve(bgDirUri);

				if (stat.children && stat.children.length > 0) {
					const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg']);
					const currentVal = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundImage) || '';

					for (const child of stat.children) {
						if (child.isDirectory) {
							continue;
						}
						const name = child.name;
						const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
						if (!imageExts.has(ext)) {
							continue;
						}

						const filePath = join(bgDir, name);
						const thumb = dom.append(userGrid, $('.sandtable-bg-thumbnail'));
						if (currentVal === filePath) {
							thumb.classList.add('selected');
						}

						const preview = dom.append(thumb, $('.sandtable-bg-thumbnail-preview'));
						// Use vscode-file:// URI for the thumbnail
						const fileUri = URI.file(filePath);
						const browserUri = FileAccess.uriToBrowserUri(fileUri);
						preview.style.backgroundImage = `url('${browserUri.toString(true)}')`;

						const labelEl2 = dom.append(thumb, $('.sandtable-bg-thumbnail-label'));
						labelEl2.textContent = name.length > 16 ? name.slice(0, 14) + '...' : name;
						labelEl2.title = name;

						userThumbElements.push({ el: thumb, path: filePath });

						this._register(dom.addDisposableListener(thumb, 'click', () => {
							this.configurationService.updateValue(AppearanceConfigKeys.BackgroundImage, filePath);
						}));
					}
				}

				if (userThumbElements.length === 0) {
					const emptyMsg = dom.append(userGrid, $('p.sandtable-settings-desc'));
					emptyMsg.textContent = nls.localize('sandtable.settings.bgNoUserImages', "No custom images yet. Add one below.");
					emptyMsg.style.margin = '4px 0';
				}
			} catch {
				// Directory doesn't exist yet -- that's fine
				const emptyMsg = dom.append(userGrid, $('p.sandtable-settings-desc'));
				emptyMsg.textContent = nls.localize('sandtable.settings.bgNoUserImages', "No custom images yet. Add one below.");
				emptyMsg.style.margin = '4px 0';
			}
		};

		// Load user images on render
		loadUserImages();

		// Update user library selection when config changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AppearanceConfigKeys.BackgroundImage)) {
				const val = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundImage) || '';
				for (const item of userThumbElements) {
					item.el.classList.toggle('selected', val === item.path);
				}
			}
		}));

		// ── Custom Image: File Picker + Drag & Drop ──────────────────────
		const customCard = dom.append(section, $('.sandtable-settings-card'));
		const customLabel = dom.append(customCard, $('label.sandtable-settings-label'));
		customLabel.textContent = nls.localize('sandtable.settings.bgCustom', "Custom Image");

		const customDesc = dom.append(customCard, $('p.sandtable-settings-desc'));
		customDesc.textContent = nls.localize('sandtable.settings.bgCustomDesc', "Choose an image from your computer or drag and drop one here. The image will be copied into Sandtable's data directory.");

		// Drag and drop zone
		const dropZone = dom.append(customCard, $('.sandtable-bg-dropzone'));
		const dropText = dom.append(dropZone, $('span'));
		dropText.textContent = nls.localize('sandtable.settings.bgDropHere', "Drop image here");

		const chooseBtn = dom.append(customCard, $('button.sandtable-bg-button'));
		chooseBtn.textContent = nls.localize('sandtable.settings.bgChooseFile', "Choose Image...");

		// File picker handler
		const copyImageAndSet = async (sourceUri: URI) => {
			try {
				const filename = basename(sourceUri.fsPath);
				const bgDir = join(this.environmentService.userDataPath, 'backgrounds');
				const targetDir = URI.file(bgDir);
				// Ensure directory exists
				await this.fileService.createFolder(targetDir);
				const targetUri = URI.file(join(bgDir, filename));
				await this.fileService.copy(sourceUri, targetUri, true);
				this.configurationService.updateValue(AppearanceConfigKeys.BackgroundImage, targetUri.fsPath);
				// Refresh user image library to show the new image
				await loadUserImages();
			} catch (err) {
				console.error('[Sandtable Appearance] Failed to copy image:', err);
			}
		};

		this._register(dom.addDisposableListener(chooseBtn, 'click', async () => {
			const result = await this.fileDialogService.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: [
					{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }
				],
				title: nls.localize('sandtable.settings.bgPickerTitle', "Select Background Image"),
			});
			if (result && result.length > 0) {
				await copyImageAndSet(result[0]);
			}
		}));

		// Drag and drop handlers
		this._register(dom.addDisposableListener(dropZone, 'dragover', (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dropZone.classList.add('dragover');
		}));
		this._register(dom.addDisposableListener(dropZone, 'dragleave', (e: DragEvent) => {
			e.preventDefault();
			dropZone.classList.remove('dragover');
		}));
		this._register(dom.addDisposableListener(dropZone, 'drop', async (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dropZone.classList.remove('dragover');

			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				const file = files[0];
				// Use the file path from the native file entry
				const filePath = (file as unknown as { path?: string }).path;
				if (filePath) {
					await copyImageAndSet(URI.file(filePath));
				}
			}
		}));

		// Show current custom image name if one is active
		const customStatus = dom.append(customCard, $('p.sandtable-settings-desc'));
		customStatus.style.fontFamily = 'var(--monaco-monospace-font)';
		customStatus.style.fontSize = '11px';
		customStatus.style.opacity = '0.6';
		const updateCustomStatus = () => {
			const val = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundImage) || '';
			if (val && !val.startsWith('bundled:')) {
				customStatus.textContent = `Active custom image: ${basename(val)}`;
			} else {
				customStatus.textContent = '';
			}
		};
		updateCustomStatus();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AppearanceConfigKeys.BackgroundImage)) {
				updateCustomStatus();
			}
		}));

		// Remove Background button
		const removeBtn = dom.append(customCard, $('button.sandtable-bg-button.sandtable-bg-button-danger'));
		removeBtn.textContent = nls.localize('sandtable.settings.bgRemove', "Remove Background");
		this._register(dom.addDisposableListener(removeBtn, 'click', () => {
			this.configurationService.updateValue(AppearanceConfigKeys.BackgroundImage, '');
		}));

		// ── Image Opacity (Slider) ────────────────────────────────────────
		this._renderSliderSetting(section, {
			key: AppearanceConfigKeys.BackgroundOpacity,
			label: nls.localize('sandtable.settings.bgOpacity', "Image Opacity"),
			description: nls.localize('sandtable.settings.bgOpacityDesc', "How visible the background image is. Low values create a subtle watermark; higher values are more vivid."),
			min: 0, max: 1, step: 0.01,
			valueFormatter: (v: number) => `${Math.round(v * 100)}%`,
		});

		// ── Image Blur (Slider) ───────────────────────────────────────────
		this._renderSliderSetting(section, {
			key: AppearanceConfigKeys.BackgroundBlur,
			label: nls.localize('sandtable.settings.bgBlur', "Image Blur"),
			description: nls.localize('sandtable.settings.bgBlurDesc', "Softens busy or detailed images into gentle textures."),
			min: 0, max: 20, step: 1,
			unit: 'px',
		});

		// ── Overlay Color (Color Picker + Opacity) ────────────────────────
		this._renderColorOverlaySetting(section);

		// ── Background Size (Button Group) ────────────────────────────────
		this._renderButtonGroupSetting(section, {
			key: AppearanceConfigKeys.BackgroundSize,
			label: nls.localize('sandtable.settings.bgSize', "Image Size"),
			description: nls.localize('sandtable.settings.bgSizeDesc', "How the image fills the editor area."),
			options: [
				{ value: 'cover', label: 'Cover' },
				{ value: 'contain', label: 'Contain' },
				{ value: 'auto', label: 'Auto' },
			],
		});

		// ── Background Position (3x3 Grid) ────────────────────────────────
		this._renderPositionGridSetting(section);

		// ── Coverage (Button Group) ───────────────────────────────────────
		this._renderButtonGroupSetting(section, {
			key: AppearanceConfigKeys.BackgroundCoverage,
			label: nls.localize('sandtable.settings.bgCoverage', "Coverage Area"),
			description: nls.localize('sandtable.settings.bgCoverageDesc', "Which parts of the editor area the background image extends into."),
			options: [
				{ value: 'content', label: 'Code Only' },
				{ value: 'content-and-gutter', label: '+ Line Numbers' },
				{ value: 'full', label: 'Full Width' },
			],
		});
	}

	/**
	 * Renders the overlay color control: a color picker, opacity slider, and "Reset to Auto" button.
	 *
	 * Note: We do NOT use `disabled` on the inputs because disabled elements
	 * swallow all mouse events in most browsers, making it impossible for the
	 * user to click them to exit auto mode. Instead, we use an opacity/pointer
	 * CSS class and a boolean flag to control the auto state.
	 */
	private _renderColorOverlaySetting(parent: HTMLElement): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const labelEl = dom.append(card, $('label.sandtable-settings-label'));
		labelEl.textContent = nls.localize('sandtable.settings.bgOverlay', "Overlay Color");

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = nls.localize('sandtable.settings.bgOverlayDesc', "A color layer between the background image and text for readability. Click Auto to match your theme, or pick a custom color and opacity.");

		const row = dom.append(card, $('.sandtable-bg-overlay-row'));

		// Auto button (placed first so it's the obvious action)
		const autoBtn = dom.append(row, $('button.sandtable-bg-button'));
		autoBtn.textContent = nls.localize('sandtable.settings.bgOverlayAuto', "Auto");
		autoBtn.title = nls.localize('sandtable.settings.bgOverlayAutoTip', "Use theme-derived overlay color");

		// Color picker
		const colorInput = dom.append(row, $('input.sandtable-bg-color-picker')) as HTMLInputElement;
		colorInput.type = 'color';
		colorInput.title = nls.localize('sandtable.settings.bgOverlayColorPicker', "Pick overlay color");

		// Opacity slider for the overlay
		const opacitySlider = dom.append(row, $('input.sandtable-bg-overlay-slider')) as HTMLInputElement;
		opacitySlider.type = 'range';
		opacitySlider.min = '0';
		opacitySlider.max = '1';
		opacitySlider.step = '0.01';

		const opacityLabel = dom.append(row, $('span.sandtable-bg-overlay-value'));

		// Parse current value
		const parseOverlay = (val: string): { color: string; opacity: number } | null => {
			const match = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
			if (match) {
				const r = parseInt(match[1]);
				const g = parseInt(match[2]);
				const b = parseInt(match[3]);
				const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
				const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
				return { color: hex, opacity: a };
			}
			return null;
		};

		let isAutoMode: boolean;
		const currentOverlay = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundOverlayColor) || '';
		const parsed = parseOverlay(currentOverlay);

		if (!currentOverlay) {
			isAutoMode = true;
			colorInput.value = '#1e1e1e';
			opacitySlider.value = '0.85';
			opacityLabel.textContent = 'Auto';
			autoBtn.classList.add('active');
			row.classList.add('auto-mode');
		} else {
			isAutoMode = false;
			colorInput.value = parsed ? parsed.color : '#1e1e1e';
			opacitySlider.value = parsed ? String(parsed.opacity) : '0.85';
			opacityLabel.textContent = parsed ? `${Math.round(parsed.opacity * 100)}%` : '85%';
		}

		const setAutoMode = (auto: boolean) => {
			isAutoMode = auto;
			if (auto) {
				autoBtn.classList.add('active');
				row.classList.add('auto-mode');
				opacityLabel.textContent = 'Auto';
				this.configurationService.updateValue(AppearanceConfigKeys.BackgroundOverlayColor, '');
			} else {
				autoBtn.classList.remove('active');
				row.classList.remove('auto-mode');
				updateOverlaySetting();
			}
		};

		const updateOverlaySetting = () => {
			if (isAutoMode) {
				return;
			}
			const hex = colorInput.value;
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			const a = parseFloat(opacitySlider.value);
			opacityLabel.textContent = `${Math.round(a * 100)}%`;
			this.configurationService.updateValue(AppearanceConfigKeys.BackgroundOverlayColor, `rgba(${r}, ${g}, ${b}, ${a})`);
		};

		// Color picker: exit auto mode on interaction, then update
		this._register(dom.addDisposableListener(colorInput, 'input', () => {
			if (isAutoMode) {
				setAutoMode(false);
			}
			updateOverlaySetting();
		}));

		// Opacity slider: exit auto mode on interaction, then update
		this._register(dom.addDisposableListener(opacitySlider, 'input', () => {
			if (isAutoMode) {
				setAutoMode(false);
			}
			updateOverlaySetting();
		}));

		// Auto button toggles back to auto
		this._register(dom.addDisposableListener(autoBtn, 'click', () => {
			setAutoMode(true);
		}));
	}

	/**
	 * Renders a 3x3 grid for selecting background position.
	 */
	private _renderPositionGridSetting(parent: HTMLElement): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const labelEl = dom.append(card, $('label.sandtable-settings-label'));
		labelEl.textContent = nls.localize('sandtable.settings.bgPosition', "Image Position");

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = nls.localize('sandtable.settings.bgPositionDesc', "Where the background image is anchored within the editor area.");

		const grid = dom.append(card, $('.sandtable-bg-position-grid'));

		const positions = [
			'top left', 'top center', 'top right',
			'center left', 'center', 'center right',
			'bottom left', 'bottom center', 'bottom right',
		];

		const currentPos = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundPosition) || 'center';
		const cells: HTMLElement[] = [];

		for (const pos of positions) {
			const cell = dom.append(grid, $('.sandtable-bg-position-cell'));
			cell.title = pos;
			if (currentPos === pos) {
				cell.classList.add('selected');
			}
			// Add a dot indicator
			dom.append(cell, $('.sandtable-bg-position-dot'));
			cells.push(cell);

			this._register(dom.addDisposableListener(cell, 'click', () => {
				this.configurationService.updateValue(AppearanceConfigKeys.BackgroundPosition, pos);
			}));
		}

		// Keep in sync
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AppearanceConfigKeys.BackgroundPosition)) {
				const newPos = this.configurationService.getValue<string>(AppearanceConfigKeys.BackgroundPosition) || 'center';
				cells.forEach((cell, i) => {
					cell.classList.toggle('selected', positions[i] === newPos);
				});
			}
		}));
	}

	// ─── Setting Renderers ────────────────────────────────────────────────

	/**
	 * Renders a range slider with a live value label.
	 */
	private _renderSliderSetting(parent: HTMLElement, opts: {
		key: string;
		label: string;
		description: string;
		min: number;
		max: number;
		step: number;
		unit?: string;
		valueFormatter?: (v: number) => string;
	}): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const labelEl = dom.append(card, $('label.sandtable-settings-label'));
		labelEl.textContent = opts.label;

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = opts.description;

		const row = dom.append(card, $('.sandtable-bg-slider-row'));

		const slider = dom.append(row, $('input.sandtable-bg-slider')) as HTMLInputElement;
		slider.type = 'range';
		slider.min = String(opts.min);
		slider.max = String(opts.max);
		slider.step = String(opts.step);
		const currentVal = this.configurationService.getValue<number>(opts.key) ?? opts.min;
		slider.value = String(currentVal);

		const valueLabel = dom.append(row, $('span.sandtable-bg-slider-value'));
		const formatValue = (v: number) => {
			if (opts.valueFormatter) {
				return opts.valueFormatter(v);
			}
			return opts.unit ? `${v}${opts.unit}` : String(v);
		};
		valueLabel.textContent = formatValue(currentVal);

		this._register(dom.addDisposableListener(slider, 'input', () => {
			const val = parseFloat(slider.value);
			valueLabel.textContent = formatValue(val);
			this.configurationService.updateValue(opts.key, val);
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(opts.key)) {
				const newVal = this.configurationService.getValue<number>(opts.key) ?? opts.min;
				slider.value = String(newVal);
				valueLabel.textContent = formatValue(newVal);
			}
		}));
	}

	/**
	 * Renders a toggle button group for selecting from a set of string options.
	 */
	private _renderButtonGroupSetting(parent: HTMLElement, opts: {
		key: string;
		label: string;
		description: string;
		options: { value: string; label: string }[];
	}): void {
		const card = dom.append(parent, $('.sandtable-settings-card'));

		const labelEl = dom.append(card, $('label.sandtable-settings-label'));
		labelEl.textContent = opts.label;

		const descEl = dom.append(card, $('p.sandtable-settings-desc'));
		descEl.textContent = opts.description;

		const group = dom.append(card, $('.sandtable-bg-button-group'));
		const currentVal = this.configurationService.getValue<string>(opts.key) || opts.options[0].value;
		const buttons: HTMLElement[] = [];

		for (const option of opts.options) {
			const btn = dom.append(group, $('button.sandtable-bg-button-group-item'));
			btn.textContent = option.label;
			if (currentVal === option.value) {
				btn.classList.add('active');
			}
			buttons.push(btn);

			this._register(dom.addDisposableListener(btn, 'click', () => {
				this.configurationService.updateValue(opts.key, option.value);
			}));
		}

		// Keep in sync
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(opts.key)) {
				const newVal = this.configurationService.getValue<string>(opts.key) || opts.options[0].value;
				buttons.forEach((btn, i) => {
					btn.classList.toggle('active', opts.options[i].value === newVal);
				});
			}
		}));
	}

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
