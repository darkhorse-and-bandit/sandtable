# COP Phase 1 Implementation

**Purpose:** This file contains the complete prompt to give an implementation agent for building COP Phase 1 (Map Panel and Basic Interaction). Copy the entire contents below the `---` line into the agent's context.

---

The COP adds an interactive map with military symbology directly into the workbench. You are implementing **COP Phase 1: Map Panel and Basic Interaction** -- the foundation that gets MapLibre GL JS rendering inside a VS Code EditorPane with offline tile support, coordinate display, basic drawing tools, and layer management.

## Critical Context

### What is Sandtable?

Sandtable is a fork of Microsoft's VS Code (Electron + TypeScript) rebuilt as an AI-powered research and wargaming workspace. It connects to Cortex (a self-hosted LLM inference gateway) for offline, air-gapped AI capabilities. The project has completed Phases 0-4.5 and Phase 6 (agent personas). The core IDE has streaming chat via VS Code's built-in Chat panel, inline code completion, a model manager, tool-calling agent mode with 6 workspace tools, multi-provider LLM routing, agent personas, Code Mode toggle, and custom settings.

The COP feature is the most important upcoming feature. It transforms Sandtable from a text-based AI workspace into a true digital sand table -- a spatial planning and wargaming platform.

### Hard Requirements (Non-Negotiable)

1. **Air-gapped deployment.** Zero internet at runtime. All map tiles, fonts, sprites, symbols rendered from local files. The only network traffic is to Cortex for LLM inference on the same air-gapped LAN.
2. **Open-source licenses only.** MIT, BSD, Apache, ISC are acceptable. No GPL/LGPL, no proprietary, no Mapbox (BSL license). MapLibre GL JS (BSD-3) is the selected renderer.
3. **EditorPane integration.** The map opens in the main editor area (not a sidebar, not a bottom panel). Chat panel stays in the right Auxiliary Bar. COP globe icon in Activity Bar for access.

### Required Reading

You MUST read these files before writing any code. They contain the complete architecture, interface definitions, data schemas, and task breakdown you need to follow:

- `@docs/project/funspace/integrated_map_cop/ARCHITECTURE.md` -- **THE PRIMARY INPUT.** Contains all file paths, TypeScript interfaces, data flow diagrams, settings schema, EditorPane integration details, MapLibre initialization specification, and the task breakdown you will follow. Read sections 1 (File Structure), 2 (Interfaces), 4 (Settings), 6 (EditorPane), 7 (MapLibre Init), 9.1 (Phase 1 Tasks), and 10 (Registration) thoroughly.
- `@docs/project/funspace/integrated_map_cop/VISION.md` -- The feature vision with all 13 resolved architectural decisions. Read this for the "why" behind design choices.
- `@docs/project/ARCHITECTURE.md` -- Existing technical architecture. Shows how `ICortexService` works, how services register with DI, how EditorPanes work, and the file structure conventions.
- `@docs/project/phases/PHASE-6-PERSONAS.md` -- The most recently completed phase. Use this as a template for the task execution style and compile-checkpoint discipline.

Also read these source files to understand the existing implementation patterns you must follow:

- `@src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettings.contribution.ts` -- **THE PATTERN TO COPY.** This shows exactly how an EditorPane is registered: `EditorPaneDescriptor.create()`, `EditorSerializer`, `EditorResolver` for URI scheme, command + menu entry. The COP follows this identical pattern with `sandtable-cop://` instead of `sandtable://`.
- `@src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettingsInput.ts` -- The `EditorInput` pattern. COP's `SandtableCopInput` copies this with a different URI scheme and icon.
- `@src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettingsPage.ts` -- The `EditorPane` pattern. Read the first ~120 lines to see constructor injection, `createEditor()`, DOM building with `dom.append()` and `$()`. COP's `SandtableCopPage` follows this pattern but hosts MapLibre instead of settings forms.
- `@src/vs/workbench/contrib/sandtableLM/browser/sandtableTools.ts` -- How tools register with `ILanguageModelToolsService`. You won't register tools in Phase 1, but understanding this pattern prepares you for Phase 3.
- `@src/vs/platform/cortex/common/cortexConfiguration.ts` -- How settings are registered. COP settings follow this exact pattern in a new `copConfiguration.ts` file.
- `@src/vs/workbench/workbench.common.main.ts` -- Where all contributions are registered via import. You will add COP imports at the end of the Sandtable block.

## Your Task: COP Phase 1

