# Sandtable -- Progress Tracker

This is the living checklist for the Sandtable project. Update checkboxes as tasks are completed. This is the single source of truth for project status.

**Last updated:** 2026-02-07
**Current phase:** Phase 4 IDE Side Complete -- Awaiting Cortex Tool Calling Metadata

---

## Phase 0: Fork and Build

**Status:** Complete
**Target:** Days 1-3
**Docs:** [PHASE-0-FORK-AND-BUILD.md](phases/PHASE-0-FORK-AND-BUILD.md)

### Prerequisites
- [x] Install build-essential, g++, libx11-dev, libxkbfile-dev, libsecret-1-dev, krb5 on Arch Linux
- [x] Install Node.js v20+ (verify with `node --version`)
- [x] Install fnm or nvm for Node version management
- [x] Install Python (required for node-gyp)
- [x] Verify `gcc --version` works
- [x] Ensure 10+ GB disk space available

### Fork and Clone
- [x] Clone microsoft/vscode into `/home/mage/repos/MAGEIDE`
- [x] Pin to a stable release tag (`1.109.0`)
- [x] Create `sandtable/main` branch from release tag
- [x] Disable GitHub Actions (remove `.github/workflows/`)

### Rebrand
- [x] Update `product.json` field: `nameShort` -> "Sandtable"
- [x] Update `product.json` field: `nameLong` -> "Sandtable"
- [x] Update `product.json` field: `applicationName` -> "sandtable"
- [x] Update `product.json` field: `dataFolderName` -> ".sandtable"
- [x] Update `product.json` field: `urlProtocol` -> "sandtable"
- [x] Update `product.json` field: `serverApplicationName` -> "sandtable-server"
- [x] Update `product.json` field: `linuxIconName` -> "com.sandtable.ide"
- [x] Remove/update telemetry-related fields
- [x] Update `reportIssueUrl` to Sandtable repo

### Build and Verify
- [x] Run `npm install` successfully
- [x] Run `npm run compile` successfully (0 errors)
- [x] Launch with `./scripts/code.sh`
- [x] Verify title bar shows "Sandtable"
- [x] Verify file editing works
- [x] Verify integrated terminal works
- [x] Verify extensions panel works
- [x] Verify Command Palette works (Ctrl+Shift+P)
- [x] Verify Settings UI works (Ctrl+,)
- [x] Verify About dialog shows correct name

### Finalize
- [x] Ensure `docs/project/` directory is preserved
- [x] Increase inotify watchers if needed (`fs.inotify.max_user_watches=524288`)
- [x] Create initial commit on `sandtable/main` branch

### Additional Completed Work (Beyond Original Phase 0 Scope)
- [x] Rename project from MAGE IDE to Sandtable across all files
- [x] Rename git branch from `mage-ide/main` to `sandtable/main`
- [x] Configure git remotes: `origin` = darkhorse-and-bandit/sandtable, `upstream` = microsoft/vscode
- [x] Push to GitHub at https://github.com/darkhorse-and-bandit/sandtable
- [x] Set `sandtable/main` as the default branch on GitHub
- [x] Rewrite root `README.md` with Sandtable vision (research, roleplay, wargaming use cases)
- [x] Update `PROJECT-CHARTER.md` with expanded mission, goals, and target audience
- [x] Expand `MILESTONES.md` with post-MVP phases 5-9 (documents, personas, MCP, collaboration)
- [x] Fix all stale MAGE/mage references in code blocks across docs
- [x] Add Sandtable logo (`assets/sandtableLogoNoBackground.png`) to README
- [x] Replace Linux application icon (`resources/linux/code.png`)
- [x] Replace workbench UI icon (`src/vs/workbench/browser/media/code-icon.svg`)
- [x] Remove `.github/README.md` that was overriding root README on GitHub
- [x] Install Node.js 22.21.1 via `mise` (required for native module compilation; Node 25.x was incompatible with tree-sitter)

---

## Phase 1: Cortex Connection + Chat Panel

