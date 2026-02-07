/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

export const sandtableSettingsInputTypeId = 'sandtable.settingsEditor';

/**
 * Singleton EditorInput for the Sandtable Settings page.
 * Uses a virtual URI with the 'sandtable' scheme -- there is no backing file.
 * Only one instance of this tab can exist at a time (matches() returns true for any other instance).
 */
export class SandtableSettingsInput extends EditorInput {

	static readonly ID = sandtableSettingsInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: 'sandtable', authority: 'settings' });

	override get typeId(): string {
		return SandtableSettingsInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: SandtableSettingsInput.RESOURCE,
			options: {
				override: SandtableSettingsInput.ID,
				pinned: false,
			}
		};
	}

	get resource(): URI | undefined {
		return SandtableSettingsInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof SandtableSettingsInput;
	}

	override getName(): string {
		return localize('sandtableSettings', "Sandtable Settings");
	}

	override getIcon(): ThemeIcon | undefined {
		return Codicon.settingsGear;
	}

	constructor() {
		super();
	}
}
