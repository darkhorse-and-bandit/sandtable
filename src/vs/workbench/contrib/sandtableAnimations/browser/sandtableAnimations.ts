/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GeoShapeType = 'circle' | 'line' | 'hexagon' | 'triangle';

export type GeoAnimationType = 'drift' | 'orbit' | 'rotate' | 'draw';

export interface IGeoShapeOptions {
	/** Number of shapes to generate (default: 5) */
	shapeCount?: number;
	/** Shape types to include (default: all) */
	types?: GeoShapeType[];
	/** Base opacity for shapes 0.0-1.0 (default: 0.08) */
	opacity?: number;
	/** Shadow depth in px for drop-shadow (default: 1, set to 0 for no shadow) */
	shadowDepth?: number;
	/** Minimum animation duration in seconds (default: 40) */
	minDuration?: number;
	/** Maximum animation duration in seconds (default: 120) */
	maxDuration?: number;
	/** Minimum shape size in px (default: 30) */
	minSize?: number;
	/** Maximum shape size in px (default: 150) */
	maxSize?: number;
}

interface ShapeDefinition {
	type: GeoShapeType;
	animation: GeoAnimationType;
	size: number;
	x: number;
	y: number;
	opacity: number;
	duration: number;
	delay: number;
	rotation: number;
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

function randomPick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

const ANIMATION_MAP: Record<GeoShapeType, GeoAnimationType[]> = {
	circle: ['drift', 'orbit', 'rotate'],
	line: ['drift', 'draw'],
	hexagon: ['drift', 'rotate'],
	triangle: ['drift', 'rotate'],
};

// ─── SVG Shape Generators (DOM API — no innerHTML / TrustedTypes needed) ──────

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgRoot(width: number, height: number): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	return svg;
}

function createCircleSvgEl(size: number): SVGSVGElement {
	const r = size / 2 - 1;
	const cx = size / 2;
	const cy = size / 2;
	const svg = createSvgRoot(size, size);
	const circle = document.createElementNS(SVG_NS, 'circle');
	circle.setAttribute('cx', String(cx));
	circle.setAttribute('cy', String(cy));
	circle.setAttribute('r', String(r));
	svg.appendChild(circle);
	return svg;
}

function createLineSvgEl(size: number, rotation: number): SVGSVGElement {
	const length = size;
	const hw = Math.max(size, 10);
	const svg = createSvgRoot(length, hw);
	svg.style.transform = `rotate(${rotation}deg)`;
	const line = document.createElementNS(SVG_NS, 'line');
	line.setAttribute('x1', '0');
	line.setAttribute('y1', String(hw / 2));
	line.setAttribute('x2', String(length));
	line.setAttribute('y2', String(hw / 2));
	line.classList.add('sandtable-draw-path');
	line.setAttribute('pathLength', '100');
	svg.appendChild(line);
	return svg;
}

function createHexagonSvgEl(size: number): SVGSVGElement {
	const cx = size / 2;
	const cy = size / 2;
	const r = size / 2 - 2;
	const pts: string[] = [];
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i - Math.PI / 6;
		pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
	}
	const svg = createSvgRoot(size, size);
	const polygon = document.createElementNS(SVG_NS, 'polygon');
	polygon.setAttribute('points', pts.join(' '));
	svg.appendChild(polygon);
	return svg;
}

function createTriangleSvgEl(size: number): SVGSVGElement {
	const cx = size / 2;
	const r = size / 2 - 2;
	const pts: string[] = [];
	for (let i = 0; i < 3; i++) {
		const angle = (2 * Math.PI / 3) * i - Math.PI / 2;
		pts.push(`${cx + r * Math.cos(angle)},${cx + r * Math.sin(angle)}`);
	}
	const svg = createSvgRoot(size, size);
	const polygon = document.createElementNS(SVG_NS, 'polygon');
	polygon.setAttribute('points', pts.join(' '));
	svg.appendChild(polygon);
	return svg;
}