**Status:** Complete (IDE-side implementation)
**Target:** Days 4-17
**Completed:** 2026-02-07
**Docs:** [PHASE-1-CORTEX-CONNECTION.md](phases/PHASE-1-CORTEX-CONNECTION.md)

### Cortex Side
- [ ] Configure CORS for Electron origins (`file://`, `null`) in Cortex

### Sandtable Settings Page (Bonus -- not in original Phase 1 scope)
- [x] Create `src/vs/workbench/contrib/sandtableSettings/browser/` directory
- [x] Implement `SandtableSettingsInput` (EditorInput with virtual `sandtable://settings` URI)
- [x] Implement `SandtableSettingsPage` (EditorPane with General/Connection/Chat/Code Completion/Models sections)
- [x] Register editor resolver for `sandtable://` URI scheme
- [x] Add "Sandtable Settings" entry to File > Preferences menu
- [x] Add `sandtable.openSettings` command (available in Command Palette)
- [x] Settings page reads/writes all `sandtable.*` settings via `IConfigurationService`
- [x] Register contribution in `workbench.common.main.ts`
- [x] Create `sandtableSettings.css` with two-column layout

### Platform Service
- [x] Create directory `src/vs/platform/cortex/common/`
- [x] Create directory `src/vs/platform/cortex/browser/`
- [x] Define `ICortexService` interface in `cortex.ts`
- [x] Define all TypeScript types (requests, responses, models, etc.)
- [x] Implement `CortexClient` with non-streaming requests
- [x] Implement `CortexClient` SSE streaming with `ReadableStream`
- [x] Implement `CortexClient` request cancellation via `AbortController`
- [x] Handle error responses (4xx, 5xx) with typed errors
- [x] Implement `CortexService` browser-side service
- [x] Register `CortexService` as singleton with DI system

### Settings
- [x] Register `sandtable.cortex.endpoint` setting
- [x] Register `sandtable.cortex.apiKey` setting
- [x] Register `sandtable.cortex.username` setting
- [x] Register `sandtable.cortex.password` setting
- [x] Register `sandtable.cortex.healthCheckIntervalMs` setting
- [x] Register `sandtable.chat.defaultModel` setting
- [x] Register `sandtable.chat.streamingEnabled` setting
- [x] Register `sandtable.chat.systemPrompt` setting
- [x] Register `sandtable.chat.maxTokens` setting
- [x] Register `sandtable.chat.temperature` setting
- [x] Verify all settings appear in Settings UI under "Sandtable" section

### Status Bar
- [x] Create `src/vs/workbench/contrib/sandtableStatus/browser/` directory
- [x] Implement status bar item showing connection status
- [x] Health check polling (every 15s)
- [x] Green indicator when connected with model count
- [x] Red indicator when disconnected
- [x] Click opens settings or model picker
- [x] Register contribution in `workbench.common.main.ts`

### Chat Panel
- [x] Create `src/vs/workbench/contrib/sandtableChat/browser/` directory
- [x] Register view container in Activity Bar
- [x] Implement `SandtableChatViewPane` (extends ViewPane)
- [x] Implement model selector dropdown (queries `/v1/models/running`)
- [x] Implement message input widget with Send button
- [x] Implement Shift+Enter for newlines in input
- [x] Implement scrollable message list
- [x] Implement markdown rendering for assistant messages
- [x] Implement syntax-highlighted code blocks in responses
- [x] Implement streaming display (append tokens as they arrive)
- [x] Implement "Stop" button to abort streaming
- [x] Implement chat session list sidebar
- [x] Implement new chat session creation
- [x] Implement session switching
- [x] Implement session deletion
- [x] Implement chat persistence via Cortex session API
- [x] Register contribution in `workbench.common.main.ts`
- [x] Create `sandtableChat.css` with styling

### Integration Testing
- [ ] Status bar shows "Connected" when Cortex is running
- [ ] Status bar shows "Disconnected" when Cortex is down
- [ ] Model selector populates with running models
- [ ] Send message to GPT-OSS 120B, receive streaming response
- [ ] Markdown code blocks render with highlighting
- [ ] Chat session persists after IDE restart
- [ ] "Stop" button aborts mid-stream

