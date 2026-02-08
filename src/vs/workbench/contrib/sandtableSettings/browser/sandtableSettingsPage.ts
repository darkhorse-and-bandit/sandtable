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
import { ChatConfigKeys, CompletionConfigKeys, ModelsConfigKeys, AgentConfigKeys, AppearanceConfigKeys, CodeModeConfigKeys, ProviderConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { IProviderRegistryService } from '../../../../platform/cortex/common/providerRegistry.js';
import { IProviderConfig } from '../../../../platform/cortex/common/cortexProviderTypes.js';
import { SandtableProviderEditor } from './sandtableProviderEditor.js';
import { BUNDLED_BACKGROUND_NAMES, BUNDLED_BACKGROUNDS } from '../../sandtableAppearance/browser/sandtableAppearance.contribution.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SandtableSettingsInput } from './sandtableSettingsInput.js';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { URI } from '../../../../base/common/uri.js';
import { FileAccess } from '../../../../base/common/network.js';
import { basename, join } from '../../../../base/common/path.js';

const $ = dom.$;

// ─── Section IDs ──────────────────────────────────────────────────────────────

type SectionId = 'general' | 'codeMode' | 'providers' | 'chat' | 'completion' | 'models' | 'agent' | 'appearance' | 'about' | 'personas' | 'documents' | 'dataSources' | 'workflows' | 'sessions' | 'users';

interface ISectionDescriptor {
	id: SectionId;
	label: string;
	icon: string;
	/** If set, a category header is rendered above this item in the sidebar */
	category?: string;
	/** If true, renders a "Coming Soon" placeholder page instead of settings */
	placeholder?: boolean;
	/** Description shown on the placeholder page */
	placeholderDesc?: string;
}

const SECTIONS: ISectionDescriptor[] = [
	// ── Workspace ──
	{ id: 'general', label: nls.localize('sandtable.settings.general', "General"), icon: '$(home)', category: 'Workspace' },
	{ id: 'appearance', label: nls.localize('sandtable.settings.appearance', "Appearance"), icon: '$(paintcan)' },
	{ id: 'codeMode', label: nls.localize('sandtable.settings.codeMode', "Code Mode"), icon: '$(code)' },
	// ── AI & Models ──
	{ id: 'providers', label: nls.localize('sandtable.settings.providers', "Providers"), icon: '$(cloud)', category: 'AI & Models' },
	{ id: 'models', label: nls.localize('sandtable.settings.models', "Models"), icon: '$(server)' },
	{ id: 'chat', label: nls.localize('sandtable.settings.chat', "Chat"), icon: '$(comment-discussion)' },
	{ id: 'agent', label: nls.localize('sandtable.settings.agent', "Agent"), icon: '$(sparkle)' },
	{ id: 'completion', label: nls.localize('sandtable.settings.completion', "Code Completion"), icon: '$(lightbulb)' },
	// ── Research ──
	{ id: 'personas', label: nls.localize('sandtable.settings.personas', "Personas"), icon: '$(person)', category: 'Research', placeholder: true, placeholderDesc: 'Create and manage AI agent personas with tailored system prompts, knowledge bases, and behavioral parameters. Define specialized roles — researcher, analyst, red team commander, facilitator — each with unique capabilities and context.' },
	{ id: 'documents', label: nls.localize('sandtable.settings.documents', "Documents"), icon: '$(file-text)', placeholder: true, placeholderDesc: 'Upload and manage research documents (PDF, DOCX, PPTX, XLSX). Documents are indexed for semantic search and can be referenced by AI agents during conversations and analysis.' },
	{ id: 'dataSources', label: nls.localize('sandtable.settings.dataSources', "Data Sources"), icon: '$(database)', placeholder: true, placeholderDesc: 'Connect to external databases, APIs, and tool servers via the Model Context Protocol (MCP). Agents can query live data from wargame databases, research repositories, and structured data sources.' },
	// ── Exercises ──
	{ id: 'workflows', label: nls.localize('sandtable.settings.workflows', "Workflows"), icon: '$(play-circle)', category: 'Exercises', placeholder: true, placeholderDesc: 'Configure exercise templates and structured workflows for wargaming, scenario planning, and research analysis. Define multi-step agent workflows that produce formatted deliverables.' },
	{ id: 'sessions', label: nls.localize('sandtable.settings.sessions', "Sessions"), icon: '$(history)', placeholder: true, placeholderDesc: 'Manage exercise sessions, recordings, and after-action reports. Record scenario sessions for review, training, and analysis. Track session history across teams.' },
	// ── System ──
	{ id: 'users', label: nls.localize('sandtable.settings.users', "Users & Roles"), icon: '$(shield)', category: 'System', placeholder: true, placeholderDesc: 'Manage user accounts, roles, and permissions. Configure role-based access for administrators, facilitators, analysts, players, and observers. Control who can manage providers, models, and system settings.' },
	{ id: 'about', label: nls.localize('sandtable.settings.about', "About"), icon: '$(info)' },
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
		@IProviderRegistryService private readonly providerRegistry: IProviderRegistryService,
		@IDialogService private readonly dialogService: IDialogService,
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
			// Render category header if this section starts a new category
			if (section.category) {
				const categoryHeader = dom.append(this.navContainer, $('div.sandtable-settings-category'));
				categoryHeader.textContent = section.category;
			}

			const navItem = dom.append(this.navContainer, $('button.sandtable-settings-nav-item'));
			navItem.setAttribute('data-section', section.id);

			if (section.id === this.activeSection) {
				navItem.classList.add('active');
			}

			// Dim placeholder items slightly
			if (section.placeholder) {
				navItem.classList.add('sandtable-settings-nav-placeholder');
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

		// Check if this section is a placeholder
		const sectionDescriptor = SECTIONS.find(s => s.id === sectionId);
		if (sectionDescriptor?.placeholder) {
			this._renderPlaceholderSection(sectionDescriptor);
			return;
		}

		switch (sectionId) {
			case 'general':
				this._renderGeneralSection();
				break;
			case 'codeMode':
				this._renderCodeModeSection();
				break;
			case 'providers':
				this._renderProvidersSection();
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
			case 'about':
				this._renderAboutSection();
				break;
		}
	}

	// ─── Placeholder Section (Coming Soon) ────────────────────────────────

	private _renderPlaceholderSection(section: ISectionDescriptor): void {
		const container = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(container, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = section.label;

		const descEl = dom.append(container, $('p.sandtable-settings-section-desc'));
		descEl.textContent = section.placeholderDesc || 'This feature is coming in a future release.';

		const badgeContainer = dom.append(container, $('div'));
		badgeContainer.style.marginTop = '20px';

		const badge = dom.append(badgeContainer, $('span.sandtable-settings-coming-soon'));
		badge.textContent = nls.localize('sandtable.settings.comingSoon', "Coming Soon");

		const roadmapNote = dom.append(container, $('p'));
		roadmapNote.style.marginTop = '24px';
		roadmapNote.style.opacity = '0.6';
		roadmapNote.style.fontSize = '0.9em';
		roadmapNote.textContent = nls.localize('sandtable.settings.roadmapNote', "This feature is part of the Sandtable roadmap. Check the project documentation for development progress and timelines.");
	}

	// ─── About Section ───────────────────────────────────────────────────

	private _renderAboutSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.aboutTitle', "About Sandtable");

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

		const platformRow = dom.append(infoCard, $('.sandtable-settings-info-row'));
		const platformLabel = dom.append(platformRow, $('span.sandtable-settings-info-label'));
		platformLabel.textContent = nls.localize('sandtable.settings.platform', "Platform");
		const platformValue = dom.append(platformRow, $('span.sandtable-settings-info-value'));
		platformValue.textContent = `${process.platform} ${process.arch}`;

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

		// Mission statement
		const missionCard = dom.append(section, $('.sandtable-settings-card'));
		const missionTitle = dom.append(missionCard, $('h3.sandtable-settings-card-title'));
		missionTitle.textContent = nls.localize('sandtable.settings.mission', "Mission");
		const missionText = dom.append(missionCard, $('p'));
		missionText.style.lineHeight = '1.5';
		missionText.textContent = 'Sandtable is an AI-powered research and scenario simulation workspace. Built as a fork of VS Code with core-level LLM integration powered by Cortex, it runs fully offline on self-hosted infrastructure — providing an intelligent workspace for researchers, analysts, and teams to chat with AI agents, ingest documents, create specialized personas, and conduct structured research and wargaming exercises.';
	}

	// ─── Providers Section (Phase 4.5) ───────────────────────────────────

	private _renderProvidersSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.providersTitle', "Providers");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.providersDesc', "Configure connections to LLM inference endpoints. Cortex is the recommended primary provider with full admin capabilities. Additional OpenAI-compatible endpoints (Ollama, vLLM, LM Studio, cloud APIs) can be added as secondary inference-only providers.");

		const listContainer = dom.append(section, $('.sandtable-provider-list'));

		// Read current provider configs
		const configs = this.configurationService.getValue<IProviderConfig[]>(ProviderConfigKeys.Providers) || [];

		if (configs.length === 0) {
			const emptyCard = dom.append(listContainer, $('.sandtable-settings-card'));
			const emptyText = dom.append(emptyCard, $('p'));
			emptyText.textContent = nls.localize('sandtable.settings.noProviders', "No providers configured. A default Cortex provider is being used from the Connection settings. Add a provider below to set up multi-provider connections.");
		}

		// Render a card for each provider
		for (const config of configs) {
			this._renderProviderCard(listContainer, config, configs);
		}

		// Add Provider button
		const addBtnContainer = dom.append(section, $('.sandtable-provider-add-container'));
		const addBtn = dom.append(addBtnContainer, $('button.sandtable-provider-add-btn'));
		addBtn.textContent = nls.localize('sandtable.settings.addProvider', "+ Add Provider");

		this._register(dom.addDisposableListener(addBtn, 'click', () => {
			this._showProviderEditor(section);
		}));
	}

	private _renderProviderCard(parent: HTMLElement, config: IProviderConfig, allConfigs: IProviderConfig[]): void {
		const card = dom.append(parent, $('.sandtable-provider-card'));

		// Header row: name + toggle
		const headerRow = dom.append(card, $('.sandtable-provider-card-header'));
		const nameEl = dom.append(headerRow, $('span.sandtable-provider-card-name'));
		nameEl.textContent = config.displayName;

		const toggleLabel = dom.append(headerRow, $('label.sandtable-provider-card-toggle'));
		const toggleInput = dom.append(toggleLabel, $('input')) as HTMLInputElement;
		toggleInput.type = 'checkbox';
		toggleInput.checked = config.enabled;
		const toggleText = dom.append(toggleLabel, $('span'));
		toggleText.textContent = config.enabled
			? nls.localize('sandtable.settings.providerOn', "On")
			: nls.localize('sandtable.settings.providerOff', "Off");

		this._register(dom.addDisposableListener(toggleInput, 'change', () => {
			config.enabled = toggleInput.checked;
			toggleText.textContent = config.enabled
				? nls.localize('sandtable.settings.providerOn', "On")
				: nls.localize('sandtable.settings.providerOff', "Off");
			this.configurationService.updateValue(ProviderConfigKeys.Providers, [...allConfigs]);
		}));

		// Info row: endpoint, type, health
		const infoRow = dom.append(card, $('.sandtable-provider-card-info'));
		const endpointEl = dom.append(infoRow, $('span.sandtable-provider-card-endpoint'));
		endpointEl.textContent = config.endpoint;

		const health = this.providerRegistry.getProviderHealth(config.id);
		const statusDot = dom.append(infoRow, $('span.sandtable-provider-card-status'));
		if (!config.enabled) {
			statusDot.classList.add('sandtable-provider-status-disabled');
			statusDot.textContent = nls.localize('sandtable.settings.providerDisabled', "disabled");
		} else if (health?.healthy) {
			statusDot.classList.add('sandtable-provider-status-healthy');
			statusDot.textContent = nls.localize('sandtable.settings.providerHealthy', "{0} \u00B7 {1} models \u00B7 {2}ms", config.type, health.modelCount, health.latencyMs);
		} else {
			statusDot.classList.add('sandtable-provider-status-unhealthy');
			statusDot.textContent = nls.localize('sandtable.settings.providerUnhealthy', "{0} \u00B7 disconnected", config.type);
		}

		// Show model override count if any
		if (config.modelOverrides && Object.keys(config.modelOverrides).length > 0) {
			const overrideCount = Object.keys(config.modelOverrides).length;
			const overrideEl = dom.append(infoRow, $('span.sandtable-provider-card-overrides'));
			overrideEl.textContent = nls.localize('sandtable.settings.providerOverrides', "{0} model override(s)", overrideCount);
		}

		// Actions: Edit, Remove
		const actionsRow = dom.append(card, $('.sandtable-provider-card-actions'));

		const editBtn = dom.append(actionsRow, $('button.sandtable-provider-card-edit'));
		editBtn.textContent = nls.localize('sandtable.settings.editProvider', "Edit");
		this._register(dom.addDisposableListener(editBtn, 'click', () => {
			// Clear content and show editor
			dom.clearNode(this.contentContainer);
			const editorSection = dom.append(this.contentContainer, $('.sandtable-settings-section'));
			this._showProviderEditor(editorSection, config);
		}));

		const removeBtn = dom.append(actionsRow, $('button.sandtable-provider-card-remove'));
		removeBtn.textContent = nls.localize('sandtable.settings.removeProvider', "Remove");
		this._register(dom.addDisposableListener(removeBtn, 'click', async () => {
			const result = await this.dialogService.confirm({
				message: nls.localize('sandtable.settings.removeConfirmTitle', "Remove Provider"),
				detail: nls.localize('sandtable.settings.removeConfirmDetail', "Are you sure you want to remove \"{0}\"? This cannot be undone.", config.displayName),
				primaryButton: nls.localize('sandtable.settings.removeConfirmYes', "Remove"),
			});
			if (result.confirmed) {
				this.providerRegistry.removeProvider(config.id);
				// Re-render the section
				this._renderSection('providers');
			}
		}));
	}

	private _showProviderEditor(parent: HTMLElement, existingConfig?: IProviderConfig): void {
		const editor = this._register(new SandtableProviderEditor(parent, this.providerRegistry, existingConfig));

		this._register(editor.onSave(async (event) => {
			if (event.isNew) {
				await this.providerRegistry.addProvider(event.config);
			} else {
				this.providerRegistry.updateProvider(event.config.id, event.config);
			}
			// Re-render providers section
			this._renderSection('providers');
		}));

		this._register(editor.onCancel(() => {
			// Re-render providers section
			this._renderSection('providers');
		}));
	}

	// ─── General Section ──────────────────────────────────────────────────

	private _renderGeneralSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		// Section title
		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.generalTitle', "General");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.generalDesc', "Workspace status and quick access to key settings.");

		// Connection status card
		const statusCard = dom.append(section, $('.sandtable-settings-card'));
		const statusTitle = dom.append(statusCard, $('h3.sandtable-settings-card-title'));
		statusTitle.textContent = nls.localize('sandtable.settings.connectionOverview', "Connection Status");

		const statusRow = dom.append(statusCard, $('.sandtable-settings-info-row'));
		const statusLabel = dom.append(statusRow, $('span.sandtable-settings-info-label'));
		statusLabel.textContent = nls.localize('sandtable.settings.status', "Status");
		const statusValue = dom.append(statusRow, $('span.sandtable-settings-info-value'));
		const connectionStatus = this.cortexService.getConnectionStatus();
		statusValue.textContent = connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1);
		statusValue.classList.add(`sandtable-settings-status-${connectionStatus}`);

		// Provider count
		const providerConfigs = this.configurationService.getValue<IProviderConfig[]>(ProviderConfigKeys.Providers) || [];
		const providerRow = dom.append(statusCard, $('.sandtable-settings-info-row'));
		const providerLabel = dom.append(providerRow, $('span.sandtable-settings-info-label'));
		providerLabel.textContent = nls.localize('sandtable.settings.providers', "Providers");
		const providerValue = dom.append(providerRow, $('span.sandtable-settings-info-value'));
		const enabledCount = providerConfigs.filter(p => p.enabled !== false).length;
		providerValue.textContent = `${enabledCount} configured`;

		// Model count
		const curatedModels = this.configurationService.getValue<Array<{ qualifiedName: string; enabled: boolean }>>(ModelsConfigKeys.CuratedModels) || [];
		const modelRow = dom.append(statusCard, $('.sandtable-settings-info-row'));
		const modelLabel = dom.append(modelRow, $('span.sandtable-settings-info-label'));
		modelLabel.textContent = nls.localize('sandtable.settings.modelsAvailable', "Curated Models");
		const modelValue = dom.append(modelRow, $('span.sandtable-settings-info-value'));
		const enabledModels = curatedModels.filter(m => m.enabled !== false).length;
		modelValue.textContent = curatedModels.length > 0 ? `${enabledModels} of ${curatedModels.length} enabled` : 'All (no curation)';

		// Update status when it changes
		this._register(this.cortexService.onConnectionStatusChanged((newStatus) => {
			statusValue.textContent = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
			statusValue.className = 'sandtable-settings-info-value';
			statusValue.classList.add(`sandtable-settings-status-${newStatus}`);
		}));

		// Quick actions card
		const actionsCard = dom.append(section, $('.sandtable-settings-card'));
		const actionsTitle = dom.append(actionsCard, $('h3.sandtable-settings-card-title'));
		actionsTitle.textContent = nls.localize('sandtable.settings.quickActions', "Quick Actions");

		const quickLinks: Array<{ label: string; sectionId: SectionId; desc: string }> = [
			{ label: 'Set up Providers', sectionId: 'providers', desc: 'Configure LLM inference endpoints' },
			{ label: 'Curate Models', sectionId: 'models', desc: 'Select which models are available in chat' },
			{ label: 'Customize Appearance', sectionId: 'appearance', desc: 'Background images and visual theme' },
			{ label: 'Configure Agent', sectionId: 'agent', desc: 'Tool-calling agent settings' },
		];

		for (const quickLink of quickLinks) {
			const linkRow = dom.append(actionsCard, $('div.sandtable-settings-quick-link'));
			linkRow.style.padding = '6px 0';
			linkRow.style.cursor = 'pointer';

			const linkLabel = dom.append(linkRow, $('strong'));
			linkLabel.textContent = quickLink.label;
			linkLabel.style.color = 'var(--vscode-textLink-foreground)';

			const linkDesc = dom.append(linkRow, $('span'));
			linkDesc.textContent = ` — ${quickLink.desc}`;
			linkDesc.style.opacity = '0.7';

			this._register(dom.addDisposableListener(linkRow, 'click', () => {
				this._switchSection(quickLink.sectionId);
			}));
		}
	}

	// ─── Code Mode Section ───────────────────────────────────────────────

	private _renderCodeModeSection(): void {
		const section = dom.append(this.contentContainer, $('.sandtable-settings-section'));

		const titleEl = dom.append(section, $('h2.sandtable-settings-section-title'));
		titleEl.textContent = nls.localize('sandtable.settings.codeModeTitle', "Code Mode");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.codeModeDesc',
			"Sandtable is a research and analysis workspace by default. Enable Code Mode to activate the full coding toolkit."
		);

		// Main toggle
		this._renderBooleanSetting(section, {
			key: CodeModeConfigKeys.Enabled,
			label: nls.localize('sandtable.settings.codeModeEnabled', "Enable Code Mode"),
			description: nls.localize('sandtable.settings.codeModeEnabledDesc',
				"When enabled, shows coding-specific features in the workspace. When disabled, Sandtable presents a streamlined research and analysis experience."),
		});

		// Info card listing what Code Mode controls
		const infoCard = dom.append(section, $('.sandtable-settings-card'));
		const infoTitle = dom.append(infoCard, $('h3.sandtable-settings-card-title'));
		infoTitle.textContent = nls.localize('sandtable.settings.codeModeControls', "Code Mode Controls");

		const infoDesc = dom.append(infoCard, $('p.sandtable-settings-info-description'));
		infoDesc.textContent = nls.localize('sandtable.settings.codeModeControlsDesc',
			"Toggling Code Mode shows or hides the following features:");

		const featureList = dom.append(infoCard, $('ul.sandtable-settings-feature-list'));
		const features = [
			nls.localize('sandtable.codeMode.feature.scm', "Source Control (Git) panel in the Activity Bar"),
			nls.localize('sandtable.codeMode.feature.debug', "Run and Debug panel in the Activity Bar"),
			nls.localize('sandtable.codeMode.feature.testing', "Testing panel in the Activity Bar"),
			nls.localize('sandtable.codeMode.feature.extensions', "Extensions panel in the Activity Bar"),
			nls.localize('sandtable.codeMode.feature.runMenu', "Run menu in the menu bar"),
			nls.localize('sandtable.codeMode.feature.tasks', "Tasks items in the Terminal menu"),
			nls.localize('sandtable.codeMode.feature.problems', "Problems panel"),
			nls.localize('sandtable.codeMode.feature.debugConsole', "Debug Console panel"),
			nls.localize('sandtable.codeMode.feature.statusBar', "Language, encoding, EOL, and indentation indicators in the status bar"),
			nls.localize('sandtable.codeMode.feature.codeNav', "Code navigation items (Go to Definition, References, etc.) in menus and context menus"),
		];

		for (const feature of features) {
			const li = dom.append(featureList, $('li'));
			li.textContent = feature;
		}
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
		titleEl.textContent = nls.localize('sandtable.settings.modelsTitle', "Models");

		const descEl = dom.append(section, $('p.sandtable-settings-section-desc'));
		descEl.textContent = nls.localize('sandtable.settings.modelsDesc', "Curate which models from your configured providers are available in the chat panel. When no models are curated, all detected models are shown.");

		// ─── Curated Models List ─────────────────────────────────────────
		const curatedContainer = dom.append(section, $('.sandtable-settings-card'));

		const curatedTitle = dom.append(curatedContainer, $('h3'));
		curatedTitle.textContent = nls.localize('sandtable.settings.curatedModelsTitle', "Available Models");

		const curatedList = dom.append(curatedContainer, $('div.sandtable-curated-models-list'));

		const renderCuratedModels = () => {
			dom.clearNode(curatedList);

			type CuratedModel = { qualifiedName: string; displayName?: string; enabled: boolean; overrides?: { dropParameters?: string[]; renameParameters?: Record<string, string>; forceParameters?: Record<string, string>; extraParameters?: Record<string, string> } };
			const curated = this.configurationService.getValue<CuratedModel[]>(ModelsConfigKeys.CuratedModels) || [];

			if (curated.length === 0) {
				const emptyMsg = dom.append(curatedList, $('p.sandtable-settings-info'));
				emptyMsg.textContent = nls.localize('sandtable.settings.noCuratedModels', "No models curated. All models from all providers are available in the chat panel. Use '+ Add Model' to curate specific models.");
			} else {
				for (const model of curated) {
					const card = dom.append(curatedList, $('div.sandtable-settings-card'));
					card.style.marginBottom = '8px';
					card.style.padding = '10px 12px';

					// Top row: model name + actions
					const row = dom.append(card, $('div'));
					row.style.display = 'flex';
					row.style.alignItems = 'center';
					row.style.justifyContent = 'space-between';

					const infoCol = dom.append(row, $('div'));
					const nameEl = dom.append(infoCol, $('strong'));
					nameEl.textContent = model.displayName || model.qualifiedName;
					if (model.displayName) {
						const qualEl = dom.append(infoCol, $('div'));
						qualEl.style.fontSize = '0.85em';
						qualEl.style.opacity = '0.7';
						qualEl.textContent = model.qualifiedName;
					}
					// Show override indicator
					const hasOverrides = model.overrides && (
						(model.overrides.dropParameters && model.overrides.dropParameters.length > 0) ||
						(model.overrides.renameParameters && Object.keys(model.overrides.renameParameters).length > 0) ||
						(model.overrides.forceParameters && Object.keys(model.overrides.forceParameters).length > 0) ||
						(model.overrides.extraParameters && Object.keys(model.overrides.extraParameters).length > 0)
					);
					if (hasOverrides) {
						const badge = dom.append(infoCol, $('span'));
						badge.style.fontSize = '0.75em';
						badge.style.opacity = '0.6';
						badge.style.marginLeft = '6px';
						badge.textContent = '(has overrides)';
					}

					const actionsCol = dom.append(row, $('div'));
					actionsCol.style.display = 'flex';
					actionsCol.style.gap = '6px';
					actionsCol.style.alignItems = 'center';

					// Enabled toggle
					const toggleLabel = dom.append(actionsCol, $('label'));
					toggleLabel.style.display = 'flex';
					toggleLabel.style.alignItems = 'center';
					toggleLabel.style.gap = '4px';
					const checkbox = dom.append(toggleLabel, $('input')) as HTMLInputElement;
					checkbox.type = 'checkbox';
					checkbox.checked = model.enabled !== false;
					const toggleText = dom.append(toggleLabel, $('span'));
					toggleText.textContent = model.enabled !== false ? 'On' : 'Off';
					toggleText.style.fontSize = '0.85em';

					checkbox.addEventListener('change', () => {
						const current = this.configurationService.getValue<CuratedModel[]>(ModelsConfigKeys.CuratedModels) || [];
						const updated = current.map(m => m.qualifiedName === model.qualifiedName ? { ...m, enabled: checkbox.checked } : m);
						this.configurationService.updateValue(ModelsConfigKeys.CuratedModels, updated);
						toggleText.textContent = checkbox.checked ? 'On' : 'Off';
					});

					// Edit button (expand/collapse configuration)
					const editBtn = dom.append(actionsCol, $('button.sandtable-settings-button-secondary'));
					editBtn.textContent = nls.localize('sandtable.settings.edit', "Edit");

					// Remove button
					const removeBtn = dom.append(actionsCol, $('button.sandtable-settings-button-secondary'));
					removeBtn.textContent = nls.localize('sandtable.settings.remove', "Remove");
					removeBtn.addEventListener('click', () => {
						const current = this.configurationService.getValue<CuratedModel[]>(ModelsConfigKeys.CuratedModels) || [];
						const updated = current.filter(m => m.qualifiedName !== model.qualifiedName);
						this.configurationService.updateValue(ModelsConfigKeys.CuratedModels, updated);
						renderCuratedModels();
					});

					// Expandable configuration panel (hidden by default)
					const configPanel = dom.append(card, $('div'));
					configPanel.style.display = 'none';
					configPanel.style.marginTop = '10px';
					configPanel.style.paddingTop = '10px';
					configPanel.style.borderTop = '1px solid var(--vscode-widget-border, rgba(255,255,255,0.1))';

					editBtn.addEventListener('click', () => {
						const isVisible = configPanel.style.display !== 'none';
						configPanel.style.display = isVisible ? 'none' : 'block';
						editBtn.textContent = isVisible ? 'Edit' : 'Close';
						if (!isVisible) {
							renderConfigPanel(configPanel, model);
						}
					});
				}
			}
		};

		// Renders the inline configuration panel for a curated model
		const renderConfigPanel = (container: HTMLElement, model: { qualifiedName: string; displayName?: string; enabled: boolean; overrides?: { dropParameters?: string[]; renameParameters?: Record<string, string>; forceParameters?: Record<string, string>; extraParameters?: Record<string, string> } }) => {
			dom.clearNode(container);

			const overrides = model.overrides || {};

			// Display Name
			const nameRow = dom.append(container, $('div'));
			nameRow.style.marginBottom = '8px';
			const nameLabel = dom.append(nameRow, $('label.sandtable-settings-label'));
			nameLabel.textContent = nls.localize('sandtable.settings.modelDisplayName', "Display Name (optional)");
			const nameInput = dom.append(nameRow, $('input.sandtable-settings-input')) as HTMLInputElement;
			nameInput.type = 'text';
			nameInput.value = model.displayName || '';
			nameInput.placeholder = model.qualifiedName;
			nameInput.style.width = '100%';

			// Drop Parameters
			const dropRow = dom.append(container, $('div'));
			dropRow.style.marginBottom = '8px';
			const dropLabel = dom.append(dropRow, $('label.sandtable-settings-label'));
			dropLabel.textContent = nls.localize('sandtable.settings.dropParams', "Drop Parameters (comma-separated)");
			const dropDesc = dom.append(dropRow, $('div'));
			dropDesc.style.fontSize = '0.8em';
			dropDesc.style.opacity = '0.7';
			dropDesc.style.marginBottom = '4px';
			dropDesc.textContent = 'Parameters to remove from requests (e.g., temperature, top_p for reasoning models)';
			const dropInput = dom.append(dropRow, $('input.sandtable-settings-input')) as HTMLInputElement;
			dropInput.type = 'text';
			dropInput.value = (overrides.dropParameters || []).join(', ');
			dropInput.placeholder = 'e.g., temperature, top_p';
			dropInput.style.width = '100%';

			// Rename Parameters
			const renameRow = dom.append(container, $('div'));
			renameRow.style.marginBottom = '8px';
			const renameLabel = dom.append(renameRow, $('label.sandtable-settings-label'));
			renameLabel.textContent = nls.localize('sandtable.settings.renameParams', "Rename Parameters (old=new, comma-separated)");
			const renameDesc = dom.append(renameRow, $('div'));
			renameDesc.style.fontSize = '0.8em';
			renameDesc.style.opacity = '0.7';
			renameDesc.style.marginBottom = '4px';
			renameDesc.textContent = 'Rename request parameters (e.g., max_tokens=max_completion_tokens)';
			const renameInput = dom.append(renameRow, $('input.sandtable-settings-input')) as HTMLInputElement;
			renameInput.type = 'text';
			renameInput.value = Object.entries(overrides.renameParameters || {}).map(([k, v]) => `${k}=${v}`).join(', ');
			renameInput.placeholder = 'e.g., max_tokens=max_completion_tokens';
			renameInput.style.width = '100%';

			// Force Parameters
			const forceRow = dom.append(container, $('div'));
			forceRow.style.marginBottom = '8px';
			const forceLabel = dom.append(forceRow, $('label.sandtable-settings-label'));
			forceLabel.textContent = nls.localize('sandtable.settings.forceParams', "Force Parameters (key=value, comma-separated)");
			const forceDesc = dom.append(forceRow, $('div'));
			forceDesc.style.fontSize = '0.8em';
			forceDesc.style.opacity = '0.7';
			forceDesc.style.marginBottom = '4px';
			forceDesc.textContent = 'Always set these parameters to specific values, overriding defaults';
			const forceInput = dom.append(forceRow, $('input.sandtable-settings-input')) as HTMLInputElement;
			forceInput.type = 'text';
			forceInput.value = Object.entries(overrides.forceParameters || {}).map(([k, v]) => `${k}=${v}`).join(', ');
			forceInput.placeholder = 'e.g., temperature=1';
			forceInput.style.width = '100%';

			// Extra Parameters
			const extraRow = dom.append(container, $('div'));
			extraRow.style.marginBottom = '8px';
			const extraLabel = dom.append(extraRow, $('label.sandtable-settings-label'));
			extraLabel.textContent = nls.localize('sandtable.settings.extraParams', "Extra Parameters (key=value, comma-separated)");
			const extraDesc = dom.append(extraRow, $('div'));
			extraDesc.style.fontSize = '0.8em';
			extraDesc.style.opacity = '0.7';
			extraDesc.style.marginBottom = '4px';
			extraDesc.textContent = 'Additional parameters to include in every request to this model';
			const extraInput = dom.append(extraRow, $('input.sandtable-settings-input')) as HTMLInputElement;
			extraInput.type = 'text';
			extraInput.value = Object.entries(overrides.extraParameters || {}).map(([k, v]) => `${k}=${v}`).join(', ');
			extraInput.placeholder = 'e.g., reasoning_effort="medium"';
			extraInput.style.width = '100%';

			// Save button
			const saveRow = dom.append(container, $('div'));
			saveRow.style.marginTop = '10px';
			const saveBtn = dom.append(saveRow, $('button.sandtable-settings-button'));
			saveBtn.textContent = nls.localize('sandtable.settings.saveModelConfig', "Save Configuration");
			saveBtn.addEventListener('click', () => {
				const current = this.configurationService.getValue<typeof model[]>(ModelsConfigKeys.CuratedModels) || [];

				// Parse override values
				const newOverrides: typeof overrides = {};
				const dropVal = dropInput.value.trim();
				if (dropVal) {
					newOverrides.dropParameters = dropVal.split(',').map(s => s.trim()).filter(Boolean);
				}
				const renameVal = renameInput.value.trim();
				if (renameVal) {
					newOverrides.renameParameters = {};
					for (const pair of renameVal.split(',')) {
						const [oldName, newName] = pair.split('=').map(s => s.trim());
						if (oldName && newName) {
							newOverrides.renameParameters[oldName] = newName;
						}
					}
				}
				const forceVal = forceInput.value.trim();
				if (forceVal) {
					newOverrides.forceParameters = {};
					for (const pair of forceVal.split(',')) {
						const eqIdx = pair.indexOf('=');
						if (eqIdx > 0) {
							newOverrides.forceParameters[pair.substring(0, eqIdx).trim()] = pair.substring(eqIdx + 1).trim();
						}
					}
				}
				const extraVal = extraInput.value.trim();
				if (extraVal) {
					newOverrides.extraParameters = {};
					for (const pair of extraVal.split(',')) {
						const eqIdx = pair.indexOf('=');
						if (eqIdx > 0) {
							newOverrides.extraParameters[pair.substring(0, eqIdx).trim()] = pair.substring(eqIdx + 1).trim();
						}
					}
				}

				const displayNameVal = nameInput.value.trim() || undefined;
				const hasAnyOverrides = Object.keys(newOverrides).length > 0;

				const updated = current.map(m =>
					m.qualifiedName === model.qualifiedName
						? { ...m, displayName: displayNameVal, overrides: hasAnyOverrides ? newOverrides : undefined }
						: m
				);
				this.configurationService.updateValue(ModelsConfigKeys.CuratedModels, updated);
				renderCuratedModels();
			});
		};

		renderCuratedModels();

		// ─── Add Model Button + Detection Workflow ──────────────────────
		const addModelBtn = dom.append(curatedContainer, $('button.sandtable-settings-button'));
		addModelBtn.textContent = nls.localize('sandtable.settings.addModel', "+ Add Model");
		addModelBtn.style.marginTop = '12px';

		const detectionArea = dom.append(curatedContainer, $('div'));
		detectionArea.style.display = 'none';
		detectionArea.style.marginTop = '12px';

		addModelBtn.addEventListener('click', async () => {
			detectionArea.style.display = 'block';
			dom.clearNode(detectionArea);

			const statusEl = dom.append(detectionArea, $('p'));
			statusEl.textContent = nls.localize('sandtable.settings.detectingModels', "Detecting models from all providers...");

			try {
				const models = await this.providerRegistry.listAllModels();
				dom.clearNode(detectionArea);

				if (models.length === 0) {
					const emptyEl = dom.append(detectionArea, $('p.sandtable-settings-info'));
					emptyEl.textContent = nls.localize('sandtable.settings.noModelsDetected', "No models detected. Ensure at least one provider is configured and healthy.");
					return;
				}

				const headerEl = dom.append(detectionArea, $('p'));
				headerEl.textContent = nls.localize('sandtable.settings.selectModels', "Select models to add ({0} detected):", models.length);

				const curated = this.configurationService.getValue<Array<{ qualifiedName: string; enabled: boolean }>>(ModelsConfigKeys.CuratedModels) || [];
				const existingNames = new Set(curated.map(c => c.qualifiedName));

				// Group models by provider
				const byProvider = new Map<string, typeof models>();
				for (const model of models) {
					const key = model.providerName || model.providerId;
					if (!byProvider.has(key)) {
						byProvider.set(key, []);
					}
					byProvider.get(key)!.push(model);
				}

				const selectedModels = new Set<string>();

				for (const [providerName, providerModels] of byProvider) {
					const groupEl = dom.append(detectionArea, $('div'));
					groupEl.style.marginBottom = '12px';

					const groupTitle = dom.append(groupEl, $('strong'));
					groupTitle.textContent = `${providerName} (${providerModels.length} models)`;

					for (const model of providerModels) {
						const alreadyAdded = existingNames.has(model.qualifiedName);
						const rowEl = dom.append(groupEl, $('label'));
						rowEl.style.display = 'flex';
						rowEl.style.alignItems = 'center';
						rowEl.style.gap = '6px';
						rowEl.style.padding = '2px 0';

						const cb = dom.append(rowEl, $('input')) as HTMLInputElement;
						cb.type = 'checkbox';
						cb.disabled = alreadyAdded;
						cb.checked = alreadyAdded;

						const labelText = dom.append(rowEl, $('span'));
						labelText.textContent = model.modelName + (alreadyAdded ? ' (already added)' : '');
						labelText.style.opacity = alreadyAdded ? '0.5' : '1';

						if (!alreadyAdded) {
							cb.addEventListener('change', () => {
								if (cb.checked) {
									selectedModels.add(model.qualifiedName);
								} else {
									selectedModels.delete(model.qualifiedName);
								}
							});
						}
					}
				}

				// Confirm button
				const confirmRow = dom.append(detectionArea, $('div'));
				confirmRow.style.marginTop = '12px';
				confirmRow.style.display = 'flex';
				confirmRow.style.gap = '8px';

				const confirmBtn = dom.append(confirmRow, $('button.sandtable-settings-button'));
				confirmBtn.textContent = nls.localize('sandtable.settings.addSelected', "Add Selected");
				confirmBtn.addEventListener('click', () => {
					if (selectedModels.size === 0) {
						return;
					}
					const current = this.configurationService.getValue<Array<{ qualifiedName: string; enabled: boolean }>>(ModelsConfigKeys.CuratedModels) || [];
					const newEntries = Array.from(selectedModels).map(name => ({
						qualifiedName: name,
						enabled: true,
					}));
					this.configurationService.updateValue(ModelsConfigKeys.CuratedModels, [...current, ...newEntries]);
					detectionArea.style.display = 'none';
					renderCuratedModels();
				});

				const cancelBtn = dom.append(confirmRow, $('button.sandtable-settings-button-secondary'));
				cancelBtn.textContent = nls.localize('sandtable.settings.cancel', "Cancel");
				cancelBtn.addEventListener('click', () => {
					detectionArea.style.display = 'none';
				});

			} catch (e) {
				dom.clearNode(detectionArea);
				const errorEl = dom.append(detectionArea, $('p'));
				errorEl.style.color = 'var(--vscode-errorForeground)';
				errorEl.textContent = nls.localize('sandtable.settings.detectionError', "Error detecting models: {0}", e instanceof Error ? e.message : String(e));
			}
		});

		// ─── Model Manager Settings (subsection) ────────────────────────
		const managerSection = dom.append(section, $('div'));
		managerSection.style.marginTop = '24px';

		const managerTitle = dom.append(managerSection, $('h3'));
		managerTitle.textContent = nls.localize('sandtable.settings.modelManagerTitle', "Model Manager Panel");

		const managerDesc = dom.append(managerSection, $('p.sandtable-settings-section-desc'));
		managerDesc.textContent = nls.localize('sandtable.settings.modelManagerDesc', "Settings for the Model Manager panel in the Activity Bar (GPU metrics, model lifecycle).");

		// Show in Activity Bar
		this._renderBooleanSetting(managerSection, {
			key: ModelsConfigKeys.ShowInActivityBar,
			label: nls.localize('sandtable.settings.modelsShowInActivityBar', "Show in Activity Bar"),
			description: nls.localize('sandtable.settings.modelsShowInActivityBarDesc', "Show the Model Manager panel icon in the Activity Bar for quick access."),
		});

		// GPU Poll Interval
		this._renderNumberSetting(managerSection, {
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
