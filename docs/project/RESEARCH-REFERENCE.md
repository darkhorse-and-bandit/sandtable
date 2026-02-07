# MAGE IDE -- Research Reference

Compiled research from the project's initial investigation phase. This document serves as a reference for technical decisions and implementation details.

## VS Code Fork Ecosystem

### Existing Forks

| Project | Stars | License | What It Does | Lessons for MAGE IDE |
|---------|-------|---------|-------------|---------------------|
| [VSCodium](https://github.com/VSCodium/vscodium) | 29.8k | MIT | Clean VS Code builds without telemetry | Reference for `product.json` rebranding and telemetry stripping |
| [code-server](https://github.com/coder/code-server) | 76k | MIT | VS Code in the browser, self-hosted | Proves server-side VS Code fork is viable at scale |
| [Void Editor](https://github.com/voideditor/void) | 28.2k | -- | AI-first VS Code fork with multi-model LLM support | Closest precedent to MAGE IDE; Y Combinator backed; development currently paused |
| [Eclipse Theia](https://theia-ide.org/) | -- | EPL-2.0 | Open source IDE framework with native AI ("Theia AI") | Alternative approach; supports any LLM, but smaller ecosystem |

### VS Code Source Code Organization

The codebase lives under `src/vs/` with these layers (each can only depend on layers above it):

| Layer | Path | Purpose |
|-------|------|---------|
| base | `src/vs/base/` | General utilities and UI building blocks |
| platform | `src/vs/platform/` | Service injection, shared services |
| editor | `src/vs/editor/` | Monaco Editor core |
| workbench | `src/vs/workbench/` | Full IDE shell (panels, sidebar, status bar) |
| code | `src/vs/code/` | Electron desktop app entry point |
| server | `src/vs/server/` | Remote development server entry point |

Code within each layer is organized by target environment:

| Subdirectory | Runtime | APIs |
|-------------|---------|------|
| `common/` | All | Basic JavaScript |
| `browser/` | Browser/Renderer | DOM, Web APIs |
| `node/` | Node.js | Node APIs |
| `electron-browser/` | Electron renderer | Browser + Electron IPC |
| `electron-main/` | Electron main | Full Node + Electron |

### Building VS Code from Source

**Prerequisites (Linux):**
```bash
sudo apt-get install build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev python-is-python3
```

**Build commands:**
```bash
git clone https://github.com/microsoft/vscode.git
cd vscode
npm install
npm run watch       # Incremental build (development)
npm run compile     # One-time build
./scripts/code.sh   # Launch
```

**Key file: `product.json`**

Controls all branding: `nameShort`, `nameLong`, `applicationName`, `dataFolderName`, `urlProtocol`, platform-specific identifiers, built-in extensions list, and URL endpoints.

## VS Code Extension APIs (Relevant)

### InlineCompletionItemProvider

The API for providing ghost text / inline code suggestions:

```typescript
interface InlineCompletionItemProvider {
    provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): ProviderResult<InlineCompletionItem[] | InlineCompletionList>;
}
```

Register with:
```typescript
vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider
);
```

Requires `"editor.inlineSuggest.enabled": true` in settings.

### LanguageModelChatProvider

VS Code's API for contributing custom language models to chat:

```typescript
interface LanguageModelChatProvider {
    provideLanguageModelChatInformation(): LanguageModelChatInformation;
    provideLanguageModelChatResponse(messages, options, token): AsyncIterable<string>;
    provideTokenCount(text, token): Promise<number>;
}
```

Register in `package.json` under `contributes.languageModelChatProviders`, then register via `vscode.lm.registerLanguageModelChatProvider()`.

### Language Model Tool API

Enables extensions to expose tools that LLM agents can invoke:

- Extensions contribute tools that agents discover and call automatically
- Tools receive VS Code extension API access for deep editor integration
- Distributable via the marketplace

## Cortex API Reference

### OpenAI-Compatible Endpoints (Port 8084)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/v1/chat/completions` | API Key | Chat inference with streaming |
| POST | `/v1/completions` | API Key | Text completion |
| POST | `/v1/embeddings` | API Key | Vector embeddings |

### Model Discovery

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/v1/models/running` | Session | List healthy running models |
| GET | `/v1/models/{name}/constraints` | Session | Context limits and capabilities |

### Chat Sessions

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/v1/chat/sessions` | Session | List user's sessions |
| POST | `/v1/chat/sessions` | Session | Create session |
| GET | `/v1/chat/sessions/{id}` | Session | Get session with messages |
| POST | `/v1/chat/sessions/{id}/messages` | Session | Add message |
| DELETE | `/v1/chat/sessions/{id}` | Session | Delete session |

### Admin API

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/admin/models` | Session | List all models |
| POST | `/admin/models/{id}/start` | Session | Start model container |
| POST | `/admin/models/{id}/stop` | Session | Stop model container |
| POST | `/admin/models/{id}/dry-run` | Session | Config validation + VRAM estimate |
| GET | `/admin/models/{id}/logs` | Session | Container logs |
| GET | `/admin/system/summary` | Session | CPU/mem/disk |
| GET | `/admin/system/gpus` | Session | Per-GPU metrics |
| GET | `/admin/system/throughput` | Session | Tokens/sec, RPS, latency |
| GET | `/admin/models/metrics` | Session | Per-model inference metrics |

### Cortex Technology Stack

| Component | Technology |
|-----------|-----------|
| Gateway | FastAPI (Python 3.11+) |
| Frontend | Next.js 14 (React) + Tailwind CSS |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Metrics | Prometheus |
| vLLM Engine | `vllm/vllm-openai` Docker container |
| llama.cpp Engine | `ggml-org/llama.cpp` Docker container |

### Cortex Architecture

```
Client Request --> Gateway (FastAPI, port 8084)
  --> Auth / Rate Limit Check
  --> Model Registry Lookup (by served_name)
  --> Route to Container (vllm-model-{id} or llamacpp-model-{id})
  --> Streaming Response --> Client (with usage metrics)
  --> Usage record --> PostgreSQL
```

## Local LLM Serving Options

### Comparison Table

| Tool | Purpose | API | License | Stars |
|------|---------|-----|---------|-------|
| [Ollama](https://ollama.com/) | User-friendly LLM runtime | REST + OpenAI-compatible | MIT | 120k+ |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | High-performance C++ inference | REST + FIM `/infill` | MIT | 75k+ |
| [vLLM](https://vllm.ai/) | Production GPU inference with PagedAttention | OpenAI-compatible | Apache 2.0 | 40k+ |
| [LocalAI](https://localai.io/) | OpenAI API drop-in replacement | Full OpenAI-compatible | MIT | 40k+ |
| [Tabby](https://tabby.tabbyml.com/) | Self-hosted AI coding assistant | Custom + IDE extensions | Apache 2.0 | 32.8k |

### Why Cortex Over Raw Engines

Cortex provides the management layer on top of vLLM and llama.cpp:
- Multi-model routing with health-aware load balancing
- API key authentication and rate limiting
- Usage metering and analytics
- Model lifecycle management (create, configure, start, stop)
- GPU monitoring and VRAM estimation
- Chat session persistence
- Admin UI for configuration
- Air-gapped deployment support

## Open Source Code Models (2025-2026)

### Models for Code Completion (FIM)

| Model | Size | FIM Support | Context | License | Best For |
|-------|------|------------|---------|---------|----------|
| Codestral 22B | 22B | Native | 32K | Mistral License | Inline completions (single GPU) |
| DeepSeek Coder V2 | 6.7B-236B | Native | 128K | MIT | Versatile code generation |
| StarCoder2 | 3B/15B | Native | 16K | BigCode OpenRAIL | Lightweight completions |
| Qwen3-Coder | 30B-480B (MoE) | Native | 256K | Apache 2.0 | Repo-level understanding |

### Models for Chat and Agent

| Model | Size | Tool Calling | Context | License | Best For |
|-------|------|-------------|---------|---------|----------|
| DeepSeek V3.2 | 685B (MoE) | Yes | 128K | MIT | Top-tier code reasoning |
| GPT-OSS 20B/120B | 20B/120B | Unknown | 128K | Open | Air-gap friendly (requires llama.cpp) |
| Qwen3-Coder | 30B-480B (MoE) | Yes | 256K | Apache 2.0 | Agent tasks |
| Llama 3.3 70B | 70B | Yes | 128K | Meta License | Reliable tool calling |

### Hardware Requirements

| Model | Quantization | VRAM Needed | Recommended GPUs |
|-------|-------------|-------------|-----------------|
| Codestral 22B | BF16 | ~44 GB | 1x L40S or 2x RTX 4090 |
| DeepSeek Coder 6.7B | BF16 | ~14 GB | 1x RTX 4090 |
| GPT-OSS 120B | Q8_0 GGUF | ~120 GB | 4x L40S |
| GPT-OSS 20B | Q8_0 GGUF | ~20 GB | 1x RTX 4090 |

## Model Context Protocol (MCP)

**What:** Open protocol by Anthropic for connecting LLMs to external tools and data sources.

**Key concepts:**
- **Hosts:** LLM applications that initiate connections
- **Clients:** Connectors within the host application
- **Servers:** Services providing context and capabilities (tools, resources, prompts)

**Communication:** JSON-RPC 2.0 messages

**SDKs:**
- TypeScript SDK: `@modelcontextprotocol/sdk`
- Python SDK: `mcp`

**Relevance to MAGE IDE:** MCP could be used in a future phase to allow the agent to connect to external tool servers (databases, APIs, deployment services) beyond the built-in file/terminal tools.

**Specification:** https://modelcontextprotocol.io/specification/latest

## Open Source AI Coding Tools

| Tool | Type | Integration | Notes |
|------|------|------------|-------|
| [Continue](https://docs.continue.dev/) | VS Code extension | Chat, completions, agent | 2M+ installs, supports Ollama/llama.cpp |
| [llama-vscode](https://marketplace.visualstudio.com/items?itemName=ggml-org.llama-vscode) | VS Code extension | Inline completions | Lightweight, llama.cpp only |
| [OpenHands](https://openhands.dev/) | Standalone agent | Terminal CLI + Web UI | Full autonomous coding agent |
| [Tabby](https://tabby.tabbyml.com/) | Server + extensions | Completions + chat | Self-hosted, Rust backend |

## Key Reference Links

### VS Code
- Source: https://github.com/microsoft/vscode
- Build guide: https://github.com/microsoft/vscode/wiki/How-to-Contribute
- Source organization: https://github.com/microsoft/vscode/wiki/Source-Code-Organization
- API reference: https://code.visualstudio.com/api
- InlineCompletionItemProvider: https://vscode-api.js.org/interfaces/vscode.InlineCompletionItemProvider.html
- Language Model API: https://code.visualstudio.com/api/extension-guides/language-model

### Cortex
- Repository: https://github.com/AulendurForge/Cortex
- Documentation: https://aulendurforge.github.io/Cortex/
- System architecture: https://aulendurforge.github.io/Cortex/architecture/system/
- Backend architecture: https://aulendurforge.github.io/Cortex/architecture/backend/
- Frontend architecture: https://aulendurforge.github.io/Cortex/architecture/frontend/
- OpenAI-compatible API: https://aulendurforge.github.io/Cortex/api/openai-compatible/
- Admin API: https://aulendurforge.github.io/Cortex/api/admin-api/
- Engine comparison: https://aulendurforge.github.io/Cortex/models/engine-comparison/

### LLM Serving
- Ollama: https://ollama.com/ | API docs: https://docs.ollama.com/api
- llama.cpp: https://github.com/ggml-org/llama.cpp | Server: https://github.com/ggml-org/llama.cpp/blob/master/examples/server/README.md
- vLLM: https://vllm.ai/ | OpenAI server: https://docs.vllm.ai/en/stable/serving/openai_compatible_server.html
- LocalAI: https://localai.io/

### Protocols
- MCP specification: https://modelcontextprotocol.io/specification/latest
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- OpenAI API reference: https://platform.openai.com/docs/api-reference

### Forks and Alternatives
- VSCodium: https://github.com/VSCodium/vscodium
- Void Editor: https://github.com/voideditor/void
- code-server: https://github.com/coder/code-server
- Eclipse Theia: https://theia-ide.org/
- Theia AI: https://theia-ide.org/theia-ai/
