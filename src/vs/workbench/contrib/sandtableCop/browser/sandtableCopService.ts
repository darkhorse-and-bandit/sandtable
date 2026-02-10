/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import {
	ISandtableCopService,
	ISandtableCopState,
	ICopLayer,
	ICopAnnotation,
	ICopUnit,
	ICopUnitProperties,
	ICopUnitFilter,
	ICopOrbat,
	ICopTimelineEvent,
	ICopPhase,
	ICopScenario,
	ICopMapSummary,
	ICopUnitSummary,
	ICopUnitDetail,
	ICopSpatialQuery,
	ICopSpatialResult,
} from '../../../../platform/cortex/common/copTypes.js';

// ─── Default Layers ───────────────────────────────────────────────────────────

const DEFAULT_LAYERS: ICopLayer[] = [
	{
		id: 'friendly-orbat',
		name: 'Friendly ORBAT',
		type: 'friendly-orbat',
		visible: true,
		opacity: 1.0,
		zIndex: 10,
		color: '#2196f3',
		locked: false,
	},
	{
		id: 'enemy-orbat',
		name: 'Enemy ORBAT',
		type: 'enemy-orbat',
		visible: true,
		opacity: 1.0,
		zIndex: 20,
		color: '#f44336',
		locked: false,
	},
	{
		id: 'annotations',
		name: 'Annotations',
		type: 'annotation',
		visible: true,
		opacity: 1.0,
		zIndex: 30,
		color: '#ffc107',
		locked: false,
	},
];

// ─── Default State ────────────────────────────────────────────────────────────

function createDefaultState(): ISandtableCopState {
	return {
		center: [0, 0],
		zoom: 3,
		bearing: 0,
		pitch: 0,
		basemapTheme: 'light',
		tileSource: '',
		visibleLayerIds: DEFAULT_LAYERS.filter(l => l.visible).map(l => l.id),
		currentPhase: 0,
		mgrsGridVisible: false,
		coordinateFormat: 'mgrs',
		activeDrawMode: null,
	};
}

// ─── SandtableCopService ──────────────────────────────────────────────────────

export class SandtableCopService extends Disposable implements ISandtableCopService {

	declare readonly _serviceBrand: undefined;

	// --- Events ---
	private readonly _onMapStateChanged = this._register(new Emitter<ISandtableCopState>());
	readonly onMapStateChanged: Event<ISandtableCopState> = this._onMapStateChanged.event;

	private readonly _onOrbatChanged = this._register(new Emitter<ICopOrbat>());
	readonly onOrbatChanged: Event<ICopOrbat> = this._onOrbatChanged.event;

	private readonly _onLayersChanged = this._register(new Emitter<ICopLayer[]>());
	readonly onLayersChanged: Event<ICopLayer[]> = this._onLayersChanged.event;

	private readonly _onTimelineChanged = this._register(new Emitter<ICopTimelineEvent[]>());
	readonly onTimelineChanged: Event<ICopTimelineEvent[]> = this._onTimelineChanged.event;

	private readonly _onUnitSelected = this._register(new Emitter<string | null>());
	readonly onUnitSelected: Event<string | null> = this._onUnitSelected.event;

	// --- State ---
	private _mapState: ISandtableCopState;
	private _layers: ICopLayer[];
	private _units: Map<string, ICopUnit> = new Map();
	private _annotations: ICopAnnotation[] = [];
	private _orbat: ICopOrbat;
	private _timelineEvents: ICopTimelineEvent[] = [];
	private _phases: ICopPhase[] = [];
	private _selectedUnitId: string | null = null;

	/** Reference to the active map renderer (set by COP EditorPane, used by snapshot) */
	private _mapRendererRef: unknown = null;

	constructor() {
		super();
		this._mapState = createDefaultState();
		this._layers = DEFAULT_LAYERS.map(l => ({ ...l }));
		this._orbat = {
			name: 'Default ORBAT',
			standard: '2525D',
			roots: [],
			tree: {},
		};
	}

	// ─── Map State ────────────────────────────────────────────────────────

	getMapState(): ISandtableCopState {
		return { ...this._mapState };
	}

	setMapState(state: Partial<ISandtableCopState>): void {
		this._mapState = { ...this._mapState, ...state };
		this._onMapStateChanged.fire(this._mapState);
	}

