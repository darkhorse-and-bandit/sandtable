/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { SandtableStatusBarItem } from './sandtableStatusBarItem.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICortexService } from '../../../../platform/cortex/common/cortex.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import * as nls from '../../../../nls.js';

// Register the status bar contribution
registerWorkbenchContribution2(
	SandtableStatusBarItem.ID,
	SandtableStatusBarItem,
	WorkbenchPhase.AfterRestored
);

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Command to show running models in a quick pick.
 * Triggered when clicking the status bar item while connected.
 */
registerAction2(class ShowRunningModelsAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.showRunningModels',
			title: nls.localize2('sandtable.showRunningModels', "Sandtable: Show Running Models"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const cortexService = accessor.get(ICortexService);
		const quickInputService = accessor.get(IQuickInputService);

		try {
			const models = await cortexService.listRunningModels();

			if (models.length === 0) {
				quickInputService.pick(
					[{ label: nls.localize('sandtable.noModels', "No models currently running") }],
					{ placeHolder: nls.localize('sandtable.runningModels', "Running Models") }
				);
				return;
			}

			const items = models.map(model => ({
				label: model.served_model_name,
				description: `${model.engine_type} · ${model.task}`,
				detail: `State: ${model.state}`,
			}));

			quickInputService.pick(items, {
				placeHolder: nls.localize('sandtable.runningModels', "Running Models"),
			});
		} catch {
			quickInputService.pick(
				[{ label: nls.localize('sandtable.modelsError', "Failed to fetch models from Cortex") }],
				{ placeHolder: nls.localize('sandtable.runningModels', "Running Models") }
			);
		}
	}
});
