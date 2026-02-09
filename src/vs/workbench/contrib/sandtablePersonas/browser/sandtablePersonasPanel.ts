/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './sandtablePersonas.css';

import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { PersonaConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { ICuratedPersona, BUILTIN_PERSONAS, generatePersonaId } from '../../../../platform/cortex/common/personaTypes.js';

const $ = dom.$;

/**
 * Agent Portfolio panel -- the primary interface for managing agent personas.
 * Provides full CRUD: create, edit, duplicate, delete, activate, import, export.
 */
export class SandtablePersonasPanel extends ViewPane {

	static readonly ID = 'sandtable.personasView';

	private _rootEl!: HTMLElement;
	private _listContainer!: HTMLElement;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService override readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService protected override readonly openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@ILogService _logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._rootEl = dom.append(container, $('.sandtable-personas-root'));
		this._renderContent();

		// Re-render when persona settings change
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PersonaConfigKeys.Personas) || e.affectsConfiguration(PersonaConfigKeys.ActivePersona)) {
				this._renderContent();
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	// ─── Data Helpers ─────────────────────────────────────────────────────

	private _getPersonas(): ICuratedPersona[] {
		const stored = this.configurationService.getValue<ICuratedPersona[]>(PersonaConfigKeys.Personas) ?? [];
		if (stored.length > 0) {
			return stored;
		}
		return [...BUILTIN_PERSONAS];
	}

	private _savePersonas(personas: ICuratedPersona[]): void {
		this.configurationService.updateValue(PersonaConfigKeys.Personas, personas, ConfigurationTarget.USER);
	}

	// ─── Main Render ──────────────────────────────────────────────────────

	private _renderContent(): void {
		dom.clearNode(this._rootEl);

		const activeId = this.configurationService.getValue<string>(PersonaConfigKeys.ActivePersona) || '';
		const personas = this._getPersonas();
		const activePersona = personas.find(p => p.id === activeId);

		// Title
		const title = dom.append(this._rootEl, $('h2'));
		title.textContent = nls.localize('sandtable.personas.panelTitle', "Agent Portfolio");

		const desc = dom.append(this._rootEl, $('p.sandtable-personas-desc'));
		desc.textContent = nls.localize('sandtable.personas.panelDesc', "Create and manage AI agent personas with tailored system prompts, model preferences, and inference parameters.");

		// Active persona banner
		const activeCard = dom.append(this._rootEl, $('.sandtable-persona-active-card'));
		const activeRow = dom.append(activeCard, $('.sandtable-persona-active-row'));

		const activeLabel = dom.append(activeRow, $('span.sandtable-persona-active-label'));
		activeLabel.textContent = nls.localize('sandtable.personas.activeLabel', "Active:");

		const activeValue = dom.append(activeRow, $('span.sandtable-persona-active-value'));
		activeValue.textContent = activePersona
			? `${activePersona.name} — ${activePersona.role}`
			: nls.localize('sandtable.personas.noActive', "None (default settings)");

		if (activePersona) {
			const clearBtn = dom.append(activeRow, $('button.sandtable-personas-btn.sandtable-persona-clear-btn'));
			clearBtn.textContent = nls.localize('sandtable.personas.clear', "Clear");
			this._register(dom.addDisposableListener(clearBtn, 'click', () => {
				this.configurationService.updateValue(PersonaConfigKeys.ActivePersona, '', ConfigurationTarget.USER);
			}));
		}

		// Action buttons
		const actionsRow = dom.append(this._rootEl, $('.sandtable-persona-actions'));

		const createBtn = dom.append(actionsRow, $('button.sandtable-personas-btn.sandtable-personas-btn-primary'));
		createBtn.textContent = nls.localize('sandtable.personas.create', "+ Create Agent");
		this._register(dom.addDisposableListener(createBtn, 'click', () => {
			this._showForm(undefined);
		}));

		const importBtn = dom.append(actionsRow, $('button.sandtable-personas-btn'));
		importBtn.textContent = nls.localize('sandtable.personas.import', "Import");
		this._register(dom.addDisposableListener(importBtn, 'click', () => {
			this._importPersonas();
		}));

		const exportBtn = dom.append(actionsRow, $('button.sandtable-personas-btn'));
		exportBtn.textContent = nls.localize('sandtable.personas.export', "Export All");
		this._register(dom.addDisposableListener(exportBtn, 'click', () => {
			this._exportPersonas();
		}));

		// Persona card list
		this._listContainer = dom.append(this._rootEl, $('.sandtable-persona-list'));
		this._renderCards(personas, activeId);
	}

	// ─── Card List ────────────────────────────────────────────────────────

	private _renderCards(personas: ICuratedPersona[], activeId: string): void {
		dom.clearNode(this._listContainer);

		for (const persona of personas) {
			const isActive = persona.id === activeId;
			const card = dom.append(this._listContainer, $('.sandtable-persona-card'));
			if (isActive) {
				card.classList.add('sandtable-persona-card-active');
			}

			// Header
			const headerRow = dom.append(card, $('.sandtable-persona-card-header'));

			const iconEl = dom.append(headerRow, $('span.sandtable-persona-icon'));
			iconEl.classList.add('codicon', `codicon-${persona.icon || 'person'}`);

			const nameEl = dom.append(headerRow, $('span.sandtable-persona-name'));
			nameEl.textContent = persona.name;

			const roleEl = dom.append(headerRow, $('span.sandtable-persona-role'));
			roleEl.textContent = persona.role;

			if (persona.isBuiltIn) {
				const badge = dom.append(headerRow, $('span.sandtable-persona-badge.sandtable-persona-badge-builtin'));
				badge.textContent = nls.localize('sandtable.personas.builtIn', "Built-in");
			}
			if (isActive) {
				const badge = dom.append(headerRow, $('span.sandtable-persona-badge.sandtable-persona-badge-active'));
				badge.textContent = nls.localize('sandtable.personas.activeBadge', "Active");
			}

			// Tags
			const detailsRow = dom.append(card, $('.sandtable-persona-details'));
			if (persona.temperature !== undefined) {
				const tag = dom.append(detailsRow, $('span.sandtable-persona-tag'));
				tag.textContent = `Temp: ${persona.temperature}`;
			}
			if (persona.maxTokens !== undefined) {
				const tag = dom.append(detailsRow, $('span.sandtable-persona-tag'));
				tag.textContent = `Max tokens: ${persona.maxTokens}`;
			}
			if (persona.model) {
				const tag = dom.append(detailsRow, $('span.sandtable-persona-tag'));
				tag.textContent = `Model: ${persona.model}`;
			}

			// Prompt preview
			const preview = dom.append(card, $('p.sandtable-persona-prompt-preview'));
			const text = persona.systemPrompt || '';
			preview.textContent = text.length > 120 ? text.substring(0, 120) + '...' : text;

			// Actions
			const actions = dom.append(card, $('.sandtable-persona-card-actions'));

			if (!isActive) {
				const activateBtn = dom.append(actions, $('button.sandtable-personas-btn.sandtable-personas-btn-primary'));
				activateBtn.textContent = nls.localize('sandtable.personas.activate', "Activate");
				this._register(dom.addDisposableListener(activateBtn, 'click', () => {
					this.configurationService.updateValue(PersonaConfigKeys.ActivePersona, persona.id, ConfigurationTarget.USER);
				}));
			}

			const editBtn = dom.append(actions, $('button.sandtable-personas-btn'));
			editBtn.textContent = nls.localize('sandtable.personas.edit', "Edit");
			this._register(dom.addDisposableListener(editBtn, 'click', () => {
				this._showForm(persona);
			}));

			const dupBtn = dom.append(actions, $('button.sandtable-personas-btn'));
			dupBtn.textContent = nls.localize('sandtable.personas.duplicate', "Duplicate");
			this._register(dom.addDisposableListener(dupBtn, 'click', () => {
				const dup: ICuratedPersona = {
					...persona,
					id: generatePersonaId(),
					name: `${persona.name} (Copy)`,
					isBuiltIn: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};
				const all = this._getPersonas();
				all.push(dup);
				this._savePersonas(all);
			}));

			if (!persona.isBuiltIn) {
				const delBtn = dom.append(actions, $('button.sandtable-personas-btn.sandtable-personas-btn-danger'));
				delBtn.textContent = nls.localize('sandtable.personas.delete', "Delete");
				this._register(dom.addDisposableListener(delBtn, 'click', async () => {
					const result = await this.dialogService.confirm({
						message: nls.localize('sandtable.personas.confirmDelete', "Delete persona \"{0}\"?", persona.name),
						detail: nls.localize('sandtable.personas.confirmDeleteDetail', "This action cannot be undone."),
					});
					if (result.confirmed) {
						const all = this._getPersonas().filter(p => p.id !== persona.id);
						this._savePersonas(all);
						if (activeId === persona.id) {
							this.configurationService.updateValue(PersonaConfigKeys.ActivePersona, '', ConfigurationTarget.USER);
						}
					}
				}));
			}
		}
	}

	// ─── Create / Edit Form ───────────────────────────────────────────────

	private _showForm(existingPersona: ICuratedPersona | undefined): void {
		dom.clearNode(this._rootEl);

		const isNew = !existingPersona;

		const backBtn = dom.append(this._rootEl, $('button.sandtable-personas-btn'));
		backBtn.textContent = nls.localize('sandtable.personas.backToList', "< Back to Portfolio");
		backBtn.style.marginBottom = '12px';
		this._register(dom.addDisposableListener(backBtn, 'click', () => {
			this._renderContent();
		}));

		const form = dom.append(this._rootEl, $('.sandtable-persona-form'));

		const formTitle = dom.append(form, $('h3'));
		formTitle.textContent = isNew
			? nls.localize('sandtable.personas.newTitle', "Create New Agent")
			: nls.localize('sandtable.personas.editTitle', "Edit: {0}", existingPersona!.name);

		// Name
		const nameGroup = dom.append(form, $('.sandtable-persona-form-group'));
		dom.append(nameGroup, $('label')).textContent = nls.localize('sandtable.personas.nameLabel', "Name");
		const nameInput = dom.append(nameGroup, $('input')) as HTMLInputElement;
		nameInput.type = 'text';
		nameInput.placeholder = 'e.g., Red Team Commander';
		nameInput.value = existingPersona?.name || '';

		// Role
		const roleGroup = dom.append(form, $('.sandtable-persona-form-group'));
		dom.append(roleGroup, $('label')).textContent = nls.localize('sandtable.personas.roleLabel', "Role / Title");
		const roleInput = dom.append(roleGroup, $('input')) as HTMLInputElement;
		roleInput.type = 'text';
		roleInput.placeholder = 'e.g., Adversarial Analyst';
		roleInput.value = existingPersona?.role || '';

		// System Prompt
		const promptGroup = dom.append(form, $('.sandtable-persona-form-group'));
		dom.append(promptGroup, $('label')).textContent = nls.localize('sandtable.personas.promptLabel', "System Prompt");
		const promptDesc = dom.append(promptGroup, $('p.sandtable-persona-form-desc'));
		promptDesc.textContent = nls.localize('sandtable.personas.promptDesc', "The full system prompt injected before conversations. Defines the persona's behavior, expertise, and response format.");
		const promptTextarea = dom.append(promptGroup, $('textarea.sandtable-persona-prompt-textarea')) as HTMLTextAreaElement;
		promptTextarea.rows = 10;
		promptTextarea.placeholder = 'You are a...';
		promptTextarea.value = existingPersona?.systemPrompt || '';

		// Guidelines
		const guidelinesGroup = dom.append(form, $('.sandtable-persona-form-group'));
		dom.append(guidelinesGroup, $('label')).textContent = nls.localize('sandtable.personas.guidelinesLabel', "Behavioral Guidelines");
		const guidelinesDesc = dom.append(guidelinesGroup, $('p.sandtable-persona-form-desc'));
		guidelinesDesc.textContent = nls.localize('sandtable.personas.guidelinesDesc', "Short behavioral rules appended to the system prompt.");
		const guidelinesInput = dom.append(guidelinesGroup, $('input')) as HTMLInputElement;
		guidelinesInput.type = 'text';
		guidelinesInput.placeholder = 'e.g., Always cite sources. Flag uncertainty.';
		guidelinesInput.value = existingPersona?.guidelines || '';

		// Model
		const modelGroup = dom.append(form, $('.sandtable-persona-form-group'));
		dom.append(modelGroup, $('label')).textContent = nls.localize('sandtable.personas.modelLabel', "Preferred Model");
		const modelDesc = dom.append(modelGroup, $('p.sandtable-persona-form-desc'));
		modelDesc.textContent = nls.localize('sandtable.personas.modelDesc', "Leave empty to use default. Use compound IDs like 'cortex::deepseek-v3'.");
		const modelInput = dom.append(modelGroup, $('input')) as HTMLInputElement;
		modelInput.type = 'text';
		modelInput.placeholder = 'Auto-detect (leave empty)';
		modelInput.value = existingPersona?.model || '';

		// Params row: Temperature, Top P, Max Tokens
		const paramsRow = dom.append(form, $('.sandtable-persona-params-row'));

		const tempGroup = dom.append(paramsRow, $('.sandtable-persona-param-group'));
		dom.append(tempGroup, $('label')).textContent = nls.localize('sandtable.personas.tempLabel', "Temperature");
		const tempInput = dom.append(tempGroup, $('input')) as HTMLInputElement;
		tempInput.type = 'number'; tempInput.min = '0'; tempInput.max = '2'; tempInput.step = '0.1';
		tempInput.placeholder = '0.7';
		tempInput.value = existingPersona?.temperature !== undefined ? String(existingPersona.temperature) : '';

		const topPGroup = dom.append(paramsRow, $('.sandtable-persona-param-group'));
		dom.append(topPGroup, $('label')).textContent = nls.localize('sandtable.personas.topPLabel', "Top P");
		const topPInput = dom.append(topPGroup, $('input')) as HTMLInputElement;
		topPInput.type = 'number'; topPInput.min = '0'; topPInput.max = '1'; topPInput.step = '0.05';
		topPInput.placeholder = '0.9';
		topPInput.value = existingPersona?.topP !== undefined ? String(existingPersona.topP) : '';

		const tokensGroup = dom.append(paramsRow, $('.sandtable-persona-param-group'));
		dom.append(tokensGroup, $('label')).textContent = nls.localize('sandtable.personas.tokensLabel', "Max Tokens");
		const tokensInput = dom.append(tokensGroup, $('input')) as HTMLInputElement;
		tokensInput.type = 'number'; tokensInput.min = '1'; tokensInput.max = '32768'; tokensInput.step = '256';
		tokensInput.placeholder = '4096';
		tokensInput.value = existingPersona?.maxTokens !== undefined ? String(existingPersona.maxTokens) : '';

		// Icon
		const iconGroup = dom.append(form, $('.sandtable-persona-form-group'));
		dom.append(iconGroup, $('label')).textContent = nls.localize('sandtable.personas.iconLabel', "Icon (Codicon name)");
		const iconDesc = dom.append(iconGroup, $('p.sandtable-persona-form-desc'));
		iconDesc.textContent = nls.localize('sandtable.personas.iconDesc', "Examples: shield, telescope, beaker, lock, megaphone, mortar-board, person, flame, bug, globe");
		const iconInput = dom.append(iconGroup, $('input')) as HTMLInputElement;
		iconInput.type = 'text';
		iconInput.placeholder = 'person';
		iconInput.value = existingPersona?.icon || '';

		// Buttons
		const formActions = dom.append(form, $('.sandtable-persona-form-actions'));

		const saveBtn = dom.append(formActions, $('button.sandtable-personas-btn.sandtable-personas-btn-primary'));
		saveBtn.textContent = isNew
			? nls.localize('sandtable.personas.createBtn', "Create Agent")
			: nls.localize('sandtable.personas.saveBtn', "Save Changes");

		this._register(dom.addDisposableListener(saveBtn, 'click', () => {
			const name = nameInput.value.trim();
			const sysPrompt = promptTextarea.value.trim();

			if (!name || !sysPrompt) {
				if (!name) { nameInput.style.borderColor = 'var(--vscode-inputValidation-errorBorder, #f44)'; }
				if (!sysPrompt) { promptTextarea.style.borderColor = 'var(--vscode-inputValidation-errorBorder, #f44)'; }
				return;
			}

			const now = new Date().toISOString();
			const persona: ICuratedPersona = {
				id: existingPersona?.id || generatePersonaId(),
				name,
				role: roleInput.value.trim() || name,
				systemPrompt: sysPrompt,
				model: modelInput.value.trim() || undefined,
				temperature: tempInput.value ? parseFloat(tempInput.value) : undefined,
				topP: topPInput.value ? parseFloat(topPInput.value) : undefined,
				maxTokens: tokensInput.value ? parseInt(tokensInput.value, 10) : undefined,
				guidelines: guidelinesInput.value.trim() || undefined,
				icon: iconInput.value.trim() || undefined,
				isBuiltIn: existingPersona?.isBuiltIn || false,
				createdAt: existingPersona?.createdAt || now,
				updatedAt: now,
			};

			const all = this._getPersonas();
			const idx = all.findIndex(p => p.id === persona.id);
			if (idx >= 0) {
				all[idx] = persona;
			} else {
				all.push(persona);
			}
			this._savePersonas(all);
			this._renderContent();
		}));

		const cancelBtn = dom.append(formActions, $('button.sandtable-personas-btn'));
		cancelBtn.textContent = nls.localize('sandtable.personas.cancelBtn', "Cancel");
		this._register(dom.addDisposableListener(cancelBtn, 'click', () => {
			this._renderContent();
		}));
	}

	// ─── Import / Export ──────────────────────────────────────────────────

	private async _importPersonas(): Promise<void> {
		try {
			const fileUris = await this.fileDialogService.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: [{ name: 'JSON Files', extensions: ['json'] }],
				title: nls.localize('sandtable.personas.importTitle', "Import Personas"),
			});
			if (!fileUris || fileUris.length === 0) { return; }

			const content = await this.fileService.readFile(fileUris[0]);
			const imported = JSON.parse(content.value.toString()) as ICuratedPersona[];
			if (!Array.isArray(imported)) { throw new Error('Invalid file: expected JSON array.'); }

			const existing = this._getPersonas();
			const existingIds = new Set(existing.map(p => p.id));
			const now = new Date().toISOString();
			let count = 0;

			for (const p of imported) {
				if (!p.name || !p.systemPrompt) { continue; }
				if (existingIds.has(p.id)) { p.id = generatePersonaId(); }
				p.isBuiltIn = false;
				p.updatedAt = now;
				existing.push(p);
				count++;
			}

			this._savePersonas(existing);
			await this.dialogService.info(nls.localize('sandtable.personas.importSuccess', "Imported {0} persona(s).", count));
		} catch (e) {
			await this.dialogService.error(nls.localize('sandtable.personas.importError', "Import failed: {0}", e instanceof Error ? e.message : String(e)));
		}
	}

	private async _exportPersonas(): Promise<void> {
		try {
			const personas = this._getPersonas();
			const saveUri = await this.fileDialogService.showSaveDialog({
				filters: [{ name: 'JSON Files', extensions: ['json'] }],
				title: nls.localize('sandtable.personas.exportTitle', "Export Personas"),
				defaultUri: URI.file('sandtable-personas.json'),
			});
			if (!saveUri) { return; }

			await this.fileService.writeFile(saveUri, VSBuffer.fromString(JSON.stringify(personas, null, 2)));
			await this.dialogService.info(nls.localize('sandtable.personas.exportSuccess', "Exported {0} persona(s).", personas.length));
		} catch (e) {
			await this.dialogService.error(nls.localize('sandtable.personas.exportError', "Export failed: {0}", e instanceof Error ? e.message : String(e)));
		}
	}
}