const SVG_GENERATORS: Record<GeoShapeType, (size: number, rotation: number) => SVGSVGElement> = {
	circle: (size) => createCircleSvgEl(size),
	line: (size, rotation) => createLineSvgEl(size, rotation),
	hexagon: (size) => createHexagonSvgEl(size),
	triangle: (size) => createTriangleSvgEl(size),
};

// ─── Shape Definition Generator ───────────────────────────────────────────────

function generateShapeDefinitions(options: Required<IGeoShapeOptions>): ShapeDefinition[] {
	const shapes: ShapeDefinition[] = [];
	for (let i = 0; i < options.shapeCount; i++) {
		const type = randomPick(options.types);
		const animation = randomPick(ANIMATION_MAP[type]);
		const size = type === 'line'
			? randomBetween(100, Math.max(options.maxSize * 2, 200))
			: randomBetween(options.minSize, options.maxSize);
		shapes.push({
			type,
			animation,
			size: Math.round(size),
			x: randomBetween(5, 90),
			y: randomBetween(5, 90),
			opacity: options.opacity * randomBetween(0.5, 1.5),
			duration: randomBetween(options.minDuration, options.maxDuration),
			delay: randomBetween(0, 15),
			rotation: type === 'line' ? randomBetween(-45, 45) : 0,
		});
	}
	return shapes;
}

// ─── DOM Creation ─────────────────────────────────────────────────────────────

function createShapeElement(shape: ShapeDefinition, shadowDepth: number): HTMLDivElement {
	const wrapper = document.createElement('div');
	wrapper.className = 'sandtable-geo-shape';

	// Animation class
	switch (shape.animation) {
		case 'drift': wrapper.classList.add('sandtable-anim-drift'); break;
		case 'orbit': wrapper.classList.add('sandtable-anim-orbit'); break;
		case 'rotate': wrapper.classList.add('sandtable-anim-rotate'); break;
		case 'draw': wrapper.classList.add('sandtable-anim-drift'); break;
	}

	// Shadow
	if (shadowDepth > 0) {
		wrapper.classList.add('sandtable-shadow-depth');
	}

	// Position
	wrapper.style.left = `${shape.x}%`;
	wrapper.style.top = `${shape.y}%`;
	wrapper.style.opacity = `${Math.min(shape.opacity, 0.15).toFixed(3)}`;
	wrapper.style.setProperty('--sandtable-anim-duration', `${Math.round(shape.duration)}s`);
	wrapper.style.animationDelay = `${shape.delay.toFixed(1)}s`;

	// SVG content (DOM API — no innerHTML / TrustedTypes needed)
	const svgFn = SVG_GENERATORS[shape.type];
	const svgEl = svgFn(shape.size, shape.rotation);
	wrapper.appendChild(svgEl);

	return wrapper;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates an animated geometric background overlay inside the given container.
 *
 * The overlay is positioned absolutely with z-index 0, pointer-events none,
 * and will not interfere with any interactive content.
 *
 * @param container The HTML element to insert the geometric background into.
 *   The container should have `position: relative` (or absolute/fixed) for
 *   proper overlay positioning.
 * @param options Configuration for shapes, opacity, shadows, and animation timing.
 * @returns A disposable that removes all created elements when disposed.
 */
export function createGeometricBackground(
	container: HTMLElement,
	options?: IGeoShapeOptions
): IDisposable {
	const resolved: Required<IGeoShapeOptions> = {
		shapeCount: options?.shapeCount ?? 5,
		types: options?.types ?? ['circle', 'line', 'hexagon', 'triangle'],
		opacity: options?.opacity ?? 0.08,
		shadowDepth: options?.shadowDepth ?? 1,
		minDuration: options?.minDuration ?? 40,
		maxDuration: options?.maxDuration ?? 120,
		minSize: options?.minSize ?? 30,
		maxSize: options?.maxSize ?? 150,
	};

	const canvas = document.createElement('div');
	canvas.className = 'sandtable-geo-canvas';

	const shapes = generateShapeDefinitions(resolved);
	for (const shape of shapes) {
		const el = createShapeElement(shape, resolved.shadowDepth);
		canvas.appendChild(el);
	}

	container.appendChild(canvas);

	return toDisposable(() => {
		canvas.remove();
	});
}

/**
 * Adds the gradient sweep processing overlay to an element.
 * The element will have a subtle left-to-right gradient that sweeps
 * across it to indicate ongoing processing.
 *
 * @param element The element to add the sweep overlay to.
 * @returns A disposable that removes the overlay classes when disposed.
 */
export function addGradientSweep(element: HTMLElement): IDisposable {
	element.classList.add('sandtable-sweep-overlay');
	return toDisposable(() => {
		element.classList.remove('sandtable-sweep-overlay');
	});
}

/**
 * Adds the border pulse animation to an element.
 *
 * @param element The element to animate.
 * @returns A disposable that removes the animation class when disposed.
 */
export function addBorderPulse(element: HTMLElement): IDisposable {
	element.classList.add('sandtable-anim-border-pulse');
	return toDisposable(() => {
		element.classList.remove('sandtable-anim-border-pulse');
	});
}

/**
 * Adds fade-in entrance animation to an element.
 *
 * @param element The element to animate.
 * @returns A disposable that removes the animation class when disposed.
 */
export function addFadeEnter(element: HTMLElement): IDisposable {
	element.classList.add('sandtable-anim-fade-enter');
	return toDisposable(() => {
		element.classList.remove('sandtable-anim-fade-enter');
	});
}

/**
 * Adds staggered card entrance animations to child elements.
 * Each child receives a delayed card-enter animation.
 *
 * @param container The parent element whose direct children will animate.
 * @param delayStepMs Delay between each child's animation start in ms (default: 40).
 * @param selector Optional CSS selector to filter children (default: all direct children).
 * @returns A disposable that removes all animation classes.
 */
export function addStaggeredEntrance(
	container: HTMLElement,
	delayStepMs: number = 40,
	selector?: string
): IDisposable {
	const children = selector
		? Array.from(container.querySelectorAll(selector)) as HTMLElement[]
		: Array.from(container.children) as HTMLElement[];

	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		child.classList.add('sandtable-anim-card-enter');
		child.style.animationDelay = `${(i * delayStepMs)}ms`;
	}

	return toDisposable(() => {
		for (const child of children) {
			child.classList.remove('sandtable-anim-card-enter');
			child.style.removeProperty('animation-delay');
		}
	});
}

