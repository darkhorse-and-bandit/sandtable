/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { join } from '../../../../base/common/path.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CopBasemapTheme } from '../../../../platform/cortex/common/copTypes.js';
import { importAMDNodeModule } from '../../../../amdX.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ICopMapMovedState {
	center: [number, number];
	zoom: number;
	bearing: number;
	pitch: number;
}

// ─── UMD Module Loader (Electron workaround) ─────────────────────────────────

/**
 * Load a UMD npm module via importAMDNodeModule, working around Electron's
 * Node.js globals that cause UMD wrappers to take the CJS path instead of AMD.
 *
 * In Electron's renderer, `module` and `exports` exist as global Node.js
 * objects. UMD wrappers check `typeof exports === 'object'` BEFORE checking
 * `typeof define === 'function' && define.amd`, so they always take the CJS
 * path and never call `define()`. This means importAMDNodeModule (which relies
 * on capturing `define()` calls) returns `undefined`.
 *
 * Fix: temporarily nullify `module` and `exports` so the UMD wrapper falls
 * through to the AMD `define()` path, then restore them immediately after.
 */
export async function loadUmdModule<T>(packageName: string, filePath: string): Promise<T> {
	const savedModule = (globalThis as any).module;
	const savedExports = (globalThis as any).exports;
	try {
		(globalThis as any).module = undefined;
		(globalThis as any).exports = undefined;
		return await importAMDNodeModule<T>(packageName, filePath);
	} finally {
		(globalThis as any).module = savedModule;
		(globalThis as any).exports = savedExports;
	}
}

// ─── Trusted Types Worker Patch (MapLibre WebGL Workers) ──────────────────────

/**
 * MapLibre GL JS creates Web Workers for tile parsing. VS Code's CSP includes
 * `require-trusted-types-for 'script'` which blocks `new Worker(url)` unless
 * the URL is a TrustedScriptURL. This patch creates a Trusted Types policy
 * and monkey-patches the Worker constructor so MapLibre's internal worker
 * creation passes through the policy.
 */
let workerPatchApplied = false;

function ensureWorkerTrustedTypesPatch(): void {
	if (workerPatchApplied) {
		return;
	}
	workerPatchApplied = true;

	let ttPolicy: any;
	try {
		ttPolicy = (globalThis as any).trustedTypes?.createPolicy('maplibreWorker', {
			createScriptURL: (url: string) => url,
		});
	} catch {
		// Policy creation failed (not in CSP whitelist or trustedTypes not available).
		// Fall through -- the Worker patch will still be applied without trusted types,
		// which works if the CSP doesn't strictly enforce trusted types for workers.
		ttPolicy = null;
	}

	const OrigWorker = globalThis.Worker;
	const PatchedWorker = function (this: any, scriptURL: any, options?: any) {
		if (ttPolicy) {
			if (typeof scriptURL === 'string') {
				scriptURL = ttPolicy.createScriptURL(scriptURL);
			} else if (scriptURL instanceof URL) {
				scriptURL = ttPolicy.createScriptURL(scriptURL.toString());
			}
		}
		return new OrigWorker(scriptURL, options);
	} as unknown as typeof Worker;
	PatchedWorker.prototype = OrigWorker.prototype;
	(PatchedWorker as any).toString = () => OrigWorker.toString();
	globalThis.Worker = PatchedWorker;
}

// ─── Trusted Types innerHTML Patch (MapLibre Controls) ────────────────────────

/**
 * MapLibre GL JS uses innerHTML in its NavigationControl and ScaleControl.
 * VS Code's CSP with `require-trusted-types-for 'script'` blocks direct
 * innerHTML assignments. This patch creates a TrustedHTML policy and
 * monkey-patches Element.prototype.innerHTML to use it.
 */
let innerHtmlPatchApplied = false;

function ensureInnerHtmlTrustedTypesPatch(): void {
	if (innerHtmlPatchApplied) {
		return;
	}
	innerHtmlPatchApplied = true;

	let htmlPolicy: any;
	try {
		htmlPolicy = (globalThis as any).trustedTypes?.createPolicy('maplibreHtml', {
			createHTML: (html: string) => html,
		});
	} catch {
		htmlPolicy = null;
	}

	if (!htmlPolicy) {
		return;
	}

	// Monkey-patch innerHTML setter on the map container's elements
	// We use a targeted approach: override innerHTML on the specific
	// MapLibre control container elements rather than globally
	const origInnerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
	if (origInnerHTMLDesc && origInnerHTMLDesc.set) {
		const origSetter = origInnerHTMLDesc.set;
		Object.defineProperty(Element.prototype, 'innerHTML', {
			...origInnerHTMLDesc,
			set(this: Element, value: any) {
				// If already a TrustedHTML, pass through
				if (typeof value !== 'string') {
					origSetter.call(this, value);
					return;
				}
				// Wrap string in TrustedHTML
				try {
					origSetter.call(this, htmlPolicy.createHTML(value));
				} catch {
					origSetter.call(this, value);
				}
			}
		});
	}
}

