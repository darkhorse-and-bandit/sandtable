/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandtableCopService, ICopUnit, ICopOrbat, ICopUnitProperties, CopAffiliation, CopEchelon, CopUnitStatus } from '../../../../platform/cortex/common/copTypes.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CopConfigKeys } from '../../../../platform/cortex/common/copConfiguration.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';

// ─── SandtableCopOrbatIO ─────────────────────────────────────────────────────

/**
 * Handles ORBAT import/export to workspace files.
 *
 * Export writes two files:
 *   - .sandtable/cop/orbat.geojson (unit positions as GeoJSON FeatureCollection)
 *   - .sandtable/cop/orbat-tree.json (hierarchy structure)
 *
 * Import reads either or both files and loads them into the COP service.
 *
 * Auto-save: When enabled, subscribes to onOrbatChanged and debounce-writes
 * to workspace files after each change.
 */
export class SandtableCopOrbatIO extends Disposable {

	private readonly _autoSaveScheduler: RunOnceScheduler;

	/** Suppresses auto-save during initial workspace load to avoid overwriting files mid-read */
	private _loading = false;

	constructor(
		private readonly copService: ISandtableCopService,
		private readonly fileService: IFileService,
		private readonly fileDialogService: IFileDialogService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) {
		super();

		// Set up auto-save scheduler (500ms debounce)
		this._autoSaveScheduler = this._register(new RunOnceScheduler(() => {
			this._autoSave();
		}, 500));

		// Listen for ORBAT changes and trigger auto-save if enabled
		this._register(this.copService.onOrbatChanged(() => {
			if (this._loading) {
				return; // Suppress auto-save during initial workspace load
			}
			const autoSave = this.configurationService.getValue<boolean>(CopConfigKeys.AutoSaveOrbat);
			if (autoSave !== false) {
				this._autoSaveScheduler.schedule();
			}
		}));
	}

	// ─── Load from Workspace (Startup) ────────────────────────────────────

