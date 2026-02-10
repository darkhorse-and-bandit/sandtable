# Sandtable -- Funspace

This directory documents **fun, non-core features** that the development team has built into Sandtable. These are quality-of-life enhancements, visual customizations, UX experiments, and identity refinements that make the workspace more enjoyable and better aligned with Sandtable's mission -- but are not part of the core Cortex integration roadmap (Phases 0-4).

Funspace features are:

- **Optional** -- they can be disabled or ignored without affecting core functionality
- **Self-contained** -- they don't create dependencies for the phase roadmap
- **Developer-driven** -- built because someone on the team thought it would be cool or important for the product vision
- **Documented here** -- so the rest of the team understands what exists and how it works

## Feature Index

| Feature | Directory | Status | Description |
|---------|-----------|--------|-------------|
| Editor Background Image | [custom_editor_background/](custom_editor_background/) | Complete | Custom background images behind code with opacity, blur, and overlay controls |
| Sandtable UX Overhaul | [sandtable_ux_overhaul/](sandtable_ux_overhaul/) | Phase 2 Complete | Code Mode toggle, research-first identity, comprehensive UI text/label cleanup, command center overhaul, menu/panel gating, VS Code Chat integration, settings reorganization |
| Integrated Map & COP | [integrated_map_cop/](integrated_map_cop/) | Phase 1 Complete | Interactive Common Operating Picture with MapLibre GL JS in EditorPane. Phase 1: map rendering, drawing tools, coordinate display, layer management, 5 basemap themes. Phase 2 next: military symbology + ORBAT |
| Chat Model Picker & Token Tracking | [chat_token_tracking/](chat_token_tracking/) | Complete | Model picker populated with registered models in all chat modes, token usage pie chart fed with real API data, 60+ model context window reference table, streaming usage capture, Settings UI for token budgets |
| Tool Call Display Overhaul | [tool_call_display/](tool_call_display/) | Complete | Persistent, collapsible tool call rendering with human-friendly aliases, transparency into tool inputs/outputs, native VS Code tool invocation pipeline integration |
| Visual Animations & Branding | [geometric_animations/](geometric_animations/) | Active | Sacred geometry compositions (concentric circles, radiating spokes, compass ticks, hexagon center), desert floor panoramic images, Sandtable logo branding, and chat processing animations across welcome page, walkthroughs, empty editor, and chat panel. Includes critical guidance on VS Code TrustedTypes CSP, `.empty` class visibility, chat thinking-box DOM structure, and SVG transform-origin. |

## Contributing a Funspace Feature

1. Build it as a self-contained workbench contribution under `src/vs/workbench/contrib/sandtable*/`
2. Register settings under `sandtable.*` in `cortexConfiguration.ts`
3. Add a section to the Sandtable Settings page if the feature has user-facing configuration
4. Register the contribution in `workbench.common.main.ts`
5. Create a subdirectory in `docs/project/funspace/` with documentation explaining what it does, how it works, and where the code lives
6. Make sure `npm run compile` passes with 0 errors
