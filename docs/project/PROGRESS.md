# Sandtable -- Progress Tracker

This is the living checklist for the Sandtable project. Update checkboxes as tasks are completed. This is the single source of truth for project status.

**Last updated:** 2026-02-09
**Current phase:** Visual Animations & Branding -- Active Development

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

## Phase 4.5: Multi-Provider LLM Connection System

**Status:** Complete
**Target:** Days 64-84
**Docs:** [PHASE-4.5-MULTI-PROVIDER.md](phases/PHASE-4.5-MULTI-PROVIDER.md)

### Sub-Phase 4.5.1: Provider Abstraction Layer
- [x] Create `src/vs/platform/cortex/common/cortexProviderTypes.ts` -- provider config types, IUnifiedModel
- [x] Create `src/vs/platform/cortex/common/llmProvider.ts` -- ILLMProvider base interface
- [x] Create `src/vs/platform/cortex/common/cortexLLMProvider.ts` -- ICortexLLMProvider extended interface
- [x] Create `src/vs/platform/cortex/common/openAICompatibleClient.ts` -- HTTP client for OpenAI-compatible endpoints
- [x] Create `src/vs/platform/cortex/common/modelResolver.ts` -- compound model ID parsing
- [x] Create `src/vs/platform/cortex/browser/cortexLLMProviderImpl.ts` -- wraps existing CortexClient
- [x] Create `src/vs/platform/cortex/browser/openAICompatibleProviderImpl.ts` -- OpenAI-compatible provider
- [x] `npm run compile` passes with 0 errors

### Sub-Phase 4.5.2: Provider Registry Service
- [x] Create `src/vs/platform/cortex/common/providerRegistry.ts` -- IProviderRegistryService interface
- [x] Create `src/vs/platform/cortex/browser/providerRegistryService.ts` -- full implementation
- [x] Add `sandtable.providers` array setting to `cortexConfiguration.ts`
- [x] Add `sandtable.defaultProvider` setting to `cortexConfiguration.ts`
- [x] Implement legacy settings migration (sandtable.cortex.* -> providers array)
- [x] Register singleton in DI system
- [x] `npm run compile` passes with 0 errors

### Sub-Phase 4.5.3: Evolve ICortexService
- [x] Add provider-aware methods to `ICortexService` interface in `cortex.ts`
- [x] Inject `IProviderRegistryService` into `CortexService`
- [x] Implement model routing in `chatCompletion()` and `chatCompletionStream()`
- [x] Implement model routing in `fimCompletion()` and `fimCompletionStream()`
- [x] Implement model routing in `textCompletion()` and `textCompletionStream()`
- [x] Update `listRunningModels()` to aggregate from all providers
- [x] Delegate admin methods to Cortex provider via registry
- [x] Update health check to use aggregate provider health
- [x] `npm run compile` passes with 0 errors

### Sub-Phase 4.5.4: Update Consumers
- [x] Update `sandtableChatModelSelector.ts` -- group models by provider in dropdown
- [x] Update `sandtableStatusBarItem.ts` -- aggregate provider/model count
- [x] Update `sandtableModelsPanel.ts` -- add external models read-only section
- [x] Update `sandtableInlineCompletionProvider.ts` -- route FIM across providers
- [x] Update `sandtableAgentLoop.ts` -- scan all providers for tool-calling models
- [x] `npm run compile` passes with 0 errors

### Sub-Phase 4.5.5: Settings Page Providers Section
- [x] Add "Providers" to settings page navigation
- [x] Implement provider list with status cards
- [x] Create `sandtableProviderEditor.ts` -- add/edit provider dialog
- [x] Implement "Test Connection" with model discovery preview
- [x] Provider enable/disable toggle
- [x] Provider remove with confirmation
- [x] Styling for provider cards and dialog
- [x] `npm run compile` passes with 0 errors

### Sub-Phase 4.5.6: Documentation and Testing
- [x] Update PROJECT-CHARTER.md for multi-provider support
- [x] Update MILESTONES.md with Phase 4.5 section
- [x] Update ARCHITECTURE.md with multi-provider architecture
- [x] Update PROGRESS.md with Phase 4.5 checklist
- [x] Update docs/project/README.md with Phase 4.5 link
- [x] Register imports in `workbench.common.main.ts`
- [x] Final `npm run compile` with 0 errors

### Post-Implementation Bug Fixes (Phase 4.5)

Issues discovered during live testing with OpenAI and Cortex providers:

- [x] **TrustedHTML CSP fix** -- Replaced `innerHTML` in `sandtableChatMessageList.ts` typing indicator with `dom.append()` calls to comply with Electron's TrustedHTML CSP
- [x] **System prompt on session failure** -- Moved system prompt insertion in `sandtableChatViewPane.ts` outside the session creation `try/catch` so chat works when Cortex is unreachable
- [x] **CSP `http://` allowance** -- Added `http:` to `connect-src` directive in `workbench.html` and `workbench-dev.html` to allow connections to local network HTTP servers
- [x] **False-positive health check** -- Rewrote `OpenAICompatibleClient.checkHealth()` to call `request()` directly instead of `listModels()` which swallowed errors
- [x] **Endpoint URL normalization** -- Added `_normalizeEndpoint()` to `CortexClient` and `OpenAICompatibleClient` to strip trailing `/v1` preventing URL duplication
- [x] **Cortex session auth priority** -- Changed `CortexClient` auth to prefer session cookie over Bearer token for all requests. Added `_setAuthHeaders()` helper
- [x] **CortexLLMProvider session login** -- Added `_ensureAdminSession()` before `checkHealth()`, `listModels()`, `getModelCapabilities()`, `getModelConstraints()`, and `getIDEStatus()` in the Cortex provider

### Sub-Phase 4.5.7: Model Parameter Overrides

Addresses API parameter incompatibilities across different LLM providers/models (e.g., GPT-5 rejects `temperature` and `max_tokens`):

