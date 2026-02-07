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
import { SandtableChatViewPane } from './sandtableChatViewPane.js';

// ─── View Container ───────────────────────────────────────────────────────────

const SANDTABLE_CHAT_VIEW_ID = 'sandtable.chatView';
const SANDTABLE_CHAT_CONTAINER_ID = 'workbench.view.sandtableChat';

const sandtableChatViewIcon = registerIcon(
	'sandtable-chat-view-icon',
	Codicon.commentDiscussion,
	nls.localize('sandtableChatViewIcon', "View icon for the Sandtable Chat panel.")
);

const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: SANDTABLE_CHAT_CONTAINER_ID,
	title: nls.localize2('sandtableChatTitle', "Sandtable Chat"),
	icon: sandtableChatViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SANDTABLE_CHAT_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'sandtable.chat.views.state',
	order: 100,
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

// ─── View Registration ────────────────────────────────────────────────────────

const viewDescriptor: IViewDescriptor = {
	id: SANDTABLE_CHAT_VIEW_ID,
	name: nls.localize2('sandtableChatView', "Chat"),
	containerIcon: sandtableChatViewIcon,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(SandtableChatViewPane),
	order: 0,
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);
