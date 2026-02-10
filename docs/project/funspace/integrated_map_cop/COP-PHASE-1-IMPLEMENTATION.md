# COP Phase 1 Implementation -- Completed

**Status:** Complete (Code infrastructure and interactive features)
**Completed:** 2026-02-09
**Dependencies:** Phase 4 (Agent Mode), Phase 6 (Personas)
**Static Assets:** Pending download (fonts, sprites, natural-earth PMTiles)

---

## Overview

COP Phase 1 delivers MapLibre GL JS rendering inside a VS Code EditorPane with offline tile support architecture, MGRS/lat-lon/UTM coordinate display, freeform drawing tools (point, line, polygon), layer management, and five basemap themes. The map opens as a tab in the main editor area alongside the Chat panel.

## What Was Built

### Files Created

| File | Purpose |
|------|---------|
| `src/vs/platform/cortex/common/copTypes.ts` | ISandtableCopService interface, all COP domain types and enums |
| `src/vs/platform/cortex/common/copConfiguration.ts` | CopConfigKeys enum, 12 `sandtable.cop.*` settings registration |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCop.contribution.ts` | Activity Bar icon, ViewContainer, EditorPane, command, resolver |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopInput.ts` | EditorInput with `sandtable-cop://` URI scheme |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopPage.ts` | EditorPane hosting MapLibre, toolbar, coordinate display |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopMapRenderer.ts` | MapLibre init, PMTiles protocol, style gen, Trusted Types patches |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopCoordinateDisplay.ts` | MGRS/lat-lon/UTM display with format cycling and copy |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopLayerPanel.ts` | Layer list with visibility toggle and opacity slider |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopDrawTools.ts` | Point/line/polygon drawing with MapLibre interaction control |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopService.ts` | ISandtableCopService implementation, DI singleton |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCop.css` | All COP styling, animations, reduced-motion support |
| `resources/cop-assets/README.md` | Download instructions for static map assets |

### Files Modified

| File | Change |
|------|--------|
| `src/vs/workbench/workbench.common.main.ts` | Added COP service and contribution imports |
| `src/vs/code/electron-browser/workbench/workbench.html` | CSP: `file:` in img/connect/font-src, `maplibreHtml` + `maplibreWorker` in trusted-types |
| `src/vs/code/electron-browser/workbench/workbench-dev.html` | Same CSP changes as workbench.html (dev mode uses this file) |
| `src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettingsPage.ts` | Added COP settings section, `_renderSelectSetting()` helper |
| `package.json` | Added `maplibre-gl`, `pmtiles`, `@protomaps/basemaps`, `mgrs` dependencies |

### npm Dependencies

| Package | Version | License | Format | Loading Method |
|---------|---------|---------|--------|----------------|
| `maplibre-gl` | ^5.x | BSD-3 | UMD | `loadUmdModule()` via `importAMDNodeModule` |
| `pmtiles` | ^4.x | BSD-3 | IIFE | `importAMDNodeModule` + `globalThis.pmtiles` |
| `@protomaps/basemaps` | ^5.x | BSD-3 | IIFE | `importAMDNodeModule` + `globalThis.basemaps` |
| `mgrs` | ^2.x | MIT | UMD | `loadUmdModule()` via `importAMDNodeModule` |

**Note:** The original plan specified `@ngageoint/mgrs-js`, but this package only ships CommonJS builds which cannot be loaded in VS Code's browser layer. It was replaced with the `mgrs` package which ships a proper UMD build.

---

## Critical Engineering Lessons (VS Code Fork Context)

These lessons were discovered during implementation and are essential knowledge for anyone working on the COP or any feature that loads external npm packages in the browser layer.

### 1. Module Loading: No `require()`, No Bare `import` Specifiers

VS Code compiles TypeScript to ESM with `packages: 'external'` (esbuild). This means:
- **Static `import foo from 'package-name'`** produces bare specifiers in the JS output. The browser ESM loader cannot resolve these (it only understands relative paths). This crashes the entire workbench at startup.
- **`require()`** is not available in the ESM module context of the Electron renderer.
- **The correct pattern** is `importAMDNodeModule()` from `src/vs/amdX.ts`, which loads scripts via `<script>` tags with an AMD `define()` shim.

### 2. UMD Modules in Electron: The CJS-First Problem

Electron's renderer has Node.js globals (`module`, `exports`) at the top level. UMD module wrappers check for CJS **before** AMD:

```javascript
typeof exports === 'object' && typeof module !== 'undefined'  // TRUE in Electron!
  ? module.exports = factory()     // CJS path taken, define() NEVER called
  : typeof define === 'function' && define.amd ? define(factory)
  : (global.maplibregl = factory())
