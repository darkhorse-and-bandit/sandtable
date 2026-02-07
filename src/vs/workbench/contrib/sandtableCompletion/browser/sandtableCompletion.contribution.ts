/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICortexService } from '../../../../platform/cortex/common/cortex.js';
import { SandtableInlineCompletionProvider } from './sandtableInlineCompletionProvider.js';

// ─── Workbench Contribution ───────────────────────────────────────────────────

/**
 * Workbench contribution that registers the Sandtable inline completion provider.
 *
 * This contribution:
 * 1. Creates the SandtableInlineCompletionProvider instance (injecting services)
 * 2. Registers it with the language features service for all file types
 * 3. Manages the provider lifecycle (disposal on shutdown)
 *
 * The provider is registered after the workbench is restored (AfterRestored phase)
 * to avoid interfering with initial editor load performance.
 */
class SandtableCompletionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableCompletion';

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ICortexService cortexService: ICortexService,
		@IConfigurationService configService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super();

		// Create the inline completion provider
		const provider = new SandtableInlineCompletionProvider(
			cortexService,
			configService,
			logService,
		);

		// Register for all file types (pattern '**' matches everything)
		this._register(
			languageFeaturesService.inlineCompletionsProvider.register(
				{ pattern: '**' },
				provider,
			)
		);

		logService.info('[Sandtable Completion] Contribution registered -- inline completions active for all file types');
	}
}

// ─── Registration ─────────────────────────────────────────────────────────────

registerWorkbenchContribution2(
	SandtableCompletionContribution.ID,
	SandtableCompletionContribution,
	WorkbenchPhase.AfterRestored,
);