- [x] **Layer 1: Auto-detection** -- `OpenAICompatibleClient.normalizeChatBody()` detects GPT-5/o1/o3 reasoning models and strips unsupported params (`temperature`, `top_p`, `frequency_penalty`, `presence_penalty`). Renames `max_tokens` to `max_completion_tokens` for all external providers
- [x] **Layer 2: `IModelParameterOverrides` type** -- New interface with `dropParams`, `renameParams`, `forceParams`, `extraParams` in `cortexProviderTypes.ts`
- [x] **Layer 2: `modelOverrides` on `IProviderConfig`** -- Per-model overrides keyed by model name or glob pattern (e.g., `gpt-5*`)
- [x] **Layer 2: Override resolution** -- `OpenAICompatibleProvider._resolveModelOverrides()` matches model names with exact match then trailing `*` wildcard
- [x] **Layer 2: Override application** -- `normalizeChatBody()` applies admin overrides after auto-detection (admin wins)
- [x] **Layer 2: Settings schema** -- Updated `sandtable.providers` item schema with `modelOverrides` property
- [x] **Layer 2: Provider editor UI** -- "Model Parameter Overrides" section in `sandtableProviderEditor.ts` with add/edit/remove per model pattern
- [x] **Layer 2: Provider card badges** -- Override count shown on provider cards in settings page
- [x] `npm run compile` passes with 0 errors

### Sub-Phase 4.5.8: Model Test Button and Reliability Fixes

Adds a "Test Model" button for verifying models work before using them in chat, plus fixes for curated model overrides and provider connectivity timing:

- [x] **Test Model button** -- Added to curated model config panel in `sandtableSettingsPage.ts`. Sends a minimal `chatCompletion()` request ("Say hello in one sentence") through the full routing + normalization pipeline. Shows model reply (green) or API error details (red) inline
- [x] **Test result CSS** -- Green success box, red failure box, reply text, usage stats, and error tip styles in `sandtableSettings.css`
- [x] **Curated model overrides plumbing** -- `CortexService._routeRequest()` now reads `sandtable.models.curated` and applies curated model overrides (`dropParameters`, `renameParameters`, `forceParameters`, `extraParameters`) to the request before the provider's own overrides run
- [x] **Provider connectivity timing fix** -- `ProviderRegistryService.getActiveProviders()` now includes providers that haven't completed their first health check yet (optimistic inclusion). Prevents "No models available" when health polls haven't finished at startup. Providers are excluded only after a failed health check
- [x] `npm run compile` passes with 0 errors

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
- [x] `docs/project/phases/PHASE-4.5-MULTI-PROVIDER.md` -- Phase 4.5 plan
- [x] `docs/project/CORTEX-ENHANCEMENTS.md` -- Cortex changes
- [x] `docs/project/RESEARCH-REFERENCE.md` -- Research reference
- [x] `docs/project/PROGRESS.md` -- This file
- [x] `docs/project/funspace/README.md` -- Funspace index (non-core fun features)
- [x] `docs/project/funspace/custom_editor_background/EDITOR-BACKGROUND-IMAGE.md` -- Editor background image feature
- [x] `docs/project/funspace/sandtable_ux_overhaul/SANDTABLE-UX-OVERHAUL.md` -- UX overhaul & Code Mode documentation
- [x] `docs/project/funspace/sandtable_ux_overhaul/NEXT-STEPS.md` -- Remaining work and follow-up tasks
- [x] `docs/project/funspace/chat_token_tracking/DESIGN.md` -- Chat model picker fix & token usage tracking design
- [x] `docs/project/funspace/geometric_animations/GEOMETRIC-ANIMATIONS.md` -- Geometric animations design, implementation, and critical CSP/TrustedTypes guidance

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

### Sandtable UX Overhaul & Code Mode
**Docs:** [funspace/sandtable_ux_overhaul/](funspace/sandtable_ux_overhaul/)
**Next Steps:** [funspace/sandtable_ux_overhaul/NEXT-STEPS.md](funspace/sandtable_ux_overhaul/NEXT-STEPS.md)

#### Code Mode Toggle (Phase 1 -- Complete)
- [x] `CodeModeConfigKeys` enum and `sandtable.codeMode.enabled` setting registered in `cortexConfiguration.ts`
- [x] `sandtableCodeMode.contribution.ts` -- context key, config watching, research defaults
- [x] Contribution registered in `workbench.common.main.ts`
- [x] `sandtable.codeModeEnabled` context key set from configuration
- [x] `PaneCompositeBar.shouldBeHidden()` modified to check Code Mode for target containers
- [x] Activity Bar containers hidden when Code Mode OFF: SCM, Debug, Testing, Extensions
- [x] Bottom panels hidden when Code Mode OFF: Problems, Debug Console
- [x] Run menu hidden when Code Mode OFF (entire top-level menu)
- [x] Terminal > Tasks menu items hidden when Code Mode OFF
- [x] Go > Symbol Navigation items hidden when Code Mode OFF (Definition, Declaration, Type, Implementations, References)
- [x] Editor context menu: Go to Definition/Declaration/Type/Implementations/References hidden when Code Mode OFF
- [x] Status bar: Language, Encoding, EOL, Indentation indicators hidden when Code Mode OFF
- [x] Research-friendly defaults applied when Code Mode OFF (minimap off, word wrap on, breadcrumbs off)
- [x] Research defaults removed when Code Mode toggled ON (restores VS Code defaults)
- [x] "Code Mode" section added to Sandtable Settings page with toggle and feature list
- [x] `npm run compile` passes with 0 errors

#### Welcome Page Overhaul (Phase 1 -- Complete)
- [x] "Get Started with Sandtable" walkthrough (Connect Cortex, Chat, Models, Agent, Theme, Code Mode)
- [x] "Explore Sandtable" walkthrough (Shortcuts, Terminal, Command Palette, Search, Background)
- [x] Start entries updated: "New Document...", "Open Workspace...", "Sandtable Settings"
- [x] All Copilot walkthrough steps and related code removed
- [x] SetupWeb and notebooks walkthroughs removed

#### Terminology & Branding (Phase 1 -- Complete)
- [x] Explorer renamed to "Workspace" in Activity Bar
- [x] Help menu: removed VS Code links (Video Tutorials, Tips and Tricks, YouTube, Feature Requests)
- [x] Help menu: added "Sandtable Settings" entry
- [x] `product.json`: `defaultChatAgent` removed (null guards added to `DefaultAccountService`)
- [x] `product.json`: `trustedExtensionAuthAccess` cleared

