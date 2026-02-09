/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import {
	Extensions as ViewExtensions,
	IViewContainersRegistry,
	IViewsRegistry,
	ViewContainerLocation,
	IViewDescriptor,
} from '../../../common/views.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment, IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { PersonaConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { ICuratedPersona, BUILTIN_PERSONAS } from '../../../../platform/cortex/common/personaTypes.js';
import { SandtablePersonasPanel } from './sandtablePersonasPanel.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SANDTABLE_PERSONAS_VIEW_ID = 'sandtable.personasView';
const SANDTABLE_PERSONAS_CONTAINER_ID = 'workbench.view.sandtablePersonas';
const SANDTABLE_PERSONA_STATUS_ID = 'workbench.contrib.sandtablePersonaStatus';
const SANDTABLE_SELECT_PERSONA_COMMAND = 'sandtable.selectPersona';
const SANDTABLE_OPEN_PORTFOLIO_COMMAND = 'sandtable.openAgentPortfolio';

// ─── View Container (Activity Bar) ───────────────────────────────────────────

const sandtablePersonasViewIcon = registerIcon(
	'sandtable-personas-view-icon',
	Codicon.organization,
	nls.localize('sandtablePersonasViewIcon', "View icon for the Sandtable Agent Portfolio panel.")
);

const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: SANDTABLE_PERSONAS_CONTAINER_ID,
	title: nls.localize2('sandtablePersonasTitle', "Agent Portfolio"),
	icon: sandtablePersonasViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SANDTABLE_PERSONAS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'sandtable.personas.views.state',
	order: 100,
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

// ─── View Registration ────────────────────────────────────────────────────────

const viewDescriptor: IViewDescriptor = {
	id: SANDTABLE_PERSONAS_VIEW_ID,
	name: nls.localize2('sandtablePersonasView', "Agent Portfolio"),
	containerIcon: sandtablePersonasViewIcon,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(SandtablePersonasPanel),
	order: 0,
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);

// ─── Helper ───────────────────────────────────────────────────────────────────

function getPersonas(configurationService: IConfigurationService): ICuratedPersona[] {
	const stored = configurationService.getValue<ICuratedPersona[]>(PersonaConfigKeys.Personas) ?? [];
	if (stored.length > 0) {
		return stored;
	}
	return [...BUILTIN_PERSONAS];
}

// ─── Status Bar Item ──────────────────────────────────────────────────────────

/**
 * Status bar item that displays the currently active persona.
 * Clicking opens the quick-pick to select or clear the active persona.
 */
class SandtablePersonaStatusContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = SANDTABLE_PERSONA_STATUS_ID;

	private readonly _statusBarItem: IStatusbarEntryAccessor;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.logService.info('[Sandtable Personas] Registering persona status bar item and Agent Portfolio panel');

		this._statusBarItem = this._register(
			this.statusbarService.addEntry(
				this._getEntry(),
				SANDTABLE_PERSONA_STATUS_ID,
				StatusbarAlignment.RIGHT,
				90
			)
		);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PersonaConfigKeys.ActivePersona) || e.affectsConfiguration(PersonaConfigKeys.Personas)) {
				this._statusBarItem.update(this._getEntry());
			}
		}));
	}

	private _getEntry(): IStatusbarEntry {
		const activeId = this.configurationService.getValue<string>(PersonaConfigKeys.ActivePersona) || '';
		const personas = getPersonas(this.configurationService);
		const activePersona = personas.find(p => p.id === activeId);

		if (activePersona) {
			return {
				name: nls.localize('sandtable.persona.statusName', "Sandtable Persona"),
				ariaLabel: nls.localize('sandtable.persona.activeAriaLabel', "Active Persona: {0}", activePersona.name),
				text: `$(${activePersona.icon || 'person'}) ${activePersona.name}`,
				tooltip: nls.localize('sandtable.persona.activeTooltip', "Active Persona: {0} — {1}\nClick to change persona", activePersona.name, activePersona.role),
				command: SANDTABLE_SELECT_PERSONA_COMMAND,
			};
		}

		return {
			name: nls.localize('sandtable.persona.statusName', "Sandtable Persona"),
			ariaLabel: nls.localize('sandtable.persona.noActiveAriaLabel', "No persona active"),
			text: `$(person) ${nls.localize('sandtable.persona.none', "No Persona")}`,
			tooltip: nls.localize('sandtable.persona.noActiveTooltip', "No persona active. Click to select one."),
			command: SANDTABLE_SELECT_PERSONA_COMMAND,
		};
	}
}

