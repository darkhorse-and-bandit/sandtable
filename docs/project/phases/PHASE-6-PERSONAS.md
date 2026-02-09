# Phase 6: Agent Personas and Roleplay System

**Status:** Complete (IDE-side implementation)
**Completed:** 2026-02-08
**Dependencies:** Phase 4 (Agent Mode), Phase 4.5 (Multi-Provider)

---

## Overview

Phase 6 introduces the Agent Persona system -- the feature that transforms Sandtable from "VS Code with chat" into a research and wargaming tool. Personas are named, saveable configurations that customize the chat agent's behavior with tailored system prompts, model preferences, and inference parameters.

## Architecture

### Persona Data Model

```typescript
// src/vs/platform/cortex/common/personaTypes.ts
interface ICuratedPersona {
    id: string;          // UUID
    name: string;        // "Red Team Commander"
    role: string;        // "Adversarial Analyst"
    systemPrompt: string;
    model?: string;      // Compound model ID
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    guidelines?: string;
    icon?: string;       // Codicon name
    isBuiltIn?: boolean;
    createdAt?: string;
    updatedAt?: string;
}
```

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sandtable.personas` | array | `[]` | Array of persona configurations. When empty, built-in templates are loaded |
| `sandtable.activePersona` | string | `""` | ID of the currently active persona |

### Data Flow

```
User selects persona via:
  - Agent Portfolio panel (Activity Bar sidebar)
  - Chat input persona picker (person icon next to send button)
  - Status bar persona indicator (bottom right)
  - Quick-pick via Command Palette ("Sandtable: Select Persona")
  - LLM tool (user asks AI to create a persona → sandtable_create_persona tool)

  → configurationService.updateValue(PersonaConfigKeys.ActivePersona, personaId)
  → Status bar updates to show active persona name
  → Chat input persona icon reflects active persona
  → Chat agent reads active persona on each request:
    → buildMessages(): uses persona's system prompt + guidelines
    → resolveModelId(): prefers persona's model over default
    → runToolLoop(): applies persona's temperature, topP, maxTokens
```

## File Structure

```
src/vs/platform/cortex/common/
    personaTypes.ts                  # ICuratedPersona interface + BUILTIN_PERSONAS + generatePersonaId()
    cortexConfiguration.ts           # PersonaConfigKeys enum + settings registration

src/vs/workbench/contrib/sandtablePersonas/
    browser/
        sandtablePersonas.contribution.ts   # ViewContainer (Activity Bar), status bar, quick-pick, chat input button
        sandtablePersonasPanel.ts           # Agent Portfolio panel (ViewPane with full CRUD)
        sandtablePersonas.css               # Panel styles

src/vs/workbench/contrib/sandtableLM/
    browser/
        sandtableChatAgent.ts        # Persona integration (resolveActivePersona, system prompt, model, params)
        sandtableTools.ts            # sandtable_create_persona tool (AI-assisted persona creation)
