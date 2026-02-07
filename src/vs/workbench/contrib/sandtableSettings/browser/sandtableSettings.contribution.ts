/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { SandtableSettingsInput } from './sandtableSettingsInput.js';
import { SandtableSettingsPage, SandtableSettingsInputSerializer } from './sandtableSettingsPage.js';

// ─── Register EditorPane + Input ──────────────────────────────────────────────

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		SandtableSettingsPage,
		SandtableSettingsPage.ID,
		localize('sandtableSettingsEditor', "Sandtable Settings")
	),
	[
		new SyncDescriptor(SandtableSettingsInput)
	]
);

// ─── Register Serializer (tab persistence across restarts) ────────────────────

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	SandtableSettingsInput.ID,
	SandtableSettingsInputSerializer
);

// ─── Editor Resolver (maps sandtable:// URIs to our EditorInput) ──────────────

/**
 * Registers an editor resolver so that when VS Code encounters a `sandtable://`
 * URI, it creates a SandtableSettingsInput instead of trying to open it as text.
 * This is the same pattern used by the Welcome/Getting Started page.
 */
class SandtableSettingsEditorResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableSettingsEditorResolver';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${SandtableSettingsInput.RESOURCE.scheme}:/**`,
			{
				id: SandtableSettingsInput.ID,
				label: localize('sandtableSettings.displayName', "Sandtable Settings"),
				priority: RegisteredEditorPriority.builtin,
			},
			{
				singlePerResource: true,
				canSupportResource: uri => uri.scheme === SandtableSettingsInput.RESOURCE.scheme,
			},
			{
				createEditorInput: ({ options }) => {
					return {
						editor: this.instantiationService.createInstance(SandtableSettingsInput),
						options: {
							...options,
							pinned: false,
						}
					};
				}
			}
		));
	}
}

registerWorkbenchContribution2(
	SandtableSettingsEditorResolverContribution.ID,
	SandtableSettingsEditorResolverContribution,
	WorkbenchPhase.BlockRestore
);

// ─── Register Command + Menu Entry ────────────────────────────────────────────

registerAction2(class OpenSandtableSettingsAction extends Action2 {
	constructor() {
		super({
			id: 'sandtable.openSettings',
			title: {
				...localize2('sandtableSettingsTitle', "Sandtable Settings"),
				mnemonicTitle: localize({ key: 'miSandtableSettings', comment: ['&& denotes a mnemonic'] }, "S&&andtable Settings"),
			},
			f1: true,
			menu: [{
				id: MenuId.MenubarPreferencesMenu,
				group: '1_sandtable',
				order: 1,
			}],
		});
	}

	run(accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		editorService.openEditor({
			resource: SandtableSettingsInput.RESOURCE,
			options: {
				override: SandtableSettingsInput.ID,
				pinned: false,
			}
		});
	}
});