#### UX Overhaul Phase 2 -- In Progress
- [x] `DefaultAccountService` null guards for `defaultChatAgent` -- removed empty stubs from `product.json`, added safe fallback config
- [x] Rename Symbol context menu gated behind Code Mode (`rename.ts`)
- [x] Refactor / Source Action context menus gated behind Code Mode (`codeActionCommands.ts`)
- [x] Go menu: Problem navigation (Next/Previous Problem) gated behind Code Mode (`gotoError.ts`)
- [x] Go menu: Change navigation (Next/Previous Change) gated behind Code Mode (`quickDiffWidget.ts`)
- [x] Code Mode quick-toggle: `Shift+Alt+M` keyboard shortcut via `sandtable.toggleCodeMode` command
- [x] Code Mode status bar button: shows "Research Mode" / "Code Mode" with toggle on click
- [x] Toggle command available in Command Palette as "Sandtable: Toggle Code Mode"
- [x] Keybinding conflict resolved: changed from `Ctrl+Shift+M` (conflicts with Toggle Problems Panel) to `Shift+Alt+M`
- [x] New File defaults to Markdown when Code Mode OFF (`fileCommands.ts`: both `newUntitledFile` and `newFile`)
- [x] Window title template verified: `${appName}` already resolves to "Sandtable" from `product.json` `nameLong`
- [x] Command Palette filtering: all 15 task commands gated behind Code Mode (`task.contribution.ts`)
- [x] Terminal menu separators: investigated, VS Code auto-hides empty groups -- no code change needed
- [x] `npm run compile` passes with 0 errors

#### Chat Integration (VS Code Built-in Chat Panel) -- Complete
- [x] Custom `sandtableChat` and `sandtableAgent` sidebar panels replaced with VS Code's built-in Chat panel
- [x] `CortexLanguageModelProvider` -- registers Cortex as a language model vendor with `ILanguageModelsService`, exposing running models in VS Code's model picker
- [x] `SandtableChatAgentImpl` -- default chat agent registered via `IChatAgentService`, handles conversations by routing to Cortex via the LM provider
- [x] 6 workspace tools registered via `ILanguageModelToolsService`: read_file, edit_file, create_file, run_command, search_files, list_directory
- [x] Chat setup flow naturally bypassed: no `defaultChatAgent` in `product.json` = Copilot setup flow inert
- [x] `panelParticipantRegistered` context key set by agent registration = chat panel visible
- [x] Old `sandtableChat` and `sandtableAgent` imports commented out in `workbench.common.main.ts`
- [x] New files: `src/vs/workbench/contrib/sandtableLM/browser/` (contribution, agent, tools)
- [x] `npm run compile` passes with 0 errors

#### Provider/Model/Chat Streamlining -- Complete
- [x] Removed redundant Connection settings page (absorbed by Providers)
- [x] Redesigned Models page: curated model list with enable/disable, "+ Add Model" detection workflow, per-model parameter override editor (drop/rename/force/extra params)
- [x] LM provider queries ProviderRegistryService for ALL models from ALL providers (not just Cortex)
- [x] Chat agent accepts any provider model (removed `cortex:` prefix filter in resolveModelId)
- [x] Model parameter overrides moved from Providers page to Models page (per-model, not per-provider)
- [x] Added `sandtable.models.curated` setting for persistent model curation
- [x] `npm run compile` passes with 0 errors

#### Tool Calling Wired into Chat Agent -- Complete
- [x] LM provider `sendChatRequest()` handles tool_calls: uses non-streaming for tool requests, emits `IChatResponseToolUsePart`
- [x] Chat agent collects available tools from `ILanguageModelToolsService.getTools()` for each request
- [x] Full tool-calling loop in agent: send tools to LLM -> detect tool_use -> invoke tools -> feed results back -> repeat (max 15 iterations)
- [x] Agent respects `userSelectedTools` from request to filter tools
- [x] Progress messages shown during tool execution ("Running tool: **name**...")
- [x] Access to all VS Code built-in tools (edit file, terminal, tasks, fetch, tests) plus Sandtable tools (read_file, search_files, list_directory)
- [x] `npm run compile` passes with 0 errors

#### Settings Menu Reorganization -- Complete
- [x] Sidebar reorganized into 5 categories: Workspace, AI & Models, Research, Exercises, System
- [x] Category headers rendered as styled uppercase dividers in sidebar
- [x] 6 future-phase placeholder sections added: Personas, Documents, Data Sources, Workflows, Sessions, Users & Roles
- [x] Placeholder pages show "Coming Soon" badge with feature description
- [x] About section created (version, platform, resources, mission statement)
- [x] General section slimmed to dashboard: connection status, provider/model counts, quick action links
- [x] `npm run compile` passes with 0 errors

#### Stabilization and Hardening -- Complete
- [x] `run_command` tool: implemented via `ITerminalService` with shell integration output capture and basic fallback
- [x] Edit mode (`ChatModeKind.Edit`): added to agent's supported modes, mode instructions appended to system prompt
- [x] `npm run compile` passes with 0 errors

#### Code Mode UX Cleanup -- Complete
Comprehensive audit and cleanup of all coding-centric UI elements that remain visible when Code Mode is OFF. Every change dynamically responds to the code mode toggle (no restart required).

**Chat Panel Text and Suggested Actions:**
- [x] Welcome titles: "Ask a question" / "Edit content" / "Research with Agent" (replacing code-centric titles)
- [x] Chat input placeholders: "Ask a question or explore a topic" / "Edit or revise selected content" / "Describe what to research or explore next"
- [x] Suggested prompts: "Explore Documents" / "Start Research" (replacing "Build Workspace" / "Show Config")
- [x] "Generate Agent Instructions" message rephrased to "configure AI for your workspace"
- [x] Agent title bar hover: "describe what to research next" (replacing "describe what to build next")

**Copilot Status Bar:**
- [x] Copilot status bar icon hidden when Code Mode is OFF (Sandtable has its own Cortex status indicator)

**Editor Empty State / Watermark:**
- [x] Empty editor hint: "Ask a question, or start writing" (replacing "Generate code / select a language")
- [x] Inline chat placeholders: "Generate content" / "Modify selected text" (replacing "Generate code" / "Modify selected code")
- [x] Editor watermark: "Start Debugging" and "Toggle Terminal" shortcuts hidden behind code mode

**Panels:**
- [x] Outline panel hidden when Code Mode is OFF (code symbols irrelevant for research)
- [x] Timeline panel hidden when Code Mode is OFF