	// ─── Unit Management ──────────────────────────────────────────────────

	getUnits(filter?: ICopUnitFilter): ICopUnit[] {
		let units = Array.from(this._units.values());
		if (filter) {
			if (filter.affiliation) {
				units = units.filter(u => u.properties.affiliation === filter.affiliation);
			}
			if (filter.echelon) {
				units = units.filter(u => u.properties.echelon === filter.echelon);
			}
			if (filter.layerId) {
				units = units.filter(u => u.properties.layerId === filter.layerId);
			}
			if (filter.unitType) {
				units = units.filter(u => u.properties.unitType === filter.unitType);
			}
			if (filter.status) {
				units = units.filter(u => u.properties.status === filter.status);
			}
			if (filter.bbox) {
				const [west, south, east, north] = filter.bbox;
				units = units.filter(u => {
					const [lon, lat] = u.coordinates;
					return lon >= west && lon <= east && lat >= south && lat <= north;
				});
			}
		}
		return units;
	}

	getUnit(unitId: string): ICopUnit | undefined {
		return this._units.get(unitId);
	}

	addUnit(unit: ICopUnit): void {
		this._units.set(unit.id, unit);

		// Maintain ORBAT tree: add to parent's children or as a root
		const parentId = unit.properties.higherFormation;
		if (parentId && this._orbat.tree[parentId]) {
			// Add as child of the parent unit
			if (!this._orbat.tree[parentId].includes(unit.id)) {
				this._orbat.tree[parentId].push(unit.id);
			}
		} else {
			// No parent or parent not in tree -- add as root
			if (!this._orbat.roots.includes(unit.id)) {
				this._orbat.roots.push(unit.id);
			}
		}
		// Ensure this unit has a children array in the tree
		if (!this._orbat.tree[unit.id]) {
			this._orbat.tree[unit.id] = [];
		}

		this._onOrbatChanged.fire(this._orbat);
	}

	updateUnit(unitId: string, changes: Partial<ICopUnitProperties>): void {
		const unit = this._units.get(unitId);
		if (unit) {
			const oldParent = unit.properties.higherFormation;
			unit.properties = { ...unit.properties, ...changes };
			const newParent = unit.properties.higherFormation;

			// If parent changed, update ORBAT tree
			if (oldParent !== newParent) {
				this._reparentUnitInTree(unitId, oldParent, newParent);
			}

			this._onOrbatChanged.fire(this._orbat);
		}
	}

	moveUnit(unitId: string, coordinates: [number, number]): void {
		const unit = this._units.get(unitId);
		if (unit) {
			unit.coordinates = coordinates;
			this._onOrbatChanged.fire(this._orbat);
		}
	}

	removeUnit(unitId: string): void {
		if (!this._units.has(unitId)) {
			return;
		}

		// Clean up ORBAT tree references
		// Remove from parent's children
		const unit = this._units.get(unitId)!;
		const parentId = unit.properties.higherFormation;
		if (parentId && this._orbat.tree[parentId]) {
			this._orbat.tree[parentId] = this._orbat.tree[parentId].filter(id => id !== unitId);
		}

		// Remove from roots
		this._orbat.roots = this._orbat.roots.filter(id => id !== unitId);

		// Re-parent children to the removed unit's parent (or make them roots)
		const children = this._orbat.tree[unitId] || [];
		for (const childId of children) {
			if (parentId && this._orbat.tree[parentId]) {
				this._orbat.tree[parentId].push(childId);
			} else {
				this._orbat.roots.push(childId);
			}
			// Update child unit's higherFormation
			const child = this._units.get(childId);
			if (child) {
				child.properties.higherFormation = parentId || '';
			}
		}

		// Delete from tree and units
		delete this._orbat.tree[unitId];
		this._units.delete(unitId);

		// Clear selection if the deleted unit was selected
		if (this._selectedUnitId === unitId) {
			this.selectUnit(null);
		}

		this._onOrbatChanged.fire(this._orbat);
	}

	// ─── Unit Selection ───────────────────────────────────────────────────

	selectUnit(unitId: string | null): void {
		if (this._selectedUnitId !== unitId) {
			this._selectedUnitId = unitId;
			this._onUnitSelected.fire(unitId);
		}
	}

