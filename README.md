<p align="center">
  <img src="assets/sandtableLogoNoBackground.png" alt="Sandtable" width="200">
</p>

<h1 align="center">Sandtable</h1>

<p align="center"><strong>A research and scenario simulation environment powered by local LLMs.</strong></p>

Sandtable is a fork of [VS Code](https://github.com/microsoft/vscode) rebuilt as an intelligent workspace for research, roleplay, and scenario experimentation. It connects to [Cortex](https://github.com/AulendurForge/Cortex), a self-hosted OpenAI-compatible inference gateway, giving you direct access to locally hosted LLM models -- fully offline, fully private, fully under your control.

## What Is Sandtable?

In military tradition, a **sand table** is a physical terrain model used for planning, wargaming, and rehearsal. Commanders gather around it to explore scenarios, test strategies, and prepare for what lies ahead.

Sandtable brings that concept into a digital workspace. It's an environment where researchers, analysts, and teams can:

- **Chat with AI agents** backed by powerful open-source models running on your own hardware
- **Upload and analyze documents** -- PDFs, presentations, spreadsheets, reports -- and have AI agents reason over them
- **Create specialized agent personas** -- subject matter experts, roleplaying participants, analysts, facilitators -- each with tailored system prompts and knowledge bases
- **Connect to external data sources** via the Model Context Protocol (MCP) for live database access, API integration, and tool use
- **Write, edit, and generate documents** with AI assistance in a full-featured editor
- **Run autonomous agent workflows** that can read files, execute commands, search across documents, and produce structured outputs

All of this happens locally. No data leaves your network. No cloud API calls. No vendor lock-in.

## Use Cases

### Wargaming and Defense

Sandtable's namesake use case. Design wargames, spin up AI participants and adjudicators, upload doctrine and scenario documents, connect to game databases, and run exercises with AI-powered red teams, blue teams, and analysts.

### Research and Analysis

Upload academic papers, reports, and datasets. Create agent personas that specialize in specific domains. Have agents synthesize findings, identify patterns, and generate structured research outputs.

### Scenario Planning and Tabletop Exercises

Model complex scenarios -- from business continuity planning to crisis response to policy analysis. Create agents representing different stakeholders, run through decision trees, and explore second- and third-order effects.

### Training and Education

Build interactive learning environments where AI agents play roles in simulated scenarios. Students interact with realistic personas, make decisions, and see consequences unfold.

### Creative and Narrative Work

Develop characters, worlds, and storylines with AI collaborators. Use agent personas for dialogue, world-building, and narrative testing.

## Architecture

Sandtable is built on three layers:

```
┌─────────────────────────────────────────────┐
│  Sandtable (VS Code Fork - Electron App)    │
│  ─────────────────────────────────────────── │
│  VS Code Chat Panel · Tool-Calling Agent    │
│  Model Manager · Code Completion (FIM)      │
│  Multi-Provider Model Picker · Settings     │
│  Code Mode · Background Images · Terminal   │
├─────────────────────────────────────────────┤
│  Provider Layer (Multi-Provider)            │
│  ─────────────────────────────────────────── │
│  Cortex Gateway · OpenAI-compatible APIs    │
│  Ollama · vLLM · LM Studio · Cloud APIs    │
│  Unified model routing and health checks    │
├─────────────────────────────────────────────┤
│  Inference Engines                          │
│  ─────────────────────────────────────────── │
│  vLLM (GPU-optimized) · llama.cpp (GGUF)   │
│  Local models · No cloud dependencies       │
└─────────────────────────────────────────────┘
```

- **Sandtable** is where you work -- VS Code's built-in Chat panel with tool-calling agent, model manager, code completion, and research workspace features
- **Provider Layer** routes to multiple LLM backends -- Cortex (primary, with admin capabilities) plus any OpenAI-compatible endpoint
- **Inference engines** (vLLM and llama.cpp) run the actual models on your GPUs

## Key Principles

- **Offline-first.** The entire stack runs on local infrastructure. Air-gapped and classified environments are a first-class use case.
- **No telemetry.** All Microsoft telemetry is stripped. Your data stays on your machines.
- **Open models only.** Designed for open-source and open-weight models served through Cortex. No cloud provider lock-in.
- **Core-level integration.** AI features are built into the IDE platform, not bolted on as extensions. This means lower latency, tighter UX, and capabilities that extensions cannot provide.
- **Self-hosted everything.** You own the models, the infrastructure, the data, and the tool.

## Current Status

Sandtable is in active development. See [docs/project/PROGRESS.md](docs/project/PROGRESS.md) for the latest status.

| Phase | Status | Description |
|-------|--------|-------------|
| 0 - Fork and Build | **Complete** | VS Code forked, rebranded, building from source |
| 1 - Cortex Connection + Chat | **Complete** (IDE) | Platform service, streaming chat integrated into VS Code's built-in Chat panel |
| 2 - Inline Code Completion | **Complete** (IDE) | Ghost text suggestions via Fill-in-the-Middle (awaiting Cortex FIM endpoint) |
| 3 - Model Manager | **Complete** (IDE) | GPU dashboard, model start/stop, system monitoring panel |
| 4 - Agent Mode | **Complete** (IDE) | Tool-calling agent with read/edit/create/search/terminal tools |
| 4.5 - Multi-Provider | **Complete** | Connect Cortex + OpenAI-compatible endpoints (Ollama, vLLM, cloud APIs) |
| UX Overhaul | **In Progress** | Research-first identity, Code Mode toggle, settings reorganization |
| 5+ - Research Features | Planned | Document ingestion, agent personas, MCP integration, exercises |

## Building from Source

### Prerequisites

- **OS:** Linux (Arch Linux is the primary development environment)
- **Node.js:** v22.x (see `.nvmrc` for exact version)
- **Python:** 3.x (required for node-gyp)
- **GCC:** For native module compilation
- **System libraries:** `libx11`, `libxkbfile`, `libsecret`, `krb5`

### Build

```bash
# Clone the repository
git clone git@github.com:darkhorse-and-bandit/sandtable.git
cd sandtable

# Install the correct Node.js version (using mise, fnm, or nvm)
mise use node@22.21.1   # or: fnm use / nvm use

# Install dependencies (~10-15 minutes on first run)
npm install

# Build
npm run compile

# Launch
./scripts/code.sh
```

See [docs/project/phases/PHASE-0-FORK-AND-BUILD.md](docs/project/phases/PHASE-0-FORK-AND-BUILD.md) for detailed build instructions and troubleshooting.

## Project Documentation

Detailed planning and architecture documents live in [`docs/project/`](docs/project/README.md):

| Document | Description |
|----------|-------------|
| [Project Charter](docs/project/PROJECT-CHARTER.md) | Vision, scope, goals, and constraints |
| [Architecture](docs/project/ARCHITECTURE.md) | Technical architecture, interfaces, data flows |
| [Milestones](docs/project/MILESTONES.md) | Phase overview with deliverables and timelines |
| [Progress](docs/project/PROGRESS.md) | Living checklist -- single source of truth for status |
| [Phase Plans](docs/project/phases/) | Detailed task breakdowns for each implementation phase |

## Technology

- **Editor:** [VS Code](https://github.com/microsoft/vscode) (MIT License) -- Electron + TypeScript
- **LLM Backend:** [Cortex](https://github.com/AulendurForge/Cortex) (Apache 2.0) -- FastAPI + PostgreSQL + Redis
- **Inference:** [vLLM](https://github.com/vllm-project/vllm) and [llama.cpp](https://github.com/ggerganov/llama.cpp)
- **Protocol:** [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for external tool integration

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

Sandtable modifications are also MIT licensed. Cortex is licensed under Apache 2.0.
