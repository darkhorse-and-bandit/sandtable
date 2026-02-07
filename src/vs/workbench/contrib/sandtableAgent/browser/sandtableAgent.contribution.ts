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
import { SandtableAgentPanel } from './sandtableAgentPanel.js';

// ─── View Container ───────────────────────────────────────────────────────────

const SANDTABLE_AGENT_VIEW_ID = 'sandtable.agentView';
const SANDTABLE_AGENT_CONTAINER_ID = 'workbench.view.sandtableAgent';

const sandtableAgentViewIcon = registerIcon(
	'sandtable-agent-view-icon',
	Codicon.sparkle,
	nls.localize('sandtableAgentViewIcon', "View icon for the Sandtable Agent panel.")
);

const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: SANDTABLE_AGENT_CONTAINER_ID,
	title: nls.localize2('sandtableAgentTitle', "Sandtable Agent"),
	icon: sandtableAgentViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SANDTABLE_AGENT_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'sandtable.agent.views.state',
	order: 102,
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

// ─── View Registration ────────────────────────────────────────────────────────

const viewDescriptor: IViewDescriptor = {
	id: SANDTABLE_AGENT_VIEW_ID,
	name: nls.localize2('sandtableAgentView', "Agent"),
	containerIcon: sandtableAgentViewIcon,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(SandtableAgentPanel),
	order: 0,
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Command to focus the Agent panel.
 */
registerAction2(class FocusAgentAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.agent.start',
			title: nls.localize2('sandtable.agent.start', "Sandtable: Open Agent"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView(SANDTABLE_AGENT_VIEW_ID, true);
	}
});

/**
 * Command to stop the running agent.
 */
registerAction2(class StopAgentAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.agent.stop',
			title: nls.localize2('sandtable.agent.stop', "Sandtable: Stop Agent"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getActiveViewWithId(SANDTABLE_AGENT_VIEW_ID);
		if (view instanceof SandtableAgentPanel) {
			view.stopAgent();
		}
	}
});
