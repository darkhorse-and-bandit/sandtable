/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import {
	ILanguageModelToolsService,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolResult,
	IToolResultTextPart,
	ToolDataSource,
	CountTokensCallback,
	ToolProgress,
	IPreparedToolInvocation,
	IToolInvocationPreparationContext,
} from '../../chat/common/tools/languageModelToolsService.js';
import {
	ISandtableCopService,
	ICopUnitFilter,
	ICopSpatialQuery,
	ICopUnit,
	ICopLayer,
	ICopAnnotation,
	ICopTimelineEvent,
	CopAffiliation,
	CopEchelon,
	CopUnitStatus,
	CopLayerType,
	CopAnnotationType,
} from '../../../../platform/cortex/common/copTypes.js';
import { buildSidc, generateUnitId, getDefaultLayerId } from '../../../../platform/cortex/common/copUnitTypes.js';
import {
	CopQueryEngine,
	formatMapSummary,
	formatUnitList,
	formatSpatialResult,
} from './sandtableCopQueryEngine.js';
import { CopSnapshotCapture } from './sandtableCopSnapshot.js';
import { SandtableCopMapRenderer } from './sandtableCopMapRenderer.js';

// ─── Shared Constants ─────────────────────────────────────────────────────────

const SANDTABLE_TOOL_SOURCE: typeof ToolDataSource.Internal = { type: 'internal', label: 'Sandtable' };

// ─── Result Helpers ───────────────────────────────────────────────────────────

function textResult(value: string): IToolResult {
	return { content: [{ kind: 'text', value } satisfies IToolResultTextPart] };
}

function errorResult(message: string): IToolResult {
	return { content: [{ kind: 'text', value: `Error: ${message}` } satisfies IToolResultTextPart], toolResultError: message };
}

// ─── Tool Data Definitions ────────────────────────────────────────────────────

