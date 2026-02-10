/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICopUnit } from '../../../../platform/cortex/common/copTypes.js';
import { loadUmdModule } from './sandtableCopMapRenderer.js';

// ─── SandtableCopSymbology ────────────────────────────────────────────────────

/**
 * Wrapper around the milsymbol library for generating MIL-STD-2525 military
 * unit symbols as MapLibre-compatible images.
 *
 * Pipeline: SIDC -> milsymbol SVG -> data URI -> HTMLImageElement -> map.addImage()
 *
 * milsymbol is loaded via loadUmdModule() (same pattern as maplibre-gl).
 */
export class SandtableCopSymbology extends Disposable {

	/** The loaded milsymbol module */
	private _ms: any;

	/** Cache of generated symbol images: cacheKey -> HTMLImageElement */
	private readonly _imageCache = new Map<string, HTMLImageElement>();

	/** Default symbol size in pixels */
	private _defaultSize = 35;

	constructor(
		private readonly logService: ILogService,
	) {
		super();
	}

	/**
	 * Load the milsymbol npm package. Must be called before any symbol generation.
	 * Uses loadUmdModule() to handle Electron's UMD loading quirks.
	 */
	async initialize(): Promise<void> {
		try {
			this._ms = await loadUmdModule<any>('milsymbol', 'dist/milsymbol.js');
			if (!this._ms) {
				// milsymbol may have landed on globalThis as an IIFE fallback
				this._ms = (globalThis as any).ms || (globalThis as any).milsymbol;
			}
			this.logService.info(`[Sandtable COP Symbology] milsymbol loaded (Symbol available: ${!!(this._ms?.Symbol)}).`);
		} catch (err) {
			this.logService.error('[Sandtable COP Symbology] Failed to load milsymbol:', err);
		}
	}

	/**
	 * Whether milsymbol has been successfully loaded.
	 */
	get isReady(): boolean {
		return !!this._ms?.Symbol;
	}

	/**
	 * Set the default symbol size in pixels.
	 */
	setDefaultSize(size: number): void {
		this._defaultSize = size;
	}

	/**
	 * Generate a MapLibre-compatible image from a SIDC code and register it
	 * with the map. Returns the cache key used as the `icon-image` property
	 * value in the symbol layer.
	 *
	 * @param map - MapLibre Map instance
	 * @param sidc - 20-digit MIL-STD-2525D Symbol Identification Code
	 * @param options - Optional symbol rendering options
	 * @returns The image ID (cacheKey) to use in `icon-image`, or empty string on failure
	 */
	async generateSymbolImage(
		map: any,
		sidc: string,
		options: {
			size?: number;
			uniqueDesignation?: string;
			higherFormation?: string;
		} = {},
	): Promise<string> {
		if (!this._ms?.Symbol) {
			this.logService.warn('[Sandtable COP Symbology] milsymbol not loaded, cannot generate symbol.');
			return '';
		}

		const size = options.size ?? this._defaultSize;
		const cacheKey = this._buildCacheKey(sidc, size, options.uniqueDesignation);

		// If we already have this image cached AND it's registered with the map, return it
		if (this._imageCache.has(cacheKey) && map.hasImage(cacheKey)) {
			return cacheKey;
		}

		try {
			// Generate SVG via milsymbol
			const symbolOptions: Record<string, any> = { size };
			if (options.uniqueDesignation) {
				symbolOptions.uniqueDesignation = options.uniqueDesignation;
			}
			if (options.higherFormation) {
				symbolOptions.higherFormation = options.higherFormation;
			}

			const symbol = new this._ms.Symbol(sidc, symbolOptions);
			const svgString: string = symbol.asSVG();

			// Convert SVG to data URI
			const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

			// Convert data URI to HTMLImageElement
			const img = await this._loadImage(svgDataUri);

			// Register with MapLibre
			if (!map.hasImage(cacheKey)) {
				map.addImage(cacheKey, img);
			}

			// Cache the image element
			this._imageCache.set(cacheKey, img);

			return cacheKey;
		} catch (err) {
			this.logService.error(`[Sandtable COP Symbology] Failed to generate symbol for SIDC ${sidc}:`, err);
			return '';
		}
	}

	/**
	 * Generate an SVG string from a SIDC for preview purposes (e.g., in dialogs).
	 * Does not register with MapLibre -- returns raw SVG markup.
	 */
	generateSvgPreview(sidc: string, size?: number): string {
		if (!this._ms?.Symbol) {
			return '';
		}
		try {
			const symbol = new this._ms.Symbol(sidc, { size: size ?? this._defaultSize });
			return symbol.asSVG();
		} catch {
			return '';
		}
	}

	/**
	 * Re-register all cached symbol images with a new/reset map.
	 * Called after a style switch (map.setStyle()) which destroys all images.
	 *
	 * @param map - The MapLibre Map instance
	 * @param units - Current units to ensure their symbols are registered
	 */
	async reloadAllSymbols(map: any, units: ICopUnit[]): Promise<void> {
		if (!this._ms?.Symbol) {
			return;
		}

		this.logService.info(`[Sandtable COP Symbology] Reloading ${units.length} unit symbols after style switch.`);

		// Re-register images from cache first (fast path)
		for (const [key, img] of this._imageCache) {
			if (!map.hasImage(key)) {
				try {
					map.addImage(key, img);
				} catch {
					// Image may have been invalidated -- regenerate below
				}
			}
		}

		// Ensure all units have their symbols registered
		for (const unit of units) {
			await this.generateSymbolImage(map, unit.properties.sidc, {
				uniqueDesignation: unit.properties.designation,
				higherFormation: unit.properties.higherFormation,
			});
		}
	}

	/**
	 * Clear the entire symbol cache. Used when the symbology standard changes.
	 */
	clearCache(): void {
		this._imageCache.clear();
	}

	// ─── Private Helpers ──────────────────────────────────────────────────

	private _buildCacheKey(sidc: string, size: number, designation?: string): string {
		return `sym-${sidc}-${size}-${designation ?? ''}`;
	}

	private _loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = (e) => reject(e);
			img.src = src;
		});
	}
}
