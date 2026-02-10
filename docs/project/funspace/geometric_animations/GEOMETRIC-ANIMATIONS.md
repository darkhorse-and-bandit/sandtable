# Sandtable -- Visual Animations & Branding

## Overview

Sandtable features a layered visual identity system across its key UI surfaces: a sacred-geometry composition (concentric circles, radiating spokes, compass ticks, solid hexagon center), a desert floor panoramic image, the Sandtable logo, and processing-state animations for the chat panel. All visual elements are purely decorative, performance-optimized, theme-aware, and fully accessible (reduced motion support).

**Status:** Active Development
**Last Updated:** 2026-02-09

## Visual Surfaces

### Welcome Page (Getting Started)

A 4-layer composited background behind the welcome content:

1. **Opaque background** -- `var(--vscode-editor-background)` solid fill prevents the watermark composition from bleeding through
2. **Sacred geometry composition** -- 1600px SVG, 6 concentric rings, 12 radiating spokes at varying lengths, 36 compass tick marks, solid hexagon center. Counter-rotating layers at half-speed (slowFactor 2). Injected into `.gettingStartedSlideCategories`
3. **Desert floor image** -- Photorealistic night desert sand panorama, anchored to bottom, full editor width, gradient mask fading from transparent at top to opaque at bottom. 50% opacity
4. **Content** -- Logo, title, subtitle, Start/Recent columns, Walkthroughs, footer (z-index 100)

The same composition + desert image also appear on the **walkthrough detail screens** (Get Started, Explore Sandtable).

The Sandtable logo appears above the "Sandtable Dev" title text, loaded via `FileAccess.asBrowserUri()`.

**Files:** `gettingStarted.ts`, `gettingStarted.css`, `media/sandtableLogo.png`, `media/sandtableDesertFloor.png`

### Empty Editor Watermark (No Files Open)

Same 4-layer system as the welcome page, plus a greyscale Sandtable logo:

1. **Sacred geometry composition** -- 1600px, same parameters as welcome page, centered via CSS `top: 50%; left: 50%; transform: translate(-50%, -50%)`. Container has `overflow: hidden` so the 1600px SVG is clipped to the editor bounds
2. **Desert floor image** -- Same image and styling, anchored to bottom
3. **Greyscale Sandtable logo** -- Replaces VS Code's default document icon (letterpress SVGs) with `sandtableLogo.png` at 480px, `filter: grayscale(100%)`, 40% opacity
4. **Shortcut hints** -- "Open Chat", "Show All Commands", etc. with staggered fade-in

**Critical: The `.empty` class pattern.** The composition and desert image are injected as direct children of `.editor-group-container`. VS Code toggles the `.empty` class on this container based on whether files are open. CSS rules hide our elements when `.empty` is absent:

```css
.editor-group-container:not(.empty) > .sandtable-composition,
.editor-group-container:not(.empty) > .sandtable-watermark-desert {
    display: none;
}
```

This mirrors VS Code's own watermark hiding rule. **Any new decorative elements injected at the editor-group-container level MUST include this hiding rule**, or they will appear behind open files.

**Files:** `editorGroupWatermark.ts`, `editorgroupview.css`, `media/sandtableLogo.png`, `media/sandtableDesertFloor.png`

### Chat Tool Call Processing

Border pulse and gradient sweep on the **thinking box** container while tools are actively processing.

**Critical: The thinking box DOM structure.** In VS Code 1.109+, agent tool calls render inside a `.chat-thinking-box` container, NOT as direct children of `.value`. The actual DOM during tool processing is:

```
.interactive-item-container
  └── .value
       └── .chat-thinking-box
            └── .chat-used-context-list.chat-thinking-collapsible.chat-thinking-streaming
                 ├── .chat-thinking-tool-wrapper
                 │    └── .chat-tool-invocation-part
                 └── .chat-thinking-spinner-item
```

Our CSS targets `.chat-used-context-list.chat-thinking-collapsible.chat-thinking-streaming` using the `.chat-thinking-streaming` class as the semantic indicator for active processing. A standalone fallback targets `.chat-tool-invocation-part:has(.codicon-loading)` as a descendant selector (no `>` combinator) for edge cases.

