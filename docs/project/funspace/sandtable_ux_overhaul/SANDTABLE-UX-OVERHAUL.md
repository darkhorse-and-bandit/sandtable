# Funspace: Sandtable UX Overhaul & Code Mode

**Status:** Phase 2 Complete
**Date:** 2026-02-08
**Category:** Identity & UX Transformation

## What It Does

Transforms Sandtable's user experience from a code-centric IDE into a **research-first AI workspace** that happens to be excellent at code. The core mechanism is a single toggle -- **Code Mode** (`sandtable.codeMode.enabled`) -- that shows or hides all coding-specific UI elements. When Code Mode is OFF (the default), Sandtable presents a streamlined research and analysis workspace. When Code Mode is ON, the full coding toolkit appears.

This work also replaces VS Code-specific branding, walkthroughs, and terminology throughout the workbench with Sandtable-native language and content.

## Philosophy

Sandtable is not an IDE that happens to have AI -- it is an AI-powered research and analysis workspace that happens to be excellent at code. The default experience speaks to researchers, analysts, and scenario planners. Developers opt into Code Mode when they need the full coding toolkit.

## Architecture

The implementation divides into three pillars:

1. **Code Mode Toggle** -- A single boolean setting and context key that controls visibility of coding-specific features across the entire workbench
2. **Global Identity** -- Welcome page, terminology, menus, and branding that always reflect Sandtable's mission regardless of Code Mode state
3. **Cleanup** -- Removal of VS Code / Copilot / Microsoft residue that doesn't belong in Sandtable

### How Code Mode Works

```
sandtable.codeMode.enabled (boolean setting, default: false)
    │
    ├── SandtableCodeModeContribution (workbench contribution)
    │   ├── Sets context key: sandtable.codeModeEnabled
    │   ├── Applies/removes research-friendly editor defaults
    │   └── Logs state changes
    │
    ├── PaneCompositeBar.shouldBeHidden() (modified)
    │   ├── Checks SANDTABLE_CODE_MODE_CONTAINERS set
    │   ├── Returns true (hidden) for code containers when OFF
    │   └── Listens for config changes to refresh visibility
    │
    ├── Menu registrations (when clauses)
    │   ├── Run menu: when: sandtable.codeModeEnabled
    │   ├── Go menu symbol nav: when: sandtable.codeModeEnabled
    │   ├── Terminal tasks: when: sandtable.codeModeEnabled
    │   └── Editor context menu: when: sandtable.codeModeEnabled
    │
    └── Status bar (editorStatus.ts)
        └── Language/Encoding/EOL/Indent: gated by config check
```