const queryMapStateToolData: IToolData = {
	id: 'sandtable_query_map_state',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Query Map State',
	userDescription: 'Queries the COP map state and units',
	modelDescription: 'Query the current state of the Common Operating Picture (COP) map. Without filters, returns a high-level summary (unit counts, active layers, map center, scenario phase). With filters, returns a filtered list of units matching the criteria. Use this to understand the current tactical situation before making decisions.',
	tags: ['cop', 'map', 'query'],
	inputSchema: {
		type: 'object',
		properties: {
			filter_affiliation: {
				type: 'string',
				enum: ['friendly', 'hostile', 'neutral', 'unknown'],
				description: 'Filter units by affiliation',
			},
			filter_echelon: {
				type: 'string',
				enum: ['team', 'squad', 'section', 'platoon', 'company', 'battalion', 'regiment', 'brigade', 'division', 'corps', 'army'],
				description: 'Filter units by echelon level',
			},
			filter_unit_type: {
				type: 'string',
				description: 'Filter by unit type (e.g., infantry, armor, artillery)',
			},
			filter_layer: {
				type: 'string',
				description: 'Filter by layer ID',
			},
			bbox_west: { type: 'number', description: 'Bounding box west longitude' },
			bbox_south: { type: 'number', description: 'Bounding box south latitude' },
			bbox_east: { type: 'number', description: 'Bounding box east longitude' },
			bbox_north: { type: 'number', description: 'Bounding box north latitude' },
		},
		required: [],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

const addMapUnitToolData: IToolData = {
	id: 'sandtable_add_map_unit',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Add Map Unit',
	userDescription: 'Places a military unit on the COP map',
	modelDescription: 'Place a new military unit on the COP map with MIL-STD-2525 symbology. Specify the unit designation, type, affiliation, echelon, and position (as MGRS grid reference or lat/lon). The unit will be rendered with the appropriate military symbol.',
	tags: ['cop', 'map', 'unit'],
	inputSchema: {
		type: 'object',
		properties: {
			designation: { type: 'string', description: 'Unit designation (e.g., "2-7 IN", "1st Mech Bn")' },
			name: { type: 'string', description: 'Full unit name (e.g., "2nd Battalion, 7th Infantry Regiment")' },
			unit_type: { type: 'string', description: 'Unit type: infantry, armor, artillery, engineer, logistics, reconnaissance, aviation, signal, medical, headquarters' },
			affiliation: { type: 'string', enum: ['friendly', 'hostile', 'neutral', 'unknown'], description: 'Unit affiliation' },
			echelon: { type: 'string', enum: ['team', 'squad', 'platoon', 'company', 'battalion', 'regiment', 'brigade', 'division', 'corps', 'army'], description: 'Echelon level' },
			position_mgrs: { type: 'string', description: 'Position as MGRS grid reference (e.g., "38SMB4488306483")' },
			position_lat: { type: 'number', description: 'Position latitude (alternative to MGRS)' },
			position_lon: { type: 'number', description: 'Position longitude (alternative to MGRS)' },
			layer: { type: 'string', description: 'Layer to place unit on (default: auto-detect from affiliation)' },
			higher_formation: { type: 'string', description: 'ID or designation of the parent unit' },
			strength: { type: 'integer', description: 'Personnel strength' },
			commander: { type: 'string', description: 'Commander name' },
			status: { type: 'string', enum: ['operational', 'degraded', 'not_operational', 'destroyed'], description: 'Unit status (default: operational)' },
		},
		required: ['designation', 'unit_type', 'affiliation', 'echelon'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

const moveMapUnitToolData: IToolData = {
	id: 'sandtable_move_map_unit',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Move Map Unit',
	userDescription: 'Moves or updates a unit on the COP map',
	modelDescription: 'Move an existing unit to a new position on the COP map, or update its properties (status, strength, etc.). Identify the unit by its ID or designation.',
	tags: ['cop', 'map', 'unit'],
	inputSchema: {
		type: 'object',
		properties: {
			unit_id: { type: 'string', description: 'Unit ID (e.g., "unit-001")' },
			unit_designation: { type: 'string', description: 'Unit designation (alternative to ID, e.g., "2-7 IN")' },
			new_position_mgrs: { type: 'string', description: 'New position as MGRS grid reference' },
			new_position_lat: { type: 'number', description: 'New position latitude' },
			new_position_lon: { type: 'number', description: 'New position longitude' },
			new_status: { type: 'string', enum: ['operational', 'degraded', 'not_operational', 'destroyed'], description: 'Updated unit status' },
			new_strength: { type: 'integer', description: 'Updated personnel strength' },
			direction_of_movement: { type: 'number', description: 'Direction of movement in degrees (0-360)' },
			speed_kmh: { type: 'number', description: 'Speed in km/h' },
		},
		required: [],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

const addMapOverlayToolData: IToolData = {
	id: 'sandtable_add_map_overlay',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Add Map Overlay',
	userDescription: 'Adds a tactical overlay to the COP map',
	modelDescription: 'Add a named overlay to the COP map with tactical graphics (phase lines, axes of advance, boundaries, objectives, engagement areas, routes). Each graphic is specified as a type with coordinates. The overlay appears as a toggleable layer.',
	tags: ['cop', 'map', 'overlay'],
	inputSchema: {
		type: 'object',
		properties: {
			name: { type: 'string', description: 'Overlay name (e.g., "Red COA-1: Northern Thrust")' },
			layer_type: { type: 'string', enum: ['annotation', 'custom'], description: 'Layer type (default: annotation)' },
			color: { type: 'string', description: 'Layer color (CSS color, default: auto from type)' },
			graphics: {
				type: 'array',
				description: 'Array of tactical graphics to add',
				items: {
					type: 'object',
					properties: {
						type: { type: 'string', enum: ['phase-line', 'axis-of-advance', 'boundary', 'engagement-area', 'objective', 'no-fire-area', 'route', 'freeform-line', 'freeform-polygon', 'text-label'], description: 'Graphic type' },
						designation: { type: 'string', description: 'Military designation (e.g., "PL ALPHA", "OBJ WOLF")' },
						coordinates: { type: 'array', description: 'Array of [longitude, latitude] coordinate pairs', items: { type: 'array', items: { type: 'number' } } },
					},
					required: ['type', 'coordinates'],
				},
			},
		},
		required: ['name', 'graphics'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

const addMapEventToolData: IToolData = {
	id: 'sandtable_add_map_event',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Add Map Event',
	userDescription: 'Adds a timeline event to the scenario',
	modelDescription: 'Add a timeline event to the scenario (inject, decision, movement, fire, intelligence). Events are associated with a phase and optionally with specific units and coordinates.',
	tags: ['cop', 'map', 'event'],
	inputSchema: {
		type: 'object',
		properties: {
			name: { type: 'string', description: 'Event name (e.g., "Enemy counter-attack begins")' },
			description: { type: 'string', description: 'Detailed event description' },
			type: { type: 'string', enum: ['inject', 'decision', 'movement', 'fire', 'intelligence', 'logistics', 'communication', 'custom'], description: 'Event type' },
			phase: { type: 'integer', description: 'Phase index (0-based)' },
			time_offset_minutes: { type: 'number', description: 'Minutes from phase start' },
			affected_unit_ids: { type: 'array', items: { type: 'string' }, description: 'Unit IDs affected by this event' },
			coordinates_mgrs: { type: 'string', description: 'MGRS location of the event' },
			coordinates_lat: { type: 'number', description: 'Latitude of the event' },
			coordinates_lon: { type: 'number', description: 'Longitude of the event' },
		},
		required: ['name', 'type', 'phase'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

const captureMapSnapshotToolData: IToolData = {
	id: 'sandtable_capture_map_snapshot',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Capture Map Snapshot',
	userDescription: 'Captures a screenshot of the COP map',
	modelDescription: 'Capture a screenshot of the current COP map view and save it as a PNG file in the workspace. Returns the file path. Useful for including map views in reports and after-action reviews.',
	tags: ['cop', 'map', 'snapshot'],
	inputSchema: {
		type: 'object',
		properties: {
			filename: { type: 'string', description: 'Output filename (default: map-snapshot-{timestamp}.png)' },
			include_units: { type: 'boolean', description: 'Include unit symbols in snapshot (default: true)' },
			include_annotations: { type: 'boolean', description: 'Include annotations/overlays (default: true)' },
		},
		required: [],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

const querySpatialToolData: IToolData = {
	id: 'sandtable_query_spatial',
	source: SANDTABLE_TOOL_SOURCE,
	displayName: 'Query Spatial',
	userDescription: 'Performs spatial calculations on the COP',
	modelDescription: 'Perform spatial calculations on the COP: measure distance between two points/units, calculate bearing, compute area of a polygon, find units within a radius, or check if a point is inside a polygon. Coordinates can be MGRS grid references or lat/lon.',
	tags: ['cop', 'map', 'spatial'],
	inputSchema: {
		type: 'object',
		properties: {
			query_type: { type: 'string', enum: ['distance', 'bearing', 'area', 'units-in-radius', 'point-in-polygon'], description: 'Type of spatial query' },
			from_unit: { type: 'string', description: 'Origin unit ID or designation (for distance/bearing)' },
			from_mgrs: { type: 'string', description: 'Origin MGRS grid reference (for distance/bearing)' },
			from_lat: { type: 'number', description: 'Origin latitude' },
			from_lon: { type: 'number', description: 'Origin longitude' },
			to_unit: { type: 'string', description: 'Target unit ID or designation (for distance/bearing)' },
			to_mgrs: { type: 'string', description: 'Target MGRS grid reference (for distance/bearing)' },
			to_lat: { type: 'number', description: 'Target latitude' },
			to_lon: { type: 'number', description: 'Target longitude' },
			radius_km: { type: 'number', description: 'Radius in kilometers (for units-in-radius)' },
			center_mgrs: { type: 'string', description: 'Center MGRS (for units-in-radius)' },
			polygon_coords: { type: 'array', description: 'Polygon coordinates as [[lon,lat], ...] (for area/point-in-polygon)', items: { type: 'array', items: { type: 'number' } } },
			point_mgrs: { type: 'string', description: 'Point MGRS to test (for point-in-polygon)' },
		},
		required: ['query_type'],
	},
	canBeReferencedInPrompt: true,
	runsInWorkspace: true,
};

// ─── Tool Implementations ─────────────────────────────────────────────────────

class QueryMapStateTool implements IToolImpl {
	constructor(
		private readonly queryEngine: CopQueryEngine,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as Record<string, unknown>;
		const hasFilters = params && Object.keys(params).some(k => params[k] !== undefined && params[k] !== null && params[k] !== '');
		return {
			invocationMessage: hasFilters ? 'Querying COP units with filters' : 'Querying COP map summary',
			pastTenseMessage: hasFilters ? 'Queried COP units with filters' : 'Queried COP map summary',
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			filter_affiliation?: string;
			filter_echelon?: string;
			filter_unit_type?: string;
			filter_layer?: string;
			bbox_west?: number;
			bbox_south?: number;
			bbox_east?: number;
			bbox_north?: number;
		};

		this.logService.debug('[Sandtable COP Tool] query_map_state');

		try {
			// Check if any filters are provided
			const hasFilters = !!(
				params.filter_affiliation || params.filter_echelon ||
				params.filter_unit_type || params.filter_layer ||
				(params.bbox_west !== undefined && params.bbox_south !== undefined &&
					params.bbox_east !== undefined && params.bbox_north !== undefined)
			);

			if (!hasFilters) {
				// Return high-level summary
				const summary = await this.queryEngine.queryMapSummary();
				return textResult(formatMapSummary(summary));
			}

			// Build filter
			const filter: ICopUnitFilter = {};
			if (params.filter_affiliation) {
				filter.affiliation = params.filter_affiliation as CopAffiliation;
			}
			if (params.filter_echelon) {
				filter.echelon = params.filter_echelon as CopEchelon;
			}
			if (params.filter_unit_type) {
				filter.unitType = params.filter_unit_type;
			}
			if (params.filter_layer) {
				filter.layerId = params.filter_layer;
			}
			if (params.bbox_west !== undefined && params.bbox_south !== undefined &&
				params.bbox_east !== undefined && params.bbox_north !== undefined) {
				filter.bbox = [params.bbox_west, params.bbox_south, params.bbox_east, params.bbox_north];
			}

			// Build filter label
			const filterParts: string[] = [];
			if (filter.affiliation) { filterParts.push(filter.affiliation); }
			if (filter.echelon) { filterParts.push(filter.echelon); }
			if (filter.unitType) { filterParts.push(filter.unitType); }
			const filterLabel = filterParts.length > 0
				? `${filterParts.join(' ')} units`
				: 'Filtered units';

			const units = await this.queryEngine.queryUnitsFiltered(filter);
			return textResult(formatUnitList(units, filterLabel));
		} catch (e) {
			return errorResult(`Failed to query map state: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class AddMapUnitTool implements IToolImpl {
	constructor(
		private readonly copService: ISandtableCopService,
		private readonly queryEngine: CopQueryEngine,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { designation?: string };
		const designation = params?.designation || 'unit';
		return {
			invocationMessage: `Placing unit **${designation}** on map`,
			pastTenseMessage: `Placed unit **${designation}** on map`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			designation: string;
			name?: string;
			unit_type: string;
			affiliation: string;
			echelon: string;
			position_mgrs?: string;
			position_lat?: number;
			position_lon?: number;
			layer?: string;
			higher_formation?: string;
			strength?: number;
			commander?: string;
			status?: string;
		};

		this.logService.debug(`[Sandtable COP Tool] add_map_unit: ${params.designation}`);

		try {
			// Resolve position
			let coordinates: [number, number];

			if (params.position_mgrs) {
				coordinates = await this.queryEngine.fromMGRS(params.position_mgrs);
			} else if (params.position_lat !== undefined && params.position_lon !== undefined) {
				coordinates = [params.position_lon, params.position_lat];
			} else {
				return errorResult('Position is required. Provide either position_mgrs or both position_lat and position_lon.');
			}

			// Validate affiliation and echelon
			const affiliation = params.affiliation as CopAffiliation;
			const echelon = params.echelon as CopEchelon;
			const status = (params.status || 'operational') as CopUnitStatus;

			// Generate SIDC
			const sidc = buildSidc(affiliation, echelon, params.unit_type, status);

			// Determine layer
			const layerId = params.layer || getDefaultLayerId(affiliation);

			// Resolve higher formation if provided as designation
			let higherFormation = params.higher_formation || '';
			if (higherFormation && !higherFormation.startsWith('unit-')) {
				const parent = this.queryEngine.findUnit(higherFormation);
				if (parent) {
					higherFormation = parent.id;
				}
			}

			// Build unit
			const unitId = generateUnitId();
			const unit: ICopUnit = {
				id: unitId,
				coordinates,
				properties: {
					sidc,
					designation: params.designation,
					name: params.name || params.designation,
					affiliation,
					echelon,
					unitType: params.unit_type,
					strength: params.strength || 0,
					status,
					commander: params.commander || '',
					higherFormation,
					scenarioPhase: this.copService.getCurrentPhase(),
					notes: '',
					layerId,
				},
			};

			// Add to COP
			this.copService.addUnit(unit);

			// Format response with MGRS
			const mgrs = await this.queryEngine.toMGRS(coordinates[0], coordinates[1]);
			const lines: string[] = [];
			lines.push(`Placed unit "${params.designation}" on the map.`);
			lines.push(`  ID: ${unitId}`);
			lines.push(`  SIDC: ${sidc}`);
			lines.push(`  Position: ${mgrs} (${coordinates[0].toFixed(4)}°E, ${coordinates[1].toFixed(4)}°N)`);
			lines.push(`  Affiliation: ${affiliation} | Echelon: ${echelon} | Type: ${params.unit_type}`);
			lines.push(`  Layer: ${layerId} | Status: ${status}`);

			return textResult(lines.join('\n'));
		} catch (e) {
			return errorResult(`Failed to add unit: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class MoveMapUnitTool implements IToolImpl {
	constructor(
		private readonly copService: ISandtableCopService,
		private readonly queryEngine: CopQueryEngine,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { unit_id?: string; unit_designation?: string };
		const label = params?.unit_designation || params?.unit_id || 'unit';
		return {
			invocationMessage: `Moving/updating **${label}**`,
			pastTenseMessage: `Moved/updated **${label}**`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			unit_id?: string;
			unit_designation?: string;
			new_position_mgrs?: string;
			new_position_lat?: number;
			new_position_lon?: number;
			new_status?: string;
			new_strength?: number;
			direction_of_movement?: number;
			speed_kmh?: number;
		};

		this.logService.debug(`[Sandtable COP Tool] move_map_unit: ${params.unit_id || params.unit_designation}`);

		try {
			// Find the unit
			const searchKey = params.unit_id || params.unit_designation;
			if (!searchKey) {
				return errorResult('Either unit_id or unit_designation must be provided to identify the unit.');
			}

			const unit = this.queryEngine.findUnit(searchKey);
			if (!unit) {
				return errorResult(`No unit found matching "${searchKey}". Use sandtable_query_map_state to see available units.`);
			}

			const changes: string[] = [];

			// Move position if provided
			if (params.new_position_mgrs) {
				const newCoords = await this.queryEngine.fromMGRS(params.new_position_mgrs);
				this.copService.moveUnit(unit.id, newCoords);
				const mgrs = await this.queryEngine.toMGRS(newCoords[0], newCoords[1]);
				changes.push(`Position: → ${mgrs}`);
			} else if (params.new_position_lat !== undefined && params.new_position_lon !== undefined) {
				const newCoords: [number, number] = [params.new_position_lon, params.new_position_lat];
				this.copService.moveUnit(unit.id, newCoords);
				const mgrs = await this.queryEngine.toMGRS(newCoords[0], newCoords[1]);
				changes.push(`Position: → ${mgrs}`);
			}

			// Update properties if provided
			const propChanges: Partial<Record<string, unknown>> = {};
			if (params.new_status) {
				propChanges.status = params.new_status;
				changes.push(`Status: ${unit.properties.status} → ${params.new_status}`);
			}
			if (params.new_strength !== undefined) {
				propChanges.strength = params.new_strength;
				changes.push(`Strength: ${unit.properties.strength} → ${params.new_strength}`);
			}
			if (params.direction_of_movement !== undefined) {
				propChanges.directionOfMovement = params.direction_of_movement;
				changes.push(`Direction: → ${params.direction_of_movement}°`);
			}
			if (params.speed_kmh !== undefined) {
				propChanges.speed = params.speed_kmh;
				changes.push(`Speed: → ${params.speed_kmh} km/h`);
			}

			if (Object.keys(propChanges).length > 0) {
				this.copService.updateUnit(unit.id, propChanges as any);
			}

			if (changes.length === 0) {
				return errorResult('No changes specified. Provide a new position, status, strength, direction, or speed.');
			}

			const lines: string[] = [];
			lines.push(`Updated "${unit.properties.designation}" (${unit.id}):`);
			for (const change of changes) {
				lines.push(`  ${change}`);
			}

			return textResult(lines.join('\n'));
		} catch (e) {
			return errorResult(`Failed to move/update unit: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class AddMapOverlayTool implements IToolImpl {
	constructor(
		private readonly copService: ISandtableCopService,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { name?: string };
		const name = params?.name || 'overlay';
		return {
			invocationMessage: `Adding overlay **${name}**`,
			pastTenseMessage: `Added overlay **${name}**`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			name: string;
			layer_type?: string;
			color?: string;
			graphics: Array<{
				type: string;
				designation?: string;
				coordinates: number[][];
			}>;
		};

		this.logService.debug(`[Sandtable COP Tool] add_map_overlay: ${params.name}`);

		try {
			if (!params.graphics || params.graphics.length === 0) {
				return errorResult('At least one graphic is required in the graphics array.');
			}

			// Create a new layer
			const layerType = (params.layer_type || 'annotation') as CopLayerType;
			const layerId = `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
			const existingLayers = this.copService.getLayers();

			const layer: ICopLayer = {
				id: layerId,
				name: params.name,
				type: layerType,
				visible: true,
				opacity: 1.0,
				zIndex: (existingLayers.length + 1) * 10,
				color: params.color || '#ff9800',
				locked: false,
			};
			this.copService.addLayer(layer);

			// Add each graphic as an annotation
			let addedCount = 0;
			for (const graphic of params.graphics) {
				const annotationType = graphic.type as CopAnnotationType;
				const coordinates = graphic.coordinates as [number, number][];

				// Determine geometry type from annotation type
				let geometryType: 'Point' | 'LineString' | 'Polygon';
				if (['objective', 'freeform-point', 'text-label'].includes(annotationType)) {
					geometryType = 'Point';
				} else if (['engagement-area', 'no-fire-area', 'freeform-polygon'].includes(annotationType)) {
					geometryType = 'Polygon';
				} else {
					geometryType = 'LineString';
				}

				// Build geometry coordinates based on type
				let geomCoordinates: number[] | number[][] | number[][][];
				if (geometryType === 'Point' && coordinates.length > 0) {
					geomCoordinates = coordinates[0];
				} else if (geometryType === 'Polygon') {
					// Close the ring if not already closed
					const ring = [...coordinates];
					if (ring.length > 0) {
						const first = ring[0];
						const last = ring[ring.length - 1];
						if (first[0] !== last[0] || first[1] !== last[1]) {
							ring.push(first);
						}
					}
					geomCoordinates = [ring];
				} else {
					geomCoordinates = coordinates;
				}

				const annotationId = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
				const annotation: ICopAnnotation = {
					id: annotationId,
					layerId,
					type: annotationType,
					geometry: {
						type: geometryType,
						coordinates: geomCoordinates,
					},
					style: {
						strokeColor: params.color || '#ff9800',
						strokeWidth: 2,
					},
					label: graphic.designation || '',
					militaryDesignation: graphic.designation,
				};
				this.copService.addAnnotation(annotation);
				addedCount++;
			}

			const lines: string[] = [];
			lines.push(`Created overlay "${params.name}" with ${addedCount} graphic(s).`);
			lines.push(`  Layer ID: ${layerId}`);
			lines.push(`  Type: ${layerType}`);
			for (const graphic of params.graphics) {
				const designation = graphic.designation ? ` (${graphic.designation})` : '';
				lines.push(`  - ${graphic.type}${designation}: ${graphic.coordinates.length} coordinate(s)`);
			}

			return textResult(lines.join('\n'));
		} catch (e) {
			return errorResult(`Failed to add overlay: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class AddMapEventTool implements IToolImpl {
	constructor(
		private readonly copService: ISandtableCopService,
		private readonly queryEngine: CopQueryEngine,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { name?: string };
		const name = params?.name || 'event';
		return {
			invocationMessage: `Adding event **${name}**`,
			pastTenseMessage: `Added event **${name}**`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			name: string;
			description?: string;
			type: string;
			phase: number;
			time_offset_minutes?: number;
			affected_unit_ids?: string[];
			coordinates_mgrs?: string;
			coordinates_lat?: number;
			coordinates_lon?: number;
		};

		this.logService.debug(`[Sandtable COP Tool] add_map_event: ${params.name}`);

		try {
			// Resolve coordinates if provided
			let coordinates: [number, number] | undefined;
			if (params.coordinates_mgrs) {
				coordinates = await this.queryEngine.fromMGRS(params.coordinates_mgrs);
			} else if (params.coordinates_lat !== undefined && params.coordinates_lon !== undefined) {
				coordinates = [params.coordinates_lon, params.coordinates_lat];
			}

			const eventId = `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const event: ICopTimelineEvent = {
				id: eventId,
				name: params.name,
				description: params.description || '',
				type: params.type,
				phase: params.phase,
				timeOffset: params.time_offset_minutes || 0,
				affectedUnitIds: params.affected_unit_ids || [],
				coordinates,
				data: {},
			};

			this.copService.addTimelineEvent(event);

			const lines: string[] = [];
			lines.push(`Added timeline event "${params.name}".`);
			lines.push(`  ID: ${eventId}`);
			lines.push(`  Type: ${params.type} | Phase: ${params.phase}`);
			if (params.time_offset_minutes !== undefined) {
				lines.push(`  Time offset: +${params.time_offset_minutes} min`);
			}
			if (coordinates) {
				const mgrs = await this.queryEngine.toMGRS(coordinates[0], coordinates[1]);
				lines.push(`  Location: ${mgrs}`);
			}
			if (params.affected_unit_ids && params.affected_unit_ids.length > 0) {
				lines.push(`  Affected units: ${params.affected_unit_ids.join(', ')}`);
			}

			return textResult(lines.join('\n'));
		} catch (e) {
			return errorResult(`Failed to add event: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class CaptureMapSnapshotTool implements IToolImpl {
	constructor(
		private readonly copService: ISandtableCopService,
		private readonly snapshotCapture: CopSnapshotCapture,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: 'Capturing map snapshot',
			pastTenseMessage: 'Captured map snapshot',
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			filename?: string;
			include_units?: boolean;
			include_annotations?: boolean;
		};

		this.logService.debug('[Sandtable COP Tool] capture_map_snapshot');

		try {
			const mapRenderer = this.copService.getMapRendererRef() as SandtableCopMapRenderer | undefined;
			const relativePath = await this.snapshotCapture.capture(mapRenderer, params.filename);

			return textResult(`Map snapshot saved to: ${relativePath}\nThe file is in the workspace at .sandtable/cop/snapshots/.`);
		} catch (e) {
			return errorResult(`Failed to capture snapshot: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

class QuerySpatialTool implements IToolImpl {
	constructor(
		private readonly queryEngine: CopQueryEngine,
		private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as { query_type?: string };
		const type = params?.query_type || 'spatial query';
		return {
			invocationMessage: `Running ${type} query`,
			pastTenseMessage: `Ran ${type} query`,
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as {
			query_type: string;
			from_unit?: string;
			from_mgrs?: string;
			from_lat?: number;
			from_lon?: number;
			to_unit?: string;
			to_mgrs?: string;
			to_lat?: number;
			to_lon?: number;
			radius_km?: number;
			center_mgrs?: string;
			polygon_coords?: number[][];
			point_mgrs?: string;
		};

		this.logService.debug(`[Sandtable COP Tool] query_spatial: ${params.query_type}`);

		try {
			// Resolve "from" coordinates
			let from: string | [number, number] | undefined;
			let fromLabel = '';
			if (params.from_unit) {
				from = params.from_unit;
				const unit = this.queryEngine.findUnit(params.from_unit);
				if (unit) {
					const mgrs = await this.queryEngine.toMGRS(unit.coordinates[0], unit.coordinates[1]);
					fromLabel = `${unit.properties.designation} at ${mgrs}`;
				}
			} else if (params.from_mgrs) {
				from = await this.queryEngine.fromMGRS(params.from_mgrs);
				fromLabel = params.from_mgrs;
			} else if (params.from_lat !== undefined && params.from_lon !== undefined) {
				from = [params.from_lon, params.from_lat];
				const mgrs = await this.queryEngine.toMGRS(params.from_lon, params.from_lat);
				fromLabel = mgrs;
			}

			// Resolve "to" coordinates
			let to: string | [number, number] | undefined;
			let toLabel = '';
			if (params.to_unit) {
				to = params.to_unit;
				const unit = this.queryEngine.findUnit(params.to_unit);
				if (unit) {
					const mgrs = await this.queryEngine.toMGRS(unit.coordinates[0], unit.coordinates[1]);
					toLabel = `${unit.properties.designation} at ${mgrs}`;
				}
			} else if (params.to_mgrs) {
				to = await this.queryEngine.fromMGRS(params.to_mgrs);
				toLabel = params.to_mgrs;
			} else if (params.to_lat !== undefined && params.to_lon !== undefined) {
				to = [params.to_lon, params.to_lat];
				const mgrs = await this.queryEngine.toMGRS(params.to_lon, params.to_lat);
				toLabel = mgrs;
			}

			// Resolve center for units-in-radius
			let center: string | [number, number] | undefined;
			let centerLabel = '';
			if (params.center_mgrs) {
				center = await this.queryEngine.fromMGRS(params.center_mgrs);
				centerLabel = params.center_mgrs;
			} else if (params.from_unit && params.query_type === 'units-in-radius') {
				center = params.from_unit;
				centerLabel = fromLabel;
			} else if (from) {
				center = from;
				centerLabel = fromLabel;
			}

			// Resolve point for point-in-polygon
			let point: [number, number] | undefined;
			if (params.point_mgrs) {
				point = await this.queryEngine.fromMGRS(params.point_mgrs);
			} else if (params.from_lat !== undefined && params.from_lon !== undefined) {
				point = [params.from_lon, params.from_lat];
			}

			// Build spatial query
			const spatialQuery: ICopSpatialQuery = {
				type: params.query_type as any,
				from,
				to,
				center,
				radiusKm: params.radius_km,
				polygon: params.polygon_coords as [number, number][] | undefined,
				point,
			};

			const result = await this.queryEngine.querySpatial(spatialQuery);
			return textResult(formatSpatialResult(result, this.queryEngine, fromLabel, toLabel, centerLabel));
		} catch (e) {
			return errorResult(`Failed to run spatial query: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
}

// ─── Workbench Contribution ───────────────────────────────────────────────────

/**
 * Registers 7 COP agent tools with VS Code's ILanguageModelToolsService.
 * These tools allow the chat agent to query, manipulate, and capture
 * the Common Operating Picture map.
 */
class SandtableCopToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableCopTools';

	constructor(
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@ISandtableCopService private readonly copService: ISandtableCopService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.logService.info('[Sandtable COP Tools] Registering 7 COP map tools');

		// Create shared helpers
		const queryEngine = new CopQueryEngine(this.copService, this.logService);
		const snapshotCapture = new CopSnapshotCapture(this.fileService, this.workspaceService, this.logService);

		// 1. Query Map State
		this._register(this.toolsService.registerTool(
			queryMapStateToolData,
			new QueryMapStateTool(queryEngine, this.logService)
		));

		// 2. Add Map Unit
		this._register(this.toolsService.registerTool(
			addMapUnitToolData,
			new AddMapUnitTool(this.copService, queryEngine, this.logService)
		));

		// 3. Move Map Unit
		this._register(this.toolsService.registerTool(
			moveMapUnitToolData,
			new MoveMapUnitTool(this.copService, queryEngine, this.logService)
		));

		// 4. Add Map Overlay
		this._register(this.toolsService.registerTool(
			addMapOverlayToolData,
			new AddMapOverlayTool(this.copService, this.logService)
		));

		// 5. Add Map Event
		this._register(this.toolsService.registerTool(
			addMapEventToolData,
			new AddMapEventTool(this.copService, queryEngine, this.logService)
		));

		// 6. Capture Map Snapshot
		this._register(this.toolsService.registerTool(
			captureMapSnapshotToolData,
			new CaptureMapSnapshotTool(this.copService, snapshotCapture, this.logService)
		));

		// 7. Query Spatial
		this._register(this.toolsService.registerTool(
			querySpatialToolData,
			new QuerySpatialTool(queryEngine, this.logService)
		));

		this.logService.info('[Sandtable COP Tools] 7 COP map tools registered');
	}
}

registerWorkbenchContribution2(
	SandtableCopToolsContribution.ID,
	SandtableCopToolsContribution,
	WorkbenchPhase.AfterRestored
);
