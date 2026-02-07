# Sandtable -- Project Charter

## Project Identity

- **Project Name:** Sandtable
- **Codename:** Sandtable
- **Repository:** `/home/mage/repos/MAGEIDE`
- **License:** MIT (inherited from VS Code OSS)
- **Parent Project:** [Microsoft VS Code](https://github.com/microsoft/vscode) (MIT License)
- **LLM Backend:** [Cortex by Aulendur Labs](https://github.com/AulendurForge/Cortex) (Apache 2.0)

## Mission Statement

Sandtable is a fork of Microsoft's VS Code with core-level LLM integration powered by Cortex, capable of running fully offline on self-hosted infrastructure. It provides AI-assisted coding -- chat, inline code completion, model management, and autonomous agent capabilities -- all connected to locally hosted open source LLM models served through Cortex's inference gateway.

## Goals

1. **Core-level LLM integration:** LLM features are built into the IDE's platform and workbench layers, not bolted on as extensions. This provides tighter integration, lower latency, and a more cohesive user experience.

2. **Cortex as the backend:** All LLM inference routes through Cortex's OpenAI-compatible gateway, which manages vLLM and llama.cpp engine containers. This gives us dual-engine support (GPU-optimized vLLM for standard models, llama.cpp for GGUF/exotic architectures like GPT-OSS Harmony).

3. **Fully offline capable:** The entire stack -- IDE, Cortex, models -- runs on local infrastructure with zero cloud dependencies. Suitable for air-gapped, classified, and restricted network environments.

4. **Internal team tool:** Built for our team that already runs Cortex with GPT-OSS 20B and 120B models. Setup assumes familiarity with Cortex deployment and local LLM operations.

5. **Progressive capability:** Start with a working chat to prove connectivity, then layer on code completion, model management, and agent mode -- always keeping the full vision in sight.

## Non-Goals

- **Public distribution (for now):** This is not a product for general public download. No installer wizard, no onboarding tutorial for non-technical users.
- **Cloud LLM support:** We are not building integration with OpenAI, Anthropic, or other cloud providers. All inference is local via Cortex.
- **Extension marketplace:** We will not build or host a custom extension marketplace. Extensions can be side-loaded or sourced from Open VSX Registry.
- **Mobile/tablet support:** Desktop only (Linux primary, with potential for macOS/Windows later).
- **Replacing Cortex's Admin UI:** The IDE's model manager panel complements Cortex's web admin UI -- it does not replace it. Full model configuration and administrative tasks still happen in Cortex's frontend.

## Target Audience

The internal engineering team at Aulendur Labs, specifically:

- Developers who use VS Code daily and have Cortex running on the local network
- The Cortex development team (who will also be developing Sandtable and its Cortex-side enhancements)
- Infrastructure team managing GPU servers running vLLM and llama.cpp model containers

**Assumptions about the audience:**
- Comfortable building software from source
- Already have Cortex deployed and running with models loaded
- Have access to GPU servers with NVIDIA GPUs
- Running Linux (Arch Linux is the primary development environment)

## Technology Decisions

### Why fork VS Code (not Theia, not extension-only)?

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **VS Code Fork** | Massive ecosystem, familiar UX, MIT license, proven fork path (VSCodium, Void, code-server) | Monthly rebase maintenance, complex build system | **Selected** |
| Eclipse Theia | Purpose-built for customization, native AI framework | Smaller ecosystem, less familiar UX, fewer extensions | Rejected |
| Extension-only | No fork maintenance, fast to prototype | Limited API surface, can't modify core editor, extension host overhead | Rejected |

**Rationale:** VS Code's source is MIT-licensed and has been successfully forked by multiple projects (VSCodium: 29.8k stars, code-server: 76k stars, Void: 28.2k stars). The extension APIs, while useful, cannot provide the tight integration we need for sub-200ms inline completions and native workbench panels. Core-level integration is the approach used by Cursor and Void.

### Why Cortex (not raw Ollama/llama.cpp)?

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Cortex** | We own it, enterprise features (auth, metering, health routing), dual engine (vLLM + llama.cpp), OpenAI-compatible API, admin UI | Must maintain both projects | **Selected** |
| Raw Ollama | Simple setup, popular | Single engine, no multi-user auth, no usage metering, no admin API | Rejected |
| Raw llama.cpp | Direct FIM support, lightweight | No routing, no auth, no model management API, single model per instance | Rejected |
| Raw vLLM | Best throughput | No llama.cpp for GPT-OSS Harmony models, no admin layer | Rejected |

**Rationale:** Cortex provides the complete infrastructure layer -- auth, routing, health checks, model lifecycle management, GPU monitoring, usage tracking -- so the IDE doesn't have to build any of that. We also need both vLLM and llama.cpp to serve our GPT-OSS models (Harmony architecture requires llama.cpp), and Cortex abstracts the engine difference behind a unified API.

### Why core-level (not extension-level)?

| Aspect | Extension-Level | Core-Level |
|--------|----------------|------------|
| Inline completion latency | Extension host IPC overhead (~10-50ms) | Direct editor integration (~0ms) |
| UI integration | Webview panels (iframe sandbox) | Native workbench panels |
| Settings integration | Extension settings API | Native settings schema |
| Maintenance | Independent of VS Code version | Must rebase with VS Code updates |
| User experience | Feels "bolted on" | Feels native |

**Rationale:** For an IDE where AI is a first-class feature (not an add-on), core-level integration delivers a meaningfully better experience. The inline completion path is especially latency-sensitive -- every millisecond matters when showing ghost text while typing.

## High-Level Timeline

| Phase | Name | Duration | Target Completion |
|-------|------|----------|-------------------|
| 0 | Fork and Build | Days 1-3 | Week 1 |
| 1 | Cortex Connection + Chat | Days 4-14 | Week 3 |
| 2 | Inline Code Completion | Days 15-28 | Week 5 |
| 3 | Model Manager Panel | Days 29-42 | Week 7 |
| 4 | Agent Mode | Days 43-63 | Week 10 |

Total estimated duration: **10 weeks** from start to full feature set.

Note: These are working-day estimates. Actual calendar time depends on team allocation and competing priorities.

## Team and Roles

| Role | Responsibility |
|------|---------------|
| **Principal Developer (Cortex)** | Cortex-side enhancements (FIM endpoint, IDE status API, tool calling metadata). Owns the Cortex codebase. |
| **IDE Developer** | VS Code fork modifications -- platform services, workbench contributions, editor integrations. |
| **Infrastructure** | GPU server management, model deployment, Cortex operations. |

In practice, roles overlap significantly given the small team size.

## Success Criteria

### Phase 0: Fork and Build
- Sandtable builds from source on Arch Linux without errors
- Application launches and shows "Sandtable" in the title bar
- All standard VS Code functionality works (editing, terminal, extensions, git)

### Phase 1: Cortex Connection + Chat
- Status bar shows "Cortex: Connected" with model count when Cortex is reachable
- Chat panel opens from the sidebar with a model selector dropdown
- Can have a streaming conversation with GPT-OSS 120B via Cortex
- Chat renders markdown with syntax-highlighted code blocks

### Phase 2: Inline Code Completion
- Ghost text suggestions appear after typing pauses (~350ms)
- Suggestions come from a model running on Cortex (via FIM endpoint)
- Tab accepts the suggestion, Escape dismisses it
- Performance: time-to-first-token under 200ms on localhost connection

### Phase 3: Model Manager Panel
- Panel shows all models from Cortex with their state (running/stopped)
- GPU utilization dashboard with per-GPU VRAM, temperature, utilization
- Can start and stop models from within the IDE
- Can view container logs for a selected model

### Phase 4: Agent Mode
- Agent panel accepts natural language coding instructions
- Agent can read files, edit files, and run terminal commands
- All destructive actions require user confirmation before execution
- Changes are shown as diffs that can be accepted or rejected

## Constraints

1. **Offline operation is mandatory.** The IDE must function with zero internet connectivity when Cortex and models are running locally.
2. **No telemetry.** Following VSCodium's approach, all Microsoft telemetry is stripped from the build.
3. **Cortex is the only LLM backend.** The IDE does not support direct connections to Ollama, raw llama.cpp, or cloud providers. Everything goes through Cortex's gateway.
4. **Linux-first development.** The primary build and test platform is Arch Linux. macOS and Windows support are not priorities for the initial build.
5. **Pin VS Code version.** We pin to a specific VS Code release tag and rebase quarterly (not monthly) to reduce maintenance burden.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| VS Code rebase breaks our modifications | High | Medium | Pin to release tag, rebase quarterly, keep modifications isolated in clearly marked directories (`mage*` prefix) |
| GPT-OSS models don't support tool calling well | Medium | Medium | Test tool calling per model, designate specific models for agent vs. chat roles, fall back to prompt-based tool use |
| Build system too complex for team | Medium | Low | Use VS Code's dev container as fallback, document every step in Phase 0 doc |
| Inline completion latency exceeds 200ms | Medium | Low | FIM endpoint optimization, debounce tuning, completion caching, Cortex on localhost eliminates network latency |
| Extension marketplace access lost | Low | Certain | Use Open VSX Registry, pre-bundle essential extensions, side-load as needed |
