/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICortexGPUMetric } from '../../../../platform/cortex/common/cortex.js';

const $ = dom.$;

/**
 * Per-GPU cards showing name, VRAM usage progress bar, utilization percentage,
 * temperature with color coding (green<70C, yellow<85C, red>=85C), and
 * flash attention badge.
 */
export class SandtableGpuDashboard extends Disposable {

	private readonly _container: HTMLElement;
	private _grid!: HTMLElement;

	constructor(parent: HTMLElement) {
		super();

		this._container = dom.append(parent, $('.sandtable-models-section'));

		const header = dom.append(this._container, $('.sandtable-models-section-header'));
		const titleEl = dom.append(header, $('h3.sandtable-models-section-title'));
		titleEl.textContent = 'GPU Dashboard';

		this._grid = dom.append(this._container, $('.sandtable-models-gpu-grid'));
	}

	/**
	 * Update the GPU dashboard with new metrics.
	 * Re-renders all GPU cards.
	 */
	update(gpus: ICortexGPUMetric[]): void {
		dom.clearNode(this._grid);

		if (gpus.length === 0) {
			const empty = dom.append(this._grid, $('span.sandtable-models-list-empty'));
			empty.textContent = 'No GPUs detected';
			return;
		}

		for (const gpu of gpus) {
			this._renderGpuCard(gpu);
		}
	}

	/**
	 * Show empty / placeholder state.
	 */
	showEmpty(): void {
		dom.clearNode(this._grid);
		const empty = dom.append(this._grid, $('span.sandtable-models-list-empty'));
		empty.textContent = 'No GPU data available';
	}

	private _renderGpuCard(gpu: ICortexGPUMetric): void {
		const card = dom.append(this._grid, $('.sandtable-models-gpu-card'));

		// Header: name + index badge
		const header = dom.append(card, $('.sandtable-models-gpu-header'));
		const nameEl = dom.append(header, $('span.sandtable-models-gpu-name'));
		nameEl.textContent = gpu.name;
		nameEl.title = gpu.name;
		const indexEl = dom.append(header, $('span.sandtable-models-gpu-index'));
		indexEl.textContent = `GPU ${gpu.index}`;

		// VRAM usage
		const vramSection = dom.append(card, $('.sandtable-models-gpu-vram'));
		const vramLabel = dom.append(vramSection, $('.sandtable-models-gpu-vram-label'));

		const vramTitle = dom.append(vramLabel, $('span.sandtable-models-gpu-vram-text'));
		vramTitle.textContent = 'VRAM';

		const vramNumbers = dom.append(vramLabel, $('span.sandtable-models-gpu-vram-text'));
		const usedGb = (gpu.mem_used_mb / 1024).toFixed(1);
		const totalGb = (gpu.mem_total_mb / 1024).toFixed(1);
		const vramPct = gpu.mem_total_mb > 0 ? (gpu.mem_used_mb / gpu.mem_total_mb) * 100 : 0;
		vramNumbers.textContent = `${usedGb} / ${totalGb} GB (${Math.round(vramPct)}%)`;

		// VRAM progress bar
		const track = dom.append(vramSection, $('.sandtable-models-progress-track'));
		const fill = dom.append(track, $('.sandtable-models-progress-fill'));
		fill.style.width = `${Math.min(100, vramPct)}%`;
		if (vramPct >= 90) {
			fill.classList.add('sandtable-models-progress-danger');
		} else if (vramPct >= 75) {
			fill.classList.add('sandtable-models-progress-warning');
		}

		// Stats row: utilization, temperature, flash attention
		const stats = dom.append(card, $('.sandtable-models-gpu-stats'));

		// Utilization
		if (gpu.utilization_pct !== undefined) {
			const utilStat = dom.append(stats, $('span.sandtable-models-gpu-stat'));
			utilStat.innerHTML = `Util: <span class="sandtable-models-gpu-stat-value">${Math.round(gpu.utilization_pct)}%</span>`;
		}

		// Temperature
		if (gpu.temperature_c !== undefined) {
			const tempStat = dom.append(stats, $('span.sandtable-models-gpu-stat'));
			const tempClass = this._getTemperatureClass(gpu.temperature_c);
			tempStat.innerHTML = `Temp: <span class="sandtable-models-gpu-stat-value ${tempClass}">${Math.round(gpu.temperature_c)}\u00B0C</span>`;
		}

		// Flash attention badge
		const badge = dom.append(stats, $('span.sandtable-models-gpu-badge'));
		if (gpu.flash_attention_supported) {
			badge.classList.add('sandtable-models-gpu-badge-flash');
			badge.textContent = '\u26A1 Flash Attn';
			badge.title = 'Flash Attention supported';
		} else {
			badge.classList.add('sandtable-models-gpu-badge-no-flash');
			badge.textContent = 'No Flash Attn';
			badge.title = 'Flash Attention not supported';
		}
	}

	private _getTemperatureClass(tempC: number): string {
		if (tempC >= 85) {
			return 'sandtable-models-gpu-temp-red';
		} else if (tempC >= 70) {
			return 'sandtable-models-gpu-temp-yellow';
		}
		return 'sandtable-models-gpu-temp-green';
	}

	get element(): HTMLElement {
		return this._container;
	}
}
