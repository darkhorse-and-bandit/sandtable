/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { SandtableModelsPanel } from './sandtableModelsPanel.js';

// ─── View Container ───────────────────────────────────────────────────────────

const SANDTABLE_MODELS_VIEW_ID = 'sandtable.modelsView';
const SANDTABLE_MODELS_CONTAINER_ID = 'workbench.view.sandtableModels';

const sandtableModelsViewIcon = registerIcon(
	'sandtable-models-view-icon',
	Codicon.server,
	nls.localize('sandtableModelsViewIcon', "View icon for the Sandtable Model Manager panel.")
);

const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: SANDTABLE_MODELS_CONTAINER_ID,
	title: nls.localize2('sandtableModelsTitle', "Sandtable Models"),
	icon: sandtableModelsViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SANDTABLE_MODELS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'sandtable.models.views.state',
	order: 101,
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

// ─── View Registration ────────────────────────────────────────────────────────

const viewDescriptor: IViewDescriptor = {
	id: SANDTABLE_MODELS_VIEW_ID,
	name: nls.localize2('sandtableModelsView', "Model Manager"),
	containerIcon: sandtableModelsViewIcon,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(SandtableModelsPanel),
	order: 0,
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Command to refresh the Model Manager panel data.
 */
registerAction2(class RefreshModelsAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.models.refresh',
			title: nls.localize2('sandtable.models.refresh', "Sandtable: Refresh Model Manager"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getActiveViewWithId(SANDTABLE_MODELS_VIEW_ID);
		if (view instanceof SandtableModelsPanel) {
			await view.refresh();
		}
	}
});

/**
 * Command to focus the Model Manager panel.
 */
registerAction2(class FocusModelsAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.models.focus',
			title: nls.localize2('sandtable.models.focus', "Sandtable: Focus Model Manager"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView(SANDTABLE_MODELS_VIEW_ID, true);
	}
});