/**
 * Adds a section fade transition to an element (for content switches).
 *
 * @param element The element to animate.
 * @returns A disposable that removes the animation class when disposed.
 */
export function addSectionFade(element: HTMLElement): IDisposable {
	// Remove and re-add to retrigger animation
	element.classList.remove('sandtable-anim-section-fade');
	// Force reflow to reset animation
	void element.offsetWidth;
	element.classList.add('sandtable-anim-section-fade');
	return toDisposable(() => {
		element.classList.remove('sandtable-anim-section-fade');
	});
}

// ─── Centered Composition (Sacred Geometry Emblem) ────────────────────────────

export interface ICompositionOptions {
	/** SVG viewport size in px (default: 400) */
	size?: number;
	/** Base opacity 0.0-1.0 (default: 0.12) */
	opacity?: number;
	/** Number of outer concentric ring circles (default: 4) */
	ringCount?: number;
	/** Number of radiating lines through center (default: 8) */
	lineCount?: number;
	/** Radius of the solid center hexagon in SVG units (default: 30) */
	hexRadius?: number;
	/** Multiplier for all rotation durations (default: 1). Use 2 for half-speed. */
	slowFactor?: number;
}

/**
 * Creates a centered sacred-geometry composition: concentric circles, radiating
 * lines, and a solid hexagon center. Each layer rotates at a different speed,
 * some counter-clockwise, producing a slowly morphing intersection effect.
 *
 * The composition is absolutely positioned at the center of the container.
 * The container must have `position: relative` (or absolute/fixed).
 *
 * @returns A disposable that removes the composition when disposed.
 */
