/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';

// ─── Service Decorator ────────────────────────────────────────────────────────

export const ISandtableCopService = createDecorator<ISandtableCopService>('sandtableCopService');

// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type CopBasemapTheme = 'light' | 'dark' | 'grayscale' | 'white' | 'black';
export type CopCoordinateFormat = 'mgrs' | 'latlon' | 'utm';
export type CopSymbologyStandard = '2525C' | '2525D' | '2525E' | 'APP6B' | 'APP6D' | 'APP6E';

export type CopLayerType =
	| 'friendly-orbat'
	| 'enemy-orbat'
	| 'neutral-orbat'
	| 'terrain-analysis'
	| 'intelligence'
	| 'logistics'
	| 'fire-support'
	| 'communications'
	| 'annotation'
	| 'custom';

export type CopAnnotationType =
	| 'phase-line'
	| 'axis-of-advance'
	| 'boundary'
	| 'engagement-area'
	| 'objective'
	| 'no-fire-area'
	| 'route'
	| 'freeform-line'
	| 'freeform-polygon'
	| 'freeform-point'
	| 'text-label';

export type CopAffiliation = 'friendly' | 'hostile' | 'neutral' | 'unknown';

export type CopEchelon =
	| 'team' | 'squad' | 'section' | 'platoon'
	| 'company' | 'battalion' | 'regiment' | 'brigade'
	| 'division' | 'corps' | 'army' | 'army_group'
	| 'theater' | 'command';

export type CopUnitStatus =
	| 'operational' | 'degraded' | 'not_operational' | 'destroyed'
	| 'anticipated' | 'planned' | 'present' | 'fully_capable';

// ─── State Interfaces ─────────────────────────────────────────────────────────

export interface ISandtableCopState {
	/** Map center as [longitude, latitude] */
	center: [number, number];
	/** Current zoom level (0-22) */
	zoom: number;
	/** Map bearing/rotation in degrees (0 = north up) */
	bearing: number;
	/** Map pitch in degrees (0 = looking straight down) */
	pitch: number;
	/** Active basemap theme */
	basemapTheme: CopBasemapTheme;
	/** Configured tile source (path or URL to .pmtiles file) */
	tileSource: string;
	/** Active layer IDs (visible layers) */
	visibleLayerIds: string[];
	/** Current scenario phase index */
	currentPhase: number;
	/** Whether MGRS grid overlay is shown */
	mgrsGridVisible: boolean;
	/** Coordinate display format preference */
	coordinateFormat: CopCoordinateFormat;
	/** Active drawing mode (null if not drawing) */
	activeDrawMode: string | null;
}

// ─── Layer Interface ──────────────────────────────────────────────────────────

export interface ICopLayer {
	/** Unique layer identifier */
	id: string;
	/** Display name (e.g., 'Friendly ORBAT', 'Enemy ORBAT', 'Annotations') */
	name: string;
	/** Layer type for categorization */
	type: CopLayerType;
	/** Whether this layer is currently visible */
	visible: boolean;
	/** Layer opacity (0.0 - 1.0) */
	opacity: number;
	/** Rendering order (lower = rendered first / below) */
	zIndex: number;
	/** Color associated with this layer (for UI indicators) */
	color: string;
	/** Whether units/annotations on this layer are editable */
	locked: boolean;
}

// ─── Annotation Interfaces ────────────────────────────────────────────────────

export interface ICopAnnotationStyle {
	strokeColor: string;
	strokeWidth: number;
	strokeDash?: number[];
	fillColor?: string;
	fillOpacity?: number;
	iconSize?: number;
}

export interface ICopAnnotation {
	/** Unique annotation ID */
	id: string;
	/** Layer this annotation belongs to */
	layerId: string;
	/** Annotation type */
	type: CopAnnotationType;
	/** GeoJSON geometry (Point, LineString, Polygon) */
	geometry: ICopGeoJsonGeometry;
	/** Display properties */
	style: ICopAnnotationStyle;
	/** Label text */
	label: string;
	/** Military designation (e.g., 'PL ALPHA', 'OBJ WOLF', 'EA KILL') */
	militaryDesignation?: string;
	/** Phase this annotation belongs to */
	phase?: number;
}