	/**
	 * Load a previously saved ORBAT from workspace files (.sandtable/cop/).
	 * Called on startup to restore unit state from the last session.
	 *
	 * Reads orbat.geojson (unit positions) and orbat-tree.json (hierarchy),
	 * populates the COP service, then fires onOrbatChanged so the map and
	 * ORBAT tree update.
	 *
	 * Safe to call when no saved files exist -- silently returns.
	 */
	async loadFromWorkspace(): Promise<void> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			return;
		}

		// Suppress auto-save while loading to prevent overwriting the files we're reading
		this._loading = true;

		let unitCount = 0;
		try {
			const copDir = URI.joinPath(workspaceUri, '.sandtable', 'cop');
			const geojsonUri = URI.joinPath(copDir, 'orbat.geojson');
			const treeUri = URI.joinPath(copDir, 'orbat-tree.json');

			// Check if the GeoJSON file exists
			let geojsonContent: string | undefined;
			try {
				const file = await this.fileService.readFile(geojsonUri);
				geojsonContent = file.value.toString();
			} catch {
				// File doesn't exist or can't be read -- no saved ORBAT
				return;
			}

			// Parse and load the GeoJSON units
			try {
				const parsed = JSON.parse(geojsonContent);
				if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
					for (const feature of parsed.features) {
						if (feature.type !== 'Feature' || !feature.geometry || feature.geometry.type !== 'Point') {
							continue;
						}

						const coords = feature.geometry.coordinates as [number, number];
						const props = feature.properties || {};
						const id = feature.id || `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

						const unit: ICopUnit = {
							id,
							coordinates: coords,
							properties: {
								sidc: props.sidc || '10000000000000000000',
								designation: props.designation || id,
								name: props.name || props.designation || id,
								affiliation: (props.affiliation || 'unknown') as CopAffiliation,
								echelon: (props.echelon || 'battalion') as CopEchelon,
								unitType: props.unitType || 'unknown_unit',
								strength: props.strength || 0,
								status: (props.status || 'present') as CopUnitStatus,
								commander: props.commander || '',
								higherFormation: props.higherFormation || '',
								scenarioPhase: props.scenarioPhase || 0,
								notes: props.notes || '',
								layerId: props.layerId || 'friendly-orbat',
								textModifiers: props.textModifiers,
							} as ICopUnitProperties,
						};

						this.copService.addUnit(unit);
						unitCount++;
					}
				}
			} catch (err) {
				this.logService.warn('[Sandtable COP IO] Failed to parse orbat.geojson:', err);
			}

			// Load the tree structure (overrides the tree built by addUnit calls above
			// with the full saved hierarchy that may include reparenting)
			try {
				const treeFile = await this.fileService.readFile(treeUri);
				const treeJson = JSON.parse(treeFile.value.toString());

				if (treeJson.roots && treeJson.tree) {
					const orbat: ICopOrbat = {
						name: treeJson.name || 'Default ORBAT',
						standard: treeJson.standard || '2525D',
						roots: treeJson.roots || [],
						tree: treeJson.tree || {},
					};
					this.copService.setOrbat(orbat);
				}
			} catch {
				// Tree file missing or unparseable -- the addUnit calls above
				// already built a flat tree, so units will still appear
			}
		} finally {
			// Always re-enable auto-save, even if loading failed partway through
			this._loading = false;
		}

		if (unitCount > 0) {
			this.logService.info(`[Sandtable COP IO] Loaded ${unitCount} units from workspace (.sandtable/cop/).`);
		}
	}

	// ─── Export ────────────────────────────────────────────────────────────

	/**
	 * Export the current ORBAT to workspace files.
	 */
	async exportOrbat(): Promise<void> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			this.logService.warn('[Sandtable COP IO] No workspace open, cannot export ORBAT.');
			return;
		}

		try {
			// Build GeoJSON FeatureCollection
			const units = this.copService.getUnits();
			const geojson = this._buildGeoJson(units);

			// Build tree JSON
			const orbat = this.copService.getOrbat();
			const treeJson = JSON.stringify(orbat, null, 2);

			// Write files
			const copDir = URI.joinPath(workspaceUri, '.sandtable', 'cop');
			const geojsonUri = URI.joinPath(copDir, 'orbat.geojson');
			const treeUri = URI.joinPath(copDir, 'orbat-tree.json');

			await this.fileService.writeFile(geojsonUri, VSBuffer.fromString(JSON.stringify(geojson, null, 2)));
			await this.fileService.writeFile(treeUri, VSBuffer.fromString(treeJson));

			this.logService.info(`[Sandtable COP IO] Exported ORBAT: ${units.length} units to ${geojsonUri.toString()}`);
		} catch (err) {
			this.logService.error('[Sandtable COP IO] Failed to export ORBAT:', err);
		}
	}

	// ─── Import ───────────────────────────────────────────────────────────

	/**
	 * Import an ORBAT from a file selected via file dialog.
	 */
	async importOrbat(): Promise<void> {
		try {
			const result = await this.fileDialogService.showOpenDialog({
				title: 'Import ORBAT',
				filters: [
					{ name: 'GeoJSON', extensions: ['geojson', 'json'] },
				],
				canSelectMany: false,
			});

			if (!result || result.length === 0) {
				return;
			}

			const fileUri = result[0];
			const content = await this.fileService.readFile(fileUri);
			const text = content.value.toString();
			const parsed = JSON.parse(text);

			if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
				// It's a GeoJSON file -- import unit positions
				await this._importGeoJson(parsed);
			} else if (parsed.roots && parsed.tree) {
				// It's an orbat-tree.json
				this._importOrbatTree(parsed);
			} else {
				this.logService.warn('[Sandtable COP IO] Unrecognized file format. Expected GeoJSON FeatureCollection or ORBAT tree JSON.');
			}
		} catch (err) {
			this.logService.error('[Sandtable COP IO] Failed to import ORBAT:', err);
		}
	}

	/**
	 * Import from a GeoJSON FeatureCollection.
	 */
	private async _importGeoJson(geojson: any): Promise<void> {
		const features = geojson.features as any[];
		let imported = 0;

		for (const feature of features) {
			if (feature.type !== 'Feature' || !feature.geometry || feature.geometry.type !== 'Point') {
				continue;
			}

			const coords = feature.geometry.coordinates as [number, number];
			const props = feature.properties || {};
			const id = feature.id || `unit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

			const unit: ICopUnit = {
				id,
				coordinates: coords,
				properties: {
					sidc: props.sidc || '10000000000000000000',
					designation: props.designation || id,
					name: props.name || props.designation || id,
					affiliation: (props.affiliation || 'unknown') as CopAffiliation,
					echelon: (props.echelon || 'battalion') as CopEchelon,
					unitType: props.unitType || 'unknown_unit',
					strength: props.strength || 0,
					status: (props.status || 'present') as CopUnitStatus,
					commander: props.commander || '',
					higherFormation: props.higherFormation || '',
					scenarioPhase: props.scenarioPhase || 0,
					notes: props.notes || '',
					layerId: props.layerId || 'friendly-orbat',
					textModifiers: props.textModifiers,
				} as ICopUnitProperties,
			};

			this.copService.addUnit(unit);
			imported++;
		}

		this.logService.info(`[Sandtable COP IO] Imported ${imported} units from GeoJSON.`);

		// Also try to load accompanying tree file from same directory
		// (user may have exported both files together)
	}

	/**
	 * Import an ORBAT tree structure.
	 */
	private _importOrbatTree(tree: any): void {
		const orbat: ICopOrbat = {
			name: tree.name || 'Imported ORBAT',
			standard: tree.standard || '2525D',
			roots: tree.roots || [],
			tree: tree.tree || {},
		};
		this.copService.setOrbat(orbat);
		this.logService.info(`[Sandtable COP IO] Imported ORBAT tree: ${orbat.name} with ${orbat.roots.length} root units.`);
	}

	// ─── Private: Auto-Save ───────────────────────────────────────────────

	private async _autoSave(): Promise<void> {
		const workspaceUri = this._getWorkspaceUri();
		if (!workspaceUri) {
			return;
		}

		try {
			const units = this.copService.getUnits();
			const geojson = this._buildGeoJson(units);
			const orbat = this.copService.getOrbat();

			const copDir = URI.joinPath(workspaceUri, '.sandtable', 'cop');
			const geojsonUri = URI.joinPath(copDir, 'orbat.geojson');
			const treeUri = URI.joinPath(copDir, 'orbat-tree.json');

			await this.fileService.writeFile(geojsonUri, VSBuffer.fromString(JSON.stringify(geojson, null, 2)));
			await this.fileService.writeFile(treeUri, VSBuffer.fromString(JSON.stringify(orbat, null, 2)));
		} catch {
			// Silent failure on auto-save -- don't spam logs
		}
	}

	// ─── Private: Helpers ─────────────────────────────────────────────────

	private _buildGeoJson(units: ICopUnit[]): any {
		return {
			type: 'FeatureCollection',
			features: units.map(unit => ({
				type: 'Feature',
				id: unit.id,
				geometry: {
					type: 'Point',
					coordinates: unit.coordinates,
				},
				properties: {
					...unit.properties,
				},
			})),
		};
	}

	private _getWorkspaceUri(): URI | undefined {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length > 0) {
			return folders[0].uri;
		}
		return undefined;
	}
}