## Setting

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sandtable.codeMode.enabled` | boolean | `false` | Enable Code Mode to show coding-specific features. When disabled, Sandtable presents a streamlined research and analysis workspace. |

## What Code Mode Controls

### Hidden When Code Mode is OFF

**Activity Bar (Sidebar):**
| Container | ID | Notes |
|-----------|-----|-------|
| Source Control | `workbench.view.scm` | Git integration |
| Run and Debug | `workbench.view.debug` | Debugger |
| Testing | `workbench.view.extension.test` | Test runner |
| Extensions | `workbench.view.extensions` | Extension marketplace |

**Bottom Panels:**
| Panel | ID | Notes |
|-------|-----|-------|
| Problems | `workbench.panel.markers` | Linter/compiler diagnostics |
| Debug Console | `workbench.panel.repl` | Debug output |

**Menu Bar:**
- Entire "Run" menu (hidden at top level)
- Entire "Go" menu (hidden at top level -- most items code-centric)
- Entire "Terminal" menu (hidden at top level -- developer tool)
- Go > Symbol Navigation group (Go to Definition, Declaration, Type Definition, Implementations, References, Go to Symbol, Go to Bracket)
- Go > Problem Navigation group (Next/Previous Problem)
- Go > Change Navigation group (Next/Previous Change)

**Editor Context Menu:**
- Go to Definition, Go to Declaration, Go to Type Definition
- Go to Implementations, Go to References
- Rename Symbol
- Refactor...
- Source Action...

**Status Bar:**
- Language Mode indicator (e.g., "TypeScript")
- Encoding indicator (e.g., "UTF-8")
- End of Line indicator (e.g., "LF")
- Indentation indicator (e.g., "Spaces: 4")
- OVR (overtype mode) indicator
- Copilot status bar icon (hidden; Sandtable uses Cortex status indicator)
- Remote Window indicator (hidden when not connected to a remote)

**Explorer Sidebar Panels:**
- Outline panel (shows code symbols -- irrelevant for research)
- Timeline panel (shows git history)

**File Explorer Context Menu:**
- "Open in Integrated Terminal"
- "Open in External Terminal"

**Command Palette:**
- All 15 task commands (Run Task, Build Task, Test Task, Configure Tasks, etc.)

**Command Center Dropdown (Ctrl+P):**
- "Start Debugging" and "Run Task" help entries hidden
- "Go to Symbol in Editor" and "Go to Symbol in Workspace" help entries hidden
- Placeholder simplified to "Search files by name" (removed code-centric suffixes)
- Entries renamed: "Open Document", "Search in Documents", "Ask AI"
- Research-specific entries added: "Browse Personas", "Open Sandtable Settings"

**Chat Panel Text:**
- Welcome titles: "Ask a question" / "Edit content" / "Research with Agent"
- Input placeholders: research-friendly descriptions instead of code-centric ones
- Suggested prompts: "Explore Documents" / "Start Research"
- "Generate Agent Instructions" rephrased for workspace context
- Agent hover label: "describe what to research next"

**Inline Chat Placeholders:**
- "Generate content" / "Modify selected text" (replacing code-centric terminology)

**Editor Empty State:**
- Hint text: "Ask a question, or start writing" (replacing "Generate code / select a language")
- Watermark shortcuts: "Start Debugging" and "Toggle Terminal" hidden

**New File Behavior:**
- `Ctrl+N` (New Untitled File) defaults to Markdown language mode
- "New File" command defaults to `Untitled.md` filename

**Editor Defaults (research-friendly):**
- `editor.minimap.enabled` set to `false`
- `editor.wordWrap` set to `'on'`
- `breadcrumbs.enabled` set to `false`

### Always Visible (Regardless of Code Mode)

- Workspace (renamed Explorer) in Activity Bar
- Search in Activity Bar
- Chat panel in Auxiliary Bar (right side) -- VS Code's built-in chat, powered by Cortex models
- Sandtable Models in Activity Bar
- Agent Portfolio in Activity Bar
- Terminal panel
- Output panel
- File, Edit, Selection, View, Help menus
- Cursor position (Ln/Col) in Status Bar
- Cortex connection status in Status Bar
- Active Persona indicator in Status Bar
- Code Mode toggle button in Status Bar (shows "Research Mode" / "Code Mode", click to switch)

## Global Identity Changes (Always Active)

### Welcome Page

Replaced all VS Code walkthroughs with Sandtable-specific content:

**"Get Started with Sandtable" walkthrough:**
1. Connect to Cortex -- Configure endpoint and API key
2. Start a Conversation -- Open the Chat panel
3. Manage Your Models -- Open the Model Manager
4. Meet Your Agent -- Open the Agent panel
5. Choose Your Theme -- Color theme picker
6. Enable Code Mode -- Toggle on coding features

**"Explore Sandtable" walkthrough:**
1. Keyboard Shortcuts -- Essential navigation shortcuts
2. The Terminal -- Run commands within Sandtable
3. The Command Palette -- Access any command instantly
4. Search Across Files -- Full-text workspace search
5. Customize Your Background -- Editor background images

**Start entries** (quick-action buttons):
- "New Document..." (was "New File...")
- "Open Workspace..." (was "Open Folder...")
- "Sandtable Settings" (was "Clone Git Repository...")

### Terminology

| Original (VS Code) | Sandtable | File |
|---------------------|-----------|------|
| Explorer | Workspace | `explorerViewlet.ts` |
| &&Explorer (mnemonic) | &&Workspace | `explorerViewlet.ts` |

### Help Menu

Removed from Help menu:
- Video Tutorials (VS Code YouTube)
- Tips and Tricks (VS Code tips)
- Join Us on YouTube (VS Code YouTube channel)
- Search Feature Requests (VS Code GitHub)

Added to Help menu:
- Sandtable Settings (opens `sandtable.openSettings` command)

Kept in Help menu:
- Keyboard Shortcuts Reference (still useful)
- Report Issue (already points to Sandtable repo)
- Documentation (kept for future Sandtable docs URL)
- Accessibility features

### Product.json

- `defaultChatAgent` section: Removed entirely (null guards in `DefaultAccountService` handle the missing property gracefully)
- Branding fields already set from Phase 0 (`nameShort`, `nameLong`, etc.)

### Settings Page

New "Code Mode" section added as the second section in Sandtable Settings (after General), containing:
- Enable/disable toggle for Code Mode
- Feature list showing everything Code Mode controls

## Implementation Details

### Central Contribution: `sandtableCodeMode.contribution.ts`

The `SandtableCodeModeContribution` class is the central controller. It:
1. Reads `sandtable.codeMode.enabled` on startup
2. Binds the `sandtable.codeModeEnabled` context key via `IContextKeyService`
3. Watches for configuration changes and updates the context key
4. Applies research-friendly editor defaults when Code Mode is OFF
5. Removes research overrides when Code Mode is turned ON (only if the values match what it set -- never overrides explicit user choices)
6. Shows a status bar toggle button: `$(book) Research Mode` or `$(tools) Code Mode`
7. Registers `sandtable.toggleCodeMode` command with `Ctrl+Shift+M` keybinding (also in Command Palette)

### PaneCompositeBar Integration: `paneCompositeBar.ts`

The `shouldBeHidden()` method in `PaneCompositeBar` was modified to check Code Mode state for a static set of container IDs. This is a single change point that handles all Activity Bar and Panel container visibility:

- A static `SANDTABLE_CODE_MODE_CONTAINERS` set lists all container IDs to hide
- `shouldBeHidden()` returns `true` for these containers when Code Mode is disabled
- `onDidCodeModeChange()` re-evaluates visibility for all affected containers when the setting changes
- `IConfigurationService` was added as a constructor parameter (injected via DI)

### Menu `when` Clauses

Menu items use the `sandtable.codeModeEnabled` context key in their `when` clauses:
- `ContextKeyExpr.has('sandtable.codeModeEnabled')` for standalone conditions
- `ContextKeyExpr.and(existingCondition, ContextKeyExpr.has('sandtable.codeModeEnabled'))` when combining with existing conditions

### Status Bar Gating: `editorStatus.ts`

Four `update*Element()` methods in the `EditorStatus` class check `CodeModeConfigKeys.Enabled` via `IConfigurationService`. When Code Mode is OFF, they call `.clear()` on their respective status bar elements and return early.

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/vs/workbench/contrib/sandtableCodeMode/browser/sandtableCodeMode.contribution.ts` | Central Code Mode controller: context key, research defaults, logging |

