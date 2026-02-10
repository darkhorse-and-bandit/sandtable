/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IAsyncDataSource, ITreeRenderer, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { ISandtableCopService, ICopUnit, ICopOrbat } from '../../../../platform/cortex/common/copTypes.js';
import { getEchelonLabel, getAffiliationColor } from '../../../../platform/cortex/common/copUnitTypes.js';

const $ = dom.$;

// ─── Tree Element Types ───────────────────────────────────────────────────────

/** Root input for the tree data source */
type OrbatTreeInput = ICopOrbat;

/** Nodes in the tree are ICopUnit instances */
type OrbatTreeElement = ICopUnit;

// ─── Template Data ────────────────────────────────────────────────────────────

interface OrbatNodeTemplateData {
	container: HTMLElement;
	affiliationDot: HTMLElement;
	designation: HTMLElement;
	echelonBadge: HTMLElement;
	statusIndicator: HTMLElement;
	disposables: DisposableStore;
}

// ─── Data Source ──────────────────────────────────────────────────────────────

class OrbatDataSource implements IAsyncDataSource<OrbatTreeInput, OrbatTreeElement> {

	constructor(private readonly copService: ISandtableCopService) { }

	hasChildren(element: OrbatTreeInput | OrbatTreeElement): boolean {
		if (this._isOrbat(element)) {
			return element.roots.length > 0;
		}
		// It's a unit -- check if it has children in the ORBAT tree
		const orbat = this.copService.getOrbat();
		const children = orbat.tree[element.id];
		return !!children && children.length > 0;
	}

	async getChildren(element: OrbatTreeInput | OrbatTreeElement): Promise<OrbatTreeElement[]> {
		if (this._isOrbat(element)) {
			// Return root units
			const units: OrbatTreeElement[] = [];
			for (const rootId of element.roots) {
				const unit = this.copService.getUnit(rootId);
				if (unit) {
					units.push(unit);
				}
			}
			return units;
		}

		// Return children of this unit
		const orbat = this.copService.getOrbat();
		const childIds = orbat.tree[element.id] || [];
		const children: OrbatTreeElement[] = [];
		for (const childId of childIds) {
			const unit = this.copService.getUnit(childId);
			if (unit) {
				children.push(unit);
			}
		}
		return children;
	}

	private _isOrbat(element: OrbatTreeInput | OrbatTreeElement): element is OrbatTreeInput {
		return 'roots' in element && 'tree' in element;
	}
}

// ─── Virtual Delegate ─────────────────────────────────────────────────────────

class OrbatVirtualDelegate implements IListVirtualDelegate<OrbatTreeElement> {
	getHeight(_element: OrbatTreeElement): number {
		return 28;
	}

	getTemplateId(_element: OrbatTreeElement): string {
		return OrbatNodeRenderer.ID;
	}
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

class OrbatNodeRenderer implements ITreeRenderer<OrbatTreeElement, FuzzyScore, OrbatNodeTemplateData> {

	static readonly ID = 'orbatNode';

	get templateId(): string {
		return OrbatNodeRenderer.ID;
	}

	renderTemplate(container: HTMLElement): OrbatNodeTemplateData {
		const row = dom.append(container, $('.cop-orbat-node'));
		const affiliationDot = dom.append(row, $('span.cop-orbat-node-dot'));
		const designation = dom.append(row, $('span.cop-orbat-node-designation'));
		const echelonBadge = dom.append(row, $('span.cop-orbat-node-echelon'));
		const statusIndicator = dom.append(row, $('span.cop-orbat-node-status'));

		return {
			container: row,
			affiliationDot,
			designation,
			echelonBadge,
			statusIndicator,
			disposables: new DisposableStore(),
		};
	}

