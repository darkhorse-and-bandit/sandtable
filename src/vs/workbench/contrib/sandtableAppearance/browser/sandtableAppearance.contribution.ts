/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { AppearanceConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';

// ─── Bundled Background Image Definitions ─────────────────────────────────────

/**
 * Map of bundled background image names to their module-relative paths.
 * These ship with Sandtable and are referenced via the `bundled:` prefix in settings.
 */
export const BUNDLED_BACKGROUNDS: Record<string, string> = {
	'topo-lines': 'vs/workbench/contrib/sandtableAppearance/browser/media/backgrounds/topo-lines.svg',
	'grid-blueprint': 'vs/workbench/contrib/sandtableAppearance/browser/media/backgrounds/grid-blueprint.svg',
	'dark-gradient': 'vs/workbench/contrib/sandtableAppearance/browser/media/backgrounds/dark-gradient.svg',
	'sandtable-watermark': 'vs/workbench/contrib/sandtableAppearance/browser/media/backgrounds/sandtable-watermark.svg',
	'circuit-board': 'vs/workbench/contrib/sandtableAppearance/browser/media/backgrounds/circuit-board.svg',
};

/** List of bundled background names for use in UI selectors */
export const BUNDLED_BACKGROUND_NAMES = Object.keys(BUNDLED_BACKGROUNDS);

// ─── Workbench Contribution ───────────────────────────────────────────────────

/**
 * Workbench contribution that manages the editor background image feature.
 *
 * This contribution:
 * 1. Creates a dedicated <style> element in the document head
 * 2. Reads sandtable.appearance.* settings and builds CSS rules
 * 3. Uses ::before on .overflow-guard for the background image (z-index: -1)
 * 4. Overrides .monaco-editor and .monaco-editor-background to use semi-transparent
 *    background colors (the overlay), so the image shows through while text stays on top
 * 5. Watches for configuration and theme changes to update CSS rules live
 * 6. Resolves bundled image paths via FileAccess.asBrowserUri()
 * 7. Resolves user file paths via URI.file() + vscode-file:// protocol
 *
 * CSS layering (bottom to top):
 *   .overflow-guard background (transparent)
 *   ::before pseudo-element (the image, z-index: -1, with opacity)
 *   .monaco-editor-background (semi-transparent overlay color on .lines-content)
 *   text content (children of .lines-content -- always on top of parent bg)
 */
class SandtableAppearanceContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableAppearance';

	private readonly _styleElement: HTMLStyleElement;

	constructor(
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Create dedicated stylesheet for background image rules
		this._styleElement = createStyleSheet(undefined, undefined, this._store);

		// Initial render
		this._updateBackgroundCSS();

		// Watch for configuration changes
		this._register(this._configService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(AppearanceConfigKeys.BackgroundImage) ||
				e.affectsConfiguration(AppearanceConfigKeys.BackgroundOpacity) ||
				e.affectsConfiguration(AppearanceConfigKeys.BackgroundOverlayColor) ||
				e.affectsConfiguration(AppearanceConfigKeys.BackgroundBlur) ||
				e.affectsConfiguration(AppearanceConfigKeys.BackgroundSize) ||
				e.affectsConfiguration(AppearanceConfigKeys.BackgroundPosition) ||
				e.affectsConfiguration(AppearanceConfigKeys.BackgroundCoverage)
			) {
				this._updateBackgroundCSS();
			}
		}));

		// Watch for theme changes (auto-overlay depends on theme colors)
		this._register(this._themeService.onDidColorThemeChange(() => {
			this._updateBackgroundCSS();
		}));

		this._logService.info('[Sandtable Appearance] Contribution initialized');
	}

	// ─── CSS Generation ───────────────────────────────────────────────────

	/**
	 * Reads all appearance settings and rebuilds the stylesheet content.
	 * Called on initialization, config change, and theme change.
	 */
	private _updateBackgroundCSS(): void {
		const imagePath = this._configService.getValue<string>(AppearanceConfigKeys.BackgroundImage) || '';

		if (!imagePath) {
			// No background image -- clear all rules
			this._styleElement.textContent = '';
			return;
		}

		// Warn if GPU acceleration is on (background will be hidden behind the canvas)
		const gpuAccel = this._configService.getValue<string>('editor.experimentalGpuAcceleration');
		if (gpuAccel === 'on') {
			this._logService.warn('[Sandtable Appearance] GPU acceleration is enabled -- the editor background image may not be visible behind the GPU canvas. Consider setting editor.experimentalGpuAcceleration to "off".');
		}

		// Resolve image URI
		const imageUrl = this._resolveImageUrl(imagePath);
		if (!imageUrl) {
			this._styleElement.textContent = '';
			return;
		}

		// Read settings
		const opacity = this._configService.getValue<number>(AppearanceConfigKeys.BackgroundOpacity) ?? 0.08;
		const blur = this._configService.getValue<number>(AppearanceConfigKeys.BackgroundBlur) ?? 0;
		const size = this._configService.getValue<string>(AppearanceConfigKeys.BackgroundSize) || 'cover';
		const position = this._configService.getValue<string>(AppearanceConfigKeys.BackgroundPosition) || 'center';
		const coverage = this._configService.getValue<string>(AppearanceConfigKeys.BackgroundCoverage) || 'full';
		const overlayColor = this._resolveOverlayColor();

		// Build CSS rules
		//
		// The layering strategy:
		//
		// 1. .monaco-editor normally has an opaque background-color. We make it
		//    transparent so the ::before image can be seen through it.
		//
		// 2. .overflow-guard::before is the image layer at z-index: -1 within
		//    the isolate stacking context. It sits behind all child elements.
		//
		// 3. .monaco-editor-background (on .lines-content) normally has the
		//    opaque editor background. We replace it with a SEMI-TRANSPARENT
		//    version of the same color. This acts as the overlay: it lets the
		//    image peek through while providing contrast for text readability.
		//    Text is rendered by children of .lines-content, so it paints ON TOP
		//    of its parent's background -- always fully visible.
		//
		// 4. Coverage controls which additional areas become transparent:
		//    - content: only the code area (gutter keeps its opaque bg)
		//    - content-and-gutter: also makes the margin/gutter transparent
		//    - full: also makes the minimap semi-transparent
		//
		// We do NOT use ::after on .overflow-guard because pseudo-elements of a
		// parent paint over its children in the stacking order, which would cover
		// the text.

		const rules: string[] = [
			// Step 1: Make the .monaco-editor element transparent so the image
			// beneath .overflow-guard is not blocked by the editor's own bg.
			`.monaco-editor {`,
			`  background-color: transparent !important;`,
			`}`,
			'',
			// Step 2: The image layer -- ::before on .overflow-guard.
			// z-index: -1 within the isolate stacking context puts it behind
			// all real child elements (scrollbar, margin, lines, etc.)
			`.monaco-editor .overflow-guard::before {`,
			`  content: '';`,
			`  position: absolute;`,
			`  inset: 0;`,
			`  z-index: -1;`,
			`  pointer-events: none;`,
			`  background-image: ${imageUrl};`,
			`  background-size: ${this._sanitizeCssValue(size)};`,
			`  background-position: ${this._sanitizeCssValue(position)};`,
			`  background-repeat: no-repeat;`,
			`  opacity: ${Math.max(0, Math.min(1, opacity))};`,
			blur > 0 ? `  filter: blur(${Math.max(0, Math.min(20, blur))}px);` : '',
			`}`,
			'',
			// Step 3: Replace the opaque .monaco-editor-background with a
			// semi-transparent overlay color. This is on .lines-content, so text
			// (children of .lines-content) renders ON TOP of it naturally.
			`.monaco-editor-background {`,
			`  background-color: ${overlayColor} !important;`,
			`}`,
		];

		// Step 4: Coverage-dependent rules
		if (coverage === 'content-and-gutter' || coverage === 'full') {
			// Replace the gutter's opaque background with the same semi-transparent
			// overlay color used on .lines-content. This ensures the gutter area
			// shows the image through the overlay, matching the code content area.
			rules.push('');
			rules.push(`.monaco-editor .margin {`);
			rules.push(`  background-color: ${overlayColor} !important;`);
			rules.push(`}`);
		}

		if (coverage === 'full') {
			// Make the minimap container semi-transparent so image bleeds through.
			// The minimap renders on a <canvas>, so we reduce the container opacity
			// to let the background image show while keeping the minimap content
			// partially visible.
			rules.push('');
			rules.push(`.monaco-editor .minimap {`);
			rules.push(`  opacity: 0.6;`);
			rules.push(`}`);
			rules.push(`.monaco-editor .minimap:hover {`);
			rules.push(`  opacity: 0.85;`);
			rules.push(`}`);
		}

		const cssText = rules.filter(Boolean).join('\n');

		this._styleElement.textContent = cssText;

		this._logService.trace(`[Sandtable Appearance] Background CSS updated: image=${imagePath}, opacity=${opacity}, blur=${blur}, coverage=${coverage}`);
	}

	// ─── Image URL Resolution ─────────────────────────────────────────────

	/**
	 * Resolves an image path to a CSS url() value.
	 * Handles both bundled images (bundled:name) and user file paths.
	 */
	private _resolveImageUrl(imagePath: string): string {
		try {
			if (imagePath.startsWith('bundled:')) {
				// Bundled image
				const name = imagePath.slice('bundled:'.length);
				const resourcePath = BUNDLED_BACKGROUNDS[name];
				if (!resourcePath) {
					this._logService.warn(`[Sandtable Appearance] Unknown bundled background: ${name}. Available: ${BUNDLED_BACKGROUND_NAMES.join(', ')}`);
					return '';
				}
				const uri = FileAccess.asBrowserUri(resourcePath as `vs/${string}`);
				return `url('${CSS.escape(uri.toString(true))}')`;
			} else {
				// User file path
				const uri = URI.file(imagePath);
				const browserUri = FileAccess.uriToBrowserUri(uri);
				return `url('${CSS.escape(browserUri.toString(true))}')`;
			}
		} catch (err) {
			this._logService.warn(`[Sandtable Appearance] Failed to resolve image path: ${imagePath}`, err);
			return '';
		}
	}

	// ─── Overlay Color Resolution ─────────────────────────────────────────

	/**
	 * Resolves the overlay color. If the user set a custom color, use it directly.
	 * Otherwise, auto-derive from the current theme's editor background color.
	 */
	private _resolveOverlayColor(): string {
		const customColor = this._configService.getValue<string>(AppearanceConfigKeys.BackgroundOverlayColor) || '';

		if (customColor) {
			return this._sanitizeCssValue(customColor);
		}

		// Auto-derive from theme
		const theme = this._themeService.getColorTheme();
		const bgColor = theme.getColor(editorBackground);

		if (bgColor) {
			// Use the editor background color at high opacity
			// Dark themes: 85% opacity (let a bit of image peek through)
			// Light themes: 90% opacity (light backgrounds need more coverage for readability)
			const isDark = theme.type === ColorScheme.DARK || theme.type === ColorScheme.HIGH_CONTRAST_DARK;
			const overlayOpacity = isDark ? 0.85 : 0.90;
			return `rgba(${bgColor.rgba.r}, ${bgColor.rgba.g}, ${bgColor.rgba.b}, ${overlayOpacity})`;
		}

		// Ultimate fallback
		return 'rgba(30, 30, 30, 0.85)';
	}

	// ─── CSS Sanitization ─────────────────────────────────────────────────

	/**
	 * Basic sanitization for CSS values from user settings.
	 * Strips characters that could break out of CSS value context.
	 */
	private _sanitizeCssValue(value: string): string {
		// Remove characters that could inject CSS rules or close declarations
		return value.replace(/[{};<>]/g, '');
	}
}

// ─── Registration ─────────────────────────────────────────────────────────────

registerWorkbenchContribution2(
	SandtableAppearanceContribution.ID,
	SandtableAppearanceContribution,
	WorkbenchPhase.AfterRestored,
);
