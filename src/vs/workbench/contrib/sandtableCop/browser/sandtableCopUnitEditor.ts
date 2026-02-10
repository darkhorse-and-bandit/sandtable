/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandtableCopService, ICopUnit, CopUnitStatus } from '../../../../platform/cortex/common/copTypes.js';
import { SandtableCopMapRenderer } from './sandtableCopMapRenderer.js';
import { SandtableCopSymbology } from './sandtableCopSymbology.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const $ = dom.$;

// ─── Status Options ───────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: CopUnitStatus; label: string }[] = [
	{ value: 'operational', label: 'Operational' },
	{ value: 'degraded', label: 'Degraded' },
	{ value: 'not_operational', label: 'Not Operational' },
	{ value: 'destroyed', label: 'Destroyed' },
	{ value: 'anticipated', label: 'Anticipated' },
	{ value: 'planned', label: 'Planned' },
	{ value: 'present', label: 'Present' },
	{ value: 'fully_capable', label: 'Fully Capable' },
];

// ─── SandtableCopUnitEditor ──────────────────────────────────────────────────

/**
 * Inline unit properties editor panel that appears when a unit is selected
 * on the map or in the ORBAT tree. Shows editable fields for the unit's
 * properties and provides Move Unit and Delete Unit actions.
 */
export class SandtableCopUnitEditor extends Disposable {

	private _panel: HTMLElement | undefined;
	private _moveMode = false;

	constructor(
		private readonly mapContainer: HTMLElement,
		private readonly mapRenderer: SandtableCopMapRenderer,
		private readonly symbology: SandtableCopSymbology,
		private readonly copService: ISandtableCopService,
		private readonly logService: ILogService,
	) {
		super();

		// Listen to unit selection events
		this._register(this.copService.onUnitSelected((unitId) => {
			if (unitId) {
				this._showEditor(unitId);
			} else {
				this._hideEditor();
			}
		}));
	}

