/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandtableCopService, ICopUnit, CopAffiliation, CopEchelon, CopUnitStatus } from '../../../../platform/cortex/common/copTypes.js';
import { buildSidc, generateUnitId, getDefaultLayerId, getEchelonValues, getEchelonLabel, getUnitTypes, getUnitTypeLabel } from '../../../../platform/cortex/common/copUnitTypes.js';
import { SandtableCopMapRenderer } from './sandtableCopMapRenderer.js';
import { SandtableCopSymbology } from './sandtableCopSymbology.js';
import { ILogService } from '../../../../platform/log/common/log.js';

const $ = dom.$;

// ─── Affiliation Option ───────────────────────────────────────────────────────

interface AffiliationOption {
	value: CopAffiliation;
	label: string;
	color: string;
}

const AFFILIATIONS: AffiliationOption[] = [
	{ value: 'friendly', label: 'Friendly', color: '#2196f3' },
	{ value: 'hostile', label: 'Hostile', color: '#f44336' },
	{ value: 'neutral', label: 'Neutral', color: '#4caf50' },
	{ value: 'unknown', label: 'Unknown', color: '#ffeb3b' },
];

// ─── SandtableCopUnitPlacement ────────────────────────────────────────────────

/**
 * Handles unit placement on the COP map via a right-click context menu
 * that opens a configuration dialog. The user selects affiliation, echelon,
 * unit type, and enters a designation; the dialog shows a live SIDC preview
 * via milsymbol. On submit, a new ICopUnit is added to the COP service.
 */
export class SandtableCopUnitPlacement extends Disposable {

	private _dialog: HTMLElement | undefined;
	private _pendingCoordinates: [number, number] | undefined;

	constructor(
		private readonly mapContainer: HTMLElement,
		private readonly mapRenderer: SandtableCopMapRenderer,
		private readonly symbology: SandtableCopSymbology,
		private readonly copService: ISandtableCopService,
		private readonly logService: ILogService,
	) {
		super();
		this._setupContextMenu();
	}

	private _setupContextMenu(): void {
		const map = this.mapRenderer.map;
		if (!map) {
			return;
		}

		map.on('contextmenu', (e: any) => {
			e.preventDefault();
			this._pendingCoordinates = [e.lngLat.lng, e.lngLat.lat];
			this._showPlacementDialog();
		});
	}