**Lesson learned:** The initial implementation used `.value > .chat-tool-invocation-part` with a direct child combinator (`>`). This never matched because tool invocations are nested inside the thinking box. Always verify the actual runtime DOM structure with the element inspector before writing CSS selectors for VS Code's chat panel.

**Files:** `chat.css` (Sandtable section at end of file)

### Other Surfaces

- **Settings page** -- Sacred-geometry composition in header (500px, 4 rings, 8 spokes, slowFactor 3, opacity 0.06), section fade transitions, staggered card entrance, nav item stagger (`sandtableSettingsPage.ts`, `sandtableSettings.css`)
- **Model Manager** -- Loading gradient sweep, disconnected entrance, GPU card + model item stagger (CSS-only, `sandtableModels.css`)
- **Explorer empty state** -- Small geometric background, welcome content fade-in (`emptyView.ts`)
- **COP map page** -- Grid loading overlay, coordinate/toolbar entrance, layer panel stagger (CSS-only, `sandtableCop.css`)
- **Agent panel** (deprecated) -- Tool indicator sweep, diff border pulse, welcome entrance (`sandtableAgent.css`)

## Architecture

### Shared Animation Module

```
src/vs/workbench/contrib/sandtableAnimations/
  browser/
    sandtableAnimations.css              # @keyframes, base classes, composition positioning
    sandtableAnimations.ts               # createGeometricBackground(), createCenteredComposition(), utilities
    sandtableAnimations.contribution.ts  # Global CSS import (registered first in workbench.common.main.ts)
```

### Sacred Geometry Composition (`createCenteredComposition`)

A single large SVG with 4 counter-rotating `<g>` layer groups:

| Layer | Content | Animation | Speed |
|-------|---------|-----------|-------|
| Outer rings | 4-6 concentric circles (alternating solid/dashed strokes) | Clockwise | 90s (x slowFactor) |
| Radiating spokes | 12 lines at varying lengths (long/medium/short alternating) | Counter-clockwise | 60s (x slowFactor) |
| Compass ticks | 36 short tick marks (major/medium/minor) + 2 inner circles | Clockwise | 45s (x slowFactor) |
| Center hexagon | Solid filled hexagon, 15% fill opacity | **Static (no rotation)** | -- |

Each `<g>` gets explicit `transform-origin` via CSS custom properties (`--sandtable-comp-cx`, `--sandtable-comp-cy`) set to the SVG center in pixels. This is critical because **SVG `<g>` elements default to transform-origin 0,0**, not center. Without explicit coordinates, each layer rotates around a different point and the composition flies apart.

```typescript
createCenteredComposition(container: HTMLElement, options?: {
    size?: number;         // SVG viewport size (default: 400)
    opacity?: number;      // Base opacity (default: 0.12)
    ringCount?: number;    // Outer ring count (default: 4)
    lineCount?: number;    // Radiating line count (default: 8)
    hexRadius?: number;    // Center hexagon radius (default: 30)
    slowFactor?: number;   // Duration multiplier (default: 1, use 2 for half-speed)
}): IDisposable;
```

### CSS Keyframes

| Keyframe | Purpose | Duration |
|----------|---------|----------|
| `sandtable-rotate-cw` | Clockwise rotation for composition layers | Variable (via CSS custom property) |
| `sandtable-rotate-ccw` | Counter-clockwise rotation for composition layers | Variable |
| `sandtable-drift` | Slow linear translation of scattered shapes | 60-90s |
| `sandtable-fade-drift` | Combined opacity fade + translate entrance | 0.4-0.8s |
| `sandtable-gradient-sweep` | Left-to-right gradient shimmer for processing states | 1.5-2.5s |
| `sandtable-border-pulse` | Border/shadow glow pulse for active containers | 1.2s |
| `sandtable-card-enter` | Staggered card entrance animation | 0.25-0.35s |
| `sandtable-section-fade` | Content switch transition | 0.2s |

## Critical Implementation Notes

### VS Code Trusted Types CSP

VS Code enforces `require-trusted-types-for 'script'`. **Never use `innerHTML` with raw strings.** Use `document.createElementNS()` for SVG and `document.createElement()` for HTML. If you must use `innerHTML`, register a TrustedTypes policy in BOTH `workbench.html` AND `workbench-dev.html`.

**If you forget `workbench-dev.html`, the app crashes in dev mode** (`./scripts/code.sh`) while production builds work fine.

