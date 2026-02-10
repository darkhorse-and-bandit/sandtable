/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import {
	ISandtableCopService,
	ICopUnitFilter,
	ICopMapSummary,
	ICopUnitSummary,
	ICopUnitDetail,
	ICopSpatialQuery,
	ICopSpatialResult,
	ICopUnit,
	CopAffiliation,
} from '../../../../platform/cortex/common/copTypes.js';
import { loadUmdModule } from './sandtableCopMapRenderer.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Earth radius in kilometers (WGS-84 mean radius, same value as @turf/helpers) */
const EARTH_RADIUS_KM = 6371.0088;

/** Degrees to radians conversion factor */
const DEG2RAD = Math.PI / 180;

/** Radians to degrees conversion factor */
const RAD2DEG = 180 / Math.PI;

/** Earth radius in meters (for area calculation, same as @turf/helpers.earthRadius) */
const EARTH_RADIUS_M = 6371008.8;

// ─── Spatial Math (replaces Turf.js -- native implementations) ────────────────

/**
 * Haversine distance between two points in kilometers.
 * Equivalent to @turf/distance with units='kilometers'.
 *
 * @param from [lon, lat] in degrees
 * @param to [lon, lat] in degrees
 * @returns Distance in kilometers
 */
function haversineDistance(from: [number, number], to: [number, number]): number {
	const dLat = DEG2RAD * (to[1] - from[1]);
	const dLon = DEG2RAD * (to[0] - from[0]);
	const lat1 = DEG2RAD * from[1];
	const lat2 = DEG2RAD * to[1];

	const a = Math.pow(Math.sin(dLat / 2), 2)
		+ Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
	return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Initial bearing from one point to another in degrees (0-360).
 * Equivalent to @turf/bearing.
 *
 * @param from [lon, lat] in degrees
 * @param to [lon, lat] in degrees
 * @returns Bearing in degrees (0 = north, clockwise)
 */
function initialBearing(from: [number, number], to: [number, number]): number {
	const lon1 = DEG2RAD * from[0];
	const lon2 = DEG2RAD * to[0];
	const lat1 = DEG2RAD * from[1];
	const lat2 = DEG2RAD * to[1];

	const a = Math.sin(lon2 - lon1) * Math.cos(lat2);
	const b = Math.cos(lat1) * Math.sin(lat2)
		- Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

	const bearingDeg = RAD2DEG * Math.atan2(a, b);
	return (bearingDeg + 360) % 360;
}

/**
 * Spherical polygon area in square kilometers.
 * Equivalent to @turf/area but returns km² instead of m².
 * Uses the spherical excess formula (same as Turf.js implementation).
 *
 * @param polygon Array of [lon, lat] coordinate rings (outer ring only)
 * @returns Area in square kilometers
 */
function sphericalArea(polygon: [number, number][]): number {
	if (!polygon || polygon.length < 3) {
		return 0;
	}

	const coords = polygon;
	const n = coords.length - 1; // last coord = first coord (closed ring)
	if (n <= 2) {
		return 0;
	}

	const FACTOR = (EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
	const PI_OVER_180 = DEG2RAD;

	let total = 0;
	for (let i = 0; i < n; i++) {
		const lower = coords[i];
		const middle = coords[i + 1 === n ? 0 : i + 1];
		const upper = coords[i + 2 >= n ? (i + 2) % n : i + 2];
		const lowerX = lower[0] * PI_OVER_180;
		const middleY = middle[1] * PI_OVER_180;
		const upperX = upper[0] * PI_OVER_180;
		total += (upperX - lowerX) * Math.sin(middleY);
	}

	const areaM2 = Math.abs(total * FACTOR);
	return areaM2 / 1_000_000; // Convert m² to km²
}

/**
 * Ray casting point-in-polygon test.
 * Equivalent to @turf/boolean-point-in-polygon for simple polygons.
 *
 * @param point [lon, lat] to test
 * @param polygon Array of [lon, lat] coordinate rings (outer ring)
 * @returns true if the point is inside the polygon
 */
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
	const x = point[0];
	const y = point[1];
	let inside = false;

	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i][0];
		const yi = polygon[i][1];
		const xj = polygon[j][0];
		const yj = polygon[j][1];

		const intersect = (yi > y) !== (yj > y)
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

		if (intersect) {
			inside = !inside;
		}
	}

	return inside;
}