	getSelectedUnitId(): string | null {
		return this._selectedUnitId;
	}

	// ─── ORBAT ────────────────────────────────────────────────────────────

	getOrbat(): ICopOrbat {
		return { ...this._orbat };
	}

	setOrbat(orbat: ICopOrbat): void {
		this._orbat = orbat;
		this._onOrbatChanged.fire(this._orbat);
	}

	getOrbatSubtree(rootUnitId: string): ICopUnit[] {
		const result: ICopUnit[] = [];
		const queue = [rootUnitId];
		while (queue.length > 0) {
			const id = queue.shift()!;
			const unit = this._units.get(id);
			if (unit) {
				result.push(unit);
			}
			const children = this._orbat.tree[id];
			if (children) {
				queue.push(...children);
			}
		}
		return result;
	}

	// ─── Layers ───────────────────────────────────────────────────────────

	getLayers(): ICopLayer[] {
		return this._layers.map(l => ({ ...l }));
	}

	getLayer(layerId: string): ICopLayer | undefined {
		const layer = this._layers.find(l => l.id === layerId);
		return layer ? { ...layer } : undefined;
	}

	addLayer(layer: ICopLayer): void {
		this._layers.push(layer);
		this._onLayersChanged.fire(this._layers);
	}

	updateLayer(layerId: string, changes: Partial<ICopLayer>): void {
		const idx = this._layers.findIndex(l => l.id === layerId);
		if (idx >= 0) {
			this._layers[idx] = { ...this._layers[idx], ...changes };
			this._onLayersChanged.fire(this._layers);
		}
	}

	removeLayer(layerId: string): void {
		this._layers = this._layers.filter(l => l.id !== layerId);
		this._onLayersChanged.fire(this._layers);
	}

	setLayerVisibility(layerId: string, visible: boolean): void {
		const layer = this._layers.find(l => l.id === layerId);
		if (layer) {
			layer.visible = visible;
			this._mapState.visibleLayerIds = this._layers.filter(l => l.visible).map(l => l.id);
			this._onLayersChanged.fire(this._layers);
		}
	}

	setLayerOpacity(layerId: string, opacity: number): void {
		const layer = this._layers.find(l => l.id === layerId);
		if (layer) {
			layer.opacity = Math.max(0, Math.min(1, opacity));
			this._onLayersChanged.fire(this._layers);
		}
	}

	// ─── Scenario (Phase 4 stubs) ─────────────────────────────────────────

	getScenario(): ICopScenario | undefined {
		return undefined;
	}

	async loadScenario(_scenarioUri: URI): Promise<void> {
		// Phase 4 implementation
	}

	async saveScenario(_scenarioUri: URI): Promise<void> {
		// Phase 4 implementation
	}

	// ─── Timeline (Phase 4 stubs) ─────────────────────────────────────────

	getTimelineEvents(): ICopTimelineEvent[] {
		return [...this._timelineEvents];
	}

	addTimelineEvent(event: ICopTimelineEvent): void {
		this._timelineEvents.push(event);
		this._onTimelineChanged.fire(this._timelineEvents);
	}

	removeTimelineEvent(eventId: string): void {
		this._timelineEvents = this._timelineEvents.filter(e => e.id !== eventId);
		this._onTimelineChanged.fire(this._timelineEvents);
	}

	getCurrentPhase(): number {
		return this._mapState.currentPhase;
	}

	setCurrentPhase(phase: number): void {
		this._mapState.currentPhase = phase;
		this._onMapStateChanged.fire(this._mapState);
	}

	getPhases(): ICopPhase[] {
		return [...this._phases];
	}

	// ─── Query (Phase 3 stubs) ────────────────────────────────────────────

	queryMapSummary(): ICopMapSummary {
		const unitCounts: Record<string, number> = {
			friendly: 0,
			hostile: 0,
			neutral: 0,
			unknown: 0,
		};
		for (const unit of this._units.values()) {
			const aff = unit.properties.affiliation;
			if (aff in unitCounts) {
				unitCounts[aff]++;
			}
		}

		return {
			center: {
				mgrs: '',
				latlon: this._mapState.center,
			},
			zoom: this._mapState.zoom,
			basemapTheme: this._mapState.basemapTheme,
			currentPhase: this._mapState.currentPhase,
			totalPhases: this._phases.length,
			unitCounts: unitCounts as Record<'friendly' | 'hostile' | 'neutral' | 'unknown', number>,
			activeLayers: this._layers.filter(l => l.visible).map(l => l.name),
			annotationCount: this._annotations.length,
		};
	}

