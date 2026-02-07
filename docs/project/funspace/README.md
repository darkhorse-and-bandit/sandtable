# Sandtable -- Funspace

This directory documents **fun, non-core features** that the development team has built into Sandtable. These are quality-of-life enhancements, visual customizations, and experimental ideas that make the workspace more enjoyable to use -- but are not part of the core Cortex integration roadmap (Phases 0-4).

Funspace features are:

- **Optional** -- they can be disabled or ignored without affecting core functionality
- **Self-contained** -- they don't create dependencies for the phase roadmap
- **Developer-driven** -- built because someone on the team thought it would be cool
- **Documented here** -- so the rest of the team understands what exists and how it works

## Feature Index

| Feature | Document | Status | Description |
|---------|----------|--------|-------------|
| Editor Background Image | [EDITOR-BACKGROUND-IMAGE.md](EDITOR-BACKGROUND-IMAGE.md) | Implemented | Custom background images behind code with opacity, blur, and overlay controls |

## Contributing a Funspace Feature

1. Build it as a self-contained workbench contribution under `src/vs/workbench/contrib/sandtable*/`
2. Register settings under `sandtable.*` in `cortexConfiguration.ts`
3. Add a section to the Sandtable Settings page if the feature has user-facing configuration
4. Register the contribution in `workbench.common.main.ts`
5. Write a document in this directory explaining what it does, how it works, and where the code lives
6. Make sure `npm run compile` passes with 0 errors
