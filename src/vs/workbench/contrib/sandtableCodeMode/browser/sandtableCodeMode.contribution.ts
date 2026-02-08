/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, IContextKey, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CodeModeConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment, IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import * as nls from '../../../../nls.js';

// ─── Context Key ──────────────────────────────────────────────────────────────

/**
 * Context key that is `true` when Sandtable Code Mode is enabled.
 * Used in `when` clauses throughout the workbench to conditionally show/hide
 * coding-specific UI elements (menus, panels, status bar items, etc.).
 */
export const SANDTABLE_CODE_MODE_ENABLED = new RawContextKey<boolean>(
	'sandtable.codeModeEnabled',
	false,
	'Whether Sandtable Code Mode is enabled (shows coding-specific features like debugger, source control, testing, etc.)'
);

// ─── View Container IDs to Control ────────────────────────────────────────────

/** Activity Bar view containers that are only shown when Code Mode is enabled */
const CODE_MODE_SIDEBAR_CONTAINERS = [
	'workbench.view.scm',           // Source Control
	'workbench.view.debug',         // Run and Debug
	'workbench.view.extension.test', // Testing
	'workbench.view.extensions',    // Extensions
];

/** Bottom panel view containers that are only shown when Code Mode is enabled */
const CODE_MODE_PANEL_CONTAINERS = [
	'workbench.panel.markers',      // Problems
	'workbench.panel.repl',         // Debug Console
];

// ─── Toggle Command ───────────────────────────────────────────────────────────

const TOGGLE_CODE_MODE_COMMAND_ID = 'sandtable.toggleCodeMode';

registerAction2(class ToggleCodeModeAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CODE_MODE_COMMAND_ID,
			title: nls.localize2('sandtable.toggleCodeMode', "Sandtable: Toggle Code Mode"),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyM,
			},
			menu: {
				id: MenuId.GlobalActivity,
				group: 'sandtable',
				order: 1,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);
		const current = configurationService.getValue<boolean>(CodeModeConfigKeys.Enabled) ?? false;
		configurationService.updateValue(CodeModeConfigKeys.Enabled, !current, ConfigurationTarget.USER_LOCAL);
	}
});

// ─── Workbench Contribution ───────────────────────────────────────────────────

/**
 * Central controller for Sandtable Code Mode.
 *
 * Responsibilities:
 * - Reads `sandtable.codeMode.enabled` from configuration
 * - Maintains the `sandtable.codeModeEnabled` context key for use in `when` clauses
 * - Programmatically controls visibility of coding-specific Activity Bar containers
 * - Programmatically controls visibility of coding-specific bottom panels
 * - Applies research-friendly editor defaults when Code Mode is OFF
 * - Restores coding defaults when Code Mode is ON
 * - Shows a status bar toggle button for quick mode switching
 *
 * Menu items, status bar items, and editor context menu entries use the
 * `sandtable.codeModeEnabled` context key in their `when` clauses directly.
 */
class SandtableCodeModeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableCodeMode';

	private readonly codeModeEnabledKey: IContextKey<boolean>;
	private readonly statusBarItem: IStatusbarEntryAccessor;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		// Initialize context key from current setting value
		const enabled = this.configurationService.getValue<boolean>(CodeModeConfigKeys.Enabled) ?? false;
		this.codeModeEnabledKey = SANDTABLE_CODE_MODE_ENABLED.bindTo(this.contextKeyService);
		this.codeModeEnabledKey.set(enabled);

		this.logService.info(`[Sandtable Code Mode] Initialized: ${enabled ? 'ON' : 'OFF'}`);

		// ─── Status Bar Toggle Button ─────────────────────────────────────
		this.statusBarItem = this._register(
			this.statusbarService.addEntry(
				this.getStatusBarEntry(enabled),
				'sandtable.codeModeToggle',
				StatusbarAlignment.RIGHT,
				1000 // High priority -- visible at the far right
			)
		);

		// Watch for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CodeModeConfigKeys.Enabled)) {
				this.onCodeModeChanged();
			}
		}));

		// Apply initial state
		// The context key is already set, so `when` clauses take effect immediately.
		// View container visibility is handled by the PaneCompositeBar's shouldBeHidden check.
		// Apply research defaults if Code Mode is OFF on startup.
		if (!enabled) {
			this.applyResearchDefaults(false);
		}
	}

	private getStatusBarEntry(enabled: boolean): IStatusbarEntry {
		if (enabled) {
			return {
				name: nls.localize('sandtable.codeMode.statusName', "Sandtable Code Mode"),
				text: `$(tools) ${nls.localize('sandtable.codeMode.on', "Code Mode")}`,
				tooltip: nls.localize('sandtable.codeMode.onTooltip', "Code Mode is ON — coding features visible. Click to switch to Research Mode. (Shift+Alt+M)"),
				command: TOGGLE_CODE_MODE_COMMAND_ID,
				ariaLabel: nls.localize('sandtable.codeMode.onAria', "Code Mode is enabled. Click to disable."),
				kind: 'prominent',
			};
		} else {
			return {
				name: nls.localize('sandtable.codeMode.statusName', "Sandtable Code Mode"),
				text: `$(book) ${nls.localize('sandtable.codeMode.off', "Research Mode")}`,
				tooltip: nls.localize('sandtable.codeMode.offTooltip', "Research Mode — streamlined workspace. Click to enable Code Mode. (Shift+Alt+M)"),
				command: TOGGLE_CODE_MODE_COMMAND_ID,
				ariaLabel: nls.localize('sandtable.codeMode.offAria', "Research Mode. Click to enable Code Mode."),
				kind: 'prominent',
			};
		}
	}

	private onCodeModeChanged(): void {
		const enabled = this.configurationService.getValue<boolean>(CodeModeConfigKeys.Enabled) ?? false;
		this.codeModeEnabledKey.set(enabled);
		this.logService.info(`[Sandtable Code Mode] Toggled: ${enabled ? 'ON' : 'OFF'}`);

		// Update status bar
		this.statusBarItem.update(this.getStatusBarEntry(enabled));

		// Apply or remove research-friendly editor defaults
		this.applyResearchDefaults(enabled);
	}

	/**
	 * When Code Mode is OFF (research mode), apply research-friendly editor settings:
	 * - Minimap disabled (reduces visual clutter for non-code documents)
	 * - Word wrap enabled (research text benefits from wrapping)
	 * - Breadcrumbs disabled (file-path navigation is less useful for research)
	 *
	 * When Code Mode is turned ON, these overrides are removed so the user's
	 * configured values (or VS Code defaults) take effect again.
	 *
	 * We use ConfigurationTarget.USER_LOCAL so these act as user-level overrides
	 * that the user can still override in their settings.
	 */
	private applyResearchDefaults(codeModeEnabled: boolean): void {
		const overrides: Array<{ key: string; researchValue: unknown }> = [
			{ key: 'editor.minimap.enabled', researchValue: false },
			{ key: 'editor.wordWrap', researchValue: 'on' },
			{ key: 'breadcrumbs.enabled', researchValue: false },
		];

		for (const { key, researchValue } of overrides) {
			if (!codeModeEnabled) {
				// Research mode: Apply overrides only if the user hasn't explicitly set a value
				const inspection = this.configurationService.inspect(key);
				if (inspection.userLocalValue === undefined && inspection.userRemoteValue === undefined) {
					this.configurationService.updateValue(key, researchValue, ConfigurationTarget.USER_LOCAL);
					this.logService.trace(`[Sandtable Code Mode] Set ${key} = ${researchValue} (research default)`);
				}
			} else {
				// Code mode: Remove our overrides by resetting to undefined (restores VS Code defaults)
				const inspection = this.configurationService.inspect(key);
				const defaultVal = inspection.defaultValue;
				const currentVal = inspection.userLocalValue;
				// Only remove if the current value matches what we set (don't override user's explicit choice)
				const researchOverrides: Record<string, unknown> = {
					'editor.minimap.enabled': false,
					'editor.wordWrap': 'on',
					'breadcrumbs.enabled': false,
				};
				if (currentVal !== undefined && currentVal === researchOverrides[key]) {
					this.configurationService.updateValue(key, undefined, ConfigurationTarget.USER_LOCAL);
					this.logService.trace(`[Sandtable Code Mode] Reset ${key} to default (${defaultVal})`);
				}
			}
		}
	}
}

registerWorkbenchContribution2(
	SandtableCodeModeContribution.ID,
	SandtableCodeModeContribution,
	WorkbenchPhase.AfterRestored
);

// Re-export constants for use by other contributions
export { CODE_MODE_SIDEBAR_CONTAINERS, CODE_MODE_PANEL_CONTAINERS };
