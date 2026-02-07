# Sandtable -- Project Documentation

This directory contains the comprehensive planning and reference documentation for the Sandtable project: a fork of Microsoft's VS Code with core-level LLM integration powered by [Cortex](https://github.com/AulendurForge/Cortex).

## Document Index

| Document | Description |
|----------|-------------|
| [PROJECT-CHARTER.md](PROJECT-CHARTER.md) | Vision, scope, goals, constraints, timeline, team, and success criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Full technical architecture for both the IDE and Cortex integration -- diagrams, interfaces, data flows, file structure |
| [MILESTONES.md](MILESTONES.md) | Phase overview with deliverables, date estimates, dependencies, and risk assessment |
| [CORTEX-ENHANCEMENTS.md](CORTEX-ENHANCEMENTS.md) | All Cortex-side changes needed to support IDE integration -- endpoint specs, implementation details |
| [RESEARCH-REFERENCE.md](RESEARCH-REFERENCE.md) | Compiled research on VS Code internals, LLM ecosystem, open source models, libraries, and APIs |
| [PROGRESS.md](PROGRESS.md) | Living checklist tracker -- the single source of truth for what is done vs. pending |

## Phase Plans

Detailed task breakdowns for each implementation phase:

| Phase | Document | Summary |
|-------|----------|---------|
| Phase 0 | [PHASE-0-FORK-AND-BUILD.md](phases/PHASE-0-FORK-AND-BUILD.md) | Clone VS Code, install deps, rebrand, get a clean build running |
| Phase 1 | [PHASE-1-CORTEX-CONNECTION.md](phases/PHASE-1-CORTEX-CONNECTION.md) | Cortex platform service, chat panel, SSE streaming, status bar |
| Phase 2 | [PHASE-2-CODE-COMPLETION.md](phases/PHASE-2-CODE-COMPLETION.md) | FIM endpoint in Cortex, InlineCompletionProvider, ghost text |
| Phase 3 | [PHASE-3-MODEL-MANAGER.md](phases/PHASE-3-MODEL-MANAGER.md) | GPU dashboard, model start/stop, logs viewer, system monitor |
| Phase 4 | [PHASE-4-AGENT-MODE.md](phases/PHASE-4-AGENT-MODE.md) | Agent loop, tool calling, file edits, terminal execution |

## Funspace -- Non-Core Fun Features

The [funspace/](funspace/) directory documents optional, non-core features built by the dev team for fun -- visual customizations, quality-of-life enhancements, and experimental ideas that make Sandtable more enjoyable to use but are not part of the core Cortex integration roadmap.

| Feature | Document | Description |
|---------|----------|-------------|
| Editor Background Image | [funspace/EDITOR-BACKGROUND-IMAGE.md](funspace/EDITOR-BACKGROUND-IMAGE.md) | Custom background images behind code with opacity, blur, and overlay controls |

## How to Use These Documents

1. **Starting out?** Read the [Project Charter](PROJECT-CHARTER.md) for the big picture.
2. **Building?** Check [PROGRESS.md](PROGRESS.md) for what to work on next, then open the corresponding phase document for detailed instructions.
3. **Need architecture context?** The [Architecture doc](ARCHITECTURE.md) has diagrams, interfaces, and data flows.
4. **Working on Cortex?** The [Cortex Enhancements doc](CORTEX-ENHANCEMENTS.md) has every endpoint spec and implementation detail.
5. **Need to look something up?** The [Research Reference](RESEARCH-REFERENCE.md) compiles all background research.
6. **Built something fun?** Document it in the [funspace/](funspace/) directory.

## Directory Note

This `docs/project/` directory lives at the root of the Sandtable repository. VS Code's source tree does not contain a root-level `docs/` folder (Microsoft's VS Code documentation lives in their GitHub wiki), so these files will not conflict with any upstream source files when the VS Code fork is cloned into this workspace.