/**
 * Get compass direction label for a bearing in degrees.
 */
function bearingToCompass(bearing: number): string {
	const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
		'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
	const idx = Math.round(((bearing % 360) + 360) % 360 / 22.5) % 16;
	return dirs[idx];
}

// ─── CopQueryEngine ───────────────────────────────────────────────────────────

/**
 * Query engine for the COP service that provides MGRS-enriched responses
 * and spatial analysis. Wraps ISandtableCopService with coordinate
 * conversion and geographic calculations.
 *
 * MGRS conversion uses the `mgrs` npm package loaded via loadUmdModule().
 * Spatial calculations (distance, bearing, area, point-in-polygon) use
 * native implementations equivalent to the @turf/* packages.
 */
export class CopQueryEngine {

	/** Loaded `mgrs` npm module reference. API: forward([lon,lat], precision) and toPoint(mgrsStr) */
	private _mgrs: any = null;
	private _mgrsLoadAttempted = false;

	constructor(
		private readonly copService: ISandtableCopService,
		private readonly logService: ILogService,
	) { }

	// ─── MGRS Module Loading ──────────────────────────────────────────────

	/**
	 * Lazily load the mgrs npm module. Safe to call multiple times.
	 * Uses the same loadUmdModule pattern as sandtableCopCoordinateDisplay.ts.
	 */
	private async _ensureMgrs(): Promise<void> {
		if (this._mgrs || this._mgrsLoadAttempted) {
			return;
		}
		this._mgrsLoadAttempted = true;
		try {
			this._mgrs = await loadUmdModule<any>('mgrs', 'dist/mgrs.min.js');
			this.logService.debug('[COP QueryEngine] mgrs module loaded');
		} catch (err) {
			this.logService.warn('[COP QueryEngine] Failed to load mgrs module, MGRS conversion unavailable:', err);
			this._mgrs = null;
		}
	}

	// ─── Public: Coordinate Conversion ────────────────────────────────────

	/**
	 * Convert [lon, lat] to MGRS string at the given precision.
	 * Falls back to "lat, lon" string if mgrs module unavailable.
	 *
	 * @param lon Longitude in degrees
	 * @param lat Latitude in degrees
	 * @param precision MGRS precision (5 = 1m, 4 = 10m, 3 = 100m)
	 */
	async toMGRS(lon: number, lat: number, precision: number = 5): Promise<string> {
		await this._ensureMgrs();
		if (!this._mgrs) {
			return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
		}
		try {
			return this._mgrs.forward([lon, lat], precision);
		} catch {
			return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
		}
	}

