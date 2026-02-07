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

		switch (status) {
			case 'connected': {
				const modelCount = (this.cortexService as any).getModelCount?.() ?? 0;
				const modelsText = modelCount === 1
					? nls.localize('sandtable.status.oneModel', "1 model")
					: nls.localize('sandtable.status.nModels', "{0} models", modelCount);
				const tooltip = nls.localize('sandtable.status.connectedTooltip', "Cortex is connected with {0}. Click to view models.", modelsText);
				return {
					name: nls.localize('sandtable.status.name', "Sandtable Cortex"),
					text: `$(check) Cortex: ${nls.localize('sandtable.status.connected', "Connected")} (${modelsText})`,
					ariaLabel: tooltip,
					tooltip,
					command: 'sandtable.showRunningModels',
				};
			}

			case 'disconnected': {
				const tooltip = nls.localize('sandtable.status.disconnectedTooltip', "Cortex is disconnected. Click to open connection settings.");
				return {
					name: nls.localize('sandtable.status.name', "Sandtable Cortex"),
					text: `$(error) Cortex: ${nls.localize('sandtable.status.disconnected', "Disconnected")}`,
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