**Status Bar:**
- [x] OVR (overtype mode) indicator hidden when Code Mode is OFF
- [x] Remote Window indicator hidden when Code Mode is OFF and not connected to remote

**File Explorer:**
- [x] "Open in Integrated Terminal" / "Open in External Terminal" context menu items gated behind code mode

**Files modified:** `chatWidget.ts`, `chatInputEditorContrib.ts`, `agentTitleBarStatusWidget.ts`, `chatStatusEntry.ts`, `emptyTextEditorHint.ts`, `inlineChatOverlayWidget.ts`, `inlineChatController.ts`, `editorGroupWatermark.ts`, `outline.contribution.ts`, `timeline.contribution.ts`, `editorStatus.ts`, `externalTerminal.contribution.ts`, `remoteIndicator.ts`

#### Command Center Overhaul -- Complete
Full overhaul of the Quick Open command center dropdown and menu bar for Research Mode.

**Command Center Dropdown (Ctrl+P):**
- [x] Fixed filter bugs: "Start Debugging" and "Run Task" now properly hidden (wrong commandId fixed, order-based fallback added)
- [x] Placeholder simplified to "Search files by name" (removed "go to line/symbol" suffixes)
- [x] Entries renamed: "Open Document" / "Search in Documents" / "Ask AI" (replacing code-centric labels)
- [x] Research-mode entries added: "Browse Personas" and "Open Sandtable Settings"
- [x] Code-centric entries filtered: Go to Symbol, Start Debugging, Run Task hidden

**Menu Bar:**
- [x] Go menu hidden when Code Mode is OFF (most items are code-centric)
- [x] Terminal menu hidden when Code Mode is OFF (developer tool)
- [x] Go to Symbol in Editor menu item gated behind code mode
- [x] Go to Symbol in Workspace menu item gated behind code mode
- [x] Go to Bracket menu item gated behind code mode

**Files modified:** `anythingQuickAccess.ts`, `menubarControl.ts`, `gotoSymbolQuickAccess.ts`, `searchActionsSymbol.ts`, `bracketMatching.ts`

- [x] `npm run compile` passes with 0 errors

#### Next Steps (Phase 2 -- Remaining)
- [ ] Custom walkthrough SVG media assets (art/design work)
- [ ] Runtime testing: verify tool calling works end-to-end in agent mode
- [ ] Chat session persistence: evaluate VS Code's built-in session storage vs Cortex-side sessions

---

## Phase 6: Agent Personas

**Status:** Complete (IDE-side implementation)
**Completed:** 2026-02-08
**Docs:** [PHASE-6-PERSONAS.md](phases/PHASE-6-PERSONAS.md)

### Persona Schema and Settings
- [x] Create `src/vs/platform/cortex/common/personaTypes.ts` -- `ICuratedPersona` interface
- [x] Define `BUILTIN_PERSONAS` array with 5 default personas
- [x] Define `generatePersonaId()` UUID generator
- [x] Add `PersonaConfigKeys` enum to `cortexConfiguration.ts`
- [x] Register `sandtable.personas` array setting with full JSON schema
- [x] Register `sandtable.activePersona` string setting
- [x] `npm run compile` passes with 0 errors

### Built-in Persona Templates
- [x] Research Analyst (structured analysis, citations, temp: 0.5)
- [x] Red Team Commander (adversarial thinking, doctrine-aware, temp: 0.8)
- [x] Blue Team Defender (defensive posture, risk mitigation, temp: 0.6)
- [x] Exercise Facilitator (neutral, tracks objectives, temp: 0.4)
- [x] Subject Matter Expert (deep expertise, source references, temp: 0.7)

### Agent Portfolio Panel (Activity Bar)
- [x] `SandtablePersonasPanel` ViewPane with full CRUD in Activity Bar sidebar
- [x] ViewContainer registered with `Codicon.organization` icon
- [x] Active persona banner, card list, create/edit form, import/export
- [x] `sandtable.openAgentPortfolio` command in Command Palette
- [x] Dedicated `sandtablePersonas.css` styles
- [x] Persona CRUD removed from Settings page (replaced with redirect placeholder)
- [x] `npm run compile` passes with 0 errors

### Persona Selection (Multiple Access Points)
- [x] Status bar item shows active persona name (click opens quick-pick)
- [x] Chat input persona picker button (person icon via `MenuId.ChatInputSide`)
- [x] `sandtable.selectPersona` command in Command Palette
- [x] Quick-pick shows icon, name, role, system prompt preview
- [x] Registered in `workbench.common.main.ts`
- [x] `npm run compile` passes with 0 errors

### Chat Agent Integration
- [x] `resolveActivePersona()` reads active persona from configuration
- [x] `buildMessages()` uses persona system prompt + guidelines
- [x] `resolveModelId()` considers persona's preferred model
- [x] `runToolLoop()` applies persona temperature, top_p, max_tokens overrides
- [x] `npm run compile` passes with 0 errors

### AI-Assisted Persona Creation Tool
- [x] `sandtable_create_persona` tool registered with `ILanguageModelToolsService`
- [x] Tool accepts name, role, systemPrompt, guidelines, temperature, topP, maxTokens, icon
- [x] Saves persona to configuration, returns formatted markdown summary
- [x] Users can ask AI "create a persona" and the LLM drafts all fields
- [x] `npm run compile` passes with 0 errors

### Testing
- [ ] Agent Portfolio panel opens from Activity Bar
- [ ] Built-in personas load automatically
- [ ] Create, edit, duplicate, delete custom personas in Agent Portfolio
- [ ] Person icon in chat input opens quick-pick
- [ ] Status bar persona indicator and quick-pick work
- [ ] Chat agent uses persona overrides
- [ ] Import/export personas as JSON
- [ ] Ask AI "Create a cybersecurity red team persona" -- tool creates persona
- [ ] Settings page Personas shows redirect to Agent Portfolio
- [ ] run_command tool executes commands
- [ ] Edit mode appears and applies mode instructions

### Documentation
- [x] `docs/project/phases/PHASE-6-PERSONAS.md` -- Phase plan and task breakdown
- [x] Updated `PROGRESS.md` with Phase 6 checklist
- [x] Updated `MILESTONES.md` with Phase 6 milestones
- [x] Updated `ARCHITECTURE.md` with persona file structure and types