	/**
	 * Convert an MGRS string to [lon, lat].
	 * Throws if the mgrs module is unavailable or the string is invalid.
	 */
	async fromMGRS(mgrsString: string): Promise<[number, number]> {
		await this._ensureMgrs();
		if (!this._mgrs) {
			throw new Error('MGRS conversion unavailable (mgrs module not loaded)');
		}
		try {
			const point = this._mgrs.toPoint(mgrsString);
			return [point[0], point[1]];
		} catch (err) {
			throw new Error(`Invalid MGRS string "${mgrsString}": ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// ─── Public: Coordinate Resolution ────────────────────────────────────

	/**
	 * Resolve a unit ID, designation, or coordinate pair to [lon, lat].
	 * Supports:
	 *  - Direct coordinate arrays [lon, lat]
	 *  - Unit ID strings (exact match on copService.getUnit())
	 *  - Unit designation strings (fuzzy case-insensitive partial match)
	 */
	resolveUnitCoordinates(idOrDesignation: string): [number, number] | undefined {
		// Try exact unit ID match
		const unit = this.copService.getUnit(idOrDesignation);
		if (unit) {
			return unit.coordinates;
		}

		// Try fuzzy designation match
		const needle = idOrDesignation.toLowerCase();
		const allUnits = this.copService.getUnits();
		const match = allUnits.find(u =>
			u.properties.designation.toLowerCase().includes(needle)
			|| u.properties.name.toLowerCase().includes(needle)
		);
		if (match) {
			return match.coordinates;
		}

		return undefined;
	}

	/**
	 * Find a unit by ID or designation. Returns the unit or undefined.
	 */
	findUnit(idOrDesignation: string): ICopUnit | undefined {
		// Try exact unit ID match
		const unit = this.copService.getUnit(idOrDesignation);
		if (unit) {
			return unit;
		}

		// Try fuzzy designation match
		const needle = idOrDesignation.toLowerCase();
		const allUnits = this.copService.getUnits();
		return allUnits.find(u =>
			u.properties.designation.toLowerCase().includes(needle)
			|| u.properties.name.toLowerCase().includes(needle)
		);
	}

	// ─── Public: Map Summary Query ────────────────────────────────────────

	/**
	 * Returns a high-level map summary with MGRS center coordinates.
	 */
	async queryMapSummary(): Promise<ICopMapSummary> {
		const state = this.copService.getMapState();
		const units = this.copService.getUnits();
		const layers = this.copService.getLayers();
		const annotations = this.copService.getAnnotations();
		const phases = this.copService.getPhases();

		const unitCounts: Record<CopAffiliation, number> = {
			friendly: 0,
			hostile: 0,
			neutral: 0,
			unknown: 0,
		};
		for (const unit of units) {
			const aff = unit.properties.affiliation;
			if (aff in unitCounts) {
				unitCounts[aff]++;
			}
		}

		const centerMgrs = await this.toMGRS(state.center[0], state.center[1]);

		return {
			center: {
				mgrs: centerMgrs,
				latlon: state.center,
			},
			zoom: state.zoom,
			basemapTheme: state.basemapTheme,
			currentPhase: state.currentPhase,
			totalPhases: phases.length,
			unitCounts,
			activeLayers: layers.filter(l => l.visible).map(l => l.name),
			annotationCount: annotations.length,
		};
	}

	// ─── Public: Filtered Unit Query ──────────────────────────────────────

	/**
	 * Returns filtered units with MGRS positions.
	 */
	async queryUnitsFiltered(filter: ICopUnitFilter): Promise<ICopUnitSummary[]> {
		const units = this.copService.getUnits(filter);
		const results: ICopUnitSummary[] = [];

		for (const u of units) {
			const mgrs = await this.toMGRS(u.coordinates[0], u.coordinates[1]);
			results.push({
				id: u.id,
				designation: u.properties.designation,
				sidc: u.properties.sidc,
				affiliation: u.properties.affiliation,
				echelon: u.properties.echelon,
				position: { mgrs, latlon: u.coordinates },
				status: u.properties.status,
				layerId: u.properties.layerId,
			});
		}

		return results;
	}

	// ─── Public: Unit Detail Query ────────────────────────────────────────

	/**
	 * Returns full detail for a single unit with MGRS position.
	 */
	async queryUnitDetail(unitId: string): Promise<ICopUnitDetail | undefined> {
		const unit = this.copService.getUnit(unitId);
		if (!unit) {
			return undefined;
		}

		const orbat = this.copService.getOrbat();
		const children = orbat.tree[unitId] || [];
		const mgrs = await this.toMGRS(unit.coordinates[0], unit.coordinates[1]);

		return {
			id: unit.id,
			designation: unit.properties.designation,
			sidc: unit.properties.sidc,
			affiliation: unit.properties.affiliation,
			echelon: unit.properties.echelon,
			position: { mgrs, latlon: unit.coordinates },
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

	// ─── Public: Spatial Query ─────────────────────────────────────────────

	/**
	 * Execute a spatial query (distance, bearing, area, units-in-radius, point-in-polygon).
	 * Uses native implementations of geographic formulas.
	 */
	async querySpatial(query: ICopSpatialQuery): Promise<ICopSpatialResult> {
		switch (query.type) {
			case 'distance':
				return this._queryDistance(query);
			case 'bearing':
				return this._queryBearing(query);
			case 'area':
				return this._queryArea(query);
			case 'units-in-radius':
				return this._queryUnitsInRadius(query);
			case 'point-in-polygon':
				return this._queryPointInPolygon(query);
			case 'buffer':
				return this._queryBuffer(query);
			default:
				return { queryType: query.type };
		}
	}

	// ─── Private: Spatial Query Implementations ───────────────────────────

	private async _queryDistance(query: ICopSpatialQuery): Promise<ICopSpatialResult> {
		const from = this._resolveQueryCoords(query.from);
		const to = this._resolveQueryCoords(query.to);

		if (!from || !to) {
			return { queryType: 'distance' };
		}

		const km = haversineDistance(from, to);
		return {
			queryType: 'distance',
			distanceKm: Math.round(km * 100) / 100,
		};
	}

	private async _queryBearing(query: ICopSpatialQuery): Promise<ICopSpatialResult> {
		const from = this._resolveQueryCoords(query.from);
		const to = this._resolveQueryCoords(query.to);

		if (!from || !to) {
			return { queryType: 'bearing' };
		}

		const deg = initialBearing(from, to);
		return {
			queryType: 'bearing',
			bearingDeg: Math.round(deg * 10) / 10,
		};
	}

	private async _queryArea(query: ICopSpatialQuery): Promise<ICopSpatialResult> {
		const polygon = query.polygon;
		if (!polygon || polygon.length < 3) {
			return { queryType: 'area' };
		}

		// Ensure the polygon is closed
		const coords = [...polygon];
		const first = coords[0];
		const last = coords[coords.length - 1];
		if (first[0] !== last[0] || first[1] !== last[1]) {
			coords.push(first);
		}

		const km2 = sphericalArea(coords);
		return {
			queryType: 'area',
			areaKm2: Math.round(km2 * 100) / 100,
		};
	}

	private async _queryUnitsInRadius(query: ICopSpatialQuery): Promise<ICopSpatialResult> {
		const center = this._resolveQueryCoords(query.center);
		const radiusKm = query.radiusKm;

		if (!center || !radiusKm || radiusKm <= 0) {
			return { queryType: 'units-in-radius' };
		}

		const allUnits = this.copService.getUnits();
		const unitsInRadius: Array<{ unit: ICopUnit; distKm: number; bearingDeg: number }> = [];

		for (const unit of allUnits) {
			const dist = haversineDistance(center, unit.coordinates);
			if (dist <= radiusKm) {
				const bear = initialBearing(center, unit.coordinates);
				unitsInRadius.push({ unit, distKm: dist, bearingDeg: bear });
			}
		}

		// Sort by distance ascending
		unitsInRadius.sort((a, b) => a.distKm - b.distKm);

		// Convert to ICopUnitSummary[] with MGRS
		const summaries: ICopUnitSummary[] = [];
		for (const entry of unitsInRadius) {
			const u = entry.unit;
			const mgrs = await this.toMGRS(u.coordinates[0], u.coordinates[1]);
			summaries.push({
				id: u.id,
				designation: u.properties.designation,
				sidc: u.properties.sidc,
				affiliation: u.properties.affiliation,
				echelon: u.properties.echelon,
				position: { mgrs, latlon: u.coordinates },
				status: u.properties.status,
				layerId: u.properties.layerId,
			});
		}

		return {
			queryType: 'units-in-radius',
			unitsInRadius: summaries,
		};
	}

	private async _queryPointInPolygon(query: ICopSpatialQuery): Promise<ICopSpatialResult> {
		const point = query.point;
		const polygon = query.polygon;

		if (!point || !polygon || polygon.length < 3) {
			return { queryType: 'point-in-polygon' };
		}

		const inside = pointInPolygon(point, polygon);
		return {
			queryType: 'point-in-polygon',
			pointInPolygon: inside,
		};
	}

	private async _queryBuffer(query: ICopSpatialQuery): Promise<ICopSpatialResult> {
		// Buffer creates a polygon around a point at a given radius.
		// Generate a circle approximation (32 vertices).
		const center = this._resolveQueryCoords(query.center);
		const radiusKm = query.radiusKm;

		if (!center || !radiusKm || radiusKm <= 0) {
			return { queryType: 'buffer' };
		}

		const numVertices = 32;
		const coords: [number, number][] = [];
		for (let i = 0; i <= numVertices; i++) {
			const angle = (i / numVertices) * 360;
			const bearing = DEG2RAD * angle;
			const lat1 = DEG2RAD * center[1];
			const lon1 = DEG2RAD * center[0];
			const d = radiusKm / EARTH_RADIUS_KM;

			const lat2 = Math.asin(
				Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
			);
			const lon2 = lon1 + Math.atan2(
				Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
				Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
			);

			coords.push([RAD2DEG * lon2, RAD2DEG * lat2]);
		}

		return {
			queryType: 'buffer',
			bufferPolygon: {
				type: 'Polygon',
				coordinates: [coords as unknown as number[][]],
			},
		};
	}

	/**
	 * Resolve a query coordinate parameter to [lon, lat].
	 * Handles:
	 *  - [lon, lat] arrays passed directly
	 *  - String unit IDs or designations
	 */
	private _resolveQueryCoords(value: string | [number, number] | undefined): [number, number] | undefined {
		if (!value) {
			return undefined;
		}
		if (Array.isArray(value)) {
			return value;
		}
		if (typeof value === 'string') {
			return this.resolveUnitCoordinates(value);
		}
		return undefined;
	}
}

// ─── Formatting Helpers (for tool response text) ──────────────────────────────

/**
 * Format an ICopMapSummary as structured text for LLM consumption.
 * Follows the format specified in ARCHITECTURE.md Section 5.1.
 */
export function formatMapSummary(summary: ICopMapSummary): string {
	const lines: string[] = [];
	lines.push('COP Summary:');
	lines.push(`  Center: ${summary.center.mgrs} (${summary.center.latlon[0].toFixed(4)}°E, ${summary.center.latlon[1].toFixed(4)}°N)`);
	lines.push(`  Zoom: ${summary.zoom} | Theme: ${summary.basemapTheme} | Phase: ${summary.currentPhase} of ${summary.totalPhases}`);

	const counts = summary.unitCounts;
	lines.push(`  Units: ${counts.friendly} friendly, ${counts.hostile} hostile, ${counts.neutral} neutral, ${counts.unknown} unknown`);
	lines.push(`  Active layers: ${summary.activeLayers.join(', ') || '(none)'}`);
	lines.push(`  Annotations: ${summary.annotationCount}`);

	return lines.join('\n');
}

/**
 * Format filtered unit summaries as structured text for LLM consumption.
 * Follows the format specified in ARCHITECTURE.md Section 5.1.
 */
export function formatUnitList(units: ICopUnitSummary[], filterLabel: string): string {
	if (units.length === 0) {
		return `${filterLabel} (0 matching): No units match the filter criteria.`;
	}

	const lines: string[] = [];
	lines.push(`${filterLabel} (${units.length} matching):`);

	for (let i = 0; i < units.length; i++) {
		const u = units[i];
		const echelonAbbr = getEchelonAbbr(u.echelon);
		lines.push(`  ${i + 1}. ${u.designation} | SIDC: ${u.sidc} | ${echelonAbbr} | ${u.position.mgrs} | ${u.status}`);
	}

	return lines.join('\n');
}

/**
 * Format unit detail as structured text for LLM consumption.
 */
export function formatUnitDetail(detail: ICopUnitDetail): string {
	const lines: string[] = [];
	lines.push(`Unit Detail: ${detail.designation} (${detail.name})`);
	lines.push(`  ID: ${detail.id}`);
	lines.push(`  SIDC: ${detail.sidc}`);
	lines.push(`  Affiliation: ${detail.affiliation} | Echelon: ${detail.echelon} | Type: ${detail.unitType}`);
	lines.push(`  Position: ${detail.position.mgrs} (${detail.position.latlon[0].toFixed(4)}°E, ${detail.position.latlon[1].toFixed(4)}°N)`);
	lines.push(`  Status: ${detail.status} | Strength: ${detail.strength}`);
	lines.push(`  Commander: ${detail.commander || '(none)'}`);
	lines.push(`  Higher Formation: ${detail.higherFormation || '(none)'}`);
	lines.push(`  Subordinates: ${detail.subordinates.length > 0 ? detail.subordinates.join(', ') : '(none)'}`);
	if (detail.directionOfMovement !== undefined) {
		lines.push(`  Direction: ${detail.directionOfMovement}° | Speed: ${detail.speed ?? 0} km/h`);
	}
	if (detail.notes) {
		lines.push(`  Notes: ${detail.notes}`);
	}

	return lines.join('\n');
}

/**
 * Format a spatial result as structured text for LLM consumption.
 * Follows the format specified in ARCHITECTURE.md Section 5.7.
 */
export function formatSpatialResult(
	result: ICopSpatialResult,
	queryEngine: CopQueryEngine,
	fromLabel?: string,
	toLabel?: string,
	centerLabel?: string,
): string {
	const lines: string[] = [];

	switch (result.queryType) {
		case 'distance': {
			const km = result.distanceKm ?? 0;
			const nm = km * 0.539957; // nautical miles
			lines.push(`Distance: ${km.toFixed(1)} km (${nm.toFixed(1)} nautical miles)`);
			if (fromLabel) { lines.push(`From: ${fromLabel}`); }
			if (toLabel) { lines.push(`To: ${toLabel}`); }
			break;
		}
		case 'bearing': {
			const deg = result.bearingDeg ?? 0;
			const compass = bearingToCompass(deg);
			lines.push(`Bearing: ${deg.toFixed(0)}° (${compass})`);
			if (fromLabel) { lines.push(`From: ${fromLabel}`); }
			if (toLabel) { lines.push(`To: ${toLabel}`); }
			break;
		}
		case 'area': {
			const km2 = result.areaKm2 ?? 0;
			lines.push(`Area: ${km2.toFixed(2)} km²`);
			break;
		}
		case 'units-in-radius': {
			const units = result.unitsInRadius ?? [];
			lines.push(`Units within radius${centerLabel ? ` of ${centerLabel}` : ''}: ${units.length} found`);
			for (let i = 0; i < units.length; i++) {
				const u = units[i];
				lines.push(`  ${i + 1}. ${u.designation} (${u.affiliation}, ${getEchelonAbbr(u.echelon)}) — ${u.position.mgrs} | ${u.status}`);
			}
			break;
		}
		case 'point-in-polygon': {
			const inside = result.pointInPolygon ?? false;
			lines.push(`Point in polygon: ${inside ? 'YES' : 'NO'}`);
			break;
		}
		case 'buffer': {
			if (result.bufferPolygon) {
				const vertices = (result.bufferPolygon.coordinates as number[][][])[0]?.length ?? 0;
				lines.push(`Buffer zone generated: ${vertices} vertices`);
			} else {
				lines.push('Buffer zone: could not be generated');
			}
			break;
		}
		default: {
			lines.push(`Spatial query result: ${result.queryType}`);
			break;
		}
	}

	return lines.join('\n');
}

/**
 * Get a short abbreviation for an echelon level.
 */
function getEchelonAbbr(echelon: string): string {
	const abbrs: Record<string, string> = {
		team: 'TM',
		squad: 'SQD',
		section: 'SEC',
		platoon: 'PLT',
		company: 'CO',
		battalion: 'BN',
		regiment: 'REGT',
		brigade: 'BDE',
		division: 'DIV',
		corps: 'CORPS',
		army: 'ARMY',
		army_group: 'AG',
		theater: 'THR',
		command: 'CMD',
	};
	return abbrs[echelon] || echelon.toUpperCase();
}
