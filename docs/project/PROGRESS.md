# MAGE IDE -- Progress Tracker

This is the living checklist for the MAGE IDE project. Update checkboxes as tasks are completed. This is the single source of truth for project status.

**Last updated:** 2026-02-07
**Current phase:** Phase 0 (Complete)

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
- [x] Create `mage-ide/main` branch from release tag
- [x] Disable GitHub Actions (remove `.github/workflows/`)

### Rebrand
- [x] Update `product.json` field: `nameShort` -> "MAGE IDE"
- [x] Update `product.json` field: `nameLong` -> "MAGE IDE"
- [x] Update `product.json` field: `applicationName` -> "mage-ide"
- [x] Update `product.json` field: `dataFolderName` -> ".mage-ide"
- [x] Update `product.json` field: `urlProtocol` -> "mage-ide"
- [x] Update `product.json` field: `serverApplicationName` -> "mage-ide-server"
- [x] Update `product.json` field: `linuxIconName` -> "com.aulendur.mage-ide"
- [x] Remove/update telemetry-related fields
- [x] Update `reportIssueUrl` to MAGE IDE repo

### Build and Verify
- [x] Run `npm install` successfully
- [x] Run `npm run compile` successfully (0 errors)
- [x] Launch with `./scripts/code.sh`
- [x] Verify title bar shows "MAGE IDE"
- [x] Verify file editing works
- [x] Verify integrated terminal works
- [x] Verify extensions panel works
- [x] Verify Command Palette works (Ctrl+Shift+P)
- [x] Verify Settings UI works (Ctrl+,)
- [x] Verify About dialog shows correct name

### Finalize
- [x] Ensure `docs/project/` directory is preserved
- [x] Increase inotify watchers if needed (`fs.inotify.max_user_watches=524288`)
- [x] Create initial commit on `mage-ide/main` branch

---

## Phase 1: Cortex Connection + Chat Panel

**Status:** Not Started
**Target:** Days 4-17
**Docs:** [PHASE-1-CORTEX-CONNECTION.md](phases/PHASE-1-CORTEX-CONNECTION.md)

### Cortex Side
- [ ] Configure CORS for Electron origins (`file://`, `null`) in Cortex

### Platform Service
- [ ] Create directory `src/vs/platform/cortex/common/`
- [ ] Create directory `src/vs/platform/cortex/browser/`
- [ ] Define `ICortexService` interface in `cortex.ts`
- [ ] Define all TypeScript types (requests, responses, models, etc.)
- [ ] Implement `CortexClient` with non-streaming requests
- [ ] Implement `CortexClient` SSE streaming with `ReadableStream`
- [ ] Implement `CortexClient` request cancellation via `AbortController`
- [ ] Handle error responses (4xx, 5xx) with typed errors
- [ ] Implement `CortexService` browser-side service
- [ ] Register `CortexService` as singleton with DI system

### Settings
- [ ] Register `mage.cortex.endpoint` setting
- [ ] Register `mage.cortex.apiKey` setting
- [ ] Register `mage.cortex.username` setting
- [ ] Register `mage.cortex.password` setting
- [ ] Register `mage.cortex.healthCheckIntervalMs` setting
- [ ] Register `mage.chat.defaultModel` setting
- [ ] Register `mage.chat.streamingEnabled` setting
- [ ] Register `mage.chat.systemPrompt` setting
- [ ] Register `mage.chat.maxTokens` setting
- [ ] Register `mage.chat.temperature` setting
- [ ] Verify all settings appear in Settings UI under "MAGE" section

### Status Bar
- [ ] Create `src/vs/workbench/contrib/mageStatus/browser/` directory
- [ ] Implement status bar item showing connection status
- [ ] Health check polling (every 15s)
- [ ] Green indicator when connected with model count
- [ ] Red indicator when disconnected
- [ ] Click opens settings or model picker
- [ ] Register contribution in `workbench.common.main.ts`

### Chat Panel
- [ ] Create `src/vs/workbench/contrib/mageChat/browser/` directory
- [ ] Register view container in Activity Bar
- [ ] Implement `MageChatViewPane` (extends ViewPane)
- [ ] Implement model selector dropdown (queries `/v1/models/running`)
- [ ] Implement message input widget with Send button
- [ ] Implement Shift+Enter for newlines in input
- [ ] Implement scrollable message list
- [ ] Implement markdown rendering for assistant messages
- [ ] Implement syntax-highlighted code blocks in responses
- [ ] Implement streaming display (append tokens as they arrive)
- [ ] Implement "Stop" button to abort streaming
- [ ] Implement chat session list sidebar
- [ ] Implement new chat session creation
- [ ] Implement session switching
- [ ] Implement session deletion
- [ ] Implement chat persistence via Cortex session API
- [ ] Register contribution in `workbench.common.main.ts`
- [ ] Create `mageChat.css` with styling

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