```

## Task Breakdown

### 6.1 Persona Schema and Settings

- [x] Define `ICuratedPersona` interface in `personaTypes.ts`
- [x] Define 5 built-in persona templates in `BUILTIN_PERSONAS` array
- [x] Add `PersonaConfigKeys` enum to `cortexConfiguration.ts`
- [x] Register `sandtable.personas` array setting with full JSON schema
- [x] Register `sandtable.activePersona` string setting
- [x] `npm run compile` passes with 0 errors

### 6.2 Built-in Persona Templates

- [x] Research Analyst -- structured analysis, citation-focused (temp: 0.5)
- [x] Red Team Commander -- adversarial thinking, doctrine-aware (temp: 0.8)
- [x] Blue Team Defender -- defensive posture, risk mitigation (temp: 0.6)
- [x] Exercise Facilitator -- neutral, tracks objectives (temp: 0.4)
- [x] Subject Matter Expert -- deep expertise, source references (temp: 0.7)

### 6.3 Agent Portfolio Panel (Activity Bar)

- [x] `SandtablePersonasPanel` ViewPane with full CRUD (create, edit, duplicate, delete, import, export)
- [x] ViewContainer registered with `Codicon.organization` in Activity Bar sidebar
- [x] Active persona banner with Clear button
- [x] Persona card list with icon, name, role, badges, tags, prompt preview, action buttons
- [x] Inline create/edit form with all fields
- [x] Built-in badge for template personas (cannot delete, can duplicate)
- [x] Import/export personas as JSON files
- [x] `sandtable.openAgentPortfolio` command in Command Palette
- [x] Dedicated CSS in `sandtablePersonas.css`
- [x] Persona CRUD removed from Sandtable Settings page (replaced with redirect placeholder)
- [x] `npm run compile` passes with 0 errors

### 6.4 Persona Selection (Multiple Access Points)

- [x] Status bar item showing active persona name (or "No Persona") -- click opens quick-pick
- [x] Chat input persona picker button (`MenuId.ChatInputSide`) -- person icon next to send button
- [x] Quick-pick shows icon, name, role, and system prompt preview
- [x] "No Persona" option clears active persona
- [x] `sandtable.selectPersona` command registered in Command Palette
- [x] Registered contribution in `workbench.common.main.ts`
- [x] `npm run compile` passes with 0 errors

### 6.5 Chat Agent Persona Integration

- [x] `resolveActivePersona()` method reads active persona from configuration
- [x] `buildMessages()` uses persona's system prompt instead of default
- [x] Persona's behavioral guidelines appended to system prompt
- [x] `resolveModelId()` considers persona's preferred model (priority: user-selected > persona > default > first available)
- [x] `runToolLoop()` applies persona's temperature, top_p, and max_tokens overrides
- [x] `npm run compile` passes with 0 errors

### 6.6 AI-Assisted Persona Creation Tool

- [x] `sandtable_create_persona` tool registered with `ILanguageModelToolsService`
- [x] Tool accepts name, role, systemPrompt, guidelines, temperature, topP, maxTokens, icon
- [x] Validates inputs and generates UUID + timestamps
- [x] Saves persona to `sandtable.personas` configuration
- [x] Returns formatted markdown summary card with persona details
- [x] Users can ask the AI to "create a persona" and the LLM drafts all fields
- [x] `npm run compile` passes with 0 errors

### 6.7 Additional Stabilization Work (Track 1)

- [x] `run_command` tool implemented via `ITerminalService` with shell integration output capture and basic fallback
- [x] Edit mode (`ChatModeKind.Edit`) added to agent's supported modes
- [x] Mode instructions (`modeInstructions.content`) appended to system prompt in Edit mode
- [x] `npm run compile` passes with 0 errors

## Testing Checklist

- [ ] Agent Portfolio panel opens from Activity Bar (organization icon)
- [ ] 5 built-in personas load automatically on first visit
- [ ] Can create a new custom persona via the form
- [ ] Can edit an existing persona
- [ ] Can duplicate a built-in persona (gets a new ID, loses built-in badge)
- [ ] Cannot delete a built-in persona (delete button absent)
- [ ] Can delete a custom persona (with confirmation dialog)
- [ ] Active persona indicator shows in status bar
- [ ] Person icon appears in chat input toolbar -- opens quick-pick
- [ ] Quick-pick lists all personas with details
- [ ] Selecting a persona updates status bar and chat panel
- [ ] Chat agent uses persona's system prompt when active
- [ ] Chat agent uses persona's preferred model when active
- [ ] Chat agent applies persona's temperature/topP/maxTokens when active
- [ ] Clearing active persona reverts to default behavior
- [ ] Export all personas to JSON works
- [ ] Import personas from JSON works
- [ ] Ask AI "Create a cybersecurity red team persona" -- tool creates and saves persona
- [ ] Settings page Personas section shows redirect to Agent Portfolio
- [ ] `run_command` tool executes commands and captures output
- [ ] Edit mode appears in mode picker and applies mode instructions

## Future Enhancements (Phase 6+)

- Multi-agent conversations (multiple personas in a single session)
- Persona knowledge sources (linked documents for RAG context)
- Persona-specific tool filtering (restrict which tools a persona can use)
- Conversation starters per persona (suggested first messages)
- Persona templates marketplace (import from a curated library)
