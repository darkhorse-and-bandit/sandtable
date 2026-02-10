/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './sandtableCop.css';

import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SandtableCopInput } from './sandtableCopInput.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { CopConfigKeys } from '../../../../platform/cortex/common/copConfiguration.js';
import { ISandtableCopService, CopBasemapTheme, CopCoordinateFormat } from '../../../../platform/cortex/common/copTypes.js';
import { SandtableCopMapRenderer } from './sandtableCopMapRenderer.js';
import { SandtableCopCoordinateDisplay } from './sandtableCopCoordinateDisplay.js';
import { SandtableCopLayerPanel } from './sandtableCopLayerPanel.js';
import { SandtableCopDrawTools } from './sandtableCopDrawTools.js';
import { SandtableCopSymbology } from './sandtableCopSymbology.js';
import { SandtableCopUnitPlacement } from './sandtableCopUnitPlacement.js';
import { SandtableCopUnitEditor } from './sandtableCopUnitEditor.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const $ = dom.$;

// ─── SandtableCopPage ─────────────────────────────────────────────────────────

export class SandtableCopPage extends EditorPane {

	static readonly ID = 'sandtable.copPage';

	private container!: HTMLElement;
	private mapContainer!: HTMLElement;
	private coordinateContainer!: HTMLElement;
	private layerSidebar!: HTMLElement;
	private toolbarLeft!: HTMLElement;

	private _mapRenderer: SandtableCopMapRenderer | undefined;
	private _coordinateDisplay: SandtableCopCoordinateDisplay | undefined;
	private _layerPanel: SandtableCopLayerPanel | undefined;
	private _drawTools: SandtableCopDrawTools | undefined;
	private _symbology: SandtableCopSymbology | undefined;
	private _unitPlacement: SandtableCopUnitPlacement | undefined;
	private _unitEditor: SandtableCopUnitEditor | undefined;
	private _mapInitialized = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ISandtableCopService private readonly copService: ISandtableCopService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super(SandtableCopPage.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, $('.sandtable-cop'));

		// ─── Toolbar ──────────────────────────────────────────────────────
		const toolbar = dom.append(this.container, $('.sandtable-cop-toolbar'));

		// Left: draw tools + layer toggle
		this.toolbarLeft = dom.append(toolbar, $('.sandtable-cop-toolbar-left'));

		// Center: phase label placeholder
		const toolbarCenter = dom.append(toolbar, $('.sandtable-cop-toolbar-center'));
		const phaseLabel = dom.append(toolbarCenter, $('span.cop-phase-label'));
		phaseLabel.textContent = nls.localize('sandtable.cop.ready', "Common Operating Picture");

		// Right: basemap picker + MGRS grid toggle
		const toolbarRight = dom.append(toolbar, $('.sandtable-cop-toolbar-right'));
		this._buildBasemapPicker(toolbarRight);
		this._buildMgrsGridToggle(toolbarRight);

		// ─── Body ─────────────────────────────────────────────────────────
		const body = dom.append(this.container, $('.sandtable-cop-body'));

		// Map container (takes all remaining space)
		this.mapContainer = dom.append(body, $('.sandtable-cop-map-container'));

		// Coordinate display overlay
		this.coordinateContainer = dom.append(this.mapContainer, $('.cop-coordinate-display'));
		const mgrsSpan = dom.append(this.coordinateContainer, $('span.cop-coord-mgrs'));
		mgrsSpan.textContent = '---';
		const latlonSpan = dom.append(this.coordinateContainer, $('span.cop-coord-latlon'));
		latlonSpan.textContent = '---';

		// Layer sidebar (right, collapsible)
		this.layerSidebar = dom.append(body, $('.sandtable-cop-sidebar-right'));