	private _showEditor(unitId: string): void {
		const unit = this.copService.getUnit(unitId);
		if (!unit) {
			this._hideEditor();
			return;
		}

		// Remove existing panel
		this._hideEditor();

		const panel = dom.append(this.mapContainer, $('.cop-unit-editor'));
		this._panel = panel;

		// Header
		const header = dom.append(panel, $('.cop-unit-editor-header'));
		const headerTitle = dom.append(header, $('h4'));
		headerTitle.textContent = 'Unit Properties';
		const closeBtn = dom.append(header, $('button.cop-unit-editor-close'));
		closeBtn.textContent = '\u00d7';
		this._register(dom.addDisposableListener(closeBtn, 'click', () => {
			this.copService.selectUnit(null);
		}));

		// Symbol preview
		const previewRow = dom.append(panel, $('.cop-unit-editor-preview'));
		const previewSvg = dom.append(previewRow, $('div.cop-unit-editor-preview-svg'));
		this._renderSymbolPreview(previewSvg, unit);
		const previewInfo = dom.append(previewRow, $('div.cop-unit-editor-preview-info'));
		const sidcSpan = dom.append(previewInfo, $('span.cop-unit-editor-sidc'));
		sidcSpan.textContent = `SIDC: ${unit.properties.sidc}`;
		const coordSpan = dom.append(previewInfo, $('span.cop-unit-editor-coords'));
		coordSpan.textContent = `${unit.coordinates[1].toFixed(4)}\u00b0N, ${unit.coordinates[0].toFixed(4)}\u00b0E`;

		// Form fields
		const form = dom.append(panel, $('.cop-unit-editor-form'));

		// Designation
		this._createTextField(form, 'Designation', unit.properties.designation, (val) => {
			this.copService.updateUnit(unitId, { designation: val });
		});

		// Name
		this._createTextField(form, 'Full Name', unit.properties.name, (val) => {
			this.copService.updateUnit(unitId, { name: val });
		});

		// Commander
		this._createTextField(form, 'Commander', unit.properties.commander, (val) => {
			this.copService.updateUnit(unitId, { commander: val });
		});

		// Strength
		this._createNumberField(form, 'Strength', unit.properties.strength, (val) => {
			this.copService.updateUnit(unitId, { strength: val });
		});

		// Status dropdown
		this._createSelectField(form, 'Status',
			STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label })),
			unit.properties.status,
			(val) => {
				this.copService.updateUnit(unitId, { status: val as CopUnitStatus });
			},
		);

		// Notes
		this._createTextArea(form, 'Notes', unit.properties.notes, (val) => {
			this.copService.updateUnit(unitId, { notes: val });
		});

		// Action buttons
		const actions = dom.append(panel, $('.cop-unit-editor-actions'));

		const moveBtn = dom.append(actions, $('button.cop-unit-editor-move-btn'));
		moveBtn.textContent = 'Move Unit';
		this._register(dom.addDisposableListener(moveBtn, 'click', () => {
			this._enterMoveMode(unitId, moveBtn);
		}));

		const deleteBtn = dom.append(actions, $('button.cop-unit-editor-delete-btn'));
		deleteBtn.textContent = 'Delete Unit';
		this._register(dom.addDisposableListener(deleteBtn, 'click', () => {
			this._deleteUnit(unitId);
		}));
	}

	private _hideEditor(): void {
		if (this._panel) {
			this._panel.remove();
			this._panel = undefined;
		}
		this._exitMoveMode();
	}

	private _renderSymbolPreview(container: HTMLElement, unit: ICopUnit): void {
		const svg = this.symbology.generateSvgPreview(unit.properties.sidc, 50);
		if (svg) {
			const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
			const img = document.createElement('img');
			img.src = dataUri;
			img.style.maxWidth = '60px';
			img.style.maxHeight = '50px';
			container.appendChild(img);
		}
	}

	private _createTextField(parent: HTMLElement, label: string, value: string, onChange: (val: string) => void): void {
		const group = dom.append(parent, $('.cop-unit-editor-field'));
		const lbl = dom.append(group, $('label'));
		lbl.textContent = label;
		const input = dom.append(group, $('input')) as HTMLInputElement;
		input.type = 'text';
		input.value = value;
		this._register(dom.addDisposableListener(input, 'change', () => {
			onChange(input.value);
		}));
	}

	private _createNumberField(parent: HTMLElement, label: string, value: number, onChange: (val: number) => void): void {
		const group = dom.append(parent, $('.cop-unit-editor-field'));
		const lbl = dom.append(group, $('label'));
		lbl.textContent = label;
		const input = dom.append(group, $('input')) as HTMLInputElement;
		input.type = 'number';
		input.min = '0';
		input.value = String(value);
		this._register(dom.addDisposableListener(input, 'change', () => {
			onChange(parseInt(input.value, 10) || 0);
		}));
	}

	private _createSelectField(parent: HTMLElement, label: string, options: { value: string; label: string }[], current: string, onChange: (val: string) => void): void {
		const group = dom.append(parent, $('.cop-unit-editor-field'));
		const lbl = dom.append(group, $('label'));
		lbl.textContent = label;
		const select = dom.append(group, $('select')) as HTMLSelectElement;
		for (const opt of options) {
			const option = dom.append(select, $('option')) as HTMLOptionElement;
			option.value = opt.value;
			option.textContent = opt.label;
			if (opt.value === current) {
				option.selected = true;
			}
		}
		this._register(dom.addDisposableListener(select, 'change', () => {
			onChange(select.value);
		}));
	}

	private _createTextArea(parent: HTMLElement, label: string, value: string, onChange: (val: string) => void): void {
		const group = dom.append(parent, $('.cop-unit-editor-field'));
		const lbl = dom.append(group, $('label'));
		lbl.textContent = label;
		const textarea = dom.append(group, $('textarea')) as HTMLTextAreaElement;
		textarea.rows = 2;
		textarea.value = value;
		this._register(dom.addDisposableListener(textarea, 'change', () => {
			onChange(textarea.value);
		}));
	}

	private _enterMoveMode(unitId: string, moveBtn: HTMLElement): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		this._moveMode = true;
		moveBtn.textContent = 'Click map to place...';
		moveBtn.classList.add('active');
		map.getCanvas().style.cursor = 'crosshair';

		const moveHandler = (e: any) => {
			const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
			this.copService.moveUnit(unitId, coords);
			this.logService.info(`[Sandtable COP Unit Editor] Moved unit ${unitId} to [${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}]`);

			// Exit move mode
			map.off('click', moveHandler);
			this._moveMode = false;
			moveBtn.textContent = 'Move Unit';
			moveBtn.classList.remove('active');
			map.getCanvas().style.cursor = '';

			// Re-show editor with updated data
			this._showEditor(unitId);
		};

		map.once('click', moveHandler);
	}

	private _exitMoveMode(): void {
		if (this._moveMode) {
			this._moveMode = false;
			const map = this.mapRenderer.map;
			if (map) {
				map.getCanvas().style.cursor = '';
			}
		}
	}

	private _deleteUnit(unitId: string): void {
		// Simple confirmation via a temporary DOM confirm dialog
		const unit = this.copService.getUnit(unitId);
		const designation = unit?.properties.designation || unitId;

		// Create a confirm overlay
		const overlay = dom.append(this.mapContainer, $('.cop-unit-editor-confirm'));
		const confirmBox = dom.append(overlay, $('.cop-unit-editor-confirm-box'));
		const msg = dom.append(confirmBox, $('p'));
		msg.textContent = `Delete unit "${designation}"? This cannot be undone.`;

		const btnRow = dom.append(confirmBox, $('.cop-unit-editor-confirm-actions'));

		const cancelBtn = dom.append(btnRow, $('button.cop-unit-editor-cancel-btn'));
		cancelBtn.textContent = 'Cancel';
		this._register(dom.addDisposableListener(cancelBtn, 'click', () => {
			overlay.remove();
		}));

		const confirmBtn = dom.append(btnRow, $('button.cop-unit-editor-delete-confirm-btn'));
		confirmBtn.textContent = 'Delete';
		this._register(dom.addDisposableListener(confirmBtn, 'click', () => {
			this.copService.removeUnit(unitId);
			overlay.remove();
			this._hideEditor();
			this.logService.info(`[Sandtable COP Unit Editor] Deleted unit: ${unitId}`);
		}));
	}

	override dispose(): void {
		this._hideEditor();
		super.dispose();
	}
}