---

## Funspace: Tool Call Display Overhaul

**Status:** Complete
**Completed:** 2026-02-08
**Docs:** [funspace/tool_call_display/DESIGN.md](funspace/tool_call_display/DESIGN.md)

Overhauled tool call display in the chat pane to provide persistent, collapsible, human-friendly tool invocation rendering using VS Code's native tool invocation pipeline.

### Tool Metadata Enhancements
- [x] Added `userDescription` to all 15 tool `IToolData` definitions (workspace + persona tools)
- [x] Added `alwaysDisplayInputOutput: true` to 6 workspace tools (read_file, edit_file, create_file, run_command, search_files, list_directory)
- [x] Added `prepareToolInvocation()` to all 15 tool classes with context-specific `invocationMessage` and `pastTenseMessage`
- [x] Workspace tools set `toolSpecificData` with `kind: 'input'` for native collapsible input/output display

### Agent Native Pipeline Integration
- [x] Refactored `SandtableChatAgentImpl.runToolLoop()` to use `toolsService.beginToolCall()` instead of transient `IChatProgressMessage`
- [x] `beginToolCall()` creates persistent `ChatToolInvocation` in Streaming state, appended to chat response model
- [x] `invokeTool()` handles `prepareToolInvocation()`, state transitions (Executing -> Completed), and result capture
- [x] Removed manual `progress([{ kind: 'progressMessage' }])` calls for tool execution
- [x] Tool invocations pass `sessionResource` and `chatRequestId` for proper chat model integration

### User-Facing Improvements
- [x] Tool calls show human-friendly aliases: "Reading `src/utils.ts`" instead of "Running tool: **sandtable_read_file**..."
- [x] After completion, tools show past-tense summary: "Read `src/utils.ts`"
- [x] Tool icon changes from spinner to checkmark on completion
- [x] Tool calls persist in chat conversation after completion (no longer vanish)
- [x] Completed tool calls collapse to a single line with expandable input/output details
- [x] Expanded tool results use scrollable containers with max-height constraints

### Build
- [x] `npm run compile` passes with 0 errors

---

## Phase 6.1: Full Persona CRUD Tools

**Status:** Complete
**Completed:** 2026-02-09
**Docs:** [PHASE-6.1-PERSONA-TOOLS.md](phases/PHASE-6.1-PERSONA-TOOLS.md)

Extended the Sandtable chat agent's tool-calling capabilities from 7 tools to 15 tools, giving the agent full conversational CRUD over the persona system plus import/export and duplication features.

### Required Persona Tools (5 new)
- [x] `sandtable_list_personas` -- List all personas with active indicator, role, temperature, built-in flag
- [x] `sandtable_get_persona` -- Get full details by ID or fuzzy name match (case-insensitive partial)
- [x] `sandtable_edit_persona` -- Partial update of any mutable field with validation and change summary
- [x] `sandtable_delete_persona` -- Delete custom personas (built-in guard), auto-clear active if deleted
- [x] `sandtable_activate_persona` -- Activate by ID/name or deactivate (empty params)

### Stretch Goal Tools (3 new)
- [x] `sandtable_duplicate_persona` -- Clone-and-modify in a single tool call with optional overrides
- [x] `sandtable_export_persona` -- Export one or all personas as pretty-printed JSON for sharing
- [x] `sandtable_import_persona` -- Import from JSON string (single object or array) with validation

### Shared Helpers
- [x] `getPersonas()` -- Module-level helper for loading personas with built-in fallback
- [x] `findPersona()` -- Lookup by exact ID with fuzzy name fallback

### Registration and Integration
- [x] All 8 new tools registered in `SandtableToolsContribution` constructor
- [x] Log message updated from "7 workspace tools registered" to "15 workspace tools registered"
- [x] All tools follow existing pattern: `IToolData` + `IToolImpl` class + `this._register()`
- [x] All persona tools use `runsInWorkspace: false` (operate on settings, not workspace files)

### Build
- [x] `gulp compile-client` passes with 0 errors

---

## Tools Settings Page

**Status:** Complete
**Completed:** 2026-02-09

Added a "Tools" menu item to the Sandtable Settings page under the "AI & Models" category that dynamically discovers and displays all registered LLM tools at runtime.

### Settings Page Integration
- [x] Added `'tools'` to `SectionId` type union
- [x] Added Tools entry to `SECTIONS` array (under AI & Models, after Agent, before Code Completion)
- [x] Injected `ILanguageModelToolsService` into `SandtableSettingsPage` constructor
- [x] Added `case 'tools'` to `_renderSection()` switch

### Tools Section Rendering
- [x] `_renderToolsSection()` -- Auto-discovers tools via `toolsService.getTools(undefined)`, groups by category, subscribes to `onDidChangeTools` for live updates
- [x] `_categorizeTool()` -- Categorizes tools by source type (MCP, extension, user) and ID pattern (workspace vs persona)
- [x] `_renderToolCard()` -- Renders card with display name, `userDescription`, tool ID, source/workspace badges, and expandable details
- [x] `_renderParameterTable()` -- Renders `inputSchema` properties as a table with parameter name, type, required badge, and description
- [x] `DisposableStore` for tools section listeners, cleared on section switch

### Tool Metadata Tags
- [x] Added `tags` to all 15 Sandtable tool `IToolData` definitions for richer categorization
- [x] Workspace tools tagged: `['workspace', 'file']`, `['workspace', 'search']`, `['workspace', 'terminal']`, `['workspace', 'filesystem']`
- [x] Persona tools tagged: `['persona']`

### CSS
- [x] Tool card styling (`.sandtable-tool-card`, header, badges, ID, user description)
- [x] Category headers (`.sandtable-tool-category`, label, count)
- [x] Expandable details panel (`.sandtable-tool-details`, toggle, model description)
- [x] Parameter table (`.sandtable-tool-params-table`, name/type/required/desc cells)
- [x] Badge variants: source (blue), workspace (green), required (orange)

### Build
- [x] `gulp compile-client` passes with 0 errors

---

## Chat Model Picker Fix & Token Usage Tracking

**Status:** Complete
**Completed:** 2026-02-09
**Docs:** [funspace/chat_token_tracking/DESIGN.md](funspace/chat_token_tracking/DESIGN.md)

