# Sandtable -- Progress Tracker

This is the living checklist for the Sandtable project. Update checkboxes as tasks are completed. This is the single source of truth for project status.

**Last updated:** 2026-02-08
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

#### Next Steps (Phase 2 -- Remaining)
- [ ] Custom walkthrough SVG media assets (art/design work)
- [ ] Command Palette filtering: debug commands (8 without preconditions identified -- lower priority)
- [ ] Runtime testing: verify tool calling works end-to-end in agent mode
- [ ] run_command tool: implement via ITerminalService (currently placeholder)
- [ ] Chat session persistence: evaluate VS Code's built-in session storage vs Cortex-side sessions