	queryUnitsFiltered(filter: ICopUnitFilter): ICopUnitSummary[] {
		return this.getUnits(filter).map(u => ({
			id: u.id,
			designation: u.properties.designation,
			sidc: u.properties.sidc,
			affiliation: u.properties.affiliation,
			echelon: u.properties.echelon,
			position: { mgrs: '', latlon: u.coordinates },
			status: u.properties.status,
			layerId: u.properties.layerId,
		}));
	}

	queryUnitDetail(unitId: string): ICopUnitDetail | undefined {
		const unit = this._units.get(unitId);
		if (!unit) {
			return undefined;
		}
		const children = this._orbat.tree[unitId] || [];
		return {
			id: unit.id,
			designation: unit.properties.designation,
			sidc: unit.properties.sidc,
			affiliation: unit.properties.affiliation,
			echelon: unit.properties.echelon,
			position: { mgrs: '', latlon: unit.coordinates },
			status: unit.properties.status,
			layerId: unit.properties.layerId,
			name: unit.properties.name,
			unitType: unit.properties.unitType,
			strength: unit.properties.strength,
			commander: unit.properties.commander,
			higherFormation: unit.properties.higherFormation,
			subordinates: children,
			notes: unit.properties.notes,
			directionOfMovement: unit.properties.directionOfMovement,
			speed: unit.properties.speed,
			textModifiers: unit.properties.textModifiers || {},
		};
	}

	querySpatial(_query: ICopSpatialQuery): ICopSpatialResult {
		// Phase 3 implementation with Turf.js
		return { queryType: _query.type };
	}

	// ─── Map Renderer Reference (Phase 3) ────────────────────────────────

	setMapRendererRef(renderer: unknown): void {
		this._mapRendererRef = renderer;
	}

	getMapRendererRef(): unknown {
		return this._mapRendererRef;
	}

	// ─── Snapshot (Phase 3) ───────────────────────────────────────────────

	async captureSnapshot(): Promise<string> {
		const renderer = this._mapRendererRef as any;
		if (!renderer || !renderer.map) {
			return '';
		}
		try {
			const canvas = renderer.map.getCanvas() as HTMLCanvasElement;
			return canvas.toDataURL('image/png');
		} catch {
			return '';
		}
	}

	// ─── Persistence (Phase 4 stubs) ──────────────────────────────────────

	async loadFromWorkspace(_workspaceUri: URI): Promise<void> {
		// Phase 4 implementation
	}

	async saveToWorkspace(_workspaceUri: URI): Promise<void> {
		// Phase 4 implementation
	}

	// ─── Annotations ──────────────────────────────────────────────────────

	getAnnotations(layerId?: string): ICopAnnotation[] {
		if (layerId) {
			return this._annotations.filter(a => a.layerId === layerId);
		}
		return [...this._annotations];
	}

	addAnnotation(annotation: ICopAnnotation): void {
		this._annotations.push(annotation);
	}

	removeAnnotation(annotationId: string): void {
		this._annotations = this._annotations.filter(a => a.id !== annotationId);
	}

	// ─── Private ORBAT Tree Helpers ───────────────────────────────────────

	private _reparentUnitInTree(unitId: string, oldParent: string, newParent: string): void {
		// Remove from old parent or roots
		if (oldParent && this._orbat.tree[oldParent]) {
			this._orbat.tree[oldParent] = this._orbat.tree[oldParent].filter(id => id !== unitId);
		} else {
			this._orbat.roots = this._orbat.roots.filter(id => id !== unitId);
		}

		// Add to new parent or roots
		if (newParent && this._orbat.tree[newParent]) {
			if (!this._orbat.tree[newParent].includes(unitId)) {
				this._orbat.tree[newParent].push(unitId);
			}
		} else {
			if (!this._orbat.roots.includes(unitId)) {
				this._orbat.roots.push(unitId);
			}
		}
	}
}

// ─── DI Registration ──────────────────────────────────────────────────────────

registerSingleton(ISandtableCopService, SandtableCopService, InstantiationType.Delayed);