export function createCenteredComposition(
	container: HTMLElement,
	options?: ICompositionOptions
): IDisposable {
	const size = options?.size ?? 400;
	const opacity = options?.opacity ?? 0.12;
	const ringCount = options?.ringCount ?? 4;
	const lineCount = options?.lineCount ?? 8;
	const hexRadius = options?.hexRadius ?? 30;
	const slowFactor = options?.slowFactor ?? 1;

	const cx = size / 2;
	const cy = size / 2;
	const maxR = size / 2 - 10; // leave a small margin

	// ─── Create wrapper div ───
	const wrapper = document.createElement('div');
	wrapper.className = 'sandtable-composition';
	wrapper.style.opacity = `${opacity}`;

	// ─── Create SVG root ───
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
	svg.setAttribute('width', String(size));
	svg.setAttribute('height', String(size));
	svg.style.overflow = 'visible';

	// Helper: configure a layer group with rotation and explicit transform-origin
	// Duration is scaled by slowFactor (e.g., slowFactor=2 doubles the duration = half speed)
	const configureLayer = (g: SVGGElement, animation: string, duration: string): void => {
		const baseSec = parseInt(duration, 10);
		const scaledDuration = `${baseSec * slowFactor}s`;
		g.classList.add('sandtable-composition-layer');
		g.style.setProperty('--sandtable-comp-animation', animation);
		g.style.setProperty('--sandtable-comp-duration', scaledDuration);
		g.style.setProperty('--sandtable-comp-direction', 'normal');
		// Explicit center point so all layers rotate around the same SVG center
		g.style.setProperty('--sandtable-comp-cx', `${cx}px`);
		g.style.setProperty('--sandtable-comp-cy', `${cy}px`);
	};

	// ─── Layer 1: Outer rings (slowest, clockwise 90s) ───
	const outerRings = document.createElementNS(SVG_NS, 'g');
	configureLayer(outerRings, 'sandtable-rotate-cw', '90s');

	for (let i = 0; i < ringCount; i++) {
		const r = maxR - i * (maxR * 0.18);
		const circle = document.createElementNS(SVG_NS, 'circle');
		circle.setAttribute('cx', String(cx));
		circle.setAttribute('cy', String(cy));
		circle.setAttribute('r', String(Math.round(r)));
		// Alternate between solid and dashed
		if (i % 2 === 0) {
			circle.setAttribute('stroke-dasharray', '8 4');
		}
		outerRings.appendChild(circle);
	}
	svg.appendChild(outerRings);

	// ─── Layer 2: Radiating spokes at varying lengths (counter-clockwise 60s) ───
	const spokes = document.createElementNS(SVG_NS, 'g');
	configureLayer(spokes, 'sandtable-rotate-ccw', '60s');

	for (let i = 0; i < lineCount; i++) {
		const angle = (Math.PI / lineCount) * i;
		// Alternate spoke lengths: long, medium, short
		const lengthFactor = i % 3 === 0 ? 1.0 : i % 3 === 1 ? 0.7 : 0.45;
		const spokeExtent = (maxR + 5) * lengthFactor;
		const x1 = cx + spokeExtent * Math.cos(angle);
		const y1 = cy + spokeExtent * Math.sin(angle);
		const x2 = cx - spokeExtent * Math.cos(angle);
		const y2 = cy - spokeExtent * Math.sin(angle);
		const line = document.createElementNS(SVG_NS, 'line');
		line.setAttribute('x1', String(Math.round(x1 * 100) / 100));
		line.setAttribute('y1', String(Math.round(y1 * 100) / 100));
		line.setAttribute('x2', String(Math.round(x2 * 100) / 100));
		line.setAttribute('y2', String(Math.round(y2 * 100) / 100));
		spokes.appendChild(line);
	}
	svg.appendChild(spokes);

	// ─── Layer 3: Compass tick marks — short lines like a watch face (clockwise 45s) ───
	const ticks = document.createElementNS(SVG_NS, 'g');
	configureLayer(ticks, 'sandtable-rotate-cw', '45s');

	const tickCount = 36; // Every 10 degrees
	const tickOuterR = maxR * 0.58;
	for (let i = 0; i < tickCount; i++) {
		const angle = (2 * Math.PI / tickCount) * i;
		// Major ticks every 90 deg (4 cardinal), medium every 45, short the rest
		const isMajor = i % 9 === 0;
		const isMedium = i % 3 === 0 && !isMajor;
		const tickLength = isMajor ? maxR * 0.12 : isMedium ? maxR * 0.07 : maxR * 0.04;
		const innerR = tickOuterR - tickLength;
		const x1 = cx + tickOuterR * Math.cos(angle);
		const y1 = cy + tickOuterR * Math.sin(angle);
		const x2 = cx + innerR * Math.cos(angle);
		const y2 = cy + innerR * Math.sin(angle);
		const tick = document.createElementNS(SVG_NS, 'line');
		tick.setAttribute('x1', String(Math.round(x1 * 100) / 100));
		tick.setAttribute('y1', String(Math.round(y1 * 100) / 100));
		tick.setAttribute('x2', String(Math.round(x2 * 100) / 100));
		tick.setAttribute('y2', String(Math.round(y2 * 100) / 100));
		ticks.appendChild(tick);
	}

	// Add two inner circles to the tick layer for the compass-face look
	const innerR1 = maxR * 0.38;
	const innerR2 = maxR * 0.28;
	for (const r of [innerR1, innerR2]) {
		const circle = document.createElementNS(SVG_NS, 'circle');
		circle.setAttribute('cx', String(cx));
		circle.setAttribute('cy', String(cy));
		circle.setAttribute('r', String(Math.round(r)));
		ticks.appendChild(circle);
	}
	svg.appendChild(ticks);

	// ─── Layer 4: Center hexagon (static — no rotation) ───
	const hexGroup = document.createElementNS(SVG_NS, 'g');
	// No configureLayer call — hexagon stays fixed, no animation

	const hexPoints: string[] = [];
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i - Math.PI / 6;
		hexPoints.push(`${cx + hexRadius * Math.cos(angle)},${cy + hexRadius * Math.sin(angle)}`);
	}
	const hexagon = document.createElementNS(SVG_NS, 'polygon');
	hexagon.setAttribute('points', hexPoints.join(' '));
	hexagon.classList.add('sandtable-comp-fill');
	hexagon.style.fillOpacity = '0.15';
	hexGroup.appendChild(hexagon);
	svg.appendChild(hexGroup);

	// ─── Assemble ───
	wrapper.appendChild(svg);
	container.appendChild(wrapper);

	return toDisposable(() => {
		wrapper.remove();
	});
}

/**
 * Helper class that manages disposable animations within a lifecycle-aware context.
 */
export class SandtableAnimationManager extends Disposable {
	private readonly _animationDisposables: IDisposable[] = [];

	/**
	 * Creates a geometric background in the given container, tracking its lifetime.
	 */
	addGeometricBackground(container: HTMLElement, options?: IGeoShapeOptions): void {
		const disposable = createGeometricBackground(container, options);
		this._animationDisposables.push(disposable);
		this._register(disposable);
	}

	/**
	 * Adds a gradient sweep to the given element, tracking its lifetime.
	 */
	addSweep(element: HTMLElement): void {
		const disposable = addGradientSweep(element);
		this._animationDisposables.push(disposable);
		this._register(disposable);
	}

	/**
	 * Adds a border pulse to the given element, tracking its lifetime.
	 */
	addPulse(element: HTMLElement): void {
		const disposable = addBorderPulse(element);
		this._animationDisposables.push(disposable);
		this._register(disposable);
	}
}