/**
 * Simplified GeoJSON geometry type for annotation storage.
 * Full GeoJSON types will be used when rendering.
 */
export interface ICopGeoJsonGeometry {
	type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';
	coordinates: number[] | number[][] | number[][][] | number[][][][];
}

// ─── Unit Interfaces (Phase 1 stubs -- full impl in Phase 2) ─────────────────

export interface ICopUnit {
	/** Unique identifier (e.g., 'unit-001') */
	id: string;
	/** Position as [longitude, latitude] */
	coordinates: [number, number];
	/** Unit properties */
	properties: ICopUnitProperties;
}

export interface ICopUnitProperties {
	sidc: string;
	designation: string;
	name: string;
	affiliation: CopAffiliation;
	echelon: CopEchelon;
	unitType: string;
	strength: number;
	status: CopUnitStatus;
	commander: string;
	higherFormation: string;
	scenarioPhase: number;
	directionOfMovement?: number;
	speed?: number;
	notes: string;
	layerId: string;
	textModifiers?: Record<string, string>;
}

export interface ICopOrbat {
	name: string;
	standard: CopSymbologyStandard;
	roots: string[];
	tree: Record<string, string[]>;
}

// ─── Filter and Query Types ───────────────────────────────────────────────────

export interface ICopUnitFilter {
	affiliation?: CopAffiliation;
	echelon?: CopEchelon;
	layerId?: string;
	bbox?: [number, number, number, number];
	mgrsZone?: string;
	unitType?: string;
	status?: CopUnitStatus;
	phase?: number;
}

export interface ICopMapSummary {
	center: { mgrs: string; latlon: [number, number] };
	zoom: number;
	basemapTheme: string;
	currentPhase: number;
	totalPhases: number;
	unitCounts: Record<CopAffiliation, number>;
	activeLayers: string[];
	annotationCount: number;
}

export interface ICopUnitSummary {
	id: string;
	designation: string;
	sidc: string;
	affiliation: CopAffiliation;
	echelon: CopEchelon;
	position: { mgrs: string; latlon: [number, number] };
	status: CopUnitStatus;
	layerId: string;
}

export interface ICopUnitDetail extends ICopUnitSummary {
	name: string;
	unitType: string;
	strength: number;
	commander: string;
	higherFormation: string;
	subordinates: string[];
	notes: string;
	directionOfMovement?: number;
	speed?: number;
	textModifiers: Record<string, string>;
}

export interface ICopSpatialQuery {
	type: 'distance' | 'bearing' | 'area' | 'buffer' | 'point-in-polygon' | 'units-in-radius';
	from?: string | [number, number];
	to?: string | [number, number];
	center?: string | [number, number];
	radiusKm?: number;
	polygon?: [number, number][];
	point?: [number, number];
}

export interface ICopSpatialResult {
	queryType: string;
	distanceKm?: number;
	bearingDeg?: number;
	areaKm2?: number;
	bufferPolygon?: ICopGeoJsonGeometry;
	unitsInRadius?: ICopUnitSummary[];
	pointInPolygon?: boolean;
}

// ─── Timeline Types (Phase 1 stubs -- full impl in Phase 4) ──────────────────

export interface ICopTimelineEvent {
	id: string;
	name: string;
	description: string;
	type: string;
	phase: number;
	timeOffset: number;
	affectedUnitIds: string[];
	layerId?: string;
	coordinates?: [number, number];
	data: Record<string, unknown>;
}

export interface ICopPhase {
	index: number;
	name: string;
	description: string;
	durationMinutes: number;
}