		// ─── Timeline placeholder ─────────────────────────────────────────
		dom.append(this.container, $('.sandtable-cop-timeline'));
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: object, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (!this._mapInitialized) {
			this._mapInitialized = true;
			await this._initializeMap();
		}
	}

	override layout(dimension: dom.Dimension): void {
		// MapLibre needs an explicit resize notification when container dimensions change
		if (this._mapRenderer) {
			this._mapRenderer.resize();
		}
		void dimension;
	}

	override dispose(): void {
		// Clear the map renderer reference from the COP service
		this.copService.setMapRendererRef(null);
		this._unitEditor?.dispose();
		this._unitPlacement?.dispose();
		this._drawTools?.dispose();
		this._coordinateDisplay?.dispose();
		this._layerPanel?.dispose();
		this._symbology?.dispose();
		this._mapRenderer?.dispose();
		super.dispose();
	}

	// ─── Private: Map Initialization ──────────────────────────────────────

	private async _initializeMap(): Promise<void> {
		this.logService.info('[Sandtable COP] Initializing map renderer...');

		try {
			// Read settings for map configuration
			const tileSource = this.configurationService.getValue<string>(CopConfigKeys.TileSource) || '';
			const basemapTheme = (this.configurationService.getValue<string>(CopConfigKeys.BasemapTheme) || 'light') as CopBasemapTheme;
			const defaultCenterStr = this.configurationService.getValue<string>(CopConfigKeys.DefaultCenter) || '0,0';
			const defaultZoom = this.configurationService.getValue<number>(CopConfigKeys.DefaultZoom) || 3;
			const coordFormat = (this.configurationService.getValue<string>(CopConfigKeys.DefaultCoordinateFormat) || 'mgrs') as CopCoordinateFormat;
			const showCoords = this.configurationService.getValue<boolean>(CopConfigKeys.ShowCoordinateDisplay) !== false;

			// Parse default center
			const centerParts = defaultCenterStr.split(',').map(s => parseFloat(s.trim()));
			const center: [number, number] = [
				isFinite(centerParts[0]) ? centerParts[0] : 0,
				isFinite(centerParts[1]) ? centerParts[1] : 0,
			];

			// Create map renderer (constructor triggers async dependency loading + map init)
			const appRoot = this.environmentService.appRoot;
			this._mapRenderer = this._register(new SandtableCopMapRenderer(
				this.mapContainer,
				appRoot,
				tileSource,
				basemapTheme,
				center,
				defaultZoom,
				this.logService,
			));

			// Wait for the map renderer to finish loading dependencies and initializing
			await this._mapRenderer.ready;

			// Register the map renderer with the COP service so tools can access it (e.g., snapshot capture)
			this.copService.setMapRendererRef(this._mapRenderer);

			// Now that the map is ready, set up components that depend on the map instance

			// Initialize coordinate display
			if (showCoords) {
				this._coordinateDisplay = this._register(new SandtableCopCoordinateDisplay(
					this.coordinateContainer,
					this._mapRenderer,
					coordFormat,
				));
				// Set up the mousemove listener now that the map exists
				this._coordinateDisplay.setupMapListener();
			} else {
				this.coordinateContainer.style.display = 'none';
			}

			// Initialize layer panel
			this._layerPanel = this._register(new SandtableCopLayerPanel(
				this.layerSidebar,
				this._mapRenderer,
				this.copService,
			));

			// Initialize draw tools
			this._drawTools = this._register(new SandtableCopDrawTools(
				this.toolbarLeft,
				this._mapRenderer,
				this.copService,
				this.logService,
			));

			// Build layer toggle button in toolbar
			this._buildLayerToggle(this.toolbarLeft);

			// Initialize symbology engine (milsymbol)
			this._symbology = this._register(new SandtableCopSymbology(this.logService));
			const symbolSize = this.configurationService.getValue<number>(CopConfigKeys.UnitSymbolSize) || 35;
			this._symbology.setDefaultSize(symbolSize);
			await this._symbology.initialize();

			// Initialize unit placement (right-click context menu)
			this._unitPlacement = this._register(new SandtableCopUnitPlacement(
				this.mapContainer,
				this._mapRenderer,
				this._symbology,
				this.copService,
				this.logService,
			));

			// Initialize unit properties editor
			this._unitEditor = this._register(new SandtableCopUnitEditor(
				this.mapContainer,
				this._mapRenderer,
				this._symbology,
				this.copService,
				this.logService,
			));

			// Listen to ORBAT changes to update unit symbols on the map
			this._register(this.copService.onOrbatChanged(() => {
				this._updateUnitsSource().catch(err => {
					this.logService.error('[Sandtable COP] Failed to update units source:', err);
				});
			}));

			// Render any units that were already loaded before the COP page opened
			// (e.g., restored from workspace files at startup by SandtableCopOrbatIO)
			this._updateUnitsSource().catch(err => {
				this.logService.error('[Sandtable COP] Failed to render pre-loaded units:', err);
			});

			// Re-render unit symbols after theme switch (style.load destroys all images)
			this._register(this._mapRenderer.onSourcesReady(() => {
				this._reloadUnitsAfterStyleSwitch();
			}));

			// Handle unit click on map for selection
			this._setupUnitClickHandler();

			// Update COP service state from map events
			this._register(this._mapRenderer.onMapMoved((state) => {
				this.copService.setMapState({
					center: state.center,
					zoom: state.zoom,
					bearing: state.bearing,
					pitch: state.pitch,
				});
			}));

			this.logService.info('[Sandtable COP] Map renderer initialized.');

		} catch (err) {
			this.logService.error('[Sandtable COP] Failed to initialize map:', err);
		}
	}

	// ─── Private: Toolbar Builders ────────────────────────────────────────

	private _buildBasemapPicker(parent: HTMLElement): void {
		const select = dom.append(parent, $('select.cop-basemap-picker')) as HTMLSelectElement;
		const themes = ['light', 'dark', 'grayscale', 'white', 'black'];
		const currentTheme = this.configurationService.getValue<string>(CopConfigKeys.BasemapTheme) || 'light';

		for (const theme of themes) {
			const opt = dom.append(select, $('option')) as HTMLOptionElement;
			opt.value = theme;
			opt.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
			if (theme === currentTheme) {
				opt.selected = true;
			}
		}

		this._register(dom.addDisposableListener(select, 'change', () => {
			const newTheme = select.value as CopBasemapTheme;
			this.configurationService.updateValue(CopConfigKeys.BasemapTheme, newTheme);
			this._mapRenderer?.setTheme(newTheme);
		}));
	}

	private _buildMgrsGridToggle(parent: HTMLElement): void {
		const btn = dom.append(parent, $('button.cop-btn'));
		btn.title = nls.localize('sandtable.cop.mgrsGrid', "MGRS Grid");
		dom.append(btn, $('span' + ThemeIcon.asCSSSelector(Codicon.symbolRuler)));

		const isEnabled = this.configurationService.getValue<boolean>(CopConfigKeys.MgrsGridEnabled) || false;
		if (isEnabled) {
			btn.classList.add('active');
		}

		this._register(dom.addDisposableListener(btn, 'click', () => {
			const current = this.configurationService.getValue<boolean>(CopConfigKeys.MgrsGridEnabled) || false;
			const newVal = !current;
			this.configurationService.updateValue(CopConfigKeys.MgrsGridEnabled, newVal);
			btn.classList.toggle('active', newVal);
		}));
	}

	private _buildLayerToggle(parent: HTMLElement): void {
		const btn = dom.append(parent, $('button.cop-btn'));
		btn.title = nls.localize('sandtable.cop.layers', "Layers");
		dom.append(btn, $('span' + ThemeIcon.asCSSSelector(Codicon.layers)));

		this._register(dom.addDisposableListener(btn, 'click', () => {
			const isOpen = this.layerSidebar.classList.toggle('open');
			btn.classList.toggle('active', isOpen);
			// After sidebar toggle, trigger map resize
			setTimeout(() => this._mapRenderer?.resize(), 250);
		}));
	}

	// ─── Unit Rendering ───────────────────────────────────────────────────

	/**
	 * Update the cop-units GeoJSON source with current unit data.
	 * For each unit, ensures its milsymbol image is registered with the map.
	 */
	private async _updateUnitsSource(): Promise<void> {
		const map = this._mapRenderer?.map;
		if (!map || !this._symbology?.isReady) {
			return;
		}

		const units = this.copService.getUnits();
		const features: any[] = [];

		for (const unit of units) {
			// Ensure symbol image is registered with the map
			const iconImageId = await this._symbology.generateSymbolImage(
				map,
				unit.properties.sidc,
				{
					uniqueDesignation: unit.properties.designation,
					higherFormation: unit.properties.higherFormation,
				},
			);

			features.push({
				type: 'Feature',
				id: unit.id,
				geometry: {
					type: 'Point',
					coordinates: unit.coordinates,
				},
				properties: {
					unitId: unit.id,
					iconImageId: iconImageId || '',
					designation: unit.properties.designation,
					affiliation: unit.properties.affiliation,
					echelon: unit.properties.echelon,
					status: unit.properties.status,
					layerId: unit.properties.layerId,
				},
			});
		}

		const source = map.getSource('cop-units');
		if (source && 'setData' in source) {
			(source as any).setData({
				type: 'FeatureCollection',
				features,
			});
		}
	}

	/**
	 * After a style switch, re-register all symbol images and re-push unit data.
	 */
	private async _reloadUnitsAfterStyleSwitch(): Promise<void> {
		const map = this._mapRenderer?.map;
		if (!map || !this._symbology) {
			return;
		}

		const units = this.copService.getUnits();
		await this._symbology.reloadAllSymbols(map, units);
		await this._updateUnitsSource();
	}

	/**
	 * Set up click handler on the cop-units-layer to select units on map click.
	 */
	private _setupUnitClickHandler(): void {
		const map = this._mapRenderer?.map;
		if (!map) {
			return;
		}

		// Click on a unit feature to select it
		map.on('click', 'cop-units-layer', (e: any) => {
			if (e.features && e.features.length > 0) {
				const unitId = e.features[0].properties?.unitId;
				if (unitId) {
					this.copService.selectUnit(unitId);
				}
			}
		});

		// Change cursor to pointer when hovering over a unit
		map.on('mouseenter', 'cop-units-layer', () => {
			map.getCanvas().style.cursor = 'pointer';
		});
		map.on('mouseleave', 'cop-units-layer', () => {
			map.getCanvas().style.cursor = '';
		});

		// Click on empty map area deselects
		map.on('click', (e: any) => {
			const features = map.queryRenderedFeatures(e.point, { layers: ['cop-units-layer'] });
			if (!features || features.length === 0) {
				this.copService.selectUnit(null);
			}
		});

		// When a unit is selected (from tree or other source), fly to it
		this._register(this.copService.onUnitSelected((unitId) => {
			if (unitId) {
				const unit = this.copService.getUnit(unitId);
				if (unit) {
					map.flyTo({
						center: unit.coordinates,
						zoom: Math.max(map.getZoom(), 10),
						duration: 800,
					});
				}
			}
		}));
	}
}

// ─── Serializer ───────────────────────────────────────────────────────────────

export class SandtableCopInputSerializer implements IEditorSerializer {
	canSerialize(_input: EditorInput): boolean {
		return _input instanceof SandtableCopInput;
	}

	serialize(_input: SandtableCopInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): SandtableCopInput {
		return instantiationService.createInstance(SandtableCopInput);
	}
}
