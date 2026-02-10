/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandtableCopService, ICopLayer } from '../../../../platform/cortex/common/copTypes.js';
import { SandtableCopMapRenderer } from './sandtableCopMapRenderer.js';

const $ = dom.$;

// ─── SandtableCopLayerPanel ───────────────────────────────────────────────────

export class SandtableCopLayerPanel extends Disposable {

	private _listContainer: HTMLElement;

	constructor(
		container: HTMLElement,
		private readonly mapRenderer: SandtableCopMapRenderer,
		private readonly copService: ISandtableCopService,
	) {
		super();
		const panel = dom.append(container, $('.cop-layer-panel'));

		// Header
		const header = dom.append(panel, $('.cop-layer-panel-header'));
		const headerTitle = dom.append(header, $('span'));
		headerTitle.textContent = 'Layers';

		// List
		this._listContainer = dom.append(panel, $('.cop-layer-panel-list'));

		// Render initial layers
		this._renderLayers();

		// Listen for layer changes
		this._register(this.copService.onLayersChanged(() => {
			this._renderLayers();
		}));
	}

	private _renderLayers(): void {
		dom.clearNode(this._listContainer);
		const layers = this.copService.getLayers();

		for (const layer of layers) {
			this._renderLayerItem(layer);
		}
	}

	private _renderLayerItem(layer: ICopLayer): void {
		const item = dom.append(this._listContainer, $('.cop-layer-item'));

		// Color dot
		const colorDot = dom.append(item, $('.cop-layer-color'));
		colorDot.style.backgroundColor = layer.color;

		// Name
		const name = dom.append(item, $('span.cop-layer-name'));
		name.textContent = layer.name;

		// Visibility toggle
		const visBtn = dom.append(item, $('button.cop-layer-visibility'));
		const visIcon = dom.append(visBtn, $('span.codicon'));
		this._updateVisibilityIcon(visIcon, visBtn, layer.visible);

		this._register(dom.addDisposableListener(visBtn, 'click', (e) => {
			e.stopPropagation();
			const newVisible = !layer.visible;
			this.copService.setLayerVisibility(layer.id, newVisible);
			layer.visible = newVisible;
			this._updateVisibilityIcon(visIcon, visBtn, newVisible);

			// Update MapLibre layer visibility for known COP layers
			this._updateMapLayerVisibility(layer.id, newVisible);
		}));

		// Opacity slider
		const slider = dom.append(item, $('input.cop-layer-opacity')) as HTMLInputElement;
		slider.type = 'range';
		slider.min = '0';
		slider.max = '100';
		slider.value = String(Math.round(layer.opacity * 100));

		this._register(dom.addDisposableListener(slider, 'input', () => {
			const newOpacity = parseInt(slider.value, 10) / 100;
			this.copService.setLayerOpacity(layer.id, newOpacity);
			layer.opacity = newOpacity;

			// Update MapLibre layer opacity for known COP layers
			this._updateMapLayerOpacity(layer.id, newOpacity);
		}));
	}

	private _updateVisibilityIcon(icon: HTMLElement, btn: HTMLElement, visible: boolean): void {
		icon.className = visible ? 'codicon codicon-eye' : 'codicon codicon-eye-closed';
		btn.classList.toggle('hidden', !visible);
	}

	private _updateMapLayerVisibility(layerId: string, visible: boolean): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		const visibility = visible ? 'visible' : 'none';

		// Map COP layer IDs to MapLibre layer IDs
		const layerMapping: Record<string, string[]> = {
			'friendly-orbat': ['cop-units-layer'],
			'enemy-orbat': ['cop-units-layer'],
			'annotations': ['cop-annotations-line', 'cop-annotations-fill', 'cop-annotations-point'],
		};

		const mapLayers = layerMapping[layerId];
		if (mapLayers) {
			for (const mlLayer of mapLayers) {
				if (map.getLayer(mlLayer)) {
					map.setLayoutProperty(mlLayer, 'visibility', visibility);
				}
			}
		}
	}

	private _updateMapLayerOpacity(layerId: string, opacity: number): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		// Adjust paint property based on layer type
		if (layerId === 'annotations') {
			if (map.getLayer('cop-annotations-line')) {
				map.setPaintProperty('cop-annotations-line', 'line-opacity', opacity);
			}
			if (map.getLayer('cop-annotations-fill')) {
				map.setPaintProperty('cop-annotations-fill', 'fill-opacity', opacity * 0.2);
			}
			if (map.getLayer('cop-annotations-point')) {
				map.setPaintProperty('cop-annotations-point', 'circle-opacity', opacity);
			}
		}
	}
}