```

Since `define()` is never called, `importAMDNodeModule` returns `undefined`.

**Solution:** The `loadUmdModule()` helper in `sandtableCopMapRenderer.ts` temporarily nullifies `module` and `exports` before loading, forcing the UMD wrapper to take the AMD `define()` path:

```typescript
export async function loadUmdModule<T>(packageName: string, filePath: string): Promise<T> {
    const savedModule = (globalThis as any).module;
    const savedExports = (globalThis as any).exports;
    try {
        (globalThis as any).module = undefined;
        (globalThis as any).exports = undefined;
        return await importAMDNodeModule<T>(packageName, filePath);
    } finally {
        (globalThis as any).module = savedModule;
        (globalThis as any).exports = savedExports;
    }
}
```

### 3. IIFE Modules: Use globalThis Fallback

Packages like `pmtiles` and `@protomaps/basemaps` ship as IIFE (`var pmtiles = (()=>{...})()`), not UMD. They never call `define()`, so `importAMDNodeModule` returns `undefined`. But the IIFE sets a global variable when loaded via `<script>` tag:

```typescript
await importAMDNodeModule('pmtiles', 'dist/pmtiles.js');  // loads script, returns undefined
const pmtiles = (globalThis as any).pmtiles;  // access the global
```

### 4. Trusted Types CSP: Two Policies Needed

VS Code enforces `require-trusted-types-for 'script'`. MapLibre requires two Trusted Types policies:

1. **`maplibreWorker`** -- MapLibre creates Web Workers for tile parsing. `new Worker(blobUrl)` requires a `TrustedScriptURL`. The fix monkey-patches the global `Worker` constructor.
2. **`maplibreHtml`** -- MapLibre's NavigationControl and ScaleControl use `innerHTML` for SVG icons. The fix monkey-patches `Element.prototype.innerHTML` setter.

Both policy names must be in the `trusted-types` directive of **both** `workbench.html` AND `workbench-dev.html`. Dev mode (`./scripts/code.sh`) uses `workbench-dev.html`.

### 5. Local File Protocol: `vscode-file://` Not `file://`

Electron's renderer blocks `file://` URLs for fetch/resource loading (security restriction). VS Code provides `vscode-file://vscode-app/` as the local file protocol:

```typescript
// WRONG: file:///home/user/app/resources/cop-assets/sprites/v4/light
// RIGHT: vscode-file://vscode-app/home/user/app/resources/cop-assets/sprites/v4/light
```

**Path construction:** The app root path already starts with `/`, so `vscode-file://vscode-app${absolutePath}` is correct (no extra `/` between authority and path).

### 6. MapLibre `load` vs `style.load` Event

MapLibre's `load` event fires only when ALL sources (including tiles) finish loading. If tile files don't exist (no static assets downloaded yet), `load` never fires. GeoJSON sources and layers added inside `map.on('load', ...)` are never created.

**Solution:** Use `map.on('style.load', ...)` instead, which fires when the style object is parsed -- even with a background-only style or failed tile fetches.

### 7. MapLibre Interaction Control During Drawing

MapLibre's `dragPan` handler consumes mousedown/mouseup events as drag interactions, preventing `click` events from firing for line/polygon vertex placement. The fix disables `dragPan` and `doubleClickZoom` when a draw mode is active:

```typescript
map.dragPan?.disable();
map.doubleClickZoom?.disable();
// ... drawing happens ...
map.dragPan?.enable();
map.doubleClickZoom?.enable();
```

### 8. Codicon CSS Selectors