---

## Phase 2: Inline Code Completion

**Status:** IDE Side Complete -- Awaiting Cortex FIM Endpoint
**Target:** Days 18-31
**Completed (IDE):** 2026-02-07
**Docs:** [PHASE-2-CODE-COMPLETION.md](phases/PHASE-2-CODE-COMPLETION.md)

### Cortex Side
- [ ] Create `backend/src/routes/fim.py` in Cortex
- [ ] Create `backend/src/fim_templates.py` in Cortex
- [ ] Implement `POST /v1/fim/completions` endpoint
- [ ] Implement FIM template for Codestral/Mistral models
- [ ] Implement FIM template for DeepSeek models
- [ ] Implement FIM template for StarCoder models
- [ ] Implement FIM template for Qwen models
- [ ] Implement generic fallback template
- [ ] Implement proxy to llama.cpp `/infill` for llama.cpp models
- [ ] Register FIM router in `main.py`
- [ ] Test FIM endpoint with vLLM model
- [ ] Test FIM endpoint with llama.cpp model
- [ ] Test FIM streaming responses

### IDE Side
- [x] Create `src/vs/workbench/contrib/sandtableCompletion/browser/` directory
- [x] Implement `sandtableFimPromptBuilder.ts` -- prefix/suffix extraction
- [x] Implement file path hint in prefix
- [x] Implement import context inclusion
- [x] Implement `sandtableCompletionCache.ts` -- LRU cache
- [x] Cache key based on prefix/suffix hash
- [x] Cache hit detection for cursor-forward movement
- [x] Cache invalidation on non-matching input
- [x] 30-second TTL
- [x] Implement `sandtableInlineCompletionProvider.ts`
- [x] Provider triggers after debounce period
- [x] Cancels previous request on new keystroke (via CancellationToken)
- [x] Returns `InlineCompletionItem` with ghost text
- [x] Tab accepts, Escape dismisses (built-in VS Code behavior)
- [x] Register `sandtable.completion.enabled` setting
- [x] Register `sandtable.completion.model` setting
- [x] Register `sandtable.completion.debounceMs` setting
- [x] Register `sandtable.completion.maxTokens` setting
- [x] Register `sandtable.completion.temperature` setting
- [x] Register `sandtable.completion.contextLines` setting
- [x] Register contribution in `workbench.common.main.ts`
- [x] `npm run compile` passes with 0 errors

### Testing
- [ ] Ghost text appears after typing pause in .py file
- [ ] Ghost text appears after typing pause in .ts file
- [ ] Ghost text appears after typing pause in .sh file
- [ ] Tab accepts ghost text
- [ ] Escape dismisses ghost text
- [ ] Rapid typing does not trigger completions (debounce works)
- [ ] Cache hit: moving cursor within completion reuses it
- [ ] Tested with Codestral 22B (if available)
- [ ] Tested with GPT-OSS model via llama.cpp FIM
- [ ] TTFT under 500ms on localhost

---

## Phase 3: Model Manager Panel

**Status:** IDE Side Complete -- Awaiting Cortex IDE Status Endpoint
**Target:** Days 32-45
**Completed (IDE):** 2026-02-07
**Docs:** [PHASE-3-MODEL-MANAGER.md](phases/PHASE-3-MODEL-MANAGER.md)

### Cortex Side
- [ ] Create `backend/src/routes/ide.py` in Cortex
- [ ] Implement `GET /v1/ide/status` combined endpoint
- [ ] Returns running models, system metrics, GPU metrics
- [ ] Register IDE router in `main.py`
- [ ] Test endpoint returns all sections

