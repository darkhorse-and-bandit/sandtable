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
| Sandtable UX Overhaul | [sandtable_ux_overhaul/](sandtable_ux_overhaul/) | Phase 2 In Progress | Code Mode toggle, research-first identity, VS Code Chat integration, settings reorganization, tool calling, multi-provider model picker |

## Contributing a Funspace Feature

1. Build it as a self-contained workbench contribution under `src/vs/workbench/contrib/sandtable*/`
2. Register settings under `sandtable.*` in `cortexConfiguration.ts`
3. Add a section to the Sandtable Settings page if the feature has user-facing configuration
4. Register the contribution in `workbench.common.main.ts`
5. Create a subdirectory in `docs/project/funspace/` with documentation explaining what it does, how it works, and where the code lives
6. Make sure `npm run compile` passes with 0 errors
