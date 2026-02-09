# Integrated Map & Common Operating Picture (COP) -- Vision

**Status:** Vision & Research Phase
**Date:** 2026-02-08
**Category:** Core Feature -- Research & Wargaming Infrastructure

---

## Executive Summary

The Common Operating Picture (COP) is the feature that transforms Sandtable from a *text-based AI workspace that could be used for wargaming* into a *purpose-built wargaming and research platform*. By embedding an interactive, AI-aware map directly into the workbench -- one that understands military symbology, order of battle, scenario timelines, and spatial relationships -- Sandtable becomes the digital manifestation of its namesake: a terrain model where teams gather to plan, wargame, and rehearse.

This is not a map viewer bolted onto a chat window. This is a shared cognitive workspace where the map *is* part of the AI conversation -- where agents can see, reason about, and manipulate spatial data; where personas speak about terrain and units with grounded situational awareness; and where every element on the map is a living artifact that the full Sandtable stack can query, analyze, and evolve over time.

---

## The "Why" -- Why a COP Changes Everything

### 1. Sandtable's Name Demands It

The sand table -- the physical object -- is fundamentally a *spatial* tool. Commanders don't gather around a sand table to read documents. They gather around it to see terrain, place units, trace routes, and visualize the fight. Sandtable the software currently excels at the textual side of research and analysis: document ingestion, agent conversations, persona roleplay, structured outputs. But the spatial dimension -- the *table* in sand table -- is missing.

A COP fills that gap. It gives Sandtable the visual, spatial center of gravity that its namesake promises.

### 2. Wargaming Without a Map is Just a Conversation

Today, a wargaming exercise in Sandtable looks like this:
- A facilitator describes a scenario in text
- AI personas (Red Team Commander, Blue Team Defender) respond in text
- Analysis happens in text
- Everything is words about a world that no one can see

This works for some tabletop exercises, but it fundamentally limits what you can do:
- You can't point to a terrain feature and ask "what happens if they advance through this valley?"
- You can't see the relationship between friendly and enemy positions at a glance
- You can't trace a course of action on a map and have an AI agent reason about it
- You can't replay a scenario and watch how the situation evolved spatially over time
- You can't identify gaps in coverage, overlapping fields of fire, or supply line vulnerabilities

With a COP, all of these become possible. The map becomes a shared artifact that humans and AI agents interact with together.

### 3. The COP is the Integration Point for Everything

The COP is not just a map panel -- it is the *connective tissue* that binds together features that otherwise exist in isolation:

| Existing/Planned Feature | Without COP | With COP |
|--------------------------|-------------|----------|
| **Agent Personas** (Phase 6) | Personas talk about scenarios in abstract terms | Red Team Commander can *point at the map*, place units, propose maneuvers as spatial overlays. Blue Team Defender can see friendly positions and reason about defensive coverage |
| **Document Ingestion** (Phase 5) | Upload a PDF about a region | Upload a PDF *and* have key geographic references automatically plotted on the map. Ask "show me the locations mentioned in this intelligence report" |
| **MCP Integration** (Phase 7) | Connect to external databases | Connect to wargame databases that have spatial data -- unit positions, logistics nodes, sensor coverage -- and visualize them live on the COP |
| **Agent Mode** (Phase 4) | Agent reads files and runs commands | Agent can read the map state, propose spatial changes, generate COA overlays, and modify the operating picture as part of its reasoning |
| **Workspace Templates** (Phase 8) | Pre-configured project layouts | Templates that include a pre-loaded map with scenario-specific terrain, initial unit positions, and phase lines. Open a workspace and the exercise is ready |
| **Session Recording** (Phase 8) | Record text conversations | Record the *entire scenario timeline* -- map state changes, unit movements, inject events, agent decisions -- and replay it spatially for after-action review |
| **Collaboration** (Phase 9) | Shared text chat | WYSIWIS (What You See Is What I See) -- all participants see the same map, same unit positions, same overlays, in real time |

The COP is the feature that makes Sandtable's vision *coherent*. Without it, Sandtable is a collection of powerful but disconnected tools. With it, those tools converge on a shared spatial context that mirrors how military planning, wargaming, and analysis actually work.

### 4. This is What the Competition Cannot Do

Existing tools in this space fall into two categories:

**AI wargaming tools** (GenWar Sim, Snow Globe, COA-GPT): These integrate LLMs with simulation engines for scenario exploration and COA development, but they are standalone platforms with no document workspace, no persistent agent personas, and no integrated development environment for building and customizing exercises. They are research projects, not workspaces.

**Military C2/COP tools** (CPOF, ATAK, DCGS-A): These are operational systems designed for real-world command and control. They have excellent map and symbology support but no AI agents, no persona roleplay, no document analysis, and no scenario design flexibility. They show the real world; they don't simulate alternatives.

**General GIS tools** (QGIS, ArcGIS, Google Earth): Powerful mapping platforms with no AI integration, no military symbology out of the box, no wargaming workflow, and no scenario management.

**Wargaming map tools** (ORBAT Mapper): Specialized for order of battle visualization but no AI, no document analysis, no agent interaction, and limited scenario management.

Sandtable with an integrated COP occupies a unique position: a *self-hosted, offline-capable, AI-powered research workspace with an interactive map, military symbology, agent personas that can reason spatially, and a full document/analysis toolkit*. No existing tool provides this combination.

### 5. Offline-First Maps are a Differentiator

Sandtable's core principle is offline-first operation. An integrated COP that works in air-gapped environments -- using locally hosted map tiles (PMTiles), locally rendered military symbols (milsymbol), and local AI inference -- is genuinely valuable for defense customers who cannot use cloud-based mapping services. This is not a limitation; it is a feature that most competitors cannot match.

---

## Hard Requirements

These constraints are non-negotiable and must inform every architectural and technology decision for the COP feature.

### Deployment Environment

The primary deployment target for Sandtable is **offline, air-gapped military servers and clients**. This is not a secondary concern or a nice-to-have -- it is the defining constraint:

- **Zero internet connectivity at runtime.** No CDN tile fetches, no cloud API calls, no license validation servers, no telemetry. Every byte the COP needs must be present on the local network or local machine before the application launches.
- **Self-contained tile data.** Map tiles for the area of operations must be pre-generated and distributed as files that can be loaded from local disk or a local HTTP server on the air-gapped network.
- **All rendering client-side.** Military symbology, map rendering, and spatial calculations must execute entirely in the Electron renderer process or on a local server within the air-gapped network. No external rendering services.
- **Cortex is the only network dependency.** The only network traffic the COP should generate is to Cortex for AI inference (already on the same air-gapped network). Everything else is local.

### Licensing

**All libraries, tools, and data sources must be free and open-source licensed.** No paid licensing, no commercial-use restrictions, no viral copyleft that would encumber Sandtable's MIT license:

- Acceptable licenses: MIT, BSD-2/3, Apache 2.0, ISC, MPL-2.0 (file-level copyleft only), ODbL (for map data)
- Unacceptable: GPL/LGPL (viral copyleft concerns with static linking in Electron), proprietary, freemium, per-seat/per-deployment commercial licenses
- **No Mapbox.** Mapbox GL JS switched to a proprietary license (BSL) in December 2020. MapLibre GL JS is the community fork that remains open-source (BSD-3-Clause). This distinction matters.
- **Map data:** OpenStreetMap (ODbL) is the primary basemap data source. Natural Earth (public domain) for low-zoom political boundaries. Satellite imagery and classified map products are out of scope for bundling but the architecture must support loading user-provided imagery tiles.

### Performance and Fidelity

The map must feel like a professional geospatial tool, not a toy:

- **Smooth pan/zoom at 60fps** on typical military workstation hardware (no dedicated GPU required beyond Intel integrated graphics, though GPU acceleration is welcome)
- **Hundreds of military symbols rendered simultaneously** without frame drops (a realistic brigade-level ORBAT could have 200-500 unit symbols on screen)
- **Crisp vector rendering** -- vector tiles that scale cleanly at any zoom level, not blurry raster tiles
- **Responsive interaction** -- click, drag, select, and draw operations must feel immediate

### Workbench Integration: EditorPane in the Main Editor Area

The COP opens in the **main editor area** as a full-width, full-height EditorPane -- the same area where code files, markdown documents, and the Sandtable Settings page open. This is a deliberate architectural decision:

**Why EditorPane (not side panel, not bottom panel):**