### IDE Side
- [x] Create `src/vs/workbench/contrib/sandtableModels/browser/` directory
- [x] Register view container in Activity Bar
- [x] Implement `sandtableModelsPanel.ts` -- main panel
- [x] Implement `sandtableModelsList.ts` -- model list with state indicators
- [x] Green dot for running models
- [x] Gray dot for stopped models
- [x] Yellow dot for starting/loading models
- [x] Red dot for failed models
- [x] Start button for stopped models
- [x] Stop button for running models
- [x] Implement `sandtableGpuDashboard.ts` -- GPU metric cards
- [x] GPU name display
- [x] VRAM usage progress bar
- [x] Utilization percentage
- [x] Temperature with color coding
- [x] Flash attention badge
- [x] Implement `sandtableSystemSummary.ts` -- CPU/RAM/disk bars
- [x] Implement `sandtableModelLogs.ts` -- container log viewer
- [x] Auto-scrolling log display
- [x] Diagnostic severity indicators
- [x] Copy button
- [x] Implement dry-run check before starting models
- [x] Show VRAM warnings in confirmation dialog
- [x] Implement admin session authentication
- [x] Login with username/password from settings
- [x] Session cookie storage
- [x] Auto re-auth on 401
- [x] Implement polling with pause when panel not visible
- [x] Register `sandtable.models.showInActivityBar` setting
- [x] Register `sandtable.models.gpuPollIntervalMs` setting
- [x] Register contribution in `workbench.common.main.ts`
- [x] Create `sandtableModels.css` with styling

### Testing
- [ ] Panel opens from Activity Bar
- [ ] Models list shows all models with correct states
- [ ] Can start a stopped model (with dry-run check)
- [ ] Can stop a running model
- [ ] GPU dashboard shows real-time metrics
- [ ] System summary shows CPU/RAM/disk
- [ ] Log viewer shows container logs
- [ ] Polling pauses when panel is hidden
- [ ] Panel works when Cortex has no models configured

---

## Phase 4: Agent Mode

**Status:** IDE Side Complete -- Awaiting Cortex Tool Calling Metadata
**Target:** Days 46-66
**Completed (IDE):** 2026-02-07
**Docs:** [PHASE-4-AGENT-MODE.md](phases/PHASE-4-AGENT-MODE.md)

### Cortex Side
- [ ] Add `supports_tool_calling` field to model constraints response
- [ ] Implement auto-detection based on model family
- [ ] Add optional override field in model schema
- [ ] Test with known tool-calling models

### IDE Side
- [x] Create `src/vs/workbench/contrib/sandtableAgent/browser/` directory
- [x] Create `src/vs/workbench/contrib/sandtableAgent/common/` directory
- [x] Implement `sandtableAgentTools.ts` -- tool definitions
- [x] `read_file` tool
- [x] `edit_file` tool
- [x] `create_file` tool
- [x] `run_command` tool
- [x] `search_files` tool
- [x] `list_directory` tool
- [x] Implement `sandtableAgentLoop.ts` -- core agent loop
- [x] Message -> tool_call -> execute -> repeat cycle
- [x] Max iteration guard (default 25)
- [x] Cancellation support (stop button)
- [x] Context pruning when token budget exceeded
- [x] Implement `sandtableAgentSafety.ts` -- confirmation system
- [x] Confirmation for `edit_file`
- [x] Confirmation for `create_file`
- [x] Confirmation for `run_command`
- [x] No confirmation for read-only tools
- [x] Respect `sandtable.agent.confirmDestructive` setting
- [x] Implement `sandtableAgentPanel.ts` -- agent conversation UI
- [x] Message display with markdown rendering (reuses `renderMarkdown` from VS Code base)
- [x] Tool execution indicators
- [x] Iteration counter
- [x] Stop button
- [x] Disabled state when `agent.enabled` is false
- [x] `run_command` via `ITerminalService` with rich/basic command detection fallback
- [x] `search_files` via `ISearchService.textSearch()` (ripgrep-backed)
- [x] Model selection with specific fallback messages (configured / auto-tool / auto-fallback / no-models)
- [x] Implement `sandtableAgentDiffView.ts` -- inline diff display
- [x] Show old_text vs new_text for edit_file
- [x] Accept/Reject buttons on diffs
- [x] Inline DOM-based diff rendering with red/green lines
- [x] Implement `sandtableAgentContext.ts` -- token budget management
- [x] Calculate available context from model constraints
- [x] Summarize old tool results when budget is tight
- [x] Always preserve system prompt and latest user message
- [x] Register `sandtable.agent.enabled` setting
- [x] Register `sandtable.agent.model` setting
- [x] Register `sandtable.agent.confirmDestructive` setting
- [x] Register `sandtable.agent.maxIterations` setting
- [x] Register `sandtable.agent.maxTokens` setting
- [x] Register contribution in `workbench.common.main.ts`
- [x] Add "Agent" section to Sandtable Settings page
- [x] Create `sandtableAgent.css` with all agent styling
- [x] `npm run compile` passes with 0 errors

