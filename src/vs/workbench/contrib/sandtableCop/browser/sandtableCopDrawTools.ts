/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandtableCopService, ICopAnnotation } from '../../../../platform/cortex/common/copTypes.js';
import { SandtableCopMapRenderer } from './sandtableCopMapRenderer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

const $ = dom.$;

// ─── Draw Mode Types ──────────────────────────────────────────────────────────

type DrawMode = 'none' | 'draw_point' | 'draw_line_string' | 'draw_polygon';

// ─── SandtableCopDrawTools ────────────────────────────────────────────────────

/**
 * Basic drawing toolbar that integrates with MapLibre GL JS for freeform
 * point, line, and polygon annotation.
 *
 * For Phase 1, this uses a simple click-to-place approach rather than the
 * full maplibre-gl-draw library, which avoids potential bundling issues.
 * The draw interactions store annotations in the COP service.
 */
export class SandtableCopDrawTools extends Disposable {

	private _activeMode: DrawMode = 'none';
	private _buttons: Map<DrawMode, HTMLElement> = new Map();
	private _currentVertices: [number, number][] = [];
	private _tempLayerAdded = false;

	constructor(
		private readonly toolbar: HTMLElement,
		private readonly mapRenderer: SandtableCopMapRenderer,
		private readonly copService: ISandtableCopService,
		private readonly logService: ILogService,
	) {
		super();
		this._buildToolbar();
		this._setupMapClickHandler();

		// Re-push annotation data to the map when sources are recreated
		// (happens after theme switch calls map.setStyle() which replaces all sources)
		this._register(this.mapRenderer.onSourcesReady(() => {
			this._updateAnnotationsSource();
		}));
	}

	private _buildToolbar(): void {
		// Separator before draw tools
		dom.append(this.toolbar, $('.cop-draw-separator'));

		// Point tool
		this._createToolButton('draw_point', Codicon.circleSmallFilled, 'Draw Point');

		// Line tool
		this._createToolButton('draw_line_string', Codicon.dash, 'Draw Line');

		// Polygon tool
		this._createToolButton('draw_polygon', Codicon.screenFull, 'Draw Polygon');

		// Delete/Cancel tool
		const deleteBtn = dom.append(this.toolbar, $('button.cop-btn'));
		deleteBtn.title = 'Cancel Drawing';
		dom.append(deleteBtn, $('span' + ThemeIcon.asCSSSelector(Codicon.close)));
		this._register(dom.addDisposableListener(deleteBtn, 'click', () => {
			this._cancelDrawing();
		}));
	}

	private _createToolButton(mode: DrawMode, icon: ThemeIcon, title: string): void {
		const btn = dom.append(this.toolbar, $('button.cop-btn'));
		btn.title = title;
		dom.append(btn, $('span' + ThemeIcon.asCSSSelector(icon)));
		this._buttons.set(mode, btn);

		this._register(dom.addDisposableListener(btn, 'click', () => {
			this._toggleMode(mode);
		}));
	}

	private _toggleMode(mode: DrawMode): void {
		if (this._activeMode === mode) {
			// Deactivate current mode
			this._finishDrawing();
			return;
		}

		// Finish any current drawing first
		if (this._activeMode !== 'none') {
			this._finishDrawing();
		}

		// Activate new mode
		this._activeMode = mode;
		this._currentVertices = [];
		this._updateButtonStates();
		this._updateCursor();
		this._updateMapInteractions();

		this.logService.info(`[Sandtable COP Draw] Activated mode: ${mode}`);
	}

	private _cancelDrawing(): void {
		this._activeMode = 'none';
		this._currentVertices = [];
		this._updateButtonStates();
		this._updateCursor();
		this._updateMapInteractions();
		this._clearTempLayer();
	}

	private _finishDrawing(): void {
		if (this._currentVertices.length > 0 && this._activeMode !== 'none') {
			this._createAnnotation();
		}
		this._activeMode = 'none';
		this._currentVertices = [];
		this._updateButtonStates();
		this._updateCursor();
		this._updateMapInteractions();
		this._clearTempLayer();
	}

