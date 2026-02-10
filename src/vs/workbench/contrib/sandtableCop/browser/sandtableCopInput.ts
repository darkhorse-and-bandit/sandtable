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

export const sandtableCopInputTypeId = 'sandtable.copEditor';

/**
 * Singleton EditorInput for the COP (Common Operating Picture) map panel.
 * Uses a virtual URI with the 'sandtable-cop' scheme -- there is no backing file.
 * Only one COP tab can exist at a time (matches() returns true for any other instance).
 * The tab is pinned by default since maps are long-lived workspace artifacts.
 */
export class SandtableCopInput extends EditorInput {

	static readonly ID = sandtableCopInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: 'sandtable-cop', authority: 'map' });

	override get typeId(): string {
		return SandtableCopInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: SandtableCopInput.RESOURCE,
			options: {
				override: SandtableCopInput.ID,
				pinned: true,
			}
		};
	}

	get resource(): URI | undefined {
		return SandtableCopInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof SandtableCopInput;
	}

	override getName(): string {
		return localize('sandtableCop', "Common Operating Picture");
	}

	override getIcon(): ThemeIcon | undefined {
		return Codicon.globe;
	}

	constructor() {
		super();
	}
}
