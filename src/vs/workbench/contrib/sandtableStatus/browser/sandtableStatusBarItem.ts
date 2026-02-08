/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { ICortexService } from '../../../../platform/cortex/common/cortex.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment, IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

/**
 * Status bar item that displays the current Cortex connection status.
 *
 * States:
 *  - Connected:    "$(check) Cortex: Connected (N models)"   -- click opens model picker
 *  - Disconnected: "$(error) Cortex: Disconnected"            -- click opens settings
 *  - Connecting:   "$(sync~spin) Cortex: Connecting..."       -- no click action
 */
export class SandtableStatusBarItem extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableStatus';

	private readonly _statusBarItem: IStatusbarEntryAccessor;

	constructor(
		@ICortexService private readonly cortexService: ICortexService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		// Create the initial status bar entry
		this._statusBarItem = this._register(
			this.statusbarService.addEntry(
				this._getEntry(),
				SandtableStatusBarItem.ID,
				StatusbarAlignment.LEFT,
				100
			)
		);

		// Update when connection status changes
		this._register(this.cortexService.onConnectionStatusChanged(() => {
			this._statusBarItem.update(this._getEntry());
		}));
	}

	private _getEntry(): IStatusbarEntry {
		const status = this.cortexService.getConnectionStatus();
		const providers = this.cortexService.listProviders();
		const totalProviders = providers.length;
		const healthyProviders = providers.filter(p => p.healthy).length;
		const modelCount = this.cortexService.getModelCount();

		switch (status) {
			case 'connected': {
				const modelsText = modelCount === 1
					? nls.localize('sandtable.status.oneModel', "1 model")
					: nls.localize('sandtable.status.nModels', "{0} models", modelCount);

				// Show provider info if more than one provider
				let displayText: string;
				let tooltip: string;
				if (totalProviders > 1) {
					if (healthyProviders === totalProviders) {
						displayText = `$(check) ${nls.localize('sandtable.status.providersModels', "{0} providers, {1}", totalProviders, modelsText)}`;
						tooltip = nls.localize('sandtable.status.allProvidersTooltip', "All {0} providers connected with {1}. Click to view models.", totalProviders, modelsText);
					} else {
						displayText = `$(warning) ${nls.localize('sandtable.status.partialProviders', "{0}/{1} providers, {2}", healthyProviders, totalProviders, modelsText)}`;
						tooltip = nls.localize('sandtable.status.partialProvidersTooltip', "{0} of {1} providers connected with {2}. Click to view models.", healthyProviders, totalProviders, modelsText);
					}
				} else {
					displayText = `$(check) Cortex: ${nls.localize('sandtable.status.connected', "Connected")} (${modelsText})`;
					tooltip = nls.localize('sandtable.status.connectedTooltip', "Cortex is connected with {0}. Click to view models.", modelsText);
				}

				return {
					name: nls.localize('sandtable.status.name', "Sandtable Cortex"),
					text: displayText,
					ariaLabel: tooltip,
					tooltip,
					command: 'sandtable.showRunningModels',
				};
			}

			case 'disconnected': {
				let displayText: string;
				let tooltip: string;
				if (totalProviders > 1) {
					displayText = `$(error) ${nls.localize('sandtable.status.noProvidersConnected', "No providers connected")}`;
					tooltip = nls.localize('sandtable.status.noProvidersTooltip', "All {0} providers are disconnected. Click to open connection settings.", totalProviders);
				} else {
					displayText = `$(error) Cortex: ${nls.localize('sandtable.status.disconnected', "Disconnected")}`;
					tooltip = nls.localize('sandtable.status.disconnectedTooltip', "Cortex is disconnected. Click to open connection settings.");
				}
				return {
					name: nls.localize('sandtable.status.name', "Sandtable Cortex"),
					text: displayText,
					ariaLabel: tooltip,
					tooltip,
					command: {
						id: 'workbench.action.openSettings',
						title: nls.localize('sandtable.status.openSettings', "Open Cortex Settings"),
						arguments: ['sandtable.cortex'],
					},
					kind: 'warning',
				};
			}

			case 'connecting':
			default: {
				const tooltip = nls.localize('sandtable.status.connectingTooltip', "Connecting to Cortex...");
				return {
					name: nls.localize('sandtable.status.name', "Sandtable Cortex"),
					text: `$(sync~spin) Cortex: ${nls.localize('sandtable.status.connecting', "Connecting...")}`,
					ariaLabel: tooltip,
					tooltip,
				};
			}
		}
	}
}