| Approach | Screen Real Estate | Chat Pairing | Multiple Maps | Verdict |
|----------|-------------------|--------------|---------------|---------|
| **EditorPane (main editor area)** | Full editor area width and height | Chat panel remains visible in right-side Auxiliary Bar | Multiple map tabs, split views possible | **Selected** |
| Side Panel (left sidebar) | Narrow, shares space with Workspace file tree | Chat visible but map is cramped | Only one panel at a time | Rejected -- insufficient space for a map |
| Bottom Panel | Wide but short, shares space with Terminal | Chat visible but map has no vertical space | Tabs possible but impractical | Rejected -- maps need vertical space |
| Separate Window | Unlimited space | Loses chat context, requires window management | Separate windows are disconnected | Rejected -- breaks the integrated workspace model |

**The user experience:**
1. User clicks the **COP globe icon** in the Activity Bar (positioned above the Workspace file tree icon, near the top of the Activity Bar)
2. A COP map opens as a tab in the main editor area, filling the full central workspace
3. The Chat panel remains visible in the right-side Auxiliary Bar -- the user can interact with AI agents while viewing the map, exactly like chatting while editing a file
4. The Workspace file tree (if open in the left sidebar) can be collapsed to give the map even more space
5. Multiple map tabs can be open (different scenarios, different zoom levels) and arranged in split views
6. Map tabs appear in the tab bar alongside document tabs and can be reordered, pinned, or closed like any other editor tab

**Activity Bar Icon:**
- Icon: Globe symbol (`$(globe)` codicon)
- Position: Activity Bar, above the Workspace (Explorer) icon, near the top
- Behavior: Click opens or focuses the COP editor tab. If no COP is open, creates a new one. If one is already open, switches to it.
- A COP view container in the Activity Bar could also host a sidebar with the ORBAT tree, layer controls, and scenario timeline -- visible alongside the map when the COP icon is selected

**Implementation pattern:** This follows the same pattern as `SandtableSettingsPage` (an `EditorPane` registered with an `EditorInput` using a virtual URI scheme like `sandtable-cop://map`). The map renderer lives inside the EditorPane's DOM, with full access to the VS Code workbench services via dependency injection.

---

## The Big Vision -- What the COP Could Be

### The Map as a First-Class Workspace Artifact

In the same way that Sandtable treats documents, chat conversations, and terminal sessions as first-class workspace artifacts, the COP should be a first-class artifact:

- **Openable as an editor tab** -- just like opening a file, you open a map. Multiple maps can be open simultaneously (different theaters, different zoom levels, different overlays). The COP globe icon in the Activity Bar provides quick access.
- **Saveable as workspace state** -- the map position, zoom, active layers, unit positions, overlays, and timeline state are all saved as part of the workspace
- **Referenceable by agents** -- an agent can "look at" the current map state, understand what's on it, and take actions that modify it
- **Embeddable in documents** -- map snapshots can be captured and inserted into research documents, after-action reports, and briefing materials
- **Shareable across sessions** -- map configurations, ORBATs, and scenario overlays can be exported, shared, and imported by other users
- **Paired with Chat** -- the COP opens in the editor area while the Chat panel remains in the right-side Auxiliary Bar, giving users simultaneous access to the map and AI agents

### Map Capabilities

#### Base Map
- Interactive pan/zoom/rotate map with smooth 60fps performance
- Offline vector tiles via PMTiles served from local disk or local network
- Multiple basemap styles: topographic, simple political boundaries, blank canvas, user-provided imagery
- Support for user-provided raster tile layers (satellite imagery, classified products) loaded from local files
- Terrain elevation data for line-of-sight analysis and 3D visualization (future)
- Coordinate display (MGRS, lat/lon, UTM) with click-to-copy

#### Military Symbology (MIL-STD-2525 / APP-6)
- Full NATO military symbol rendering via milsymbol library
- Place units on the map with proper symbology: friendly (blue), hostile (red), neutral (green), unknown (yellow)
- Symbol modifiers: unit size, type, designation, higher formation, speed, direction of movement
- Tactical graphics: boundaries, phase lines, objectives, routes, engagement areas, fire support coordination measures
- Interactive symbol editing: click a unit to view/edit its properties, drag to reposition

#### Order of Battle (ORBAT) Management
- Hierarchical ORBAT tree view (Corps → Division → Brigade → Battalion → Company → Platoon)
- ORBAT linked to map -- selecting a unit in the tree highlights it on the map and vice versa
- ORBAT importable from structured data (JSON, CSV) or created interactively
- Unit properties: designation, type, strength, equipment, status, commander, mission
- Subordination relationships visualized as tree structure

#### Scenario Layers and Overlays
- Multiple overlay layers that can be toggled independently:
  - **Friendly ORBAT** -- blue force positions and planned movements
  - **Enemy ORBAT** -- known and suspected red force positions
  - **Terrain Analysis** -- key terrain, avenues of approach, obstacles
  - **Intelligence** -- reported sightings, signals, human intelligence markers
  - **Logistics** -- supply routes, fuel points, ammunition supply points, medical facilities
  - **Fire Support** -- artillery positions, fire support coordination measures, no-fire areas
  - **Communications** -- radio nets, relay points, dead zones
  - **Custom Overlays** -- user-defined layers for any purpose
- Drawing tools for freeform annotations, arrows, areas, and text labels
- Layer opacity controls and ordering

#### Scenario Timeline
- Time slider that controls the map state across exercise phases
- Keyframed unit positions at each phase (units animate between positions)
- Event markers on the timeline: injects, decisions, fires, movements, intelligence reports
- Play/pause/step-forward/step-back controls for reviewing scenario evolution
- Branch points where different COAs diverge

### AI-COP Synergies -- Where the Magic Happens

This is where Sandtable's COP transcends what any standalone mapping tool can do.

#### 1. Agents That See the Map

Sandtable's AI agents (via tool calling) should be able to query the map state as a structured data source:

```
User: "What's the current disposition of enemy forces in the northern sector?"

Agent (Red Team Commander persona):
[Tool call: query_map_state(sector="north", filter="hostile")]

"Based on the current COP, I see three enemy mechanized battalions
positioned along the MSR between grid references NK 4523 and NK 4831.
The 3rd Mech Battalion appears to be in a defensive posture oriented
southwest, while the 1st and 2nd battalions are staged in assembly
areas consistent with a counter-attack capability. Given the terrain
channelization at the valley mouth near NK 4627, this disposition
suggests they're prepared to..."
```

The agent doesn't just *talk about* the map -- it *reads* the map programmatically and grounds its analysis in the actual spatial data.

#### 2. Agents That Modify the Map

Agents should be able to propose changes to the COP as part of their reasoning:

```
User: "Red Team, show me your planned attack."

Agent (Red Team Commander persona):
[Tool call: add_map_overlay(
    name="Red COA-1: Northern Thrust",
    units=[
        {unit: "1st Mech Bn", move_to: "NK 4523", route: [...], phase: 2},
        {unit: "2nd Mech Bn", move_to: "NK 4627", route: [...], phase: 2},
        {unit: "3rd Mech Bn", action: "fix", target: "Blue 2nd Bde", phase: 1}
    ],
    graphics=[
        {type: "axis_of_advance", points: [...]},
        {type: "objective", location: "NK 4831", name: "OBJ WOLF"},
    ]
)]

"I've overlaid my proposed COA on the map. The plan uses 3rd Mech
to fix Blue's 2nd Brigade in place while 1st and 2nd Mech execute
a double envelopment through the valley. Note the objective marked
as OBJ WOLF -- that's the bridge crossing that gives us access to
Blue's logistics hub. You can see the axis of advance on the map."
```

The AI generates spatial artifacts -- overlays, routes, objectives -- that appear on the map for human review.

#### 3. Spatial Reasoning Grounded in Terrain

When a COP exists, agent personas can reason about terrain, distance, line-of-sight, and maneuver in ways that are impossible with pure text:

- **"Can 1st Battalion reach OBJ WOLF before enemy reinforcements arrive?"** -- The agent can calculate distances on the map, estimate movement rates based on terrain type, and compare timelines
- **"Where should we place our observation post to cover the avenue of approach?"** -- The agent can analyze terrain and suggest positions with good fields of observation
- **"What's our logistics exposure if the enemy interdicts MSR ALPHA?"** -- The agent can trace supply routes on the map and identify vulnerability points
- **"Show me the dead space in our sensor coverage"** -- The agent can compute coverage areas and highlight gaps

#### 4. Document-to-Map Intelligence Fusion

When Phase 5 (Document Ingestion) lands, the COP becomes an intelligence fusion surface:

- Upload a HUMINT report → Agent extracts geographic references → Plots them on the map as intelligence markers
- Upload a satellite image analysis → Agent identifies described positions → Creates ORBAT entries from the report
- Upload enemy doctrine document → Agent extracts typical formation patterns → Generates template enemy ORBATs
- Ask "summarize all intelligence within 10km of our forward line" → Agent queries both documents and map data to produce a spatially-bounded intelligence summary

#### 5. Multi-Agent Spatial Exercises

The persona system (Phase 6) combined with the COP enables truly immersive wargaming:

**Exercise Flow:**
1. **Facilitator** loads a scenario workspace with pre-positioned units and a scenario briefing
2. **Blue Team** (AI persona) analyzes the map, proposes defensive positions, and places units
3. **Red Team** (AI persona) sees the terrain (but not Blue's positions -- fog of war), develops an attack plan, and overlays movement routes
4. **Facilitator** advances the timeline to Phase 2, triggering an inject event
5. **Both teams** react to the inject, adjusting positions on the map
6. **Analyst** (AI persona) reviews the completed exercise, generates an after-action review with map snapshots at key decision points

Each persona interacts with the same shared map but through the lens of their role, their information access (fog of war controls what each agent can see), and their behavioral parameters.

#### 6. After-Action Review and Replay

The COP's timeline functionality combined with Sandtable's session recording capability (Phase 8) creates a powerful debrief tool:

- **Spatial Replay**: Step through the exercise phase by phase, watching units move, overlays change, and events occur on the map
- **Decision Point Analysis**: Bookmark key moments in the timeline, annotate them, and compare what actually happened against what could have happened
- **Agent Reasoning Traces**: At each decision point, see what the AI agent "saw" on the map, what information it had, and why it made the decision it did
- **Comparative COA Review**: Overlay multiple COAs (from different exercise iterations or different agents) on the same map to compare approaches
- **Automated AAR Generation**: Agent generates a structured after-action report that includes map snapshots, timeline events, key decisions, and lessons learned

#### 7. MCP-Connected Live Data

When Phase 7 (MCP Integration) arrives, the COP becomes a live data surface:

- Connect to a wargame database → Unit positions update on the map in real-time
- Connect to a weather service → Weather overlays appear on the map
- Connect to a logistics tracking system → Supply chain status visible on the map
- Connect to an intelligence feed → New reports auto-plot as markers

The COP becomes the visual front-end for any MCP data source that has a spatial dimension.

---

## Why Sandtable is Uniquely Positioned to Build This

### 1. Core-Level Integration Advantage

Because Sandtable is a VS Code fork with core-level modifications (not an extension), the map panel can be a native workbench panel with the same first-class status as the editor, terminal, and chat. This means:

- The map can live in the editor area (as an EditorPane), the sidebar, or a dedicated panel position
- Map state can be saved/restored as part of workspace state using VS Code's existing persistence infrastructure
- The map can participate in VS Code's layout system (split views, tab groups, drag-and-drop)
- Map-related tools can register with `ILanguageModelToolsService` alongside existing workspace tools
- Map interactions can emit VS Code events that other contributions react to

### 2. Agent Architecture is Already Built

The tool-calling agent loop (Phase 4), the persona system (Phase 6), and the multi-provider model routing (Phase 4.5) are all in place. Adding map-aware tools to the existing `ILanguageModelToolsService` is a natural extension:

- `query_map_state` -- Read current unit positions, overlays, layers
- `add_map_unit` -- Place a unit on the map with MIL-STD-2525 symbology
- `move_map_unit` -- Reposition a unit or update its properties
- `add_map_overlay` -- Create a named overlay with graphics and annotations
- `add_map_event` -- Add a timeline event to the scenario
- `capture_map_snapshot` -- Take a visual snapshot of the current map state
- `query_spatial` -- Measure distances, compute areas, check line-of-sight

These tools plug directly into the existing agent loop -- no new agent architecture needed.

### 3. Offline-First is Built Into the DNA

Sandtable already operates in air-gapped environments. The COP can leverage:
- **PMTiles** for self-hosted map tiles (a single file containing all tiles for a region)
- **milsymbol** for client-side military symbol rendering (pure JavaScript, no server needed)
- **Local data files** for ORBAT and scenario state (JSON/GeoJSON files in the workspace)
- **Cortex** for AI inference (already local)

No cloud map service, no internet connection, no external API calls. The entire COP stack can run on the same air-gapped network as Cortex and the models.

### 4. The Document Workspace Multiplies Value

Unlike standalone map tools, Sandtable has a full document workspace surrounding the map:
- Write scenario briefs in Markdown next to the map
- Keep intelligence reports as workspace files that agents can reference
- Generate after-action reports as documents with embedded map snapshots
- Maintain a research library of doctrine, historical analysis, and reference materials

The map does not exist in a vacuum -- it exists in the context of a rich information workspace.

---

## What This is NOT

To keep scope clear and vision honest:

- **Not a physics-based simulation engine.** Sandtable does not simulate ballistics, vehicle movement physics, radar propagation, or weapon effects. Those capabilities exist in engines like AFSIM, OneSAF, and JCATS. The COP is a *visualization and interaction layer* -- it shows where things are and lets humans and AI agents reason about them. Integration with external simulation engines via MCP is a future possibility.

- **Not a real-time C2 system.** Sandtable's COP is for planning, wargaming, and analysis -- not for commanding real forces in real operations. There is no real-time data link, no Blue Force Tracker integration, and no classified network connectivity (unless the user deploys Sandtable on such a network).

- **Not trying to replace CPOF, ATAK, or DCGS-A.** Those are operational systems with decades of development, fielded to tens of thousands of users. Sandtable's COP serves a different purpose: research, scenario exploration, exercise design, and AI-assisted analysis.

- **Not a full GIS suite.** Sandtable is not trying to compete with QGIS or ArcGIS for geospatial analysis. The map provides enough capability to support wargaming and research workflows, not to perform advanced geospatial science.

---

## How This Synergizes with the Full Sandtable Roadmap

```
                        ┌─────────────────────────────────────────┐
                        │           SANDTABLE VISION               │
                        │  AI-Powered Research & Wargaming Platform │
                        └──────────────────┬──────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
     ┌────────▼────────┐        ┌─────────▼─────────┐        ┌────────▼────────┐
     │  TEXT WORKSPACE  │        │   SPATIAL LAYER    │        │   AI AGENTS     │
     │                  │◄──────►│   (THE COP)        │◄──────►│                 │
     │ Documents        │        │                    │        │ Personas        │
     │ Chat/Messaging   │        │ Interactive Map    │        │ Tool Calling    │
     │ Research Notes   │        │ Military Symbols   │        │ Spatial Tools   │
     │ Reports/Outputs  │        │ ORBAT Management   │        │ Spatial Reason  │
     │ Code (Code Mode) │        │ Scenario Timeline  │        │ COA Generation  │
     │ Terminal          │        │ Overlay Layers     │        │ AAR Analysis    │
     └────────┬─────────┘        └─────────┬─────────┘        └────────┬────────┘
              │                            │                            │
              └────────────────────────────┼────────────────────────────┘
                                           │
                        ┌──────────────────▼──────────────────────┐
                        │         PLATFORM SERVICES                │
                        │                                          │
                        │  Cortex (LLM Inference)                  │
                        │  MCP (External Data/Tools)               │
                        │  Offline Map Tiles (PMTiles)             │
                        │  Workspace Persistence                   │
                        │  Multi-Provider Model Routing             │
                        │  Session Recording & Replay               │
                        └──────────────────────────────────────────┘
```

The three pillars -- Text Workspace, Spatial Layer (COP), and AI Agents -- form a triangle where each pillar strengthens the others:

- **Text + Spatial**: Documents contain geographic references that plot on the map. Map snapshots embed in documents. Research happens at the intersection of textual and spatial data.
- **Spatial + AI**: Agents see and modify the map. The map is a tool that agents use. Spatial reasoning becomes part of the AI's capability set.
- **AI + Text**: Agents generate documents, answer questions, synthesize research. This already works today.
- **All Three Together**: An analyst uploads a stack of intelligence reports. An AI agent extracts key locations and plots them on the map. The analyst asks the Red Team persona to develop a course of action. The Red Team agent studies the terrain, places units, draws movement routes on the map, and writes a CONOP document. The Blue Team agent reviews the map and the CONOP and develops a defense. The facilitator runs the exercise forward through multiple phases. After the exercise, an analyst agent generates an AAR with map snapshots, timeline analysis, and lessons learned.

That is a sand table exercise. That is the vision.

---

## Technology Stack -- Research Findings

All candidates have been evaluated against the hard requirements: **open-source license (MIT/BSD/Apache compatible)**, **zero runtime internet dependency**, **works in Electron's renderer process on air-gapped military networks**.

### Recommended Stack

| Component | Selected | License | Offline | Status |
|-----------|----------|---------|---------|--------|
| **Map Renderer** | MapLibre GL JS | BSD-3-Clause | Yes | Confirmed -- best option |
| **Offline Tiles** | PMTiles (Protomaps) | BSD-3-Clause | Yes | Confirmed -- ideal for air-gapped |
| **Basemap Styles** | Protomaps Basemaps (`@protomaps/basemaps`) | BSD-3-Clause | Yes | Confirmed -- provides complete style generation |
| **Font Glyphs** | Protomaps basemaps-assets (Noto Sans PBF) | SIL OFL (fonts), MIT (sprites) | Yes (bundled) | Confirmed -- pre-generated PBF glyphs |
| **Sprites/Icons** | Protomaps basemaps-assets (v4) | MIT | Yes (bundled) | Confirmed -- 1x/2x, light/dark themes |
| **Military Symbology** | milsymbol v3 | MIT | Yes (pure JS) | Confirmed -- MIL-STD-2525C/D/E + APP-6B/D/E |
| **Drawing/Annotation** | maplibre-gl-draw (birkskyum fork) | ISC | Yes | Confirmed -- lines, polygons, points |
| **Spatial Analysis** | Turf.js (`@turf/turf`) | MIT | Yes (pure JS) | Confirmed -- distance, area, buffer, intersect |
| **Coordinate Systems** | @ngageoint/mgrs-js | MIT | Yes (pure JS) | Confirmed -- MGRS/UTM/LatLon conversion; NGA-developed |
| **Geospatial Data** | GeoJSON (RFC 7946) | Open standard | Yes | N/A |
| **ORBAT Schema** | Custom JSON extending GeoJSON | N/A | Yes | To be designed; reference: ORBAT Mapper + MSDL |
| **Basemap Data** | OpenStreetMap extracts | ODbL | Pre-downloaded | Via Geofabrik regional extracts |
| **Low-Zoom Boundaries** | Natural Earth | Public Domain | Bundled | Country/region boundaries |
| **Tile Generation** | Tilemaker | BSD-2-Clause | Runs locally | Single C++ binary, no database needed |
| **Integration Pattern** | VS Code EditorPane | N/A (VS Code core) | Yes | Same pattern as SandtableSettingsPage |
| **3D Terrain (Future)** | MapLibre GL JS terrain (raster-dem) | BSD-3-Clause | Yes (with local DEM tiles) | Built-in terrain support, no extra library |

### Detailed Technology Rationale

#### Map Renderer: MapLibre GL JS (BSD-3-Clause)

**Selected over Leaflet and OpenLayers.** MapLibre GL JS is the clear winner for this use case:

- **Vector tile rendering via WebGL** -- smooth 60fps pan/zoom, crisp rendering at any zoom level. This is critical for the professional-quality map experience required.
- **BSD-3-Clause license** -- fully permissive, no copyleft concerns. This is the open-source community fork of Mapbox GL JS created specifically because Mapbox switched to a proprietary license (BSL) in December 2020.
- **PMTiles protocol support** -- native integration with PMTiles via `maplibregl.addProtocol('pmtiles', ...)`. Tiles load directly from a single `.pmtiles` file without a tile server.
- **Self-hosted asset support** -- fonts (PBF glyphs), sprites, and tiles can all be served from local paths. Air-gapped deployment is a documented use case.
- **3D terrain support** -- built-in `raster-dem` source type and `setTerrain()` for elevation visualization, using locally served terrain tiles.
- **Active development** -- 9.7k GitHub stars, regular releases, strong community. MapLibre is the mapping industry standard for open-source vector map rendering.
- **Plugin ecosystem** -- drawing tools (maplibre-gl-draw), geocoding, measure tools, and more.

**Why not Leaflet?** Leaflet is raster-tile-only by default (no WebGL vector rendering), which means blurry tiles when zooming between levels and no smooth vector styling. The `leaflet.offline` plugin helps with offline raster caching but doesn't provide the rendering quality of vector tiles. Leaflet would work, but the visual quality and performance gap is significant.

**Why not OpenLayers?** OpenLayers is feature-rich and supports vector tiles, but it's substantially heavier (larger bundle), has a steeper API, and its community momentum is behind MapLibre for new projects. OpenLayers has superior built-in drawing tools, but maplibre-gl-draw closes that gap.

#### Offline Tiles: PMTiles (BSD-3-Clause)

PMTiles is the purpose-built solution for offline/serverless map tile deployment:

- **Single-file archive** -- all tiles for a region stored in one `.pmtiles` file. No directory of millions of tiny files. Easy to distribute, copy, and manage on air-gapped systems.
- **No tile server required** -- PMTiles uses HTTP Range Requests to fetch individual tiles from the archive. In an Electron app, this can be served from a local file via a custom protocol handler or a minimal local HTTP server.
- **Efficient** -- tiles are clustered by spatial proximity in the archive, so nearby tiles are fetched with minimal seeks. Compression reduces file sizes significantly.
- **Tile generation workflow**: Download OSM `.osm.pbf` regional extract from Geofabrik → Run Tilemaker (single binary, no database) → Output `.pmtiles` file → Deploy to air-gapped network. This entire workflow runs offline after the initial data download.
- **Size estimates**: A country-level extract (e.g., Germany) produces a PMTiles file of roughly 3-8 GB depending on zoom levels and detail. A city-level extract is 50-500 MB. Regional military operations areas would typically be 1-5 GB.

#### Basemap Styling: Protomaps Basemaps (BSD-3-Clause)

The Protomaps project provides a complete, self-contained styling stack for MapLibre:

- **`@protomaps/basemaps` npm package** -- TypeScript/JavaScript library that generates MapLibre style JSON with multiple themes (light, dark, white, grayscale, black). Generates styles programmatically, so no external style endpoint is needed.
- **basemaps-assets repository** -- Pre-generated font glyphs (Noto Sans in PBF format) and sprite sheets (1x/2x, light/dark). These can be downloaded and bundled locally for air-gapped deployment. Fonts are SIL Open Font License; sprites are MIT.
- **Complete offline workflow**: Bundle the fonts and sprites as static files alongside the Electron app or on the air-gapped network. Generate styles using `@protomaps/basemaps` pointing to local glyph/sprite paths. No CDN, no external font service.

```typescript
// Example: generating a fully offline MapLibre style
import { layers, namedFlavor } from '@protomaps/basemaps';

const style = {
    version: 8,
    glyphs: 'file:///path/to/bundled/fonts/{fontstack}/{range}.pbf',
    sprite: 'file:///path/to/bundled/sprites/v4/light',
    sources: {
        basemap: {
            type: 'vector',
            url: 'pmtiles:///path/to/region.pmtiles'
        }
    },
    layers: layers('basemap', namedFlavor('light'), { lang: 'en' })
};
```

#### Military Symbology: milsymbol v3 (MIT)

milsymbol is the de facto standard for rendering MIL-STD-2525/APP-6 military symbols in JavaScript:

- **Pure JavaScript** -- no native dependencies, no network calls, no server-side rendering. Generates SVG or Canvas output entirely client-side.
- **Multi-standard support** -- MIL-STD-2525C, 2525D, 2525E, and STANAG APP-6B, APP-6D, APP-6E. Configurable per symbol.
- **Performance** -- benchmarks show 1000 symbols rendered as SVG in under 2 seconds. For our 200-500 unit ORBAT target, this is well within budget.
- **MapLibre integration** -- milsymbol generates SVG strings that can be converted to data URIs and used as MapLibre marker icons or added to a symbol layer. The milsymbol docs specifically show integration examples with Leaflet, MapLibre, Cesium, and OpenLayers.
- **Extensive symbol modifiers** -- unit size, type, designation, higher formation, speed leader, direction of movement, operational condition, and all standard text modifiers.
- **npm package** -- `npm install milsymbol` (current version 3.0.3 with TypeScript types).

**Integration approach for MapLibre:**
```typescript
import ms from 'milsymbol';

// Generate a friendly infantry battalion symbol
const symbol = new ms.Symbol('10031000161211000000', {
    size: 35,
    uniqueDesignation: '2-7 IN',
    higherFormation: '1 BCT',
});

// Convert to data URI for use as MapLibre icon
const svgString = symbol.asSVG();
const dataUri = 'data:image/svg+xml;base64,' + btoa(svgString);

// Add as image to map, then use in a symbol layer
map.loadImage(dataUri, (err, image) => {
    map.addImage('unit-2-7-in', image);
});
```

#### Drawing and Annotation: maplibre-gl-draw (ISC)

The birkskyum fork of mapbox-gl-draw, modernized for MapLibre GL JS:

- **ISC license** -- permissive, compatible with MIT
- **Core drawing modes** -- point, line, polygon, simple select, direct select (vertex editing)
- **Extensible** -- custom drawing modes can be created for military-specific graphics (axes of advance, phase lines, engagement areas)
- **GeoJSON output** -- all drawn features are stored as GeoJSON, which integrates directly with our ORBAT/scenario data model
- **Alternatives considered**: Terra Draw (MIT) offers a framework-agnostic approach; maplibre-geoman provides additional geometry editing. Either could supplement or replace maplibre-gl-draw if needed.

#### Spatial Analysis: Turf.js (MIT)

Client-side geospatial analysis library with no external dependencies:

- **Distance measurement** -- Haversine-based distance between coordinates (km, miles, nautical miles)
- **Area calculation** -- polygon area in square meters/km/miles
- **Buffer zones** -- generate buffer polygons around points, lines, or areas
- **Boolean operations** -- intersect, union, difference for overlapping areas
- **Line operations** -- along, bearing, midpoint, nearest point on line
- **Modular** -- import only the functions needed (`@turf/distance`, `@turf/buffer`, etc.) to minimize bundle size

This provides the spatial computation layer that AI agents need to reason about distances, areas, coverage, and spatial relationships.

#### Coordinate Systems: @ngageoint/mgrs-js (MIT)

Military Grid Reference System conversion library developed by the National Geospatial-Intelligence Agency (NGA):

- **MIT license** -- NGA releases this as open-source
- **MGRS ↔ UTM ↔ lat/lon conversion** -- bidirectional, supporting all MGRS precision levels
- **Grid drawing** -- functions for computing MGRS grid lines at various zoom levels for overlay on the map
- **TypeScript support** -- type definitions included
- **Offline** -- pure JavaScript, no network calls
- **Government pedigree** -- developed by NGA (the organization that maintains the MGRS standard), so correctness is well-validated

#### ORBAT Data Model: Custom JSON (Reference: ORBAT Mapper + MSDL)

For the ORBAT data structure, we should design a custom JSON schema informed by two reference projects:

- **ORBAT Mapper** (MIT) -- a TypeScript/Vue web app for military ORBAT visualization. Uses JSON-based data structures with milsymbol integration. Closest existing open-source reference.
- **MSDL (Military Scenario Definition Language)** -- a NATO standard (SISO-STD-007) for exchanging military scenario data. The `msdllib` library (orbat-mapper/msdllib) provides a TypeScript implementation for parsing and manipulating MSDL data. This is the formal standard for the data we're modeling.
- **GeoJSON compliance** -- unit positions should be stored as GeoJSON `Feature` objects with military properties in the `properties` field, enabling direct rendering on the map while preserving rich ORBAT metadata.

#### Tile Generation: Tilemaker (BSD-2-Clause)

For the offline tile preparation workflow (run before deployment, not at runtime):

- **Single C++ binary** -- no database, no external services. Download, run, done.
- **OSM .pbf → PMTiles** -- direct conversion from OpenStreetMap data extracts to PMTiles format
- **Lua-scriptable** -- customize which features to include (roads, buildings, water, land use) and at what zoom levels
- **Resource requirements** -- regional extracts process in minutes with modest RAM. Global planet file needs ~22 GB RAM and several hours.
- **Workflow**: Geofabrik download (on internet-connected system) → Tilemaker conversion → Transfer `.pmtiles` file to air-gapped network → Serve from local filesystem

### Complete Offline Deployment Architecture

```
Air-Gapped Network
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Sandtable Client (Electron App)                         │  │
│  │                                                          │  │
│  │  ┌─────────────────────┐  ┌───────────────────────────┐  │  │
│  │  │  MapLibre GL JS     │  │  Chat Panel (Aux Bar)     │  │  │
│  │  │  (WebGL Renderer)   │  │  (AI Agent Interaction)   │  │  │
│  │  │                     │  │                           │  │  │
│  │  │  + milsymbol        │  │  Cortex LM Provider       │  │  │
│  │  │  + Turf.js          │  │  Tool-calling agent loop  │  │  │
│  │  │  + @ngageoint/mgrs  │  │  Map-aware tools          │  │  │
│  │  │  + maplibre-gl-draw │  │                           │  │  │
│  │  └─────────┬───────────┘  └───────────┬───────────────┘  │  │
│  │            │                          │                   │  │
│  │            ▼                          ▼                   │  │
│  │  ┌─────────────────────┐  ┌───────────────────────────┐  │  │
│  │  │  Local Assets        │  │  Cortex Gateway            │  │  │
│  │  │                     │  │  (HTTP, air-gapped LAN)   │  │  │
│  │  │  • region.pmtiles   │  │                           │  │  │
│  │  │  • fonts/*.pbf      │  │  vLLM / llama.cpp         │  │  │
│  │  │  • sprites/*        │  │  (GPU inference)          │  │  │
│  │  │  • scenario.json    │  │                           │  │  │
│  │  │  • orbat.geojson    │  │                           │  │  │
│  │  └─────────────────────┘  └───────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  Network traffic: Sandtable ←→ Cortex only (LLM inference)    │
│  Everything else: local filesystem reads                       │
└────────────────────────────────────────────────────────────────┘

Pre-Deployment (Internet-Connected Prep Machine)
┌────────────────────────────────────────────────────────────────┐
│  1. Download OSM extract from Geofabrik (.osm.pbf)            │
│  2. Run Tilemaker → produce region.pmtiles                     │
│  3. Download Protomaps basemaps-assets (fonts, sprites)        │
│  4. Package everything into deployment bundle                   │
│  5. Transfer to air-gapped network via approved media          │
└────────────────────────────────────────────────────────────────┘
```

---

## Use Case Scenarios

### Scenario 1: Tabletop Wargame Exercise

A wargame designer creates a new workspace using a wargaming template. The workspace comes pre-loaded with:
- A map centered on the exercise area with appropriate basemap
- Initial ORBAT for Blue and Red forces
- A scenario brief document
- Pre-configured personas: Blue Team Commander, Red Team Commander, Exercise Facilitator, Intelligence Analyst

The facilitator advances the exercise through phases. At each phase, AI agents react to the situation, propose actions on the map, and the facilitator adjudicates outcomes. The entire exercise is recorded for after-action review.

### Scenario 2: Intelligence Fusion and Analysis

An analyst receives a batch of intelligence reports (PDFs, message traffic, imagery analysis). They upload the documents to Sandtable's workspace. An AI agent (Research Analyst persona) reads the documents, extracts geographic references, and plots them on the COP as intelligence markers with source attribution.

The analyst asks: "Based on these reports, what is the most likely enemy composition and disposition in Sector 4?" The agent queries both the documents and the map, synthesizes the information, and produces a written assessment with supporting map overlays showing assessed enemy positions.

### Scenario 3: Course of Action Development

A military planner needs to develop three COAs for an offensive operation. They describe the mission and constraints in chat. The AI agent (using the map tools) generates three distinct COAs, each as a named overlay on the map with:
- Phase lines and objectives
- Unit movement routes
- Fire support coordination measures
- Logistics support positions

The planner reviews each COA on the map, asks the agent to compare them against doctrine, and selects one for further refinement.

### Scenario 4: Training and Education

An instructor sets up a Tactical Decision Game for students. The exercise workspace includes a map with a pre-loaded scenario, a set of questions, and an AI adjudicator persona. Students interact with the map to develop their solutions, and the AI adjudicator evaluates their decisions against doctrinal principles and scenario constraints, providing feedback.

### Scenario 5: Historical Battle Study

A researcher studying the Battle of 73 Easting loads a workspace with:
- Historical ORBAT data for both sides
- A map of the engagement area
- Doctrinal documents from both US and Iraqi forces
- After-action reports

They use AI agents to recreate the battle on the map, then ask "what if" questions: "What if the Iraqi division had repositioned 2 hours earlier?" The agent modifies the ORBAT, adjusts positions, and reasons about likely outcomes.

---

## Phasing Considerations

This feature is large. It should be broken into sub-phases:

### COP Phase 1: Map Panel and Basic Interaction
- COP globe icon (`$(globe)`) registered in Activity Bar
- COP view container with ORBAT tree / layer controls sidebar (visible when globe icon selected)
- COP EditorPane opens in the main editor area (full width/height, alongside Chat in Auxiliary Bar)
- `SandtableCopInput` (EditorInput) with `sandtable-cop://` URI scheme
- `SandtableCopPage` (EditorPane) hosting MapLibre GL JS renderer
- PMTiles protocol registered for local tile loading
- Bundled Protomaps basemap assets (fonts, sprites) served from local filesystem
- MapLibre style generated via `@protomaps/basemaps` pointing to local assets
- Pan, zoom, rotate with smooth 60fps WebGL rendering
- Coordinate display: MGRS (via @ngageoint/mgrs-js), lat/lon, UTM
- Basic drawing tools via maplibre-gl-draw (points, lines, polygons)
- Layer management panel (toggle, opacity, ordering)
- Map state persistence in workspace (position, zoom, layers saved to workspace JSON)
- `sandtable.cop.openMap` command (Activity Bar icon click + Command Palette)

### COP Phase 2: Military Symbology and ORBAT
- MIL-STD-2525/APP-6 symbol rendering via milsymbol
- Unit placement with symbol configuration dialog
- ORBAT tree view (panel or sidebar)
- ORBAT import/export (JSON)
- Unit properties editor

### COP Phase 3: Agent Map Tools
- Register map-query and map-modification tools with `ILanguageModelToolsService`
- Agent can read map state (unit positions, layers, overlays)
- Agent can place/move units and create overlays
- Map snapshots for embedding in chat responses

### COP Phase 4: Scenario Timeline
- Timeline control bar with phases
- Keyframed unit positions per phase
- Event markers (injects, decisions, fires)
- Play/pause/step controls
- Timeline recording and replay

### COP Phase 5: Intelligence Fusion and Advanced Features
- Document-to-map plotting (geographic extraction from ingested documents)
- Spatial queries (distance measurement, area calculation, buffer zones)
- FOW (Fog of War) controls per persona/role
- COA overlay comparison tools
- After-action review mode with map replay and annotation

---

## Architectural Decisions

All research questions have been resolved. Decisions are documented here with rationale.

### Decision 1: EditorPane for Workbench Integration

**Decision:** EditorPane in the main editor area.

The COP opens as a full-width, full-height EditorPane following the same pattern as `SandtableSettingsPage`. Chat panel remains visible in the right-side Auxiliary Bar. COP globe icon in Activity Bar provides quick access. See "Hard Requirements > Workbench Integration" above.

### Decision 2: Open Licenses Only for Map Data

**Decision:** OpenStreetMap (ODbL) for basemap data, Natural Earth (public domain) for low-zoom boundaries.

No paid or proprietary map services. Architecture supports user-provided imagery tiles (satellite, classified products) loaded from local files. See "Hard Requirements > Licensing" above.

### Decision 3: MapLibre GL JS as Map Renderer

**Decision:** MapLibre GL JS (BSD-3-Clause).

MapLibre is the clear winner over Leaflet and OpenLayers for this use case:

- **Vector tiles via WebGL** deliver the 60fps pan/zoom requirement with crisp rendering at any zoom level. Leaflet is raster-only by default (blurry between zoom levels, no vector styling). OpenLayers supports vector tiles but carries a much heavier bundle and has less community momentum.
- **Native PMTiles protocol** via `maplibregl.addProtocol('pmtiles', ...)` loads tiles directly from local `.pmtiles` files with no tile server. Neither Leaflet nor OpenLayers have this built-in.
- **Self-hostable assets** (fonts, sprites, tiles) are a documented use case, confirmed by Protomaps basemaps integration. Local file paths work for all asset types.
- **BSD-3-Clause** is fully MIT-compatible with no copyleft concerns.
- **Active ecosystem** with draw plugins, measure tools, and strong milsymbol integration examples.

Leaflet rejected: inferior rendering quality (raster-only). OpenLayers rejected: heavier bundle, steeper API, less community momentum for new projects.

### Decision 4: Agent Map Data Format -- Tiered Summaries

**Decision:** Agents receive tiered, filtered structured JSON -- not raw GeoJSON dumps.

When an agent calls a map tool, the response format depends on the query scope:

| Tool Call | Response Format | Token Budget |
|-----------|----------------|-------------|
| `query_map_state()` | High-level summary: unit counts by affiliation, active layers, map center/zoom, scenario phase | ~200-500 tokens |
| `query_map_state(sector="north", filter="hostile")` | Filtered unit list: SIDC, designation, position (MGRS), echelon, status for matching units only | ~50-100 tokens per unit |
| `query_unit(id="unit-001")` | Full unit detail: all properties, subordinates, current overlay memberships | ~100-200 tokens |
| `query_spatial(from="unit-001", to="unit-002")` | Computed result: distance, bearing, terrain summary | ~50-100 tokens |

**Rationale:** A brigade-level ORBAT (200-500 units) as raw GeoJSON could easily be 50,000+ tokens -- far too large for a single tool response. The tiered approach ensures agents get precisely the information they asked for within manageable token budgets. Agents can drill down by making follow-up queries. This mirrors how human staff officers work: you ask for a situation summary first, then drill into specific sectors or units.

**Implementation:** The `ISandtableCopService` (the COP's platform service) exposes methods that return pre-formatted summaries. The tool wrappers in `ILanguageModelToolsService` call these methods and return the structured text to the agent.

### Decision 5: Performance -- Acceptable at Target Scale

**Decision:** milsymbol + MapLibre can handle 200-500 units. No special mitigation needed beyond standard implementation patterns.

**Evidence:**
- milsymbol benchmarks: 1,000 SVG symbols rendered in under 2 seconds (from milsymbol's own `speed-svg` example).
- MapLibre renders thousands of features in WebGL symbol layers without issue -- this is its core competency (city-scale data with millions of features).
- Our approach uses milsymbol to pre-generate SVG data URIs, which are loaded as MapLibre images and rendered via a `symbol` layer. This leverages MapLibre's WebGL batching rather than creating individual DOM elements per unit.

**Validation plan:** During COP Phase 1 prototyping, render a test dataset of 500 symbols on the map and measure frame rate. If issues arise (unlikely), mitigation options include: clustering at low zoom levels, LOD (level of detail) that simplifies symbols at small zoom, or canvas-based rendering instead of SVG data URIs.

### Decision 6: Content Security Policy -- Modify Workbench CSP for WebGL

**Decision:** Modify VS Code's workbench CSP to permit WebGL shader compilation. Render MapLibre directly in the EditorPane DOM.

**Context:** VS Code's workbench uses a Content Security Policy that restricts `eval()` and similar constructs. MapLibre GL JS requires WebGL, which involves compiling GLSL shaders at runtime. Shader compilation uses `WebGLRenderingContext.shaderSource()` and `compileShader()` -- these are WebGL API calls, not `eval()`, but some CSP configurations block them.

**Approach:**
1. MapLibre renders directly in the EditorPane's DOM (inside a `<canvas>` element), not in a separate webview or iframe.
2. Since Sandtable is a controlled fork (not a marketplace extension), we have full authority to modify the workbench CSP. If WebGL shader compilation is blocked, we add the necessary CSP directives.
3. In an air-gapped deployment with no extension marketplace and no untrusted code, the security tradeoff is minimal. The CSP exists primarily to protect against malicious extensions; in our controlled environment, this is not a concern.
4. **Fallback:** If direct DOM rendering proves problematic, embed the map in a sandboxed `<iframe>` within the EditorPane with its own relaxed CSP. This isolates the map's security context while keeping it visually integrated in the editor area. Communication between the EditorPane and the iframe uses `postMessage`.

**Risk level:** Low. WebGL is standard in Electron's Chromium renderer. The `SandtableSettingsPage` already proves complex DOM rendering works in an EditorPane. The main unknown is whether MapLibre's specific initialization triggers CSP violations -- this will be validated in the COP Phase 1 prototype.

### Decision 7: Tile Distribution -- Tiered by Scale, Referenced by Configuration

**Decision:** Tiles are external assets (not bundled with the Electron app), referenced via the `sandtable.cop.tileSource` setting. Three deployment tiers:

| Scenario | Tile Location | Setting Value | Size |
|----------|---------------|---------------|------|
| **Small area** (city, base, exercise area) | PMTiles file in workspace directory | `./maps/exercise-area.pmtiles` (relative to workspace) | 50-500 MB |
| **Medium area** (country, region) | PMTiles file on shared network drive | `/mnt/shared/maps/germany.pmtiles` or `\\server\maps\germany.pmtiles` | 1-10 GB |
| **Large area** (theater, continental) | Local HTTP tile server on air-gapped LAN | `http://map-server.local:8080/tiles/eurasia.pmtiles` | 10-100+ GB |

**Rationale:**
- Tiles are **never bundled with the Electron app** -- even a small country tileset is multi-GB, which would make the app download/install impractical.
- The workspace-relative path option allows scenario packages to be self-contained: copy a workspace folder (with its `.pmtiles` file) to another machine and everything works.
- The network path option supports shared tile data across multiple Sandtable clients on the same air-gapped LAN.
- The HTTP server option supports large-scale deployments where a dedicated tile server (simple nginx or `http-server`) serves tiles efficiently to many clients.
- PMTiles' HTTP Range Request protocol works for all three modes (local file, network file, HTTP server).

**Settings:**
```
sandtable.cop.tileSource    // string: path or URL to .pmtiles file
sandtable.cop.tileFallback  // string: optional fallback tile source (e.g., Natural Earth bundled tiles for low-zoom world view)
```

A small Natural Earth-based PMTiles file (~5-10 MB, country boundaries and coastlines only) can be bundled with the Electron app as a fallback/default so the map always has *something* to show, even without a configured regional tileset.

### Decision 8: Symbology Standard -- MIL-STD-2525D Default, Configurable

**Decision:** Default to **MIL-STD-2525D**. Configurable per-workspace via `sandtable.cop.symbologyStandard`.

| Standard | Code | Use Case |
|----------|------|----------|
| MIL-STD-2525C | `2525C` | Legacy compatibility (older US systems) |
| **MIL-STD-2525D** | **`2525D`** | **Default.** Current US DoD standard (June 2014). Modular component-based symbols. |
| MIL-STD-2525E | `2525E` | Latest revision (if milsymbol supports it) |
| APP-6B | `APP6B` | NATO legacy |
| APP-6D | `APP6D` | Current NATO standard |
| APP-6E | `APP6E` | Latest NATO revision |

**Rationale:** Sandtable's primary users are US military. MIL-STD-2525D is the current US standard and uses the modular SIDC format (20+ digit numeric codes) that milsymbol v3 handles natively. APP-6 options are available for NATO interoperability. The setting is per-workspace so different exercises can use different standards.

**Setting:**
```
sandtable.cop.symbologyStandard  // string, default: '2525D'
```

### Decision 9: ORBAT Data Model -- GeoJSON Features + Separate Hierarchy Tree

**Decision:** Two-file model: a GeoJSON `FeatureCollection` for unit positions/properties (renderable directly on the map) and a separate JSON hierarchy file for the ORBAT tree structure.

**Unit positions (`orbat.geojson`):**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "unit-001",
      "geometry": { "type": "Point", "coordinates": [44.3661, 33.3152] },
      "properties": {
        "sidc": "10031000161211000000",
        "designation": "2-7 IN",
        "name": "2nd Battalion, 7th Infantry Regiment",
        "affiliation": "friendly",
        "echelon": "battalion",
        "unitType": "infantry",
        "strength": 800,
        "status": "operational",
        "commander": "LTC Smith",
        "higherFormation": "unit-010",
        "scenario_phase": 1,
        "notes": ""
      }
    }
  ]
}
```

**ORBAT hierarchy (`orbat-tree.json`):**
```json
{
  "name": "Blue Force ORBAT",
  "standard": "2525D",
  "roots": ["unit-100"],
  "tree": {
    "unit-100": { "children": ["unit-010", "unit-020", "unit-030"] },
    "unit-010": { "children": ["unit-001", "unit-002", "unit-003"] },
    "unit-001": { "children": [] }
  }
}
```

**Rationale:**
- **Separation of concerns.** GeoJSON is a rendering format -- MapLibre consumes it directly as a source. The hierarchy tree is a logical structure that drives the ORBAT tree view panel. Keeping them separate means the map renderer doesn't need to parse tree logic, and the ORBAT tree doesn't need to know about coordinate projections.
- **Agent-friendly.** An agent calling `query_map_state` gets a filtered GeoJSON response. An agent calling `query_orbat_hierarchy` gets the tree. Neither response contains data the agent didn't ask for.
- **GeoJSON compliance.** The position file is valid GeoJSON (RFC 7946). Standard GeoJSON tools can read/write it. It can be opened in QGIS, visualized in geojson.io, or processed by Turf.js.
- **MSDL interoperability (future).** The `msdllib` library can import/export MSDL data. Our schema can be mapped to/from MSDL fields for interoperability with NATO scenario exchange standards.
- **Workspace files.** Both files live in the workspace directory, are versionable (git), human-readable, and editable by agents. Scenario templates can bundle pre-configured ORBATs.

### Decision 10: Agent Data Flow -- Pull Model (Agent-Initiated Queries Only)

**Decision:** Agents query the map state on demand via tool calls. Map changes do NOT push notifications to agents.

**How it works:**
1. User (or facilitator) makes changes to the map (moves a unit, adds an overlay, advances the timeline).
2. The map state updates locally. No agent is notified.
3. When the user next sends a chat message (e.g., "Red Team, the enemy just repositioned. What's your assessment?"), the agent's tool-calling loop fires.
4. The agent calls `query_map_state()` to read the current situation, sees the changes, and responds.

**Rationale:**
- **Architectural simplicity.** The existing agent loop is request/response: user message → agent reasons → agent calls tools → agent responds. Push notifications would require an "always listening" agent, which is a fundamentally different architecture (event-driven rather than request-driven). That's Phase 6+ work, not COP Phase 3.
- **Token efficiency.** Push notifications on every map change would generate constant agent invocations, consuming tokens and inference time for changes the agent may not care about.
- **User control.** The facilitator controls the exercise pace. They decide when to prompt agents to react to changes. This mirrors how real wargames work -- the facilitator calls on each team when it's their turn, rather than having participants react in real-time to every update.
- **Future enhancement.** A push model (event-driven agent triggers) is a natural Phase 6+ extension if the exercise framework demands it. The pull model does not preclude adding push later.

### Decision 11: Asset Bundling -- Protomaps basemaps-assets Bundled with Electron App

**Decision:** Bundle Protomaps basemaps-assets (fonts and sprites) as static files in the Electron app's resources directory.

**Bundle contents:**
```
resources/cop-assets/
  fonts/
    Noto Sans Regular/
      0-255.pbf
      256-511.pbf
      ... (PBF glyph ranges)
    Noto Sans Medium/
      ...
    Noto Sans Italic/
      ...
  sprites/
    v4/
      light.png
      light.json
      light@2x.png
      light@2x.json
      dark.png
      dark.json
      dark@2x.png
      dark@2x.json