	/**
	 * Disable/enable MapLibre's built-in drag and double-click-zoom handlers
	 * based on the active draw mode. When drawing lines or polygons, drag-pan
	 * must be disabled so clicks register as vertex placements instead of map
	 * panning, and double-click-zoom must be disabled so double-click can
	 * finish the drawing.
	 */
	private _updateMapInteractions(): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}
		if (this._activeMode !== 'none') {
			map.dragPan?.disable();
			map.doubleClickZoom?.disable();
		} else {
			map.dragPan?.enable();
			map.doubleClickZoom?.enable();
		}
	}

	private _setupMapClickHandler(): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		const clickHandler = (e: { lngLat: { lng: number; lat: number } }) => {
			if (this._activeMode === 'none') {
				return;
			}

			const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];

			switch (this._activeMode) {
				case 'draw_point': {
					this._currentVertices = [coord];
					this._createAnnotation();
					// Point mode: single click completes the drawing
					this._activeMode = 'none';
					this._currentVertices = [];
					this._updateButtonStates();
					this._updateCursor();
					break;
				}
				case 'draw_line_string':
				case 'draw_polygon': {
					this._currentVertices.push(coord);
					this._updateTempLayer();
					break;
				}
			}
		};

		const dblClickHandler = (e: { lngLat: { lng: number; lat: number }; preventDefault: () => void }) => {
			if (this._activeMode === 'draw_line_string' || this._activeMode === 'draw_polygon') {
				e.preventDefault();
				this._finishDrawing();
			}
		};

		map.on('click', clickHandler);
		map.on('dblclick', dblClickHandler);

		this._register({
			dispose: () => {
				map.off('click', clickHandler);
				map.off('dblclick', dblClickHandler);
			}
		});
	}

	private _createAnnotation(): void {
		if (this._currentVertices.length === 0) {
			return;
		}

		const id = `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		let annotation: ICopAnnotation;

		switch (this._activeMode) {
			case 'draw_point': {
				annotation = {
					id,
					layerId: 'annotations',
					type: 'freeform-point',
					geometry: {
						type: 'Point',
						coordinates: this._currentVertices[0],
					},
					style: {
						strokeColor: '#ffc107',
						strokeWidth: 2,
					},
					label: '',
				};
				break;
			}
			case 'draw_line_string': {
				if (this._currentVertices.length < 2) {
					return;
				}
				annotation = {
					id,
					layerId: 'annotations',
					type: 'freeform-line',
					geometry: {
						type: 'LineString',
						coordinates: this._currentVertices,
					},
					style: {
						strokeColor: '#ffc107',
						strokeWidth: 2,
					},
					label: '',
				};
				break;
			}
			case 'draw_polygon': {
				if (this._currentVertices.length < 3) {
					return;
				}
				// Close the polygon
				const coords = [...this._currentVertices, this._currentVertices[0]];
				annotation = {
					id,
					layerId: 'annotations',
					type: 'freeform-polygon',
					geometry: {
						type: 'Polygon',
						coordinates: [coords],
					},
					style: {
						strokeColor: '#ffc107',
						strokeWidth: 2,
						fillColor: '#ffc107',
						fillOpacity: 0.15,
					},
					label: '',
				};
				break;
			}
			default:
				return;
		}

		this.copService.addAnnotation(annotation);
		this._updateAnnotationsSource();
		this.logService.info(`[Sandtable COP Draw] Created annotation: ${id} (${annotation.type})`);
	}

	private _updateAnnotationsSource(): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		const source = map.getSource('cop-annotations');
		if (source && 'setData' in source) {
			const annotations = this.copService.getAnnotations();
			const features = annotations.map(a => ({
				type: 'Feature' as const,
				id: a.id,
				geometry: a.geometry,
				properties: {
					annotationId: a.id,
					type: a.type,
					label: a.label,
					strokeColor: a.style.strokeColor,
					strokeWidth: a.style.strokeWidth,
					fillColor: a.style.fillColor || a.style.strokeColor,
					fillOpacity: a.style.fillOpacity || 0.2,
				},
			}));

			(source as any).setData({
				type: 'FeatureCollection',
				features,
			});
		}
	}

	private _updateTempLayer(): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		// Ensure temp source exists
		if (!this._tempLayerAdded) {
			map.addSource('cop-draw-temp', {
				type: 'geojson',
				data: { type: 'FeatureCollection', features: [] },
			});
			map.addLayer({
				id: 'cop-draw-temp-line',
				type: 'line',
				source: 'cop-draw-temp',
				paint: {
					'line-color': '#2196f3',
					'line-width': 2,
					'line-dasharray': [3, 2],
				},
			});
			map.addLayer({
				id: 'cop-draw-temp-points',
				type: 'circle',
				source: 'cop-draw-temp',
				filter: ['==', '$type', 'Point'],
				paint: {
					'circle-color': '#2196f3',
					'circle-radius': 4,
					'circle-stroke-color': '#ffffff',
					'circle-stroke-width': 1,
				},
			});
			this._tempLayerAdded = true;
		}

		const source = map.getSource('cop-draw-temp');
		if (source && 'setData' in source) {
			const features: any[] = [];

			// Show vertices as points
			for (const v of this._currentVertices) {
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: v },
					properties: {},
				});
			}

			// Show line between vertices
			if (this._currentVertices.length >= 2) {
				features.push({
					type: 'Feature',
					geometry: {
						type: 'LineString',
						coordinates: this._currentVertices,
					},
					properties: {},
				});
			}

			(source as any).setData({
				type: 'FeatureCollection',
				features,
			});
		}
	}

	private _clearTempLayer(): void {
		const map = this.mapRenderer.map;
		if (!map || !this._tempLayerAdded) {
			return;
		}

		const source = map.getSource('cop-draw-temp');
		if (source && 'setData' in source) {
			(source as any).setData({
				type: 'FeatureCollection',
				features: [],
			});
		}
	}

	private _updateButtonStates(): void {
		for (const [mode, btn] of this._buttons) {
			btn.classList.toggle('active', mode === this._activeMode);
		}
	}

	private _updateCursor(): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}
		const canvas = map.getCanvasContainer();
		canvas.style.cursor = this._activeMode !== 'none' ? 'crosshair' : '';
	}
}