Implement the complete COP Phase 1 as defined in ARCHITECTURE.md Section 9, "COP Phase 1: Map Panel and Basic Interaction" (tasks 1.1 through 1.11). Here is the execution order, with critical notes:

### Execution Order (Follow This Exactly)

#### Step 0: Validation Spike (Do This FIRST)

Before building the full EditorPane infrastructure, validate the three technical risks:

1. **Install Phase 1 npm dependencies:**
   ```
   npm install maplibre-gl pmtiles @protomaps/basemaps @ngageoint/mgrs-js
   ```
   Use the latest stable versions. Do NOT pin to specific versions -- let npm resolve to latest.

2. **Verify `npm run compile` still passes** after adding the dependencies. If there are TypeScript or webpack issues with maplibre-gl (it ships WebGL shaders and Web Workers), resolve them before proceeding.

3. **Create a minimal test** -- a barebones EditorPane that creates a `<div>`, initializes MapLibre with a simple style (even just a blank canvas with background color), and verifies WebGL works in the Electron renderer without CSP errors. Check the browser developer console for errors. If CSP blocks WebGL, you need to modify the CSP before proceeding (see ARCHITECTURE.md Section 7.5).

Only proceed to the full implementation after this spike confirms MapLibre renders.

#### Step 1: Platform Types and Settings (Task 1.1)

Create `src/vs/platform/cortex/common/copTypes.ts` and `src/vs/platform/cortex/common/copConfiguration.ts` exactly as specified in ARCHITECTURE.md Sections 2 and 4. The interfaces in Section 2 are complete -- implement them as written. The settings in Section 4 are specified with keys, types, defaults, and descriptions.

Run `npm run compile` -- must pass with 0 errors.

#### Step 2: Static Assets (Task 1.3)

Download and place static assets in `resources/cop-assets/`:

- **Fonts:** Download from https://github.com/protomaps/basemaps-assets. You need the `fonts/` directory containing Noto Sans Regular, Medium, and Italic PBF glyph files. Each font has files named `0-255.pbf`, `256-511.pbf`, etc.
- **Sprites:** Download from the same repo. You need `sprites/v4/` with light.png, light.json, light@2x.png, light@2x.json, dark.png, dark.json, dark@2x.png, dark@2x.json.
- **Natural Earth fallback:** Download a pre-built Natural Earth PMTiles file from https://protomaps.com/downloads/natural-earth or build one with Tilemaker. This provides a low-zoom world basemap (~5-10 MB) so the map always shows something even without user-configured tiles.

If downloading large binary assets is not feasible in your environment, create placeholder directories with a README explaining what goes there, and note that the map will only render if a tile source is configured via settings.

#### Step 3: EditorPane Infrastructure (Tasks 1.4, 1.10)

Build the full EditorPane stack. Follow the pattern from `sandtableSettings.contribution.ts` exactly:

1. **`sandtableCopInput.ts`** -- Copy `sandtableSettingsInput.ts`, change:
   - URI scheme: `sandtable-cop` (authority: `map`)
   - Type ID: `sandtable.copEditor`
   - Name: `Common Operating Picture`
   - Icon: `Codicon.globe`
   - `pinned: true` (maps are long-lived workspace artifacts)

2. **`sandtableCopPage.ts`** -- New `EditorPane` subclass:
   - Constructor injects: `ITelemetryService`, `IThemeService`, `IStorageService`, `IConfigurationService`, `ISandtableCopService` (created in Step 5)
   - `createEditor(parent)`: builds the DOM structure specified in ARCHITECTURE.md Section 6.2
   - `layout(dimension)`: calls `this._map?.resize()` for MapLibre resize handling
   - `setInput()`: triggers map initialization when the EditorPane is opened
   - `dispose()`: calls `this._map?.remove()` to clean up WebGL resources

3. **`sandtableCop.contribution.ts`** -- The main contribution file:
   - Register EditorPane with `EditorPaneDescriptor.create()`
   - Register EditorSerializer for tab persistence across restarts
   - Register EditorResolver for `sandtable-cop://` URIs (same pattern as settings)
   - Register `sandtable.cop.openMap` command (opens the COP EditorPane)
   - Register Activity Bar view container with `$(globe)` icon at `order: 0`
   - Register the command in the Command Palette and optionally in File > Preferences menu