Two connected fixes that complete the chat panel's model selection and context awareness UX. The model picker dropdown now shows all registered models, and the existing VS Code `ChatContextUsageWidget` (circular pie chart) is fed real token usage data from API responses.

### Problem 1: Model Picker Empty -- Fixed
- [x] **Root cause identified:** VS Code's `LanguageModelsService` skips initial model resolution when no stored picker preferences exist (`_hasStoredModelForVendor()` returns false on fresh install)
- [x] **`queueMicrotask` initial fire** -- Added `queueMicrotask(() => this._onDidChange.fire())` at the end of `SandtableLanguageModelProvider` constructor to force `_resolveAllLanguageModels()` after registration completes
- [x] **"Add Language Models" command handler** -- Registered `workbench.action.chat.triggerSetup` to open `sandtable://settings` instead of no-op Copilot setup
- [x] **Agent mode filter bug fixed** -- Enriched model capabilities (`toolCalling`, `agentMode`) from the known model context window table. Previously, OpenAI-compatible providers defaulted `toolCalling: false`, causing `suitableForAgentMode()` to filter out ALL models in Agent mode. Now uses known table data (GPT-5, Claude, etc. correctly report `toolCalling: true`)
- [x] `npm run compile` passes with 0 errors

### Problem 2: Token Usage Indicator Hidden -- Fixed
- [x] **Known model context window table** -- Created `src/vs/platform/cortex/common/knownModelContextWindows.ts` with 60+ entries covering OpenAI, Anthropic, DeepSeek, Qwen, Meta, Mistral, Google, Microsoft, Cohere model families
- [x] **Curated model schema extended** -- Added `contextWindowTokens` and `maxOutputTokens` fields to `sandtable.models.curated` items schema
- [x] **Enriched model metadata** -- `provideLanguageModelChatInfo()` resolves `maxInputTokens`/`maxOutputTokens` with layered lookup: curated config > known models table > default (128K). Uses curated `displayName` if available
- [x] **Streaming usage capture** -- Extended `ICortexStreamResult` with optional `usage?: ICortexUsage`. Added `stream_options: { include_usage: true }` to streaming requests. Final SSE chunk usage data captured when provider supports it
- [x] **Real usage in LM provider** -- `sendChatRequest()` propagates real `promptTokens` and `completionTokens` from both streaming and non-streaming API responses
- [x] **Real usage in agent result** -- `SandtableChatAgentImpl.runToolLoop()` captures real token counts across iterations and reports in `IChatAgentResult.usage`. Falls back to ~4 chars/token heuristic when API doesn't return usage
- [x] **VS Code's ChatContextUsageWidget automatically appears** -- Pie chart reads `response.result?.usage.promptTokens` and `maxInputTokens` from model metadata. Both values now populated
- [x] `npm run compile` passes with 0 errors

### Settings Page Enhancements
- [x] **Token budget fields in model edit panel** -- "Context Window (tokens)" and "Max Output Tokens" number inputs added to curated model edit panel
- [x] **Token info display on model cards** -- Cards show context window and max output info (e.g., "Context: 400K · Max output: 128K") when configured
- [x] **Save handler updated** -- `contextWindowTokens` and `maxOutputTokens` persisted alongside display name and overrides

### New File
- [x] `src/vs/platform/cortex/common/knownModelContextWindows.ts` -- `IKnownModelSpec` interface, `KNOWN_MODEL_CONTEXT_WINDOWS` array (60+ entries), `lookupKnownModelSpec()`, `matchesGlobPattern()`

### Modified Files
- [x] `src/vs/workbench/contrib/sandtableLM/browser/sandtableLM.contribution.ts` -- queueMicrotask, enriched metadata, command handler, streaming usage, capabilities enrichment
- [x] `src/vs/workbench/contrib/sandtableLM/browser/sandtableChatAgent.ts` -- Real token usage tracking and heuristic fallback in `IChatAgentResult.usage`
- [x] `src/vs/platform/cortex/common/cortex.ts` -- `ICortexStreamResult.usage?: ICortexUsage`
- [x] `src/vs/platform/cortex/common/openAICompatibleClient.ts` -- `stream_options`, SSE usage capture
- [x] `src/vs/platform/cortex/common/cortexConfiguration.ts` -- `contextWindowTokens` and `maxOutputTokens` in curated schema
- [x] `src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettingsPage.ts` -- Token budget inputs and display in model edit panel

---

## Funspace: Visual Animations & Branding

**Status:** Active Development
**Started:** 2026-02-09
**Docs:** [funspace/geometric_animations/GEOMETRIC-ANIMATIONS.md](funspace/geometric_animations/GEOMETRIC-ANIMATIONS.md)

Sacred geometry compositions, desert floor panoramic images, Sandtable logo branding, and processing-state animations across Sandtable's key UI surfaces.

### Shared Animation Module
- [x] `sandtableAnimations.css` -- `@keyframes` (rotate-cw, rotate-ccw, drift, fade-drift, gradient-sweep, border-pulse, card-enter, section-fade), composition positioning, reduced-motion support
- [x] `sandtableAnimations.ts` -- `createGeometricBackground()` (scattered shapes), `createCenteredComposition()` (sacred geometry emblem with slowFactor), plus `addGradientSweep()`, `addBorderPulse()`, `addStaggeredEntrance()`, `addSectionFade()`
- [x] `sandtableAnimations.contribution.ts` -- Global CSS import, registered first in `workbench.common.main.ts`
- [x] All SVG built with `document.createElementNS()` -- no `innerHTML`, no TrustedTypes dependency

### Welcome Page (4-layer composited background)
- [x] **Opaque background** -- `var(--vscode-editor-background)` fallback prevents watermark bleed-through
- [x] **Sacred geometry composition** -- 1600px, 6 rings, 12 spokes (varying lengths), 36 compass ticks, static hexagon center, slowFactor 2
- [x] **Desert floor image** -- Night desert sand panorama, anchored bottom, full editor width, gradient mask, 50% opacity
- [x] **Sandtable logo** -- Above title text via `FileAccess.asBrowserUri()`
- [x] **Walkthrough detail screens** -- Same composition + desert image on Get Started and Explore Sandtable walkthroughs
- [x] Staggered card entrance animations for left/right columns
- [x] Header/footer fade-in entrance