**Status:** Not Started
**Target:** Days 18-31
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
- [ ] Create `src/vs/workbench/contrib/mageCompletion/browser/` directory
- [ ] Implement `mageFimPromptBuilder.ts` -- prefix/suffix extraction
- [ ] Implement file path hint in prefix
- [ ] Implement import context inclusion
- [ ] Implement `mageCompletionCache.ts` -- LRU cache
- [ ] Cache key based on prefix/suffix hash
- [ ] Cache hit detection for cursor-forward movement
- [ ] Cache invalidation on non-matching input
- [ ] 30-second TTL
- [ ] Implement `mageInlineCompletionProvider.ts`
- [ ] Provider triggers after debounce period
- [ ] Cancels previous request on new keystroke
- [ ] Returns `InlineCompletionItem` with ghost text
- [ ] Tab accepts, Escape dismisses
- [ ] Register `mage.completion.enabled` setting
- [ ] Register `mage.completion.model` setting
- [ ] Register `mage.completion.debounceMs` setting
- [ ] Register `mage.completion.maxTokens` setting
- [ ] Register `mage.completion.temperature` setting
- [ ] Register `mage.completion.contextLines` setting
- [ ] Register contribution in `workbench.common.main.ts`

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

**Status:** Not Started
**Target:** Days 32-45
**Docs:** [PHASE-3-MODEL-MANAGER.md](phases/PHASE-3-MODEL-MANAGER.md)

### Cortex Side
- [ ] Create `backend/src/routes/ide.py` in Cortex
- [ ] Implement `GET /v1/ide/status` combined endpoint
- [ ] Returns running models, system metrics, GPU metrics
- [ ] Register IDE router in `main.py`
- [ ] Test endpoint returns all sections

### IDE Side
- [ ] Create `src/vs/workbench/contrib/mageModels/browser/` directory
- [ ] Register view container in Activity Bar
- [ ] Implement `mageModelsPanel.ts` -- main panel
- [ ] Implement `mageModelsList.ts` -- model list with state indicators
- [ ] Green dot for running models
- [ ] Gray dot for stopped models
- [ ] Yellow dot for starting/loading models
- [ ] Red dot for failed models
- [ ] Start button for stopped models
- [ ] Stop button for running models
- [ ] Implement `mageGpuDashboard.ts` -- GPU metric cards
- [ ] GPU name display
- [ ] VRAM usage progress bar
- [ ] Utilization percentage
- [ ] Temperature with color coding
- [ ] Flash attention badge
- [ ] Implement `mageSystemSummary.ts` -- CPU/RAM/disk bars
- [ ] Implement `mageModelLogs.ts` -- container log viewer
- [ ] Auto-scrolling log display
- [ ] Diagnostic severity indicators
- [ ] Copy button
- [ ] Implement dry-run check before starting models
- [ ] Show VRAM warnings in confirmation dialog
- [ ] Implement admin session authentication
- [ ] Login with username/password from settings
- [ ] Session cookie storage
- [ ] Auto re-auth on 401
- [ ] Implement polling with pause when panel not visible
- [ ] Register `mage.models.showInActivityBar` setting
- [ ] Register `mage.models.gpuPollIntervalMs` setting
- [ ] Register contribution in `workbench.common.main.ts`
- [ ] Create `mageModels.css` with styling

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

**Status:** Not Started
**Target:** Days 46-66
**Docs:** [PHASE-4-AGENT-MODE.md](phases/PHASE-4-AGENT-MODE.md)

### Cortex Side
- [ ] Add `supports_tool_calling` field to model constraints response
- [ ] Implement auto-detection based on model family
- [ ] Add optional override field in model schema
- [ ] Test with known tool-calling models

### IDE Side
- [ ] Create `src/vs/workbench/contrib/mageAgent/browser/` directory
- [ ] Create `src/vs/workbench/contrib/mageAgent/common/` directory
- [ ] Implement `mageAgentTools.ts` -- tool definitions
- [ ] `read_file` tool
- [ ] `edit_file` tool
- [ ] `create_file` tool
- [ ] `run_command` tool
- [ ] `search_files` tool
- [ ] `list_directory` tool
- [ ] Implement `mageAgentLoop.ts` -- core agent loop
- [ ] Message -> tool_call -> execute -> repeat cycle
- [ ] Max iteration guard (default 25)
- [ ] Cancellation support (stop button)
- [ ] Context pruning when token budget exceeded
- [ ] Implement `mageAgentSafety.ts` -- confirmation system
- [ ] Confirmation for `edit_file`
- [ ] Confirmation for `create_file`
- [ ] Confirmation for `run_command`
- [ ] No confirmation for read-only tools
- [ ] Respect `mage.agent.confirmDestructive` setting
- [ ] Implement `mageAgentPanel.ts` -- agent conversation UI
- [ ] Message display (reuses chat rendering)
- [ ] Tool execution indicators
- [ ] Iteration counter
- [ ] Stop button
- [ ] Implement `mageAgentDiffView.ts` -- inline diff display
- [ ] Show old_text vs new_text for edit_file
- [ ] Accept/Reject buttons on diffs
- [ ] Use VS Code's native diff editor
- [ ] Implement `mageAgentContext.ts` -- token budget management
- [ ] Calculate available context from model constraints
- [ ] Summarize old tool results when budget is tight
- [ ] Always preserve system prompt and latest user message
- [ ] Register `mage.agent.enabled` setting
- [ ] Register `mage.agent.model` setting
- [ ] Register `mage.agent.confirmDestructive` setting
- [ ] Register `mage.agent.maxIterations` setting
- [ ] Register `mage.agent.maxTokens` setting
- [ ] Register contribution in `workbench.common.main.ts`

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