export interface ICopScenario {
	id: string;
	name: string;
	description: string;
	author: string;
	createdAt: string;
	updatedAt: string;
	symbologyStandard: CopSymbologyStandard;
	initialMapState: ISandtableCopState;
	orbats: ICopOrbat[];
	layers: ICopLayer[];
	phases: ICopPhase[];
	events: ICopTimelineEvent[];
	metadata: Record<string, string>;
}

// ─── ISandtableCopService ─────────────────────────────────────────────────────

export interface ISandtableCopService {
	readonly _serviceBrand: undefined;

	// --- State Events ---
	readonly onMapStateChanged: Event<ISandtableCopState>;
	readonly onOrbatChanged: Event<ICopOrbat>;
	readonly onLayersChanged: Event<ICopLayer[]>;
	readonly onTimelineChanged: Event<ICopTimelineEvent[]>;
	readonly onUnitSelected: Event<string | null>;

	// --- Map State ---
	getMapState(): ISandtableCopState;
	setMapState(state: Partial<ISandtableCopState>): void;

	// --- Unit Management ---
	getUnits(filter?: ICopUnitFilter): ICopUnit[];
	getUnit(unitId: string): ICopUnit | undefined;
	addUnit(unit: ICopUnit): void;
	updateUnit(unitId: string, changes: Partial<ICopUnitProperties>): void;
	moveUnit(unitId: string, coordinates: [number, number]): void;
	removeUnit(unitId: string): void;

	// --- Unit Selection ---
	selectUnit(unitId: string | null): void;
	getSelectedUnitId(): string | null;

	// --- ORBAT (Phase 2) ---
	getOrbat(): ICopOrbat;
	setOrbat(orbat: ICopOrbat): void;
	getOrbatSubtree(rootUnitId: string): ICopUnit[];

	// --- Layers ---
	getLayers(): ICopLayer[];
	getLayer(layerId: string): ICopLayer | undefined;
	addLayer(layer: ICopLayer): void;
	updateLayer(layerId: string, changes: Partial<ICopLayer>): void;
	removeLayer(layerId: string): void;
	setLayerVisibility(layerId: string, visible: boolean): void;
	setLayerOpacity(layerId: string, opacity: number): void;

	// --- Scenario (Phase 4) ---
	getScenario(): ICopScenario | undefined;
	loadScenario(scenarioUri: URI): Promise<void>;
	saveScenario(scenarioUri: URI): Promise<void>;

	// --- Timeline (Phase 4) ---
	getTimelineEvents(): ICopTimelineEvent[];
	addTimelineEvent(event: ICopTimelineEvent): void;
	removeTimelineEvent(eventId: string): void;
	getCurrentPhase(): number;
	setCurrentPhase(phase: number): void;
	getPhases(): ICopPhase[];

	// --- Query (Phase 3 -- agent tools) ---
	queryMapSummary(): ICopMapSummary;
	queryUnitsFiltered(filter: ICopUnitFilter): ICopUnitSummary[];
	queryUnitDetail(unitId: string): ICopUnitDetail | undefined;
	querySpatial(query: ICopSpatialQuery): ICopSpatialResult;

	// --- Map Renderer Reference (Phase 3 -- for snapshot capture) ---
	/** Set the active map renderer reference (called by COP EditorPane) */
	setMapRendererRef(renderer: unknown): void;
	/** Get the active map renderer reference (used by snapshot capture) */
	getMapRendererRef(): unknown;

	// --- Snapshot (Phase 3) ---
	captureSnapshot(): Promise<string>;

	// --- Persistence (Phase 4) ---
	loadFromWorkspace(workspaceUri: URI): Promise<void>;
	saveToWorkspace(workspaceUri: URI): Promise<void>;

	// --- Annotations / Overlays ---
	getAnnotations(layerId?: string): ICopAnnotation[];
	addAnnotation(annotation: ICopAnnotation): void;
	removeAnnotation(annotationId: string): void;
}