	renderElement(
		node: ITreeNode<OrbatTreeElement, FuzzyScore>,
		_index: number,
		templateData: OrbatNodeTemplateData,
	): void {
		const unit = node.element;

		// Affiliation color dot
		const color = getAffiliationColor(unit.properties.affiliation);
		templateData.affiliationDot.style.backgroundColor = color;

		// Designation text
		templateData.designation.textContent = unit.properties.designation || unit.id;

		// Echelon badge
		templateData.echelonBadge.textContent = getEchelonLabel(unit.properties.echelon);

		// Status indicator
		const status = unit.properties.status;
		templateData.statusIndicator.className = 'cop-orbat-node-status';
		if (status === 'destroyed' || status === 'not_operational') {
			templateData.statusIndicator.classList.add('cop-orbat-status-critical');
			templateData.statusIndicator.title = status;
		} else if (status === 'degraded') {
			templateData.statusIndicator.classList.add('cop-orbat-status-degraded');
			templateData.statusIndicator.title = 'degraded';
		} else {
			templateData.statusIndicator.classList.add('cop-orbat-status-operational');
			templateData.statusIndicator.title = status;
		}
	}

	disposeTemplate(templateData: OrbatNodeTemplateData): void {
		templateData.disposables.dispose();
	}
}

// ─── Identity Provider ────────────────────────────────────────────────────────

class OrbatIdentityProvider implements IIdentityProvider<OrbatTreeElement> {
	getId(element: OrbatTreeElement): string {
		return element.id;
	}
}

// ─── SandtableCopOrbatTreeViewPane ────────────────────────────────────────────

/**
 * ORBAT tree view displayed in the COP Activity Bar sidebar.
 * Shows a hierarchical view of all units organized by command structure.
 * Clicking a unit selects it on the map (bidirectional selection).
 */
export class SandtableCopOrbatTreeViewPane extends ViewPane {

	private _tree: WorkbenchAsyncDataTree<OrbatTreeInput, OrbatTreeElement, FuzzyScore> | undefined;
	private _treeContainer: HTMLElement | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService override readonly instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ISandtableCopService private readonly copService: ISandtableCopService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	override shouldShowWelcome(): boolean {
		const orbat = this.copService.getOrbat();
		return orbat.roots.length === 0;
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._treeContainer = dom.append(container, $('.cop-orbat-tree-container'));
		this._treeContainer.style.height = '100%';

		const dataSource = new OrbatDataSource(this.copService);
		const delegate = new OrbatVirtualDelegate();
		const renderer = new OrbatNodeRenderer();
		const identityProvider = new OrbatIdentityProvider();

		this._tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree<OrbatTreeInput, OrbatTreeElement, FuzzyScore>,
			'SandtableCopOrbatTree',
			this._treeContainer,
			delegate,
			[renderer],
			dataSource,
			{
				identityProvider,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel(element: OrbatTreeElement): string {
						return `${element.properties.designation} - ${element.properties.affiliation} ${element.properties.echelon} ${element.properties.unitType}`;
					},
					getWidgetAriaLabel(): string {
						return 'Order of Battle';
					},
				},
			}
		);

		this._register(this._tree);

		// Set initial input
		const orbat = this.copService.getOrbat();
		this._tree.setInput(orbat);

		// Handle tree selection -> select unit on map
		this._register(this._tree.onDidChangeSelection(e => {
			if (e.elements.length > 0) {
				const selectedUnit = e.elements[0];
				if (selectedUnit) {
					this.copService.selectUnit(selectedUnit.id);
				}
			}
		}));

		// Listen to ORBAT changes to refresh the tree and welcome state
		this._register(this.copService.onOrbatChanged((orbat) => {
			if (this._tree) {
				this._tree.setInput(orbat);
			}
			// Re-evaluate whether to show welcome view or tree
			this._onDidChangeViewWelcomeState.fire();
		}));

		// Listen to unit selection from map to highlight in tree
		this._register(this.copService.onUnitSelected((unitId) => {
			if (!this._tree || !unitId) {
				return;
			}
			const unit = this.copService.getUnit(unitId);
			if (unit) {
				// Reveal and select the unit in the tree
				try {
					this._tree.reveal(unit);
					this._tree.setSelection([unit]);
				} catch {
					// Unit may not be in the tree yet
				}
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._treeContainer) {
			this._treeContainer.style.height = `${height}px`;
			this._treeContainer.style.width = `${width}px`;
		}
		this._tree?.layout(height, width);
	}
}