### Error Boundaries

Animations are decorative. They must **never** crash the host component. Always wrap in try-catch, especially in constructors of core components like `EditorGroupWatermark` where a crash renders the entire workbench blank.

### The `.empty` Class Pattern

The `.editor-group-container` element toggles the `.empty` CSS class based on whether files are open. **Any decorative elements injected as children of this container must include a `:not(.empty)` hiding rule**, or they will be visible behind open files/editors. This is how VS Code hides its own watermark, and our elements must follow the same pattern.

### SVG Transform Origin

SVG `<g>` elements use `transform-origin: 0 0` by default (not `center`). For rotation to work correctly in a centered composition, set explicit pixel coordinates via CSS custom properties:

```css
.sandtable-composition-layer {
    transform-origin: var(--sandtable-comp-cx) var(--sandtable-comp-cy);
}
```

And set them from TypeScript:
```typescript
g.style.setProperty('--sandtable-comp-cx', `${cx}px`);
g.style.setProperty('--sandtable-comp-cy', `${cy}px`);
```

### Chat Panel DOM Structure

Tool calls in VS Code 1.109+ render inside a `.chat-thinking-box` container, not as direct children of `.value`. Use `.chat-thinking-streaming` as the state indicator for active processing, and always use **descendant selectors** (no `>` combinator) when targeting `.chat-tool-invocation-part`.

### Composition Positioning

The `.sandtable-composition` wrapper uses `position: absolute` with centering. For the welcome page, position is set in `sandtableAnimations.css` (tunable `top`/`left`). For the watermark, position is set in `editorgroupview.css` using `top: 50%; left: 50%; transform: translate(-50%, -50%)`.

Parent containers must have `position: relative` for absolute positioning to work. Grid children in the welcome page may need `overflow: visible !important` to prevent clipping.

### The `out/` Directory

`./scripts/code.sh` runs compiled JS from `out/`, not source TypeScript. After changes, run `npm run compile` manually. The build only auto-compiles if `out/` doesn't exist.

### Reduced Motion

Every animation must be gated behind `.monaco-workbench:not(.monaco-reduce-motion)`. If an animation sets `opacity: 0` as a starting state, you **must** add a reduced-motion override with `opacity: 1`.

## File Inventory

### New Files
- `src/vs/workbench/contrib/sandtableAnimations/browser/sandtableAnimations.css`
- `src/vs/workbench/contrib/sandtableAnimations/browser/sandtableAnimations.ts`
- `src/vs/workbench/contrib/sandtableAnimations/browser/sandtableAnimations.contribution.ts`
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/media/sandtableLogo.png`
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/media/sandtableDesertFloor.png`
- `src/vs/workbench/browser/parts/editor/media/sandtableLogo.png`
- `src/vs/workbench/browser/parts/editor/media/sandtableDesertFloor.png`

### Modified Files
- `src/vs/workbench/workbench.common.main.ts` -- Animation module registration
- `src/vs/code/electron-browser/workbench/workbench.html` -- CSP trusted-types update
- `src/vs/code/electron-browser/workbench/workbench-dev.html` -- CSP trusted-types update
- `src/vs/workbench/browser/parts/editor/editorGroupWatermark.ts` -- Composition + desert + logo injection
- `src/vs/workbench/browser/parts/editor/media/editorgroupview.css` -- Watermark layers, greyscale logo, `.empty` hiding
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts` -- Welcome page layers + logo
- `src/vs/workbench/contrib/welcomeGettingStarted/browser/media/gettingStarted.css` -- Welcome layer stack CSS
- `src/vs/workbench/contrib/chat/browser/widget/media/chat.css` -- Thinking-box tool call processing animations
- `src/vs/workbench/contrib/sandtableAgent/browser/sandtableAgent.css` -- Agent panel animations
- `src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettingsPage.ts` -- Settings page animations
- `src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettings.css` -- Settings animations CSS
- `src/vs/workbench/contrib/sandtableModels/browser/sandtableModels.css` -- Models panel animations
- `src/vs/workbench/contrib/files/browser/views/emptyView.ts` -- Explorer empty state background
- `src/vs/workbench/contrib/sandtableCop/browser/sandtableCop.css` -- COP loading animations