4. **`sandtableCop.css`** -- Styles for the map container. Critical rules:
   ```css
   .sandtable-cop { display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; }
   .sandtable-cop-map-container { flex: 1; position: relative; }
   .sandtable-cop-map-container canvas { position: absolute; top: 0; left: 0; }
   ```
   Also import MapLibre's CSS: `maplibre-gl` requires its CSS for map controls to render. Either import it in the CSS file or inject it programmatically.

5. **Wire into `workbench.common.main.ts`** -- Add at the end of the Sandtable imports block:
   ```typescript
   // COP -- Common Operating Picture (Map Panel)
   import './contrib/sandtableCop/browser/sandtableCop.contribution.js';
   ```

Run `npm run compile` -- must pass with 0 errors.

#### Step 4: MapLibre Renderer (Task 1.5)

Create `sandtableCopMapRenderer.ts` following ARCHITECTURE.md Section 7:

1. **PMTiles protocol:** Register once globally using `maplibregl.addProtocol('pmtiles', protocol.tile)`.
2. **Style construction:** Use `@protomaps/basemaps` `layers()` and `namedFlavor()` to build the style JSON. Point glyphs and sprites to `file://` paths under `resources/cop-assets/`.
3. **Tile source resolution:** Read `sandtable.cop.tileSource` from settings. Resolve workspace-relative paths, absolute paths, and HTTP URLs to `pmtiles://` URLs. Fall back to the bundled Natural Earth PMTiles if empty.
4. **Map creation:** `new maplibregl.Map({ container, style, center, zoom })` inside the map container div.
5. **Add GeoJSON sources** for units and annotations (empty FeatureCollections initially).

**Critical: `file://` protocol for PMTiles.** If Chromium in Electron does not support HTTP Range Requests over `file://`, you will need to register a custom Electron protocol (e.g., `cop-tiles://`) using `protocol.registerFileProtocol()` in the main process, or serve tiles via a minimal local HTTP server. Test this during Step 0. The ARCHITECTURE.md notes this risk in Section 7.1.

**Critical: MapLibre CSS.** MapLibre GL JS requires its CSS file to be loaded for controls, popups, and attribution. In VS Code's build system, you may need to:
- Import the CSS directly: `import 'maplibre-gl/dist/maplibre-gl.css';` (if the build system supports CSS imports), OR
- Read the CSS file content and inject it as a `<style>` element in the EditorPane's DOM

Run `npm run compile` and verify the map renders.

#### Step 5: COP Service (Task 1.9)

Create `sandtableCopService.ts` -- the `ISandtableCopService` implementation:

- In-memory state for `ISandtableCopState` (center, zoom, bearing, pitch, theme, layers)
- Event emitters using VS Code's `Emitter<T>` for `onMapStateChanged`, `onOrbatChanged`, `onLayersChanged`
- Unit collection (Map<string, ICopUnit>)
- Layer collection with default layers (friendly-orbat, enemy-orbat, annotations)
- Methods: `getMapState()`, `setMapState()`, `getUnits()`, `addUnit()`, `getLayers()`, etc.
- Register with DI: `registerSingleton(ISandtableCopService, SandtableCopService, InstantiationType.Delayed)`

For Phase 1, many methods can have minimal implementations (the full ORBAT management comes in Phase 2). Focus on map state, layers, and the service registration.

Run `npm run compile` -- must pass with 0 errors.

#### Step 6: Coordinate Display (Task 1.6)

Create `sandtableCopCoordinateDisplay.ts`:

- Listen to `map.on('mousemove')` events
- Convert cursor `[lng, lat]` to MGRS using `@ngageoint/mgrs-js`
- Display both MGRS and lat/lon in a corner overlay widget
- Support click-to-cycle between MGRS, lat/lon, UTM
- Support click-to-copy to clipboard

Run `npm run compile` -- must pass with 0 errors.

#### Step 7: Layer Panel (Task 1.7)

Create `sandtableCopLayerPanel.ts`:

- Renders a list of layers in the COP sidebar or as a panel within the EditorPane
- Each layer shows: name, color indicator, visibility toggle (eye icon), opacity slider
- Toggle visibility updates the MapLibre layer visibility
- Opacity slider updates the MapLibre layer opacity
- Default layers: "Friendly ORBAT", "Enemy ORBAT", "Annotations"

Run `npm run compile` -- must pass with 0 errors.

#### Step 8: Drawing Tools (Task 1.8)

Install and integrate maplibre-gl-draw:

```
npm install @birkskyum/maplibre-gl-draw
```