// ─── Quick Pick Command ───────────────────────────────────────────────────────

interface IPersonaQuickPickItem extends IQuickPickItem {
	personaId: string;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SANDTABLE_SELECT_PERSONA_COMMAND,
			title: nls.localize2('sandtable.selectPersona', "Sandtable: Select Persona"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const quickInputService = accessor.get(IQuickInputService);

		const activeId = configurationService.getValue<string>(PersonaConfigKeys.ActivePersona) || '';
		const personas = getPersonas(configurationService);

		const items: IPersonaQuickPickItem[] = [];

		items.push({
			personaId: '',
			label: `$(close) ${nls.localize('sandtable.persona.clearOption', "No Persona (use default settings)")}`,
			description: activeId === '' ? nls.localize('sandtable.persona.currentlyActive', "(currently active)") : undefined,
		});

		items.push({
			personaId: '__separator__',
			label: '',
			kind: -1, // QuickPickItemKind.Separator
			type: 'separator',
		} as any);

		for (const persona of personas) {
			const isActive = persona.id === activeId;
			items.push({
				personaId: persona.id,
				label: `$(${persona.icon || 'person'}) ${persona.name}`,
				description: persona.role + (persona.isBuiltIn ? ' (Built-in)' : '') + (isActive ? ' — Active' : ''),
				detail: persona.systemPrompt.substring(0, 120) + (persona.systemPrompt.length > 120 ? '...' : ''),
			});
		}

		const picked = await quickInputService.pick(items, {
			placeHolder: nls.localize('sandtable.persona.pickPlaceholder', "Select an agent persona to activate"),
			matchOnDescription: true,
			matchOnDetail: true,
		});

		if (picked && 'personaId' in picked) {
			const selectedId = (picked as IPersonaQuickPickItem).personaId;
			await configurationService.updateValue(PersonaConfigKeys.ActivePersona, selectedId, ConfigurationTarget.USER);
		}
	}
});

// ─── Chat Input Persona Picker Button ─────────────────────────────────────────

/**
 * Adds a persona selection button to the chat input toolbar (ChatInput).
 * This puts a visible person icon in the chat panel's input toolbar area
 * (alongside the attach and tools buttons). Clicking opens the persona quick-pick.
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sandtable.selectPersonaFromChat',
			title: nls.localize2('sandtable.selectPersonaChat', "Select Agent Persona"),
			icon: Codicon.organization,
			menu: [{
				id: MenuId.ChatInput,
				group: 'navigation',
				order: 99, // High order = appears near the right side, next to the tools button
			}],
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(ICommandService).executeCommand(SANDTABLE_SELECT_PERSONA_COMMAND);
	}
});

// ─── Open Agent Portfolio Command ─────────────────────────────────────────────

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SANDTABLE_OPEN_PORTFOLIO_COMMAND,
			title: nls.localize2('sandtable.openAgentPortfolio', "Sandtable: Open Agent Portfolio"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = await import('../../../services/views/common/viewsService.js');
		const service = accessor.get(viewsService.IViewsService);
		service.openView(SANDTABLE_PERSONAS_VIEW_ID, true);
	}
});

// ─── Registration ─────────────────────────────────────────────────────────────

registerWorkbenchContribution2(
	SandtablePersonaStatusContribution.ID,
	SandtablePersonaStatusContribution,
	WorkbenchPhase.AfterRestored
);
