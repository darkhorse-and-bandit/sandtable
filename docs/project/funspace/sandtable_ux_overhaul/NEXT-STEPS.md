# Sandtable UX Overhaul -- Next Steps

**Last updated:** 2026-02-08

This document tracks remaining work, enhancements, and follow-up tasks for the Sandtable UX Overhaul and Code Mode feature. Items are organized by priority.

---

## Priority 1: Bug Fixes and Stabilization

### ~~Investigate and Fix Blank Workbench on First Launch~~ (DONE)
- **Problem:** On the first launch after the UX overhaul changes, the workbench may render blank due to the `defaultChatAgent` dependency in `DefaultAccountService`
- **Fix applied:** Added `EMPTY_DEFAULT_ACCOUNT_CONFIG` safe fallback in `toDefaultAccountConfig()` with null/empty guards. Removed the empty stub `defaultChatAgent` from `product.json` entirely -- no longer needed.
- **Files:** `src/vs/workbench/services/accounts/browser/defaultAccount.ts`, `product.json`

### Test Code Mode Toggle in Running Application
- [ ] Launch Sandtable with Code Mode OFF (default) -- verify clean research UI
- [ ] Toggle Code Mode ON via Sandtable Settings -- verify all coding features appear
- [ ] Toggle Code Mode OFF -- verify all coding features hide again
- [ ] Verify Activity Bar correctly shows/hides: SCM, Debug, Testing, Extensions
- [ ] Verify Run menu appears/disappears
- [ ] Verify Terminal > Tasks items appear/disappear
- [ ] Verify Problems and Debug Console panels appear/disappear
- [ ] Verify status bar items (language, encoding, EOL, indent) appear/disappear
- [ ] Verify editor context menu items appear/disappear
- [ ] Verify research defaults apply (minimap off, word wrap on, breadcrumbs off)
- [ ] Verify research defaults revert when Code Mode is turned ON

### Clear Stale Storage During Development
- If view containers don't respond to Code Mode toggling, clear `~/.sandtable/` to reset cached state
- Document this in the developer setup guide

---

## Priority 2: UX Polish

