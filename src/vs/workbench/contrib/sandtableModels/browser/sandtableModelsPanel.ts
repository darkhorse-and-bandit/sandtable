/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICortexService, ICortexModelDetail, ICortexGPUMetric, ICortexSystemSummary, CortexConnectionStatus } from '../../../../platform/cortex/common/cortex.js';
import { ModelsConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { SandtableSystemSummary } from './sandtableSystemSummary.js';
import { SandtableGpuDashboard } from './sandtableGpuDashboard.js';
import { SandtableModelsList } from './sandtableModelsList.js';
import { SandtableModelLogs } from './sandtableModelLogs.js';
import * as dom from '../../../../base/browser/dom.js';

import './sandtableModels.css';

/**
 * Main ViewPane that composes the sub-components:
 * system summary, GPU dashboard, model list, and log viewer.
 * Handles polling with visibility awareness.
 */
export class SandtableModelsPanel extends ViewPane {

	static readonly ID = 'sandtable.modelsView';

	private _rootEl!: HTMLElement;
	private _disconnectedEl!: HTMLElement;
	private _contentEl!: HTMLElement;

	private _systemSummary!: SandtableSystemSummary;
	private _gpuDashboard!: SandtableGpuDashboard;
	private _modelsList!: SandtableModelsList;
	private _modelLogs!: SandtableModelLogs;

	private _pollTimer: ReturnType<typeof setInterval> | undefined;
	private _isConnected = false;
	private _isActionInProgress = false;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService protected override readonly openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ICortexService private readonly cortexService: ICortexService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._rootEl = dom.append(container, dom.$('.sandtable-models-root'));

		// ─── Disconnected State ──────────────────────────────────────────
		this._disconnectedEl = dom.append(this._rootEl, dom.$('.sandtable-models-disconnected'));
		const disconnectedIcon = dom.append(this._disconnectedEl, dom.$('.sandtable-models-disconnected-icon'));
		disconnectedIcon.textContent = '\u26A0'; // ⚠
		const disconnectedTitle = dom.append(this._disconnectedEl, dom.$('.sandtable-models-disconnected-title'));
		disconnectedTitle.textContent = 'Cortex Disconnected';
		const disconnectedMsg = dom.append(this._disconnectedEl, dom.$('.sandtable-models-disconnected-message'));
		disconnectedMsg.textContent = 'The Model Manager requires an active connection to Cortex. Check your connection settings and ensure Cortex is running.';

		// ─── Connected Content ───────────────────────────────────────────
		this._contentEl = dom.append(this._rootEl, dom.$('div'));

		// System Summary
		this._systemSummary = this._register(new SandtableSystemSummary(this._contentEl));

		// GPU Dashboard
		this._gpuDashboard = this._register(new SandtableGpuDashboard(this._contentEl));

		// Models List
		this._modelsList = this._register(new SandtableModelsList(this._contentEl));

		// Model Logs
		this._modelLogs = this._register(new SandtableModelLogs(this._contentEl, this.cortexService, this.logService));

		// ─── Event Wiring ────────────────────────────────────────────────

		// Handle model actions (start/stop)
		this._register(this._modelsList.onDidRequestAction(async (action) => {
			await this._handleModelAction(action.modelId, action.modelName, action.action);
		}));

		// Handle model selection for log viewer
		this._register(this._modelsList.onDidSelectModel((selection) => {
			this._modelLogs.selectModel(selection.modelId, selection.modelName);
		}));

		// Handle connection status changes
		this._register(this.cortexService.onConnectionStatusChanged((status: CortexConnectionStatus) => {
			this._updateConnectionState(status);
		}));

		// Handle visibility changes for polling
		this._register(this.onDidChangeBodyVisibility((visible: boolean) => {
			this._onBodyVisibilityChanged(visible);
		}));

		// Set initial state
		this._updateConnectionState(this.cortexService.getConnectionStatus());
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	// ─── Visibility Awareness ─────────────────────────────────────────────

	private _onBodyVisibilityChanged(visible: boolean): void {
		if (visible) {
			this._modelLogs.setVisible(true);
			if (this._isConnected) {
				this._refreshData();
				this._startPolling();
			}
		} else {
			this._modelLogs.setVisible(false);
			this._stopPolling();
		}
	}

	// ─── Connection State ─────────────────────────────────────────────────

	private _updateConnectionState(status: CortexConnectionStatus): void {
		this._isConnected = status === 'connected';

		if (this._isConnected) {
			this._disconnectedEl.style.display = 'none';
			this._contentEl.style.display = '';
			if (this.isBodyVisible()) {
				this._refreshData();
				this._startPolling();
			}
		} else {
			this._disconnectedEl.style.display = '';
			this._contentEl.style.display = 'none';
			this._stopPolling();
			this._systemSummary.showEmpty();
			this._gpuDashboard.showEmpty();
			this._modelsList.showEmpty();
			this._modelLogs.clearSelection();
		}
	}

	// ─── Data Fetching ────────────────────────────────────────────────────

	/**
	 * Refresh all data. Tries the combined IDE status endpoint first,
	 * falls back to individual admin endpoints.
	 */
	private async _refreshData(): Promise<void> {
		if (!this._isConnected || !this.isBodyVisible()) {
			return;
		}

		try {
			// Try combined IDE status endpoint first
			const ideStatus = await this.cortexService.getIDEStatus();

			// Update system summary from combined response
			const systemSummary: ICortexSystemSummary = {
				cpu_pct: ideStatus.system.cpu_pct,
				ram_pct: ideStatus.system.ram_pct,
				disk_pct: ideStatus.system.disk_pct,
				ram_total_mb: 0,
				ram_used_mb: 0,
				disk_total_gb: 0,
				disk_used_gb: 0,
			};
			this._systemSummary.update(systemSummary);

			// Update GPU dashboard
			this._gpuDashboard.update(ideStatus.gpus);

			// Fetch full model details (the IDE status only has running models)
			await this._refreshModels();

		} catch {
			// Combined endpoint not available, fall back to individual calls
			this.logService.debug('[SandtableModelsPanel] IDE status endpoint unavailable, falling back to individual endpoints');
			await this._refreshIndividualEndpoints();
		}
	}

	/**
	 * Fallback: fetch from individual admin endpoints.
	 */
	private async _refreshIndividualEndpoints(): Promise<void> {
		// Fetch system summary
		try {
			const summary = await this.cortexService.getSystemSummary();
			this._systemSummary.update(summary);
		} catch (err) {
			this.logService.debug('[SandtableModelsPanel] Failed to fetch system summary:', err);
			this._systemSummary.showEmpty();
		}

		// Fetch GPU metrics
		try {
			const gpus: ICortexGPUMetric[] = await this.cortexService.getGPUMetrics();
			this._gpuDashboard.update(gpus);
		} catch (err) {
			this.logService.debug('[SandtableModelsPanel] Failed to fetch GPU metrics:', err);
			this._gpuDashboard.showEmpty();
		}

		// Fetch models
		await this._refreshModels();
	}

	/**
	 * Refresh just the model list.
	 */
	private async _refreshModels(): Promise<void> {
		try {
			const models: ICortexModelDetail[] = await this.cortexService.listAllModels();
			this._modelsList.update(models);
		} catch (err) {
			this.logService.debug('[SandtableModelsPanel] Failed to fetch models:', err);
			this._modelsList.showEmpty();
		}
	}

	// ─── Polling ──────────────────────────────────────────────────────────

	private _startPolling(): void {
		this._stopPolling();
		const intervalMs = this.configurationService.getValue<number>(ModelsConfigKeys.GpuPollIntervalMs) || 5000;
		this._pollTimer = setInterval(() => {
			if (this._isConnected && this.isBodyVisible() && !this._isActionInProgress) {
				this._refreshData();
			}
		}, intervalMs);
	}

	private _stopPolling(): void {
		if (this._pollTimer !== undefined) {
			clearInterval(this._pollTimer);
			this._pollTimer = undefined;
		}
	}

	// ─── Model Actions ────────────────────────────────────────────────────

	private async _handleModelAction(modelId: number, modelName: string, action: 'start' | 'stop'): Promise<void> {
		if (this._isActionInProgress) {
			return;
		}

		this._isActionInProgress = true;

		try {
			if (action === 'start') {
				await this._startModelWithDryRun(modelId, modelName);
			} else {
				await this.cortexService.stopModel(modelId);
				this.logService.info(`[SandtableModelsPanel] Stopped model: ${modelName}`);
			}

			// Refresh after action
			await this._refreshModels();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.logService.error(`[SandtableModelsPanel] Failed to ${action} model ${modelName}:`, err);
			await this.dialogService.error(
				`Failed to ${action} ${modelName}`,
				errorMsg,
			);
		} finally {
			this._isActionInProgress = false;
		}
	}

	/**
	 * Dry-run before starting a model. If warnings exist, show confirmation dialog.
	 */
	private async _startModelWithDryRun(modelId: number, modelName: string): Promise<void> {
		try {
			const dryRun = await this.cortexService.dryRunModel(modelId);

			// Check for errors first
			if (dryRun.errors && dryRun.errors.length > 0) {
				await this.dialogService.error(
					`Cannot start ${modelName}`,
					`Errors:\n${dryRun.errors.map(e => `\u2022 ${e}`).join('\n')}`,
				);
				return;
			}

			// Check for warnings
			if (dryRun.warnings && dryRun.warnings.length > 0) {
				const warningsText = dryRun.warnings.map(w => `\u2022 ${w}`).join('\n');
				const vramInfo = dryRun.estimated_vram_mb > 0
					? `\n\nEstimated VRAM: ${(dryRun.estimated_vram_mb / 1024).toFixed(1)} GB\nAvailable VRAM: ${(dryRun.available_vram_mb / 1024).toFixed(1)} GB`
					: '';

				const result = await this.dialogService.confirm({
					message: `Starting ${modelName}`,
					detail: `Warnings:\n${warningsText}${vramInfo}`,
					primaryButton: 'Start Anyway',
				});

				if (!result.confirmed) {
					return;
				}
			}
		} catch (dryRunErr) {
			// Dry-run endpoint might not exist -- log and proceed with start
			this.logService.debug('[SandtableModelsPanel] Dry-run failed, proceeding with start:', dryRunErr);
		}

		// Proceed with start
		await this.cortexService.startModel(modelId);
		this.logService.info(`[SandtableModelsPanel] Started model: ${modelName}`);
	}

	// ─── Public Refresh (for command) ─────────────────────────────────────

	/**
	 * Manual refresh triggered by the refresh command.
	 */
	async refresh(): Promise<void> {
		await this._refreshData();
	}

	// ─── Dispose ──────────────────────────────────────────────────────────

	override dispose(): void {
		this._stopPolling();
		super.dispose();
	}
}