### Modified Files

| File | What Changed |
|------|-------------|
| `src/vs/platform/cortex/common/cortexConfiguration.ts` | Added `CodeModeConfigKeys` enum and `sandtable.codeMode.enabled` setting registration |
| `src/vs/workbench/workbench.common.main.ts` | Added import for `sandtableCodeMode.contribution.js` |
| `src/vs/workbench/browser/parts/paneCompositeBar.ts` | Added `SANDTABLE_CODE_MODE_CONTAINERS`, modified `shouldBeHidden()`, added `onDidCodeModeChange()`, added `IConfigurationService` to constructor |
| `src/vs/workbench/browser/parts/activitybar/activitybarPart.ts` | Passed `configurationService` to `super()` call in `ActivityBarCompositeBar` |
| `src/vs/workbench/contrib/debug/browser/debug.contribution.ts` | Added `when: sandtable.codeModeEnabled` to Run menu top-level registration |
| `src/vs/workbench/contrib/tasks/browser/task.contribution.ts` | Added `sandtable.codeModeEnabled` to all Terminal > Tasks menu items |
| `src/vs/editor/contrib/gotoSymbol/browser/goToCommands.ts` | Added `when: sandtable.codeModeEnabled` to Go to Definition/Declaration/Type/Implementations/References (both MenubarGoMenu and EditorContext) |
| `src/vs/workbench/browser/parts/editor/editorStatus.ts` | Added Code Mode check to `updateIndentationElement`, `updateEncodingElement`, `updateEOLElement`, `updateLanguageIdElement`; added config change listener |
| `src/vs/workbench/contrib/welcomeGettingStarted/common/gettingStartedContent.ts` | Replaced all walkthroughs and start entries with Sandtable content; removed Copilot code; removed `product` import |
| `src/vs/workbench/contrib/files/browser/explorerViewlet.ts` | Renamed "Explorer" to "Workspace" |
| `src/vs/workbench/browser/actions/helpActions.ts` | Removed VS Code-specific Help menu items; added "Sandtable Settings" entry |
| `product.json` | Cleared `defaultChatAgent` to empty stubs; cleared `trustedExtensionAuthAccess` |
| `src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettingsPage.ts` | Added `codeMode` section with toggle and feature list; added `CodeModeConfigKeys` import |
| `src/vs/editor/contrib/rename/browser/rename.ts` | Added `when: sandtable.codeModeEnabled` to Rename Symbol editor context menu |
| `src/vs/editor/contrib/codeAction/browser/codeActionCommands.ts` | Added `sandtable.codeModeEnabled` to Refactor and Source Action editor context menus |
| `src/vs/editor/contrib/gotoError/browser/gotoError.ts` | Added `when: sandtable.codeModeEnabled` to Go > Next/Previous Problem menu items |
| `src/vs/workbench/contrib/scm/browser/quickDiffWidget.ts` | Added `when: sandtable.codeModeEnabled` to Go > Next/Previous Change menu items |
| `src/vs/workbench/services/accounts/browser/defaultAccount.ts` | Added `EMPTY_DEFAULT_ACCOUNT_CONFIG` and null guards in `toDefaultAccountConfig()` |
| `src/vs/workbench/contrib/files/browser/fileCommands.ts` | New File defaults to Markdown when Code Mode OFF (both `newUntitledFile` and `newFile` commands) |
| `src/vs/workbench/contrib/tasks/browser/task.contribution.ts` | All 15 task Command Palette entries gated behind `sandtableTaskPaletteWhen` |

## Known Issues

### ~~product.json `defaultChatAgent` Must Not Be Removed~~ (FIXED)

The `DefaultAccountService` now has null guards via `EMPTY_DEFAULT_ACCOUNT_CONFIG` in `toDefaultAccountConfig()`. The `defaultChatAgent` section has been removed from `product.json` entirely. If `defaultChatAgent` is missing or has empty string values, the service gracefully falls back to an inert configuration with no authentication provider lookups.

### First-Launch State Caching

VS Code caches the initial state of view containers (Activity Bar items) in local storage. If Sandtable was previously launched with Code Mode ON, those containers may remain cached as "visible" even after Code Mode is turned OFF. The `shouldBeHidden()` override in `PaneCompositeBar` handles this correctly, but clearing `~/.sandtable/` storage may be needed if stale state persists during development.

### Keybinding Conflict Resolution

The Code Mode toggle was initially assigned `Ctrl+Shift+M`, but this conflicts with VS Code's "Toggle Problems Panel" (`workbench.actions.view.problems` in `markers.contribution.ts`). Changed to `Shift+Alt+M` which is completely unused in the VS Code keybinding space. Verified via codebase-wide search.
