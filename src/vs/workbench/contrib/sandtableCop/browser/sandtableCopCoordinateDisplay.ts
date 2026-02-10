/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CopCoordinateFormat } from '../../../../platform/cortex/common/copTypes.js';
import { SandtableCopMapRenderer, loadUmdModule } from './sandtableCopMapRenderer.js';

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Format lat/lon as a human-readable string.
 */
function formatLatLon(lat: number, lon: number): string {
	const latDir = lat >= 0 ? 'N' : 'S';
	const lonDir = lon >= 0 ? 'E' : 'W';
	return `${Math.abs(lat).toFixed(5)}\u00B0${latDir}, ${Math.abs(lon).toFixed(5)}\u00B0${lonDir}`;
}

// ─── SandtableCopCoordinateDisplay ────────────────────────────────────────────

export class SandtableCopCoordinateDisplay extends Disposable {

	private _format: CopCoordinateFormat;
	private _mgrsEl: HTMLElement | null;
	private _latlonEl: HTMLElement | null;
	private _currentLat = 0;
	private _currentLon = 0;

	/**
	 * Loaded `mgrs` npm module reference.
	 * API: mgrs.forward([lon, lat], precision) => MGRS string
	 *      mgrs.toPoint(mgrsString) => [lon, lat]
	 */
	private _mgrsModule: any = null;

	constructor(
		private readonly container: HTMLElement,
		private readonly mapRenderer: SandtableCopMapRenderer,
		initialFormat: CopCoordinateFormat,
	) {
		super();
		this._format = initialFormat;
		this._mgrsEl = container.querySelector('.cop-coord-mgrs');
		this._latlonEl = container.querySelector('.cop-coord-latlon');

		this._loadMgrsModule();
		this._setupClickHandlers();
	}

	/**
	 * Set up the map mousemove listener. Must be called after the map is ready.
	 */
	setupMapListener(): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		const handler = (e: { lngLat: { lng: number; lat: number } }) => {
			this._currentLat = e.lngLat.lat;
			this._currentLon = e.lngLat.lng;
			this._updateDisplay();
		};

		map.on('mousemove', handler);
		this._register({
			dispose: () => {
				map.off('mousemove', handler);
			}
		});
	}

	// ─── Private: Module Loading ──────────────────────────────────────────

	/**
	 * Load the `mgrs` npm package via loadUmdModule.
	 * Uses the Electron UMD workaround (nullifies module/exports globals)
	 * so the UMD wrapper takes the AMD define() path.
	 */
	private async _loadMgrsModule(): Promise<void> {
		try {
			this._mgrsModule = await loadUmdModule<any>('mgrs', 'dist/mgrs.min.js');
		} catch {
			// MGRS conversion not available -- fallback to lat/lon only
			this._mgrsModule = null;
		}
	}

	// ─── Private: Coordinate Conversion ───────────────────────────────────

	private _toMGRS(lat: number, lon: number): string {
		if (!this._mgrsModule) {
			return formatLatLon(lat, lon);
		}
		try {
			// mgrs.forward([lon, lat], precision) => MGRS string
			return this._mgrsModule.forward([lon, lat], 5);
		} catch {
			return formatLatLon(lat, lon);
		}
	}

	private _toUTM(lat: number, lon: number): string {
		// Simple UTM approximation from lat/lon
		// UTM zone = floor((lon + 180) / 6) + 1
		const zone = Math.floor((lon + 180) / 6) + 1;
		const letter = lat >= 0 ? 'N' : 'S';
		return `${zone}${letter} ${lon.toFixed(4)} ${lat.toFixed(4)}`;
	}

	// ─── Private: Click Handlers ──────────────────────────────────────────

	private _setupClickHandlers(): void {
		// Click to cycle format
		this.container.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._cycleFormat();
		});

		// Right-click to copy
		this.container.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._copyToClipboard();
		});
	}

	private _cycleFormat(): void {
		const formats: CopCoordinateFormat[] = ['mgrs', 'latlon', 'utm'];
		const idx = formats.indexOf(this._format);
		this._format = formats[(idx + 1) % formats.length];
		this._updateDisplay();
	}

	private _copyToClipboard(): void {
		const text = this._getFormattedCoordinate();
		navigator.clipboard.writeText(text).catch(() => {
			// Clipboard API may fail in some contexts -- silently ignore
		});
	}

	private _getFormattedCoordinate(): string {
		switch (this._format) {
			case 'mgrs':
				return this._toMGRS(this._currentLat, this._currentLon);
			case 'utm':
				return this._toUTM(this._currentLat, this._currentLon);
			case 'latlon':
			default:
				return formatLatLon(this._currentLat, this._currentLon);
		}
	}

	// ─── Private: Display Update ──────────────────────────────────────────

	private _updateDisplay(): void {
		if (!this._mgrsEl || !this._latlonEl) {
			return;
		}

		switch (this._format) {
			case 'mgrs': {
				this._mgrsEl.textContent = this._toMGRS(this._currentLat, this._currentLon);
				this._latlonEl.textContent = formatLatLon(this._currentLat, this._currentLon);
				break;
			}
			case 'utm': {
				this._mgrsEl.textContent = this._toUTM(this._currentLat, this._currentLon);
				this._latlonEl.textContent = formatLatLon(this._currentLat, this._currentLon);
				break;
			}
			case 'latlon': {
				this._mgrsEl.textContent = formatLatLon(this._currentLat, this._currentLon);
				this._latlonEl.textContent = this._toMGRS(this._currentLat, this._currentLon);
				break;
			}
		}
	}
}
