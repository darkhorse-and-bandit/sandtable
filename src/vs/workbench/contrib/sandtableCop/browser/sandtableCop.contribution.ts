/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Trigger COP settings registration
import '../../../../platform/cortex/common/copConfiguration.js';

import * as nls from '../../../../nls.js';
import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { SandtableCopInput } from './sandtableCopInput.js';
import { SandtableCopPage, SandtableCopInputSerializer } from './sandtableCopPage.js';
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
import { SandtableCopOrbatTreeViewPane } from './sandtableCopOrbatTree.js';
import { SandtableCopOrbatIO } from './sandtableCopOrbatIO.js';
import { ISandtableCopService } from '../../../../platform/cortex/common/copTypes.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SANDTABLE_COP_VIEW_ID = 'sandtable.copView';
const SANDTABLE_COP_CONTAINER_ID = 'workbench.view.sandtableCop';

// ─── Activity Bar Icon Registration ───────────────────────────────────────────

const sandtableCopViewIcon = registerIcon(
	'sandtable-cop-view-icon',
	Codicon.globe,
	nls.localize('sandtableCopViewIcon', "View icon for the Sandtable Common Operating Picture panel.")
);

const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: SANDTABLE_COP_CONTAINER_ID,
	title: nls.localize2('sandtableCopContainerTitle', "Common Operating Picture"),
	icon: sandtableCopViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SANDTABLE_COP_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'sandtable.cop.views.state',
	order: 1,
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

// ─── COP Sidebar View (ORBAT Tree) ───────────────────────────────────────────

const viewDescriptor: IViewDescriptor = {
	id: SANDTABLE_COP_VIEW_ID,
	name: nls.localize2('sandtableCopView', "Order of Battle"),
	containerIcon: sandtableCopViewIcon,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(SandtableCopOrbatTreeViewPane),
	order: 0,
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([viewDescriptor], VIEW_CONTAINER);

// ─── Welcome Content (shown when ORBAT is empty) ─────────────────────────────

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViewWelcomeContent(SANDTABLE_COP_VIEW_ID, {
	content: localize(
		{ key: 'copOrbatWelcome', comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
		"Interactive map with military symbology, offline tiles, and spatial analysis tools.\n{0}\nRight-click the map to place units. Units will appear in this Order of Battle tree.",
		'[' + localize('openMap', "Open Map") + '](command:sandtable.cop.openMap)'
	),
	order: 1,
});

// ─── Register EditorPane + Input ──────────────────────────────────────────────

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		SandtableCopPage,
		SandtableCopPage.ID,
		localize('sandtableCopEditor', "Common Operating Picture")
	),
	[
		new SyncDescriptor(SandtableCopInput)
	]
);

// ─── Register Serializer (tab persistence across restarts) ────────────────────

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	SandtableCopInput.ID,
	SandtableCopInputSerializer
);

// ─── Editor Resolver (maps sandtable-cop:// URIs to our EditorInput) ──────────

/**
 * Registers an editor resolver so that when VS Code encounters a `sandtable-cop://`
 * URI, it creates a SandtableCopInput instead of trying to open it as text.
 */
class SandtableCopEditorResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableCopEditorResolver';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${SandtableCopInput.RESOURCE.scheme}:/**`,
			{
				id: SandtableCopInput.ID,
				label: localize('sandtableCop.displayName', "Common Operating Picture"),
				priority: RegisteredEditorPriority.builtin,
			},
			{
				singlePerResource: true,
				canSupportResource: uri => uri.scheme === SandtableCopInput.RESOURCE.scheme,
			},
			{
				createEditorInput: ({ options }) => {
					return {
						editor: this.instantiationService.createInstance(SandtableCopInput),
						options: {
							...options,
							pinned: true,
						}
					};
				}
			}
		));
	}
}

registerWorkbenchContribution2(
	SandtableCopEditorResolverContribution.ID,
	SandtableCopEditorResolverContribution,
	WorkbenchPhase.BlockRestore
);

// ─── Register Command + Menu Entry ────────────────────────────────────────────

registerAction2(class OpenSandtableCopAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.cop.openMap',
			title: {
				...localize2('sandtableCopTitle', "Open Common Operating Picture"),
				mnemonicTitle: localize({ key: 'miSandtableCop', comment: ['&& denotes a mnemonic'] }, "Common &&Operating Picture"),
			},
			f1: true,
			menu: [{
				id: MenuId.MenubarPreferencesMenu,
				group: '1_sandtable',
				order: 2,
			}],
		});
	}

	run(accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		editorService.openEditor({
			resource: SandtableCopInput.RESOURCE,
			options: {
				override: SandtableCopInput.ID,
				pinned: true,
			}
		});
	}
});

// ─── ORBAT Export Command ─────────────────────────────────────────────────────

registerAction2(class ExportOrbatAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.cop.exportOrbat',
			title: localize2('sandtableCopExportOrbat', "Export ORBAT"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const copService = accessor.get(ISandtableCopService);
		const fileService = accessor.get(IFileService);
		const fileDialogService = accessor.get(IFileDialogService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const configurationService = accessor.get(IConfigurationService);
		const logService = accessor.get(ILogService);

		const io = new SandtableCopOrbatIO(copService, fileService, fileDialogService, workspaceService, configurationService, logService);
		await io.exportOrbat();
		io.dispose();
	}
});

// ─── ORBAT Import Command ─────────────────────────────────────────────────────

registerAction2(class ImportOrbatAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.cop.importOrbat',
			title: localize2('sandtableCopImportOrbat', "Import ORBAT"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const copService = accessor.get(ISandtableCopService);
		const fileService = accessor.get(IFileService);
		const fileDialogService = accessor.get(IFileDialogService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const configurationService = accessor.get(IConfigurationService);
		const logService = accessor.get(ILogService);

		const io = new SandtableCopOrbatIO(copService, fileService, fileDialogService, workspaceService, configurationService, logService);
		await io.importOrbat();
		io.dispose();
	}
});

// ─── ORBAT Auto-Save Contribution ────────────────────────────────────────────

/**
 * Registers the ORBAT auto-save handler that persists ORBAT changes to
 * workspace files when the sandtable.cop.autoSaveOrbat setting is enabled.
 */
class SandtableCopOrbatAutoSaveContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableCopOrbatAutoSave';

	constructor(
		@ISandtableCopService copService: ISandtableCopService,
		@IFileService fileService: IFileService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super();
		const io = this._register(new SandtableCopOrbatIO(copService, fileService, fileDialogService, workspaceService, configurationService, logService));

		// Load previously saved ORBAT from workspace on startup.
		// This restores units from .sandtable/cop/orbat.geojson and the
		// hierarchy from orbat-tree.json. The auto-save listener in
		// SandtableCopOrbatIO will then keep the files in sync going forward.
		io.loadFromWorkspace().catch(err => {
			logService.warn('[Sandtable COP IO] Failed to load ORBAT from workspace on startup:', err);
		});
	}
}

registerWorkbenchContribution2(
	SandtableCopOrbatAutoSaveContribution.ID,
	SandtableCopOrbatAutoSaveContribution,
	WorkbenchPhase.AfterRestored
);
