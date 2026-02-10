/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import * as nls from '../../../nls.js';

// ─── COP Setting Keys ────────────────────────────────────────────────────────

export const enum CopConfigKeys {
	TileSource = 'sandtable.cop.tileSource',
	TileFallback = 'sandtable.cop.tileFallback',
	SymbologyStandard = 'sandtable.cop.symbologyStandard',
	DefaultCoordinateFormat = 'sandtable.cop.defaultCoordinateFormat',
	MgrsGridEnabled = 'sandtable.cop.mgrsGridEnabled',
	BasemapTheme = 'sandtable.cop.basemapTheme',
	DefaultCenter = 'sandtable.cop.defaultCenter',
	DefaultZoom = 'sandtable.cop.defaultZoom',
	UnitSymbolSize = 'sandtable.cop.unitSymbolSize',
	ShowCoordinateDisplay = 'sandtable.cop.showCoordinateDisplay',
	AutoSaveOrbat = 'sandtable.cop.autoSaveOrbat',
	AnimationDurationMs = 'sandtable.cop.animationDurationMs',
}

// ─── Default Values ───────────────────────────────────────────────────────────

export const COP_DEFAULT_TILE_FALLBACK = 'bundled:natural-earth';
export const COP_DEFAULT_SYMBOLOGY_STANDARD = '2525D';
export const COP_DEFAULT_COORDINATE_FORMAT = 'mgrs';
export const COP_DEFAULT_BASEMAP_THEME = 'light';
export const COP_DEFAULT_CENTER = '0,0';
export const COP_DEFAULT_ZOOM = 3;
export const COP_DEFAULT_UNIT_SYMBOL_SIZE = 35;
export const COP_DEFAULT_ANIMATION_DURATION_MS = 500;

// ─── Configuration Registration ───────────────────────────────────────────────

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'sandtable.cop',
	order: 115,
	title: nls.localize('sandtableCopConfigurationTitle', "Sandtable COP"),
	type: 'object',
	properties: {
		[CopConfigKeys.TileSource]: {
			type: 'string',
			default: '',
			description: nls.localize('sandtable.cop.tileSource', "Path or URL to .pmtiles tile archive. Supports workspace-relative paths (./maps/region.pmtiles), absolute paths (/mnt/shared/maps/germany.pmtiles), and HTTP URLs (http://map-server.local:8080/tiles.pmtiles). Empty uses the bundled Natural Earth fallback."),
		},
		[CopConfigKeys.TileFallback]: {
			type: 'string',
			default: COP_DEFAULT_TILE_FALLBACK,
			description: nls.localize('sandtable.cop.tileFallback', "Fallback tile source when the primary is unavailable. 'bundled:natural-earth' uses the bundled low-zoom world map."),
		},
		[CopConfigKeys.SymbologyStandard]: {
			type: 'string',
			default: COP_DEFAULT_SYMBOLOGY_STANDARD,
			enum: ['2525C', '2525D', '2525E', 'APP6B', 'APP6D', 'APP6E'],
			enumDescriptions: [
				nls.localize('sandtable.cop.symbology.2525C', "MIL-STD-2525C (US legacy)"),
				nls.localize('sandtable.cop.symbology.2525D', "MIL-STD-2525D (US current standard)"),
				nls.localize('sandtable.cop.symbology.2525E', "MIL-STD-2525E (US latest revision)"),
				nls.localize('sandtable.cop.symbology.APP6B', "STANAG APP-6B (NATO legacy)"),
				nls.localize('sandtable.cop.symbology.APP6D', "STANAG APP-6D (NATO current)"),
				nls.localize('sandtable.cop.symbology.APP6E', "STANAG APP-6E (NATO latest revision)"),
			],
			description: nls.localize('sandtable.cop.symbologyStandard', "Military symbology standard for unit symbol rendering. Per-workspace setting."),
		},
		[CopConfigKeys.DefaultCoordinateFormat]: {
			type: 'string',
			default: COP_DEFAULT_COORDINATE_FORMAT,
			enum: ['mgrs', 'latlon', 'utm'],
			enumDescriptions: [
				nls.localize('sandtable.cop.coordFormat.mgrs', "Military Grid Reference System (e.g., 38SMB4488306483)"),
				nls.localize('sandtable.cop.coordFormat.latlon', "Latitude/Longitude (e.g., 33.3152°N, 44.3661°E)"),
				nls.localize('sandtable.cop.coordFormat.utm', "Universal Transverse Mercator (e.g., 38S 544883 3683064)"),
			],
			description: nls.localize('sandtable.cop.defaultCoordinateFormat', "Default coordinate display format on the map."),
		},
		[CopConfigKeys.MgrsGridEnabled]: {
			type: 'boolean',
			default: false,
			description: nls.localize('sandtable.cop.mgrsGridEnabled', "Show MGRS grid overlay on the map."),
		},
		[CopConfigKeys.BasemapTheme]: {
			type: 'string',
			default: COP_DEFAULT_BASEMAP_THEME,
			enum: ['light', 'dark', 'grayscale', 'white', 'black'],
			enumDescriptions: [
				nls.localize('sandtable.cop.theme.light', "Light theme with standard colors"),
				nls.localize('sandtable.cop.theme.dark', "Dark theme for low-light environments"),
				nls.localize('sandtable.cop.theme.grayscale', "Grayscale theme for reduced visual distraction"),
				nls.localize('sandtable.cop.theme.white', "Minimal white background theme"),
				nls.localize('sandtable.cop.theme.black', "Minimal black background theme"),
			],
			description: nls.localize('sandtable.cop.basemapTheme', "Basemap color theme for the COP map."),
		},
		[CopConfigKeys.DefaultCenter]: {
			type: 'string',
			default: COP_DEFAULT_CENTER,
			description: nls.localize('sandtable.cop.defaultCenter', "Default map center as 'longitude,latitude' (e.g., '44.366,33.315' for Baghdad)."),
		},
		[CopConfigKeys.DefaultZoom]: {
			type: 'number',
			default: COP_DEFAULT_ZOOM,
			minimum: 0,
			maximum: 22,
			description: nls.localize('sandtable.cop.defaultZoom', "Default map zoom level (0-22). Higher values are more zoomed in."),
		},
		[CopConfigKeys.UnitSymbolSize]: {
			type: 'number',
			default: COP_DEFAULT_UNIT_SYMBOL_SIZE,
			minimum: 10,
			maximum: 100,
			description: nls.localize('sandtable.cop.unitSymbolSize', "Default size of military unit symbols in pixels."),
		},
		[CopConfigKeys.ShowCoordinateDisplay]: {
			type: 'boolean',
			default: true,
			description: nls.localize('sandtable.cop.showCoordinateDisplay', "Show cursor coordinate display overlay on the map."),
		},
		[CopConfigKeys.AutoSaveOrbat]: {
			type: 'boolean',
			default: true,
			description: nls.localize('sandtable.cop.autoSaveOrbat', "Automatically save ORBAT changes to workspace files."),
		},
		[CopConfigKeys.AnimationDurationMs]: {
			type: 'number',
			default: COP_DEFAULT_ANIMATION_DURATION_MS,
			minimum: 0,
			maximum: 5000,
			description: nls.localize('sandtable.cop.animationDurationMs', "Duration of unit movement animations when advancing timeline phases (milliseconds)."),
		},
	}
});