	private _showPlacementDialog(): void {
		// Save coordinates before closing any existing dialog (since _closeDialog clears them)
		const coords = this._pendingCoordinates;

		// Remove existing dialog if open
		this._closeDialog();

		// Restore the coordinates that were set by the contextmenu handler
		this._pendingCoordinates = coords;

		const dialog = dom.append(this.mapContainer, $('.cop-unit-dialog'));
		this._dialog = dialog;

		// Header
		const header = dom.append(dialog, $('.cop-unit-dialog-header'));
		const title = dom.append(header, $('h3'));
		title.textContent = 'Place Unit';
		const closeBtn = dom.append(header, $('button.cop-unit-dialog-close'));
		closeBtn.textContent = '\u00d7';
		this._register(dom.addDisposableListener(closeBtn, 'click', () => this._closeDialog()));

		// Form
		const form = dom.append(dialog, $('.cop-unit-dialog-form'));

		// State for form values
		let selectedAffiliation: CopAffiliation = 'friendly';
		let selectedEchelon: CopEchelon = 'battalion';
		let selectedUnitType = 'infantry';
		let designation = '';
		let unitName = '';
		let commander = '';
		let strength = 0;

		// ─── Affiliation Buttons ──────────────────────────────────────
		const affGroup = dom.append(form, $('.cop-unit-dialog-group'));
		const affLabel = dom.append(affGroup, $('label'));
		affLabel.textContent = 'Affiliation';
		const affRow = dom.append(affGroup, $('.cop-unit-dialog-aff-row'));
		const affButtons: HTMLElement[] = [];

		for (const aff of AFFILIATIONS) {
			const btn = dom.append(affRow, $('button.cop-unit-dialog-aff-btn'));
			btn.textContent = aff.label;
			btn.style.borderColor = aff.color;
			if (aff.value === selectedAffiliation) {
				btn.classList.add('selected');
				btn.style.backgroundColor = aff.color;
				btn.style.color = (aff.value as string) === 'unknown' ? '#333' : '#fff';
			}
			affButtons.push(btn);

			this._register(dom.addDisposableListener(btn, 'click', () => {
				selectedAffiliation = aff.value;
				for (let i = 0; i < AFFILIATIONS.length; i++) {
					const b = affButtons[i];
					const a = AFFILIATIONS[i];
					if (a.value === selectedAffiliation) {
						b.classList.add('selected');
						b.style.backgroundColor = a.color;
						b.style.color = (a.value as string) === 'unknown' ? '#333' : '#fff';
					} else {
						b.classList.remove('selected');
						b.style.backgroundColor = '';
						b.style.color = '';
					}
				}
				updatePreview();
			}));
		}

		// ─── Echelon Dropdown ─────────────────────────────────────────
		const echGroup = dom.append(form, $('.cop-unit-dialog-group'));
		const echLabel = dom.append(echGroup, $('label'));
		echLabel.textContent = 'Echelon';
		const echSelect = dom.append(echGroup, $('select.cop-unit-dialog-select')) as HTMLSelectElement;
		for (const ech of getEchelonValues()) {
			const opt = dom.append(echSelect, $('option')) as HTMLOptionElement;
			opt.value = ech;
			opt.textContent = getEchelonLabel(ech);
			if (ech === selectedEchelon) {
				opt.selected = true;
			}
		}
		this._register(dom.addDisposableListener(echSelect, 'change', () => {
			selectedEchelon = echSelect.value as CopEchelon;
			updatePreview();
		}));

		// ─── Unit Type Dropdown ───────────────────────────────────────
		const typeGroup = dom.append(form, $('.cop-unit-dialog-group'));
		const typeLabel = dom.append(typeGroup, $('label'));
		typeLabel.textContent = 'Unit Type';
		const typeSelect = dom.append(typeGroup, $('select.cop-unit-dialog-select')) as HTMLSelectElement;
		for (const ut of getUnitTypes()) {
			const opt = dom.append(typeSelect, $('option')) as HTMLOptionElement;
			opt.value = ut;
			opt.textContent = getUnitTypeLabel(ut);
			if (ut === selectedUnitType) {
				opt.selected = true;
			}
		}
		this._register(dom.addDisposableListener(typeSelect, 'change', () => {
			selectedUnitType = typeSelect.value;
			updatePreview();
		}));

		// ─── Designation Input ────────────────────────────────────────
		const desGroup = dom.append(form, $('.cop-unit-dialog-group'));
		const desLabel = dom.append(desGroup, $('label'));
		desLabel.textContent = 'Designation';
		const desInput = dom.append(desGroup, $('input.cop-unit-dialog-input')) as HTMLInputElement;
		desInput.type = 'text';
		desInput.placeholder = 'e.g., 2-7 IN';
		this._register(dom.addDisposableListener(desInput, 'input', () => {
			designation = desInput.value;
			updatePreview();
		}));

		// ─── Name Input ───────────────────────────────────────────────
		const nameGroup = dom.append(form, $('.cop-unit-dialog-group'));
		const nameLabel = dom.append(nameGroup, $('label'));
		nameLabel.textContent = 'Full Name';
		const nameInput = dom.append(nameGroup, $('input.cop-unit-dialog-input')) as HTMLInputElement;
		nameInput.type = 'text';
		nameInput.placeholder = 'e.g., 2nd Battalion, 7th Infantry Regiment';
		this._register(dom.addDisposableListener(nameInput, 'input', () => {
			unitName = nameInput.value;
		}));

		// ─── Commander + Strength (row) ───────────────────────────────
		const cmdRow = dom.append(form, $('.cop-unit-dialog-row'));

		const cmdGroup = dom.append(cmdRow, $('.cop-unit-dialog-group.cop-unit-dialog-flex'));
		const cmdLabel = dom.append(cmdGroup, $('label'));
		cmdLabel.textContent = 'Commander';
		const cmdInput = dom.append(cmdGroup, $('input.cop-unit-dialog-input')) as HTMLInputElement;
		cmdInput.type = 'text';
		cmdInput.placeholder = 'e.g., LTC Smith';
		this._register(dom.addDisposableListener(cmdInput, 'input', () => {
			commander = cmdInput.value;
		}));

		const strGroup = dom.append(cmdRow, $('.cop-unit-dialog-group'));
		const strLabel = dom.append(strGroup, $('label'));
		strLabel.textContent = 'Strength';
		const strInput = dom.append(strGroup, $('input.cop-unit-dialog-input')) as HTMLInputElement;
		strInput.type = 'number';
		strInput.min = '0';
		strInput.placeholder = '0';
		strInput.style.width = '80px';
		this._register(dom.addDisposableListener(strInput, 'input', () => {
			strength = parseInt(strInput.value, 10) || 0;
		}));

		// ─── SIDC Preview ─────────────────────────────────────────────
		const previewGroup = dom.append(form, $('.cop-unit-dialog-group'));
		const previewLabel = dom.append(previewGroup, $('label'));
		previewLabel.textContent = 'Symbol Preview';
		const previewContainer = dom.append(previewGroup, $('.cop-unit-dialog-preview'));
		const previewSvg = dom.append(previewContainer, $('div.cop-unit-dialog-preview-svg'));
		const previewSidc = dom.append(previewContainer, $('span.cop-unit-dialog-preview-sidc'));

		const updatePreview = (): void => {
			const sidc = buildSidc(selectedAffiliation, selectedEchelon, selectedUnitType);
			previewSidc.textContent = sidc;
			const svg = this.symbology.generateSvgPreview(sidc, 50);
			if (svg) {
				// Use data URI in an <img> to avoid innerHTML CSP issues
				const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
				const existingImg = previewSvg.querySelector('img');
				if (existingImg) {
					existingImg.src = dataUri;
				} else {
					const img = document.createElement('img');
					img.src = dataUri;
					img.style.maxWidth = '80px';
					img.style.maxHeight = '60px';
					previewSvg.appendChild(img);
				}
			}
		};
		updatePreview();

		// ─── Submit / Cancel Buttons ──────────────────────────────────
		const actions = dom.append(form, $('.cop-unit-dialog-actions'));

		const cancelBtn = dom.append(actions, $('button.cop-unit-dialog-cancel-btn'));
		cancelBtn.textContent = 'Cancel';
		this._register(dom.addDisposableListener(cancelBtn, 'click', () => this._closeDialog()));

		const submitBtn = dom.append(actions, $('button.cop-unit-dialog-submit-btn'));
		submitBtn.textContent = 'Place Unit';
		this._register(dom.addDisposableListener(submitBtn, 'click', () => {
			this._placeUnit(
				selectedAffiliation,
				selectedEchelon,
				selectedUnitType,
				designation || getUnitTypeLabel(selectedUnitType),
				unitName,
				commander,
				strength,
			);
			this._closeDialog();
		}));

		// Focus the designation input
		desInput.focus();
	}

	private _placeUnit(
		affiliation: CopAffiliation,
		echelon: CopEchelon,
		unitType: string,
		designation: string,
		name: string,
		commander: string,
		strength: number,
	): void {
		if (!this._pendingCoordinates) {
			return;
		}

		const sidc = buildSidc(affiliation, echelon, unitType);
		const status: CopUnitStatus = 'present';
		const layerId = getDefaultLayerId(affiliation);

		const unit: ICopUnit = {
			id: generateUnitId(),
			coordinates: this._pendingCoordinates,
			properties: {
				sidc,
				designation,
				name: name || designation,
				affiliation,
				echelon,
				unitType,
				strength,
				status,
				commander,
				higherFormation: '',
				scenarioPhase: 0,
				notes: '',
				layerId,
			},
		};

		this.copService.addUnit(unit);
		this.logService.info(`[Sandtable COP Unit Placement] Placed unit: ${unit.id} (${designation}, ${affiliation} ${echelon} ${unitType})`);
	}

	private _closeDialog(): void {
		if (this._dialog) {
			this._dialog.remove();
			this._dialog = undefined;
		}
		this._pendingCoordinates = undefined;
	}

	override dispose(): void {
		this._closeDialog();
		super.dispose();
	}
}