```

**Size:** ~30 MB for fonts, ~1 MB for sprites. Trivial addition to the Electron app bundle.

**Style references:**
```typescript
const style = {
    version: 8,
    glyphs: `file://${copAssetsPath}/fonts/{fontstack}/{range}.pbf`,
    sprite: `file://${copAssetsPath}/sprites/v4/${theme}`,
    sources: { /* PMTiles source */ },
    layers: layers('basemap', namedFlavor(theme), { lang: 'en' })
};
```

**Font stack:** Noto Sans Regular / Medium / Italic. Noto Sans provides excellent international coverage (Latin, Cyrillic, Greek, Arabic, CJK via `localIdeographFontFamily`). This is important for military users working with international place names.

**Rationale:** Fonts and sprites are small, static, and required for every map render. Bundling them eliminates a deployment step and ensures the map works immediately after installation. Unlike tile data (which is region-specific and multi-GB), these assets are universal and tiny.

### Decision 12: Coordinate Systems -- @ngageoint/mgrs-js

**Decision:** `@ngageoint/mgrs-js` (MIT license) for all coordinate conversion.

- Developed by the National Geospatial-Intelligence Agency (the authority that maintains MGRS).
- MIT license, TypeScript types included, pure JavaScript (no native deps, no network calls).
- Supports MGRS ↔ UTM ↔ lat/lon conversion at all precision levels.
- Includes grid computation functions for rendering MGRS grid overlays on the map.
- Alternatives considered: `proj4js/mgrs` (MIT, simpler API but fewer features) and Chris Veness' geodesy library (MIT). `@ngageoint/mgrs-js` selected for its government pedigree, grid overlay capability, and comprehensive precision support.

**UI integration:**
- Status bar or map corner displays cursor position in MGRS (primary), with lat/lon and UTM available via click-to-cycle or tooltip.
- Coordinate entry fields accept MGRS input (e.g., user types `38SMB4488306483` and the map pans to that location).
- MGRS grid overlay as a toggleable map layer.

### Decision 13: Drawing and Annotation -- maplibre-gl-draw + Custom Military Modes

**Decision:** `maplibre-gl-draw` (ISC license, birkskyum fork) for base geometry drawing, extended with custom drawing modes for military-specific tactical graphics.

**Base capabilities from maplibre-gl-draw:**
- Point placement, line drawing, polygon drawing
- Vertex editing (direct select mode), feature selection, deletion
- GeoJSON input/output (all drawn features stored as GeoJSON)
- Extensible mode system for creating custom drawing interactions

**Custom military drawing modes (built on top of maplibre-gl-draw's mode API):**

| Tactical Graphic | Implementation | Example |
|-----------------|----------------|---------|
| Phase Line | Custom mode: click two+ points on the map, auto-labels with name | `PL ALPHA` |
| Axis of Advance | Custom mode: draw directional arrow polyline with arrowhead | Arrow from assembly area to objective |
| Boundary | Custom mode: line with opposing tick marks indicating side ownership | Brigade boundary between 1BCT and 2BCT |
| Engagement Area | Custom mode: polygon with crosshatch fill pattern | `EA KILL` |
| Objective | Custom mode: polygon or point with standard objective marker | `OBJ WOLF` |
| No-Fire Area | Custom mode: polygon with NFA label and diagonal lines | NFA around civilian infrastructure |
| Route | Custom mode: polyline with direction arrows and route name | MSR TAMPA |

These custom modes are Sandtable-specific code (not third-party libraries). They extend maplibre-gl-draw's `MapboxDraw.modes` object with custom `onClick`, `onMouseMove`, and `toDisplayFeatures` handlers. The output is always GeoJSON with military-specific properties in the feature's `properties` field.

**Why not Terra Draw?** Terra Draw (MIT) is a viable alternative with a framework-agnostic design. It could replace maplibre-gl-draw entirely. However, maplibre-gl-draw has deeper MapLibre integration, more community adoption, and the custom mode system is well-documented. Terra Draw remains a fallback if maplibre-gl-draw proves insufficient.

**Why not OpenLayers?** OpenLayers has superior built-in drawing tools, but choosing OpenLayers just for drawing would mean adopting an entirely different (and heavier) map renderer. The drawing capability gap is closed by maplibre-gl-draw + custom modes.

---

## References and Prior Art

### Military COP Systems
- **CPOF (Command Post of the Future)** -- U.S. Army standard COP tool. WYSIWIS collaborative workspace with 3D map visualization. 17,000+ units fielded. Reference for collaboration and map interaction patterns.
- **ATAK (Android Tactical Assault Kit)** -- Mobile tactical COP. Excellent mobile map UX and plugin architecture. Reference for tactical symbology and GPS integration.
- **DCGS-A (Distributed Common Ground System - Army)** -- Intelligence analysis workstation with map-based intelligence fusion. Reference for document-to-map plotting.

### AI Wargaming Platforms
- **GenWar Sim (JHU APL)** -- LLM + AFSIM integration. Natural language scenario development. Reference for AI-simulation integration patterns.
- **COA-GPT (Army Research Lab)** -- LLM-based COA generation with doctrine grounding. Reference for AI spatial reasoning in military planning.
- **Snow Globe** -- LLM multi-agent wargaming system. Reference for multi-persona exercise architecture.
- **Crucible (CMU SEI)** -- Open-source exercise framework used by DoD since 2018. Reference for exercise management and virtual environment architecture.
- **Vantage (U.S. Army)** -- Hybrid OAG+RAG platform for probabilistic wargame adjudication with doctrinal constraints.

### Open Source Mapping Stack (Selected)
- **MapLibre GL JS** (BSD-3-Clause) -- WebGL vector tile map renderer. 9.7k GitHub stars. Community fork of Mapbox GL JS. The industry standard for open-source vector maps. [github.com/maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js)
- **PMTiles** (BSD-3-Clause) -- Single-file tile archive format for serverless/offline maps. [github.com/protomaps/pmtiles](https://github.com/protomaps/pmtiles)
- **Protomaps Basemaps** (BSD-3-Clause) -- Complete styling stack for MapLibre: style generation, font glyphs (PBF), sprite sheets. Self-hostable. [github.com/protomaps/basemaps](https://github.com/protomaps/basemaps)
- **milsymbol** (MIT) -- Pure JavaScript military symbol rendering. MIL-STD-2525C/D/E, APP-6B/D/E. SVG/Canvas output. [github.com/spatialillusions/milsymbol](https://github.com/spatialillusions/milsymbol)
- **maplibre-gl-draw** (ISC) -- Drawing and annotation plugin for MapLibre GL JS. Points, lines, polygons, vertex editing. [github.com/birkskyum/maplibre-gl-draw](https://github.com/birkskyum/maplibre-gl-draw)
- **Turf.js** (MIT) -- Client-side geospatial analysis. Distance, area, buffer, intersect, boolean operations. [turfjs.org](https://turfjs.org/)
- **@ngageoint/mgrs-js** (MIT) -- MGRS/UTM/lat-lon coordinate conversion. Developed by NGA. [github.com/ngageoint/mgrs-js](https://github.com/ngageoint/mgrs-js)
- **Tilemaker** (BSD-2-Clause) -- Convert OpenStreetMap .pbf data to PMTiles. Single binary, no database. [tilemaker.org](https://tilemaker.org/)
- **Natural Earth** (Public Domain) -- Free vector/raster map data for low-zoom political boundaries. [naturalearthdata.com](https://www.naturalearthdata.com/)

### Data Model References
- **ORBAT Mapper** (MIT) -- TypeScript/Vue web app for military ORBAT visualization on maps. Reference for ORBAT data structures, milsymbol integration, and scenario management. [github.com/orbat-mapper/orbat-mapper](https://github.com/orbat-mapper/orbat-mapper)
- **msdllib** (MIT) -- TypeScript library for Military Scenario Definition Language (MSDL) data manipulation. NATO standard SISO-STD-007. [github.com/orbat-mapper/msdllib](https://github.com/orbat-mapper/msdllib)
- **convert-symbology** -- TypeScript utility for converting between MIL-STD-2525C/D and APP-6C/D symbol codes. [github.com/orbat-mapper/convert-symbology](https://github.com/orbat-mapper/convert-symbology)

### Research Papers
- **"Open-Ended Wargames with Large Language Models"** (arxiv 2404.11446) -- Multi-agent LLM wargaming framework
- **"COA-GPT: Generative Pre-trained Transformers for Accelerated Course of Action Development"** (arxiv 2402.01786) -- LLM-based military COA generation with doctrine grounding. NATO IST-205 symposium.
- **"MapAgent: A Hierarchical Agent for Geospatial Reasoning"** (arxiv 2509.05933) -- Multi-agent geospatial reasoning with dynamic map tool integration
- **"Intelligent National Map: A Vision for Distributed and Agentic Geospatial Intelligence"** (eartharxiv) -- Vision for AI-integrated geospatial systems with multi-agent orchestration
- **"A Survey of LLM-Powered Spatial Intelligence Across Scales"** (arxiv 2504.09848) -- Comprehensive survey of LLM+geospatial integration across domains
- **"AI-Enabled Wargaming at the U.S. Army CGSC"** (Small Wars Journal, Jan 2026) -- Implications for PME and operational planning
- **"AI Integration for Scenario Development"** (Army University Press, 2024) -- Training the whole-of-force with AI-adapted scenarios

### Standards
- **MIL-STD-2525D** -- DoD joint military symbology standard (June 2014). Modular component-based symbol construction.
- **MIL-STD-2525E** -- Latest revision. milsymbol supports C/D/E.
- **STANAG APP-6(D/E)** -- NATO military symbology standard. Aligned with MIL-STD-2525.
- **SISO-STD-007 (MSDL)** -- Military Scenario Definition Language. NATO standard for scenario data exchange.
- **GeoJSON (RFC 7946)** -- Standard format for geospatial data interchange.
- **MGRS** -- Military Grid Reference System. Standard military coordinate system.

---

*This document captures the vision, requirements, and technology research for an integrated COP capability in Sandtable. The next phase is prototyping: embedding MapLibre GL JS in a VS Code EditorPane, validating PMTiles loading in Electron, testing milsymbol rendering performance at scale, and designing the ORBAT data schema.*