VS Code's `$()` DOM helper expects CSS selectors. `ThemeIcon.asClassName()` returns space-separated classes (`codicon codicon-close`) which breaks as a selector. Use `ThemeIcon.asCSSSelector()` which returns dot-separated (`.codicon.codicon-close`):

```typescript
// WRONG: $(`span.${ThemeIcon.asClassName(Codicon.close)}`)  // "span.codicon codicon-close"
// RIGHT: $('span' + ThemeIcon.asCSSSelector(Codicon.close))  // "span.codicon.codicon-close"
```

### 9. Style Reload and Annotation Persistence

`map.setStyle()` (called on theme switch) replaces ALL sources and layers. Drawn annotations stored in the COP service must be re-pushed to the map after the new style loads. The `onSourcesReady` event on the map renderer fires after `style.load` recreates the GeoJSON sources.

### 10. MapLibre CSS Must Be Injected Programmatically

VS Code's build system externalizes npm packages, so `import 'maplibre-gl/dist/maplibre-gl.css'` doesn't work. The critical CSS rules (map container, controls, icons, scale bar) are injected as a `<style>` element in `getMapLibreCriticalCss()`. The navigation control icons use background-image SVG data URIs that must be included.

---

## Verification Checklist (Phase 1 Complete)

- [x] COP globe icon appears in the Activity Bar
- [x] Clicking globe opens sidebar with "Open Map" button
- [x] COP EditorPane opens in main editor area as a tab
- [x] MapLibre GL JS renders WebGL canvas (background color visible)
- [x] Pan/zoom works with mouse drag and scroll wheel
- [x] Zoom +/- and compass controls visible and functional
- [x] Scale bar visible in bottom-right corner
- [x] Coordinate display shows MGRS and lat/lon, updates on mousemove
- [x] Click coordinate display to cycle formats (MGRS/lat-lon/UTM)
- [x] Right-click coordinate display copies to clipboard
- [x] Draw point: click tool button, click map, point appears
- [x] Draw line: click tool button, click vertices, double-click to finish
- [x] Draw polygon: click tool button, click vertices, double-click to close
- [x] Layer panel opens via Layers button, shows 3 default layers
- [x] Layer visibility toggle works
- [x] Layer opacity slider works
- [x] Basemap theme switching works (light/dark/grayscale/white/black)
- [x] Drawn annotations persist across theme changes
- [x] Map tab persists when switching to other tabs
- [x] Chat panel remains in right Auxiliary Bar alongside map
- [x] COP settings section in Sandtable Settings page
- [x] `npm run compile` passes with 0 errors

## What Remains (Static Assets)

The map renders with a solid background color. To see actual geography (countries, roads, labels):

1. Download fonts from https://github.com/protomaps/basemaps-assets -> `resources/cop-assets/fonts/`
2. Download sprites from same repo -> `resources/cop-assets/sprites/v4/`
3. Download Natural Earth PMTiles from https://protomaps.com/downloads/natural-earth -> `resources/cop-assets/natural-earth.pmtiles`

See `resources/cop-assets/README.md` for full instructions.

---

## Architecture Decisions (Updated from Implementation)

| # | Original Decision | Implementation Reality |
|---|---|---|
| 12 | @ngageoint/mgrs-js for MGRS conversion | **Changed to `mgrs` npm package** -- @ngageoint/mgrs-js is CJS-only with no browser build; `mgrs` has a UMD build that works with `importAMDNodeModule` |
| 13 | maplibre-gl-draw for annotation | **Changed to custom drawing implementation** -- Avoided external draw library bundling issues; built simple point/line/polygon drawing with MapLibre click handlers and temporary GeoJSON sources |
| 6 | Modify CSP for WebGL | **Required two Trusted Types policies** (`maplibreWorker`, `maplibreHtml`) plus `file:` in connect-src/img-src/font-src, applied to both `workbench.html` and `workbench-dev.html` |
| 7 | `file://` paths for local tiles | **Changed to `vscode-file://vscode-app/`** -- Electron blocks `file://` in renderer fetch context; VS Code's custom protocol is required |