### Welcome Page Enhancements
- [ ] Create custom SVG media assets for Sandtable walkthrough steps (currently reusing VS Code's `settings.svg`, `learn.svg`, etc.)
- [ ] Add a Sandtable-branded hero image or animation to the welcome page header
- [ ] Consider adding a "Recent Workspaces" section alongside "Recent" files
- [ ] Test that walkthrough step commands (`sandtable.openSettings`, `workbench.view.sandtable-chat`, etc.) actually work when clicked -- these depend on the Sandtable contributions being registered

### ~~Terminal Menu Cleanup~~ (Investigated -- No Action Needed)
- VS Code's menu rendering system automatically suppresses separators for groups where all items have their `when` clauses evaluating to false
- Task items in `3_run`, `5_manage`, and `9_config` groups disappear cleanly when `sandtableTaskWhen` evaluates to false
- The Terminal's own items (New Terminal, Run Active File, etc.) remain visible in their groups
- No empty separator lines are rendered
- [ ] Consider adding Sandtable-specific Terminal menu items (e.g., "Connect to Cortex" terminal command) -- future enhancement

### Selection Menu Review
- The Selection menu was kept always visible (useful for text editing in general)
- [ ] Review if any Selection menu items are code-specific and should be gated behind Code Mode

### ~~Go Menu Partial Items~~ (DONE)
- Only `4_symbol_nav` group items (Go to Definition, etc.) were gated behind Code Mode
- [x] `6_problem_nav` (Next/Previous Problem) gated behind Code Mode -- Problems panel is hidden, so navigating problems makes no sense
- [x] `7_change_nav` (Next/Previous Change) gated behind Code Mode -- Source Control is hidden, so change navigation is less relevant
- **Files:** `src/vs/editor/contrib/gotoError/browser/gotoError.ts`, `src/vs/workbench/contrib/scm/browser/quickDiffWidget.ts`

### Editor Features When Code Mode is OFF
- [ ] Consider hiding code folding gutter markers (the fold arrows in the margin)
- [ ] Consider hiding bracket matching highlights
- [ ] Consider hiding indent guides
- [ ] These are low-priority cosmetic changes -- they don't break anything but add visual clutter for non-code documents

---

## Priority 3: Deeper Identity Changes

### Command Palette Filtering (Partially Done)
- When Code Mode is OFF, many Command Palette entries are irrelevant (e.g., "Debug: Start Debugging", "Tasks: Run Build Task")
- [x] **Task commands (15 items):** All task Command Palette entries gated behind `sandtableTaskPaletteWhen` (combines `TaskExecutionSupportedContext` + `sandtable.codeModeEnabled`). File: `task.contribution.ts`
- [x] **Audit completed:** Most debug commands already have `CONTEXT_DEBUGGERS_AVAILABLE` preconditions that naturally filter them
- [ ] **Debug commands (8 without preconditions):** `debug.addConfiguration`, `clearReplAction`, `toggleDisassemblyViewSourceCode`, `addFunctionBreakpointAction`, `addDataBreakpointOnAddress`, `toggleBreakpointsActivatedAction`, `removeAllBreakpoints`, `toggleBreakpointsPresentation` -- these appear unconditionally but are lower priority since they're niche commands
- SCM commands: No SCM commands have `f1: true` -- they are context-menu/view-specific only
- Testing commands: `testing.toggleTestingPeekHistory` and `testing.configureProfile` lack adequate filtering but are very niche

### Keyboard Shortcut Relevance
- F5 (Start Debugging), Ctrl+Shift+B (Run Build Task), etc. are meaningless without Code Mode
- [ ] These keybindings are still registered but their commands won't do anything useful -- consider unbinding or re-assigning when Code Mode is OFF
- [ ] Low priority since the commands simply fail silently

### File Explorer Context Menu
- Right-clicking a file in the Workspace sidebar shows coding-specific entries
- [ ] Review and gate code-specific file context menu items (e.g., "Open With...", language-specific items)
- [ ] Keep general items: Open, Copy Path, Rename, Delete, etc.

### ~~Rename Symbol / Refactor / Source Action~~ (DONE)
- [x] Rename Symbol context menu gated behind Code Mode (`rename.ts`)
- [x] Refactor context menu gated behind Code Mode (`codeActionCommands.ts`)
- [x] Source Action context menu gated behind Code Mode (`codeActionCommands.ts`)
- Note: Quick Fix lightbulb not gated (uses `InlineChatEditorAffordance` menu, not editor context menu). Peek views do not have standalone editor context menu entries -- they are sub-commands of Go to Definition/References which are already gated.

### ~~New File Dialog~~ (DONE)
- [x] `workbench.action.files.newUntitledFile` defaults to `languageId: 'markdown'` when Code Mode is OFF
- [x] `workbench.action.files.newFile` defaults to filename `Untitled.md` (instead of `Untitled.txt`) when Code Mode is OFF
- Both commands check `CodeModeConfigKeys.Enabled` via `IConfigurationService` and only apply the Markdown default when no explicit `languageId`/`fileName` argument is provided
- **File:** `src/vs/workbench/contrib/files/browser/fileCommands.ts`

### ~~Window Title Template~~ (Verified -- No Change Needed)
- The default template is `${dirty}${activeEditorShort}${separator}${rootName}${separator}${profileName}${separator}${appName}`
- `${appName}` resolves to `productService.nameLong` which is `"Sandtable"` from `product.json`
- Title bar correctly shows: `README.md - MyProject - Sandtable`
- **File:** `src/vs/workbench/browser/parts/titlebar/windowTitle.ts` (line 46, 361)

---

## Priority 4: Advanced Features

### ~~Code Mode Quick Toggle~~ (DONE)
- [x] `sandtable.toggleCodeMode` command registered with `registerAction2`
- [x] Keyboard shortcut: `Shift+Alt+M` (weight: WorkbenchContrib) -- changed from `Ctrl+Shift+M` which conflicts with "Toggle Problems Panel" (`workbench.actions.view.problems`)
- [x] Command available in Command Palette as "Sandtable: Toggle Code Mode"
- [x] Status bar button shows: `$(book) Research Mode` or `$(tools) Code Mode` with click-to-toggle
- [x] Status bar positioned at RIGHT alignment with high priority (always visible)
- [x] Tooltip includes keybinding hint
- **Files:** `src/vs/workbench/contrib/sandtableCodeMode/browser/sandtableCodeMode.contribution.ts`

### ~~Chat Panel Integration~~ (DONE -- Major Architecture Change)
- [x] Replaced custom `sandtableChat` (left sidebar) and `sandtableAgent` panels with VS Code's built-in Chat panel (right-side Auxiliary Bar)
- [x] `CortexLanguageModelProvider` registers Cortex models with `ILanguageModelsService` -- models appear in VS Code's model picker
- [x] `SandtableChatAgentImpl` registered as default agent via `IChatAgentService` -- handles conversations, streaming, history
- [x] 6 workspace tools registered via `ILanguageModelToolsService` (read_file, edit_file, create_file, run_command, search_files, list_directory)
- [x] Copilot setup flow naturally bypassed (no `defaultChatAgent` in `product.json`)
- [x] Old panel imports commented out in `workbench.common.main.ts`
- **Files:** `src/vs/workbench/contrib/sandtableLM/browser/` (3 new files)

### ~~Provider/Model/Chat Streamlining~~ (DONE)
- [x] Removed redundant Connection settings page
- [x] Redesigned Models page with curated model list, model detection workflow, per-model parameter overrides
- [x] LM provider queries all providers (not just Cortex) for model discovery
- [x] Chat agent accepts models from any provider

### ~~Tool Calling Wired into Chat Agent~~ (DONE)
- [x] LM provider handles tool_calls in non-streaming responses
- [x] Agent collects tools from `ILanguageModelToolsService`, passes to LLM, implements full tool-calling loop
- [x] Access to all VS Code built-in tools + Sandtable tools

### ~~Settings Menu Reorganization~~ (DONE)
- [x] Sidebar reorganized into 5 categories: Workspace, AI & Models, Research, Exercises, System
- [x] 6 future-phase placeholders: Personas, Documents, Data Sources, Workflows, Sessions, Users & Roles
- [x] About section, slimmed General dashboard

### Remaining Work
- [ ] `run_command` tool: implement via `ITerminalService` (currently returns placeholder)
- [ ] Runtime testing: verify tool calling end-to-end in agent mode
- [ ] Evaluate VS Code's built-in session persistence vs Cortex-side session storage
- [ ] Customize chat panel welcome view with Sandtable branding

### Mode-Specific Activity Bar Ordering
- With chat now in the Auxiliary Bar (right side), the Activity Bar is less crowded
- [ ] Consider reordering Activity Bar items so Sandtable items (Models) appear above VS Code items (SCM, Debug, etc.)

### Research-Specific Features
- [ ] When Code Mode is OFF, consider showing a "Research" panel in the Activity Bar that provides:
  - Document viewer for uploaded files
  - Note-taking workspace
- [ ] This is more of a Phase 5+ feature but the UX foundation supports it

### Notification Filtering
- [ ] Various coding-specific notifications may still appear (extension recommendations, language server prompts)
- [ ] Consider suppressing these when Code Mode is OFF

---

## Priority 5: Documentation and Testing

### Automated Testing
- [ ] Write unit tests for `SandtableCodeModeContribution` -- verify context key is set correctly, research defaults are applied/removed
- [ ] Write integration tests for `PaneCompositeBar.shouldBeHidden()` -- verify Code Mode containers are hidden/shown
- [ ] Write tests for the welcome page content -- verify Sandtable walkthroughs are registered

### User Documentation
- [ ] Create an end-user guide explaining Code Mode and how to toggle it
- [ ] Document the research-first vs. code-mode differences for new users
- [ ] Add Code Mode explanation to the README.md

### Developer Documentation
- [ ] Document the `sandtable.codeModeEnabled` context key for other contributors who add new features
- [ ] Establish convention: new coding-specific features should include `when: sandtable.codeModeEnabled` in their registrations
- [ ] Add this to a developer guide or CONTRIBUTING.md

---

## Architectural Notes for Future Contributors

### Adding New Code-Mode-Gated Features

When adding a new feature that should only appear in Code Mode:

1. **View containers (Activity Bar/Panel):** Add the container ID to `SANDTABLE_CODE_MODE_CONTAINERS` in `paneCompositeBar.ts`
2. **Menu items:** Add `when: ContextKeyExpr.has('sandtable.codeModeEnabled')` to the menu registration
3. **Status bar items:** Check `configurationService.getValue(CodeModeConfigKeys.Enabled)` before rendering
4. **Commands:** Add `precondition: ContextKeyExpr.has('sandtable.codeModeEnabled')` to the command registration
5. **Editor contributions:** Add `when` clauses to context menu registrations

### The Context Key Pattern

The `sandtable.codeModeEnabled` context key is the primary mechanism. It is:
- Set by `SandtableCodeModeContribution` on startup and when the setting changes
- Available everywhere via `IContextKeyService`
- Usable in declarative `when` clauses (menu items, command preconditions, view container visibility)
- Usable imperatively via `contextKeyService.contextMatchesRules(ContextKeyExpr.has('sandtable.codeModeEnabled'))`

### The Configuration Pattern

The `sandtable.codeMode.enabled` setting is the source of truth. The context key mirrors it. Use the setting for imperative checks (in TypeScript code) and the context key for declarative checks (in `when` clauses).