// ─── PMTiles Protocol Registration (global singleton) ─────────────────────────
//
// The standard PMTiles Protocol uses FetchSource which relies on HTTP Range
// Requests (byte serving). The vscode-file:// protocol does NOT support Range
// Requests -- it serves the entire file without Content-Length headers. This
// causes PMTiles to fail with "Server returned no content-length header".
//
// Solution: Create a custom source that fetches the entire PMTiles file into
// an ArrayBuffer once, then serves byte-range reads from memory. This works
// for our bundled Natural Earth file (~44MB) and any reasonable regional tile
// files. For very large files (>500MB), a different approach would be needed.

/** In-memory PMTiles source that fetches once and serves ranges from buffer */
class InMemoryPMTilesSource {
	private _buffer: ArrayBuffer | null = null;
	private _loadPromise: Promise<void> | null = null;
	private readonly _url: string;

	constructor(url: string) {
		this._url = url;
	}

	getKey(): string {
		return this._url;
	}

	async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
		await this._ensureLoaded();
		if (!this._buffer) {
			throw new Error(`Failed to load PMTiles from ${this._url}`);
		}
		return { data: this._buffer.slice(offset, offset + length) };
	}

	private async _ensureLoaded(): Promise<void> {
		if (this._buffer) {
			return;
		}
		if (!this._loadPromise) {
			this._loadPromise = this._fetchFile();
		}
		return this._loadPromise;
	}

	private async _fetchFile(): Promise<void> {
		try {
			const response = await fetch(this._url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} fetching ${this._url}`);
			}
			this._buffer = await response.arrayBuffer();
		} catch (err) {
			this._buffer = null;
			throw err;
		}
	}
}

let pmtilesProtocolRegistered = false;
let pmtilesProtocolInstance: any;

function ensurePmtilesProtocol(maplibregl: any, pmtiles: any): void {
	if (pmtilesProtocolRegistered) {
		return;
	}

	// Create protocol with custom source support
	const protocol = new pmtiles.Protocol();
	pmtilesProtocolInstance = protocol;
	maplibregl.addProtocol('pmtiles', protocol.tile);
	pmtilesProtocolRegistered = true;
}

/**
 * Register a local PMTiles file with the protocol using an in-memory source.
 * This works around the vscode-file:// protocol not supporting Range Requests.
 */
function registerLocalPMTilesSource(pmtiles: any, tileUrl: string, localFileUrl: string): void {
	if (!pmtilesProtocolInstance) {
		return;
	}
	// Create an in-memory source and a PMTiles instance backed by it
	const source = new InMemoryPMTilesSource(localFileUrl);
	const tiles = new pmtiles.PMTiles(source);
	// Register this pre-configured PMTiles instance with the protocol
	pmtilesProtocolInstance.add(tiles);
}

// ─── MapLibre CSS Injection ───────────────────────────────────────────────────

let maplibreCssInjected = false;

function injectMapLibreCss(container: HTMLElement): void {
	if (maplibreCssInjected) {
		return;
	}

	// Inject critical MapLibre CSS directly since VS Code's build system
	// externalizes npm packages and CSS imports may not work.
	const style = document.createElement('style');
	style.textContent = getMapLibreCriticalCss();
	(container.ownerDocument || document).head.appendChild(style);
	maplibreCssInjected = true;
}

/**
 * Critical MapLibre GL CSS rules needed for proper rendering.
 * This is a minimal subset of maplibre-gl.css that ensures the map
 * canvas, controls, and popups render correctly.
 */
function getMapLibreCriticalCss(): string {
	return `
.maplibregl-map {
	font: 12px/20px 'Helvetica Neue', Arial, Helvetica, sans-serif;
	overflow: hidden;
	position: relative;
	-webkit-tap-highlight-color: rgba(0,0,0,0);
}
.maplibregl-canvas {
	position: absolute;
	left: 0;
	top: 0;
}
.maplibregl-map:-webkit-full-screen {
	width: 100%;
	height: 100%;
}
.maplibregl-canary {
	background-color: salmon;
}
.maplibregl-canvas-container.maplibregl-interactive,
.maplibregl-ctrl-group button.maplibregl-ctrl-compass {
	cursor: grab;
	-moz-user-select: none;
	-webkit-user-select: none;
	user-select: none;
}
.maplibregl-canvas-container.maplibregl-interactive.maplibregl-track-pointer {
	cursor: pointer;
}
.maplibregl-canvas-container.maplibregl-interactive:active,
.maplibregl-ctrl-group button.maplibregl-ctrl-compass:active {
	cursor: grabbing;
}
.maplibregl-ctrl-top-left,
.maplibregl-ctrl-top-right,
.maplibregl-ctrl-bottom-left,
.maplibregl-ctrl-bottom-right {
	position: absolute;
	pointer-events: none;
	z-index: 2;
}
.maplibregl-ctrl-top-left {
	top: 0;
	left: 0;
}
.maplibregl-ctrl-top-right {
	top: 0;
	right: 0;
}
.maplibregl-ctrl-bottom-left {
	bottom: 0;
	left: 0;
}
.maplibregl-ctrl-bottom-right {
	right: 0;
	bottom: 0;
}
.maplibregl-ctrl {
	clear: both;
	pointer-events: auto;
	transform: translate(0, 0);
}
.maplibregl-ctrl-top-left .maplibregl-ctrl {
	margin: 10px 0 0 10px;
	float: left;
}
.maplibregl-ctrl-top-right .maplibregl-ctrl {
	margin: 10px 10px 0 0;
	float: right;
}
.maplibregl-ctrl-bottom-left .maplibregl-ctrl {
	margin: 0 0 10px 10px;
	float: left;
}
.maplibregl-ctrl-bottom-right .maplibregl-ctrl {
	margin: 0 10px 10px 0;
	float: right;
}
.maplibregl-ctrl-group {
	border-radius: 4px;
	overflow: hidden;
	background: #fff;
	box-shadow: 0 0 2px rgba(0,0,0,.1);
}
.maplibregl-ctrl-group > button {
	width: 29px;
	height: 29px;
	display: block;
	padding: 0;
	outline: none;
	border: 0;
	box-sizing: border-box;
	background-color: transparent;
	cursor: pointer;
}
.maplibregl-ctrl-group > button + button {
	border-top: 1px solid #ddd;
}
.maplibregl-ctrl-attrib {
	color: rgba(0,0,0,.75);
	text-decoration: none;
	font-size: 12px;
	padding: 0 5px;
	background-color: hsla(0,0%,100%,.5);
}
.maplibregl-ctrl-attrib a {
	color: rgba(0,0,0,.75);
	text-decoration: none;
}
.maplibregl-popup {
	position: absolute;
	top: 0;
	left: 0;
	display: flex;
	will-change: transform;
	pointer-events: none;
}
.maplibregl-ctrl button .maplibregl-ctrl-icon {
	background-position: 50%;
	background-repeat: no-repeat;
	display: block;
	height: 100%;
	width: 100%;
}
.maplibregl-ctrl-icon {
	background-color: transparent;
}
.maplibregl-ctrl button:not(:disabled):hover {
	background-color: rgba(0,0,0,.05);
}
.maplibregl-ctrl button:disabled .maplibregl-ctrl-icon {
	opacity: .25;
}
.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon {
	background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='29' height='29' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='M14.5 8.5c-.75 0-1.5.75-1.5 1.5v3h-3c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h3v3c0 .75.75 1.5 1.5 1.5S16 19.75 16 19v-3h3c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-3v-3c0-.75-.75-1.5-1.5-1.5'/%3E%3C/svg%3E");
}
.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon {
	background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='29' height='29' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='M10 13c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h9c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13z'/%3E%3C/svg%3E");
}
.maplibregl-ctrl-compass .maplibregl-ctrl-icon {
	background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='29' height='29' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='m10.5 14 4-8 4 8z'/%3E%3Cpath fill='%23ccc' d='m10.5 16 4 8 4-8z'/%3E%3C/svg%3E");
}
.maplibregl-ctrl-shrink .maplibregl-ctrl-icon {
	background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='29' height='29' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='M18.5 16c-1.75 0-2.5.75-2.5 2.5V24h1v-5.5c0-1 .5-1.5 1.5-1.5H24v-1zM13 18.5c0-1.75-.75-2.5-2.5-2.5H5v1h5.5c1 0 1.5.5 1.5 1.5V24h1zM18.5 13c-1.75 0-2.5-.75-2.5-2.5V5h1v5.5c0 1 .5 1.5 1.5 1.5H24v1zM10.5 13c1.75 0 2.5-.75 2.5-2.5V5h-1v5.5c0 1-.5 1.5-1.5 1.5H5v1z'/%3E%3C/svg%3E");
}
.maplibregl-ctrl-pitch-slider {
	width: 26px;
	margin: 0 auto;
}
.maplibregl-ctrl-scale {
	background-color: hsla(0,0%,100%,.75);
	border: 2px solid #333;
	border-top: 0;
	box-sizing: border-box;
	color: #333;
	font-size: 10px;
	padding: 0 5px;
	white-space: nowrap;
}
`.trim();
}

// ─── SandtableCopMapRenderer ──────────────────────────────────────────────────

export class SandtableCopMapRenderer extends Disposable {

	private _map: any | undefined;
	private readonly _onMapMoved = this._register(new Emitter<ICopMapMovedState>());
	readonly onMapMoved: Event<ICopMapMovedState> = this._onMapMoved.event;

	/** Fires when GeoJSON sources are (re)created after a style load/reload */
	private readonly _onSourcesReady = this._register(new Emitter<void>());
	readonly onSourcesReady: Event<void> = this._onSourcesReady.event;

	/** Loaded module references -- populated by _loadDependencies() */
	private _maplibregl: any;
	private _pmtiles: any;
	private _basemaps: any;

	/** Resolves when the map is fully initialized and ready for interaction */
	private _readyResolve!: () => void;
	readonly ready: Promise<void>;

	constructor(
		private readonly container: HTMLElement,
		private readonly appRoot: string,
		private readonly tileSource: string,
		private basemapTheme: CopBasemapTheme,
		private readonly defaultCenter: [number, number],
		private readonly defaultZoom: number,
		private readonly logService: ILogService,
	) {
		super();
		this.ready = new Promise<void>((resolve) => { this._readyResolve = resolve; });
		this._initMap();
	}

	/** Get the underlying MapLibre Map instance */
	get map(): any | undefined {
		return this._map;
	}

	/** Resize the map (call when container dimensions change) */
	resize(): void {
		this._map?.resize();
	}

	/** Switch basemap theme */
	setTheme(theme: CopBasemapTheme): void {
		if (!this._map || theme === this.basemapTheme) {
			return;
		}
		this.basemapTheme = theme;
		const style = this._buildStyle();
		this._map.setStyle(style);
		this.logService.info(`[Sandtable COP] Basemap theme changed to: ${theme}`);
	}

	override dispose(): void {
		if (this._map) {
			this._map.remove();
			this._map = undefined;
		}
		super.dispose();
	}

	// ─── Private: Dependency Loading ──────────────────────────────────────

	/**
	 * Load all npm dependencies using VS Code's importAMDNodeModule() pattern.
	 *
	 * - maplibre-gl: UMD format, define.amd detected, returned directly
	 * - pmtiles: IIFE format, sets globalThis.pmtiles after script loads
	 * - @protomaps/basemaps: IIFE format, sets globalThis.basemaps after script loads
	 */
	private async _loadDependencies(): Promise<void> {
		this.logService.info('[Sandtable COP] Loading map dependencies...');

		// maplibre-gl: UMD -- must use loadUmdModule to work around Electron's
		// Node.js globals that cause UMD to take CJS path instead of AMD
		this._maplibregl = await loadUmdModule<any>('maplibre-gl', 'dist/maplibre-gl.js');
		this.logService.info(`[Sandtable COP] maplibre-gl loaded (Map available: ${!!this._maplibregl?.Map}).`);

		// pmtiles: IIFE -- the script sets globalThis.pmtiles
		await importAMDNodeModule<any>('pmtiles', 'dist/pmtiles.js');
		this._pmtiles = (globalThis as any).pmtiles;
		this.logService.info(`[Sandtable COP] pmtiles loaded (Protocol available: ${!!this._pmtiles?.Protocol}).`);

		// @protomaps/basemaps: IIFE -- the script sets globalThis.basemaps
		await importAMDNodeModule<any>('@protomaps/basemaps', 'dist/basemaps.js');
		this._basemaps = (globalThis as any).basemaps;
		this.logService.info(`[Sandtable COP] @protomaps/basemaps loaded (layers available: ${!!this._basemaps?.layers}).`);
	}

	// ─── Private: Initialization ──────────────────────────────────────────

	private async _initMap(): Promise<void> {
		try {
			// Load all dependencies first
			await this._loadDependencies();

			const maplibregl = this._maplibregl;
			const pmtiles = this._pmtiles;

			if (!maplibregl || !maplibregl.Map) {
				this.logService.error('[Sandtable COP] Failed to load maplibre-gl. Map cannot render.');
				this._readyResolve();
				return;
			}

			// Patch Worker constructor and innerHTML for Trusted Types
			// (must be done before map creation)
			ensureWorkerTrustedTypesPatch();
			ensureInnerHtmlTrustedTypesPatch();

			// Inject MapLibre CSS
			injectMapLibreCss(this.container);

			// Register PMTiles protocol
			if (pmtiles) {
				ensurePmtilesProtocol(maplibregl, pmtiles);
			} else {
				this.logService.warn('[Sandtable COP] pmtiles not available. Only HTTP tile sources will work.');
			}

			// Build style
			const style = this._buildStyle();

			// Register local PMTiles sources with in-memory reader
			// (vscode-file:// doesn't support HTTP Range Requests that PMTiles needs)
			if (pmtiles && style.sources) {
				for (const [, src] of Object.entries(style.sources as Record<string, any>)) {
					if (src.url && typeof src.url === 'string' && src.url.startsWith('pmtiles://vscode-file://')) {
						const pmtilesUrl = src.url; // e.g., pmtiles://vscode-file://vscode-app/path/to/file.pmtiles
						const localFileUrl = pmtilesUrl.replace('pmtiles://', ''); // vscode-file://vscode-app/path/to/file.pmtiles
						this.logService.info(`[Sandtable COP] Registering local PMTiles source: ${localFileUrl}`);
						registerLocalPMTilesSource(pmtiles, pmtilesUrl, localFileUrl);
					}
				}
			}

			// Create map instance
			this._map = new maplibregl.Map({
				container: this.container,
				style,
				center: this.defaultCenter,
				zoom: this.defaultZoom,
				attributionControl: false,
				preserveDrawingBuffer: true, // Required for map.getCanvas().toDataURL() (snapshot capture)
			});

			// Add navigation controls
			this._map.addControl(new maplibregl.NavigationControl({
				showCompass: true,
				showZoom: true,
				visualizePitch: true,
			}), 'top-right');

			// Add scale bar
			this._map.addControl(new maplibregl.ScaleControl({
				maxWidth: 150,
				unit: 'metric',
			}), 'bottom-right');

			// On style load, add empty GeoJSON sources for COP data layers.
			// Using 'style.load' instead of 'load' because 'load' requires ALL
			// sources (including tiles) to finish loading. With no tile files present,
			// 'load' may never fire. 'style.load' fires once the style is parsed,
			// even with a background-only style or failed tile fetches.
			this._map.on('style.load', () => {
				if (!this._map) {
					return;
				}

				// Units source (Phase 2 will populate this)
				this._map.addSource('cop-units', {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] },
				});

				// Units symbol layer
				this._map.addLayer({
					id: 'cop-units-layer',
					type: 'symbol',
					source: 'cop-units',
					layout: {
						'icon-image': ['get', 'iconImageId'],
						'icon-size': 1.0,
						'icon-allow-overlap': true,
						'icon-ignore-placement': true,
						'text-field': ['get', 'designation'],
						'text-font': ['Noto Sans Regular'],
						'text-size': 10,
						'text-offset': [0, 1.5],
						'text-anchor': 'top',
					},
					paint: {
						'text-color': '#333333',
						'text-halo-color': '#ffffff',
						'text-halo-width': 1,
					},
				});

				// Annotations source
				this._map.addSource('cop-annotations', {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] },
				});

				// Annotations line layer
				this._map.addLayer({
					id: 'cop-annotations-line',
					type: 'line',
					source: 'cop-annotations',
					filter: ['in', '$type', 'LineString'],
					paint: {
						'line-color': ['coalesce', ['get', 'strokeColor'], '#ffc107'],
						'line-width': ['coalesce', ['get', 'strokeWidth'], 2],
					},
				});

				// Annotations fill layer
				this._map.addLayer({
					id: 'cop-annotations-fill',
					type: 'fill',
					source: 'cop-annotations',
					filter: ['==', '$type', 'Polygon'],
					paint: {
						'fill-color': ['coalesce', ['get', 'fillColor'], '#ffc107'],
						'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.2],
					},
				});

				// Annotations point layer
				this._map.addLayer({
					id: 'cop-annotations-point',
					type: 'circle',
					source: 'cop-annotations',
					filter: ['==', '$type', 'Point'],
					paint: {
						'circle-color': ['coalesce', ['get', 'strokeColor'], '#ffc107'],
						'circle-radius': 5,
						'circle-stroke-color': '#ffffff',
						'circle-stroke-width': 1,
					},
				});

				this.logService.info('[Sandtable COP] Map loaded and COP sources added.');
				this._onSourcesReady.fire();
			});

			// Emit map state on move
			this._map.on('moveend', () => {
				if (!this._map) {
					return;
				}
				const center = this._map.getCenter();
				this._onMapMoved.fire({
					center: [center.lng, center.lat],
					zoom: this._map.getZoom(),
					bearing: this._map.getBearing(),
					pitch: this._map.getPitch(),
				});
			});

			this.logService.info('[Sandtable COP] MapLibre GL JS initialized.');
			this._readyResolve();

		} catch (err) {
			this.logService.error('[Sandtable COP] Failed to initialize map:', err);
			this._readyResolve(); // Always resolve so the page UI doesn't hang
		}
	}

	// ─── Private: Style Construction ──────────────────────────────────────

	private _buildStyle(): any {
		const assetsPath = this._getCopAssetsPath();
		// Use vscode-file:// protocol (not file://) for local resources in Electron
		const glyphsUrl = `vscode-file://vscode-app${assetsPath}/fonts/{fontstack}/{range}.pbf`;
		const spriteUrl = `vscode-file://vscode-app${assetsPath}/sprites/v4/${this.basemapTheme}`;
		const tileSourceUrl = this._resolveTileSource();

		// Try to use @protomaps/basemaps for style layers if a tile source is available
		let layers: any[];
		let sources: Record<string, any>;

		if (tileSourceUrl && this._basemaps) {
			// Use protomaps basemaps layers for rich basemap styling
			try {
				const flavor = this._basemaps.namedFlavor(this.basemapTheme);
				layers = this._basemaps.layers('basemap', flavor, { lang: 'en' });
				sources = {
					basemap: {
						type: 'vector',
						url: tileSourceUrl,
					},
				};
			} catch (e) {
				this.logService.warn('[Sandtable COP] Could not generate protomaps basemap style, using fallback.', e);
				layers = this._buildFallbackLayers();
				sources = tileSourceUrl ? {
					basemap: {
						type: 'vector',
						url: tileSourceUrl,
					},
				} : {};
			}
		} else {
			// No tile source or basemaps not available: use a plain background
			layers = this._buildFallbackLayers();
			sources = {};
			if (tileSourceUrl) {
				sources['basemap'] = {
					type: 'vector',
					url: tileSourceUrl,
				};
			}
		}

		return {
			version: 8,
			glyphs: glyphsUrl,
			sprite: spriteUrl,
			sources,
			layers,
		};
	}

	private _buildFallbackLayers(): any[] {
		// Provide a visible background even without tiles
		const bgColor = this.basemapTheme === 'dark' || this.basemapTheme === 'black'
			? '#1a1a2e'
			: this.basemapTheme === 'grayscale'
				? '#e0e0e0'
				: '#f0f0f0';

		return [{
			id: 'cop-background',
			type: 'background',
			paint: {
				'background-color': bgColor,
			},
		}];
	}

	private _resolveTileSource(): string | null {
		if (!this.tileSource) {
			// Try bundled natural earth fallback
			const assetsPath = this._getCopAssetsPath();
			const fallbackPath = join(assetsPath, 'natural-earth.pmtiles');
			// Use vscode-file:// protocol for local resources in Electron
			// Note: fallbackPath is absolute (starts with /) so no extra / needed
			return `pmtiles://vscode-file://vscode-app${fallbackPath}`;
		}

		const src = this.tileSource.trim();

		// HTTP URL
		if (src.startsWith('http://') || src.startsWith('https://')) {
			return `pmtiles://${src}`;
		}

		// Absolute path (starts with / so no extra / needed after authority)
		if (src.startsWith('/') || /^[A-Z]:\\/i.test(src)) {
			return `pmtiles://vscode-file://vscode-app${src}`;
		}

		// Workspace-relative path (starts with ./ or just a filename)
		// join() with appRoot produces an absolute path starting with /
		const resolved = join(this.appRoot, src);
		return `pmtiles://vscode-file://vscode-app${resolved}`;
	}

	private _getCopAssetsPath(): string {
		return join(this.appRoot, 'resources', 'cop-assets');
	}
}