(Note: the birkskyum fork may be published under `@birkskyum/maplibre-gl-draw` or `maplibre-gl-draw` -- check npm for the correct package name.)

Create `sandtableCopDrawTools.ts`:

- Initialize `MapboxDraw` with basic modes: point, line, polygon
- Add toolbar buttons (draw point, draw line, draw polygon, delete)
- Listen for `draw.create`, `draw.update`, `draw.delete` events
- Store drawn features in the COP annotations layer

Run `npm run compile` -- must pass with 0 errors.

#### Step 9: Settings Page Integration

Add a "COP" section to the Sandtable Settings page (`sandtableSettingsPage.ts`):

- Tile Source path/URL input
- Basemap Theme selector (light/dark/grayscale/white/black)
- Coordinate Format selector (MGRS/lat-lon/UTM)
- MGRS Grid toggle
- Default center and zoom inputs

This is optional for Phase 1 but provides a nice UX for configuring tile sources without editing `settings.json` manually.

#### Step 10: Final Verification (Task 1.11)

Verify ALL of these work:

- [ ] COP globe icon `$(globe)` appears in the Activity Bar
- [ ] Clicking the globe icon opens the COP EditorPane with a rendered map
- [ ] Map shows basemap tiles (bundled Natural Earth or configured tile source)
- [ ] Pan/zoom works smoothly at 60fps
- [ ] Coordinate display shows MGRS and lat/lon as the cursor moves
- [ ] Basic drawing (point, line, polygon) works
- [ ] Layer panel toggles visibility and opacity
- [ ] Map persists position/zoom when switching to another tab and back
- [ ] Chat panel remains visible in the right Auxiliary Bar alongside the map
- [ ] `npm run compile` passes with 0 errors

## Coding Conventions (Mandatory)

Follow these conventions exactly -- they match the existing codebase:

1. **File naming:** `sandtableCop` prefix for all new files (e.g., `sandtableCopPage.ts`, `sandtableCopMapRenderer.ts`).
2. **Directory:** All browser implementations go in `src/vs/workbench/contrib/sandtableCop/browser/`. Platform types go in `src/vs/platform/cortex/common/`.
3. **Imports:** Use VS Code's import style with `.js` extensions (e.g., `import { URI } from '../../../../base/common/uri.js';`).
4. **Copyright header:** Every new file starts with:
   ```typescript
   /*---------------------------------------------------------------------------------------------
    *  Copyright (c) Sandtable Contributors. All rights reserved.
    *  Licensed under the MIT License. See License.txt in the project root for license information.
    *--------------------------------------------------------------------------------------------*/
   ```
5. **DI pattern:** Services are injected via decorator parameters (`@IConfigurationService private readonly configurationService: IConfigurationService`).
6. **Disposables:** Use `Disposable` base class and `this._register()` for all event listeners and registrations. Clean up in `dispose()`.
7. **Compile checkpoint:** Run `npm run compile` after every logical step. Fix all errors before proceeding.
8. **No TODOs or placeholders.** Every function you write must be complete and functional.

## Architecture Decisions (Already Resolved -- Do Not Re-evaluate)

These are pinned decisions from VISION.md. Build on top of them:

| # | Decision |
|---|----------|
| 1 | EditorPane in main editor area (same pattern as SandtableSettingsPage) |
| 3 | MapLibre GL JS (BSD-3) as the map renderer |
| 6 | Modify workbench CSP for WebGL if needed; render MapLibre directly in EditorPane DOM |
| 7 | Tiles are external assets referenced by `sandtable.cop.tileSource` setting; bundled Natural Earth fallback |
| 11 | Bundle Protomaps fonts/sprites (~31MB) in Electron app resources directory |
| 12 | @ngageoint/mgrs-js (MIT) for MGRS coordinate conversion |
| 13 | maplibre-gl-draw + custom military drawing modes for annotation |

## What NOT To Do

- Do NOT implement COP Phase 2 (military symbology, ORBAT, milsymbol). That comes next.
- Do NOT implement COP Phase 3 (agent tools). That comes after Phase 2.
- Do NOT register any tools with `ILanguageModelToolsService` in Phase 1.
- Do NOT create scenario files or ORBAT JSON files. Phase 1 is map rendering only.
- Do NOT use Mapbox GL JS. Use MapLibre GL JS. They have similar APIs but different packages.
- Do NOT fetch any resources from the internet at runtime. Everything must be local.
- Do NOT skip `npm run compile` checkpoints. Every task group must compile cleanly.