### Empty Editor Watermark (No Files Open)
- [x] **Sacred geometry composition** -- 1600px, same parameters as welcome, centered on editor area, `overflow: hidden` clips to bounds
- [x] **Desert floor image** -- Same styling as welcome page
- [x] **Greyscale Sandtable logo** -- Replaces VS Code's letterpress SVGs, 480px, `filter: grayscale(100%)`, 40% opacity
- [x] **`.empty` class hiding** -- Composition and desert hidden via `:not(.empty)` selector when files are open
- [x] Staggered shortcut fade-in, logo fade entrance

### Chat Tool Call Processing
- [x] **Thinking box border pulse** -- Targets `.chat-used-context-list.chat-thinking-collapsible.chat-thinking-streaming` (VS Code's semantic state class)
- [x] **Gradient sweep** -- `::after` pseudo-element sweep across thinking box during streaming
- [x] **Standalone fallback** -- Descendant selector `.chat-tool-invocation-part:has(.codicon-loading)` for non-thinking-box rendering
- [x] **Working-progress sweep** -- Enhanced gradient on `.progress-container.working-progress`

### Other Surfaces
- [x] **Settings page** -- Sacred-geometry composition in header, section fade transitions, staggered card entrance, nav item stagger
- [x] **Model Manager** -- Loading gradient sweep, disconnected entrance, GPU card + model item stagger
- [x] **Explorer empty state** -- Geometric background, welcome content fade-in
- [x] **COP map page** -- Grid loading overlay, coordinate/toolbar entrance, layer panel stagger
- [x] **Agent panel** (deprecated) -- Tool indicator sweep, diff border pulse, welcome entrance

### Critical Fixes Applied
- [x] **TrustedTypes / innerHTML** -- Rewrote to DOM APIs, added CSP entries to both HTML files
- [x] **Error boundaries** -- All animation calls wrapped in try-catch
- [x] **Chat selector fix** -- Changed from `> .chat-tool-invocation-part` (never matched) to `.chat-thinking-collapsible.chat-thinking-streaming` (correct thinking-box target)
- [x] **`.empty` class visibility** -- Added `:not(.empty)` hiding rules so decorations don't appear behind open files
- [x] **SVG transform-origin** -- Explicit `cx`/`cy` pixel coordinates on `<g>` layers (SVG defaults to 0,0, not center)
- [x] **Welcome background opacity** -- Added `var(--vscode-editor-background)` fallback to prevent watermark composition bleed-through

### Build
- [x] `npm run compile` passes with 0 errors

### Key Lessons Learned

1. **The blank workbench incident:** `innerHTML` in `EditorGroupWatermark` constructor crashed the entire workbench. Fix: DOM APIs + error boundaries + dual CSP HTML updates.
2. **The invisible border pulse:** CSS targeted `.value > .chat-tool-invocation-part` but tool calls render inside `.chat-thinking-box` (3 levels deep). Fix: verify runtime DOM with element inspector before writing selectors.
3. **The bleeding decorations:** Elements injected into `.editor-group-container` are visible even when files are open. Fix: mirror VS Code's `:not(.empty)` hiding pattern.
4. **SVG layers flying apart:** `<g>` elements default to transform-origin 0,0. Fix: explicit pixel coordinates via CSS custom properties.

---

## COP Phase 1: Map Panel and Basic Interaction

**Status:** Complete (code infrastructure; static assets pending download)
**Completed:** 2026-02-09
**Docs:** [funspace/integrated_map_cop/COP-PHASE-1-IMPLEMENTATION.md](funspace/integrated_map_cop/COP-PHASE-1-IMPLEMENTATION.md)

MapLibre GL JS integrated into a VS Code EditorPane as the Common Operating Picture (COP). Provides an interactive map with coordinate display, drawing tools, layer management, and five basemap themes -- all designed for offline/air-gapped deployment.

### Platform Types and Settings
- [x] `copTypes.ts` -- `ISandtableCopService` interface, 15+ domain types/enums, full Phase 2-4 stubs
- [x] `copConfiguration.ts` -- 12 `sandtable.cop.*` settings with validation (tile source, theme, coordinate format, zoom, symbology standard)
- [x] COP section added to Sandtable Settings page with all configuration fields

### EditorPane Infrastructure
- [x] `sandtableCopInput.ts` -- Singleton `EditorInput` with `sandtable-cop://map` URI, globe icon, pinned by default
- [x] `sandtableCopPage.ts` -- `EditorPane` hosting MapLibre with toolbar, coordinate display, layer sidebar
- [x] `sandtableCop.contribution.ts` -- Activity Bar globe icon, ViewContainer with sidebar panel, EditorResolver, Command Palette entry
- [x] `sandtableCopService.ts` -- In-memory state management, 3 default layers, event emitters, DI singleton
- [x] Wired into `workbench.common.main.ts`

### MapLibre Renderer
- [x] `sandtableCopMapRenderer.ts` -- MapLibre GL JS initialization with PMTiles protocol, Protomaps basemap styling, `vscode-file://` asset URLs
- [x] `loadUmdModule()` helper -- Workaround for Electron's Node.js globals that break UMD module detection in `importAMDNodeModule`
- [x] Trusted Types patches for Worker constructor (`maplibreWorker`) and innerHTML (`maplibreHtml`)
- [x] MapLibre critical CSS injected programmatically (navigation icons, scale bar, control positioning)
- [x] `style.load` event (not `load`) for source creation -- works even without tile files
- [x] `onSourcesReady` event for annotation persistence across theme switches

### Interactive Features
- [x] `sandtableCopCoordinateDisplay.ts` -- MGRS/lat-lon/UTM with `mgrs` npm package (UMD), click-to-cycle, right-click-to-copy
- [x] `sandtableCopDrawTools.ts` -- Custom drawing (no external draw library): point, line, polygon with temp preview layer
- [x] `sandtableCopLayerPanel.ts` -- Layer list with visibility toggle, opacity slider, 3 default layers
- [x] MapLibre interaction control: dragPan/doubleClickZoom disabled during drawing, re-enabled after

### CSP and Build
- [x] `workbench.html` + `workbench-dev.html` -- `file:` in img/connect/font-src; `maplibreHtml` + `maplibreWorker` in trusted-types
- [x] `npm run compile` passes with 0 errors

### Key Lessons Learned

1. **No `require()` or bare `import` in browser layer.** VS Code's ESM build externalizes packages. Use `importAMDNodeModule()` from `amdX.ts`.
2. **UMD modules need `module`/`exports` nullification in Electron.** Node.js globals cause UMD to take CJS path instead of AMD.
3. **IIFE modules set globals.** Access via `(globalThis as any).packageName` after `importAMDNodeModule` loads the script.
4. **Always update BOTH HTML files.** Dev mode uses `workbench-dev.html`, not `workbench.html`.
5. **Use `vscode-file://vscode-app/` not `file://`.** Electron blocks `file://` in renderer.
6. **Use `ThemeIcon.asCSSSelector()` not `asClassName()`.** The `$()` helper needs dot-separated CSS selectors.
7. **Use `style.load` not `load`.** MapLibre's `load` event requires ALL sources to finish, which fails without tile files.
8. **Disable dragPan during drawing.** MapLibre's drag handler steals click events from drawing tools.
9. **`setStyle()` replaces all sources.** Theme switches destroy annotation layers. Fire an event to re-push data.

---

## COP Phase 2: Military Symbology and ORBAT

**Status:** Complete
**Completed:** 2026-02-09
**Dependencies:** COP Phase 1

MIL-STD-2525D military unit symbols via milsymbol, unit placement dialog, hierarchical ORBAT tree in the Activity Bar sidebar, inline unit properties editor, and ORBAT import/export.

### npm Dependencies Added

| Package | Version | License | Loading Method |
|---------|---------|---------|----------------|
| `milsymbol` | ^3.x | MIT | `loadUmdModule()` via `importAMDNodeModule` |

### Files Created

| File | Purpose |
|------|---------|
| `src/vs/platform/cortex/common/copUnitTypes.ts` | SIDC construction helpers: `buildSidc()`, affiliation/echelon/unitType-to-SIDC lookup tables, `generateUnitId()`, display label helpers |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopSymbology.ts` | milsymbol wrapper: SIDC to SVG to data URI to MapLibre image pipeline, symbol cache, `reloadAllSymbols()` for theme switches |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopUnitPlacement.ts` | Right-click context menu on map, DOM-based dialog with affiliation/echelon/type/designation fields, live SIDC preview, creates units |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopOrbatTree.ts` | `WorkbenchAsyncDataTree`-based `ViewPane` in Activity Bar sidebar, hierarchical ORBAT tree with affiliation dots, echelon badges, bidirectional selection with map |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopUnitEditor.ts` | Inline unit properties editor panel on selection, editable fields, Move Unit mode, Delete with confirmation |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopOrbatIO.ts` | Export ORBAT to `orbat.geojson` + `orbat-tree.json` via `IFileService`, import from file dialog, debounced auto-save |

### Files Modified

| File | Changes |
|------|---------|
| `src/vs/platform/cortex/common/copTypes.ts` | Added `onUnitSelected`, `selectUnit()`, `getSelectedUnitId()` to `ISandtableCopService` |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopService.ts` | Added selection state/events, ORBAT tree maintenance in addUnit/removeUnit/updateUnit, bbox filter |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCopPage.ts` | Integrated symbology, unit placement, unit editor, unit click-to-select, `_updateUnitsSource()`, theme-switch symbol reload |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCop.contribution.ts` | Replaced placeholder ViewPane with ORBAT tree, added Export/Import ORBAT commands, auto-save contribution, welcome content for empty state |
| `src/vs/workbench/contrib/sandtableCop/browser/sandtableCop.css` | Added ~400 lines for unit placement dialog, unit editor, delete confirmation overlay, ORBAT tree node styles |
| `package.json` | Added `milsymbol: ^3.0.3` |

### Verification Checklist
- [x] Right-click map opens unit placement dialog with affiliation/echelon/type selectors
- [x] Live SIDC preview in dialog renders correct milsymbol symbol
- [x] Place Unit creates unit with correct MIL-STD-2525D symbol on map
- [x] Friendly = blue rectangle, hostile = red diamond, neutral = green square (affiliation shapes correct)
- [x] ORBAT tree in Activity Bar sidebar shows hierarchical unit list
- [x] Click unit in tree pans map to unit location
- [x] Click unit on map highlights in ORBAT tree
- [x] Unit editor panel shows editable properties on selection
- [x] Move Unit mode repositions unit on next map click
- [x] Delete Unit removes from map and ORBAT tree
- [x] ORBAT welcome view shows "Open Map" button when tree is empty
- [x] Export ORBAT writes `orbat.geojson` + `orbat-tree.json` to workspace
- [x] Import ORBAT reads GeoJSON files via file dialog
- [x] Unit symbols persist across theme switches (onSourcesReady reload)
- [x] `npm run compile` passes with 0 errors

### Key Lessons Learned

1. **MIL-STD-2525D SIDC is 20 digits with 2-digit Standard Identity.** The initial implementation used a 1-digit affiliation field (positions 3 only), which shifted every subsequent field by one position, producing malformed SIDCs that milsymbol rendered as generic unknown symbols. The fix was verified against the Carmenta SIDC reference and the ARCHITECTURE.md example SIDC `10031000161211000000`. Correct layout: `{version:2}{identity:2}{symbolSet:2}{status:1}{hqTfDummy:1}{echelon:2}{entity:6}{mod1:2}{mod2:2}`.
2. **`_closeDialog()` must not clear coordinates prematurely.** The unit placement dialog's `_showPlacementDialog()` called `_closeDialog()` to remove any previous dialog, but `_closeDialog()` unconditionally cleared `_pendingCoordinates`. This silently prevented all unit placements. Fix: save and restore coordinates across dialog cleanup.
3. **ViewPane `shouldShowWelcome()` defaults to `false`.** The ORBAT tree sidebar appeared blank because no welcome state was configured. Fix: override `shouldShowWelcome()` to return `true` when ORBAT is empty, fire `_onDidChangeViewWelcomeState` on ORBAT changes, and register welcome content via `registerViewWelcomeContent()`.
4. **milsymbol loads correctly via `loadUmdModule()`.** milsymbol v3 is a proper UMD module and works with the same `loadUmdModule()` pattern used for maplibre-gl. No additional Trusted Types policies were needed -- SVGs are converted to data URIs and loaded as `<img>` elements.