### Testing
- [ ] Agent reads a file when asked "what does X contain?"
- [ ] Agent proposes edit with diff view
- [ ] Accept on diff applies the change
- [ ] Reject on diff skips the change, agent is informed
- [ ] Agent creates a new file
- [ ] Agent runs a terminal command (with confirmation)
- [ ] Agent searches across files
- [ ] Agent handles multi-step task (read -> edit -> verify)
- [ ] Stop button halts agent mid-loop
- [ ] Max iterations stops runaway agent
- [ ] Tested with GPT-OSS 120B
- [ ] Fallback behavior when model doesn't support tool calling

---

## Cortex Enhancements

**Docs:** [CORTEX-ENHANCEMENTS.md](CORTEX-ENHANCEMENTS.md)

- [ ] CORS configuration for Electron origins (Phase 1)
- [ ] `POST /v1/fim/completions` endpoint (Phase 2)
- [ ] FIM template registry (Phase 2)
- [ ] FIM proxy to llama.cpp `/infill` (Phase 2)
- [ ] `GET /v1/ide/status` combined endpoint (Phase 3)
- [ ] `supports_tool_calling` field on constraints (Phase 4)

---

## Project Documentation

- [x] `docs/project/README.md` -- Document index
- [x] `docs/project/PROJECT-CHARTER.md` -- Project charter
- [x] `docs/project/ARCHITECTURE.md` -- Technical architecture
- [x] `docs/project/MILESTONES.md` -- Phase overview
- [x] `docs/project/phases/PHASE-0-FORK-AND-BUILD.md` -- Phase 0 plan
- [x] `docs/project/phases/PHASE-1-CORTEX-CONNECTION.md` -- Phase 1 plan
- [x] `docs/project/phases/PHASE-2-CODE-COMPLETION.md` -- Phase 2 plan
- [x] `docs/project/phases/PHASE-3-MODEL-MANAGER.md` -- Phase 3 plan
- [x] `docs/project/phases/PHASE-4-AGENT-MODE.md` -- Phase 4 plan
- [x] `docs/project/CORTEX-ENHANCEMENTS.md` -- Cortex changes
- [x] `docs/project/RESEARCH-REFERENCE.md` -- Research reference
- [x] `docs/project/PROGRESS.md` -- This file
- [x] `docs/project/funspace/README.md` -- Funspace index (non-core fun features)
- [x] `docs/project/funspace/EDITOR-BACKGROUND-IMAGE.md` -- Editor background image feature

---

## Funspace Features (Non-Core)

**Docs:** [funspace/](funspace/)

Optional, self-contained features built by the dev team for fun. These don't block the phase roadmap.

### Editor Background Image
- [x] `AppearanceConfigKeys` enum and 6 settings registered in `cortexConfiguration.ts`
- [x] `sandtableAppearance.contribution.ts` -- dynamic CSS injection, config watching, URI resolution
- [x] `isolation: isolate` added to `.overflow-guard` in `editor.css`
- [x] 5 bundled SVG backgrounds shipped (topo-lines, grid-blueprint, dark-gradient, sandtable-watermark, circuit-board)
- [x] "Appearance" section added to Sandtable Settings page with image selector, preview, and controls
- [x] Contribution registered in `workbench.common.main.ts`
- [x] Auto-overlay derives color from theme (dark: 85% opacity, light: 90%)
- [x] `npm run compile` passes with 0 errors
