/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICortexSystemSummary } from '../../../../platform/cortex/common/cortex.js';

const $ = dom.$;

/**
 * Compact CPU/RAM/disk progress bars from system metrics.
 * Renders into a parent element and exposes an update method.
 */
export class SandtableSystemSummary extends Disposable {

	private readonly _container: HTMLElement;
	private _cpuFill!: HTMLElement;
	private _cpuValue!: HTMLElement;
	private _ramFill!: HTMLElement;
	private _ramValue!: HTMLElement;
	private _diskFill!: HTMLElement;
	private _diskValue!: HTMLElement;

	constructor(parent: HTMLElement) {
		super();

		this._container = dom.append(parent, $('.sandtable-models-section'));

		const header = dom.append(this._container, $('.sandtable-models-section-header'));
		const titleEl = dom.append(header, $('h3.sandtable-models-section-title'));
		titleEl.textContent = 'System Overview';

		const barsContainer = dom.append(this._container, $('.sandtable-models-system-summary'));

		// CPU
		const cpuBar = this._createMetricBar(barsContainer, 'CPU');
		this._cpuFill = cpuBar.fill;
		this._cpuValue = cpuBar.value;

		// RAM
		const ramBar = this._createMetricBar(barsContainer, 'RAM');
		this._ramFill = ramBar.fill;
		this._ramValue = ramBar.value;

		// Disk
		const diskBar = this._createMetricBar(barsContainer, 'Disk');
		this._diskFill = diskBar.fill;
		this._diskValue = diskBar.value;
	}

	private _createMetricBar(parent: HTMLElement, name: string): { fill: HTMLElement; value: HTMLElement } {
		const bar = dom.append(parent, $('.sandtable-models-metric-bar'));

		const label = dom.append(bar, $('.sandtable-models-metric-label'));
		const nameEl = dom.append(label, $('span.sandtable-models-metric-name'));
		nameEl.textContent = name;
		const value = dom.append(label, $('span.sandtable-models-metric-value'));
		value.textContent = '—';

		const track = dom.append(bar, $('.sandtable-models-progress-track'));
		const fill = dom.append(track, $('.sandtable-models-progress-fill'));
		fill.style.width = '0%';

		return { fill, value };
	}

	/**
	 * Update the progress bars with new system metrics.
	 */
	update(summary: ICortexSystemSummary): void {
		this._updateBar(this._cpuFill, this._cpuValue, summary.cpu_pct, `${Math.round(summary.cpu_pct)}%`);
		this._updateBar(this._ramFill, this._ramValue, summary.ram_pct, `${Math.round(summary.ram_pct)}%`);
		this._updateBar(this._diskFill, this._diskValue, summary.disk_pct, `${Math.round(summary.disk_pct)}%`);
	}

	/**
	 * Show a placeholder / empty state.
	 */
	showEmpty(): void {
		this._cpuValue.textContent = '—';
		this._cpuFill.style.width = '0%';
		this._ramValue.textContent = '—';
		this._ramFill.style.width = '0%';
		this._diskValue.textContent = '—';
		this._diskFill.style.width = '0%';

		// Remove any color classes
		this._cpuFill.classList.remove('sandtable-models-progress-warning', 'sandtable-models-progress-danger');
		this._ramFill.classList.remove('sandtable-models-progress-warning', 'sandtable-models-progress-danger');
		this._diskFill.classList.remove('sandtable-models-progress-warning', 'sandtable-models-progress-danger');
	}

	private _updateBar(fill: HTMLElement, valueEl: HTMLElement, pct: number, label: string): void {
		const clampedPct = Math.max(0, Math.min(100, pct));
		fill.style.width = `${clampedPct}%`;
		valueEl.textContent = label;

		// Color coding based on usage level
		fill.classList.remove('sandtable-models-progress-warning', 'sandtable-models-progress-danger');
		if (clampedPct >= 90) {
			fill.classList.add('sandtable-models-progress-danger');
		} else if (clampedPct >= 75) {
			fill.classList.add('sandtable-models-progress-warning');
		}
	}

	get element(): HTMLElement {
		return this._container;
	}
}
