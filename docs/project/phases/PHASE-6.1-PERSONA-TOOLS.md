# Phase 6.1: Full Persona CRUD Tools + Advanced Persona Tool Capabilities

**Status:** Complete
**Completed:** 2026-02-09
**Dependencies:** Phase 6 (Agent Personas -- Complete), Phase 4 (Agent Mode -- Complete)
**Branch:** `sandtable/main`
**Platform:** Arch Linux, Node.js 22.21.1 via mise

---

## Context: What Is Sandtable?

Sandtable is a fork of Microsoft VS Code (pinned to v1.109.0) being transformed from a code-centric IDE into an **AI-powered research, analysis, and scenario simulation workspace**. The target audience is defense analysts, intelligence researchers, wargame facilitators, and policy planners who need AI tools that run **fully offline on self-hosted infrastructure** -- no cloud, no telemetry, suitable for air-gapped and classified environments.

The LLM backend is **Cortex** -- our team's FastAPI gateway that manages vLLM and llama.cpp inference engines. Additional OpenAI-compatible providers (Ollama, LM Studio, cloud APIs) can be configured as secondary sources. All inference is routed through an `IProviderRegistryService` that manages multi-provider connections.

**Key documents to read first:**
- `docs/project/PROJECT-CHARTER.md` -- Vision, mission, audience
- `docs/project/ARCHITECTURE.md` -- Technical architecture, interfaces, file structure
- `docs/project/PROGRESS.md` -- Living checklist, single source of truth for status
- `docs/project/phases/PHASE-6-PERSONAS.md` -- Phase 6 plan (Agent Personas)

---

## Context: The Agent Persona System (Phase 6 -- Complete)

The persona system is the feature that transforms Sandtable from "VS Code with chat" into a research and wargaming tool. Personas are named, saveable configurations that customize the chat agent's behavior with tailored system prompts, model preferences, and inference parameters.

### Persona Data Model

```typescript
// src/vs/platform/cortex/common/personaTypes.ts
interface ICuratedPersona {
    id: string;          // UUID
    name: string;        // "Red Team Commander"
    role: string;        // "Adversarial Analyst"
    systemPrompt: string;
    model?: string;      // Compound model ID (e.g., "cortex::deepseek-v3")
    temperature?: number; // 0.0-2.0
    topP?: number;       // 0.0-1.0
    maxTokens?: number;
    guidelines?: string; // Behavioral rules appended to system prompt
    icon?: string;       // Codicon name (shield, telescope, beaker, etc.)
    isBuiltIn?: boolean; // True for the 5 built-in templates (cannot delete)
    createdAt?: string;  // ISO 8601
    updatedAt?: string;  // ISO 8601
}
```

### Settings (Configuration Keys)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sandtable.personas` | array | `[]` | Array of persona configurations. When empty, 5 built-in templates auto-load |
| `sandtable.activePersona` | string | `""` | ID of the currently active persona |

These are defined as a `const enum` in `src/vs/platform/cortex/common/cortexConfiguration.ts`:

```typescript
export const enum PersonaConfigKeys {
    Personas = 'sandtable.personas',
    ActivePersona = 'sandtable.activePersona',
}
```

**Important:** `PersonaConfigKeys` is a `const enum`, so values are inlined at compile time. All consumer files reference `PersonaConfigKeys.Personas` and `PersonaConfigKeys.ActivePersona` -- the actual string values are never hardcoded in consumer files.

### Built-in Persona Templates (5 total)

Defined in `BUILTIN_PERSONAS` array in `personaTypes.ts`:

1. **Research Analyst** (`builtin-research-analyst`) -- Structured analysis, citations, SWOT/PESTLE/ACH frameworks (temp: 0.5)
2. **Red Team Commander** (`builtin-red-team-commander`) -- Adversarial thinking, vulnerability identification, doctrine-aware (temp: 0.8)
3. **Blue Team Defender** (`builtin-blue-team-defender`) -- Defensive posture, risk mitigation, defense-in-depth (temp: 0.6)
4. **Exercise Facilitator** (`builtin-exercise-facilitator`) -- Neutral moderator, tracks objectives, manages scenario timeline (temp: 0.4)
5. **Subject Matter Expert** (`builtin-subject-matter-expert`) -- Deep domain expertise, references standards and literature (temp: 0.7)

### UI Entry Points (3 ways to activate a persona)

1. **Agent Portfolio panel** -- Activity Bar sidebar panel (Codicon.organization icon) with full CRUD. Each persona card has an "Activate" button.
2. **Chat input persona picker** -- A person icon button in the Chat panel's input toolbar that opens a quick-pick list.
3. **Status bar indicator** -- Bottom-right of the window shows the active persona name. Clicking opens the same quick-pick.

All three call `configurationService.updateValue(PersonaConfigKeys.ActivePersona, personaId, ConfigurationTarget.USER)`.

### How the Chat Agent Uses Personas

In `src/vs/workbench/contrib/sandtableLM/browser/sandtableChatAgent.ts`, the `SandtableChatAgentImpl` class:

1. **`resolveActivePersona()`** -- Reads `PersonaConfigKeys.ActivePersona` from config, finds the matching persona in the stored array (or built-ins).
2. **`buildMessages()`** -- If a persona is active, uses its `systemPrompt` (+ appended `guidelines`) instead of the default system prompt.
3. **`resolveModelId()`** -- Priority chain: user-selected model > persona's preferred model > configured default > first available model.
4. **`runToolLoop()`** -- Applies persona's `temperature`, `topP`, and `maxTokens` overrides to each LLM request.

### Key Source Files

| File | Purpose |
|------|---------|
| `src/vs/platform/cortex/common/personaTypes.ts` | `ICuratedPersona` interface, `BUILTIN_PERSONAS`, `generatePersonaId()` |
| `src/vs/platform/cortex/common/cortexConfiguration.ts` | `PersonaConfigKeys` enum, settings registration |
| `src/vs/workbench/contrib/sandtablePersonas/browser/sandtablePersonas.contribution.ts` | ViewContainer, status bar item, quick-pick command, chat input button |
| `src/vs/workbench/contrib/sandtablePersonas/browser/sandtablePersonasPanel.ts` | Agent Portfolio panel with full CRUD UI |
| `src/vs/workbench/contrib/sandtableLM/browser/sandtableChatAgent.ts` | Chat agent that reads persona and applies system prompt/model/temperature |
| `src/vs/workbench/contrib/sandtableLM/browser/sandtableTools.ts` | **All tool definitions and implementations live here** |

---

## Context: The Tool System

Sandtable's chat agent has access to tools via VS Code's `ILanguageModelToolsService`. Tools are registered as workbench contributions and are available to the agent in Agent mode (the full autonomous tool-calling loop).

### How Tools Work

1. Tools are defined as `IToolData` objects (metadata: id, description, input schema) paired with `IToolImpl` classes (the actual execution logic).
2. Both are registered in `SandtableToolsContribution` (a workbench contribution in `sandtableTools.ts`).
3. The chat agent's `collectTools()` method gathers all registered tools and converts them to OpenAI-compatible function-calling format.
4. The agent's `runToolLoop()` sends tools to the LLM, detects `tool_use` responses, invokes the matching tool via `toolsService.invokeTool()`, feeds results back, and repeats (max 15 iterations).

### Currently Registered Tools (7 total)

| Tool ID | Description | Workspace? |
|---------|-------------|-----------|
| `sandtable_read_file` | Read file contents with optional line range | Yes |
| `sandtable_edit_file` | Find-and-replace text in a file | Yes |
| `sandtable_create_file` | Create a new file with given contents | Yes |
| `sandtable_run_command` | Execute shell command in terminal | Yes |
| `sandtable_search_files` | Regex search across workspace files | Yes |
| `sandtable_list_directory` | List files/directories at a path | Yes |
| `sandtable_create_persona` | Create a new agent persona (AI-assisted) | No |

### Tool Implementation Pattern

Every tool follows this pattern in `sandtableTools.ts`:

```typescript
// 1. Define tool metadata (IToolData)
const myToolData: IToolData = {
    id: 'sandtable_my_tool',
    source: SANDTABLE_TOOL_SOURCE,  // { type: 'internal', label: 'Sandtable' }
    displayName: 'My Tool',
    modelDescription: 'Description the LLM sees to decide when to call this tool.',
    inputSchema: {
        type: 'object',
        properties: {
            param1: { type: 'string', description: 'What this param is for' },
        },
        required: ['param1'],
    },
    canBeReferencedInPrompt: true,
    runsInWorkspace: false,  // true if it reads/writes workspace files
};

// 2. Implement the tool (IToolImpl)
class MyTool implements IToolImpl {
    constructor(
        private readonly configurationService: IConfigurationService,
        private readonly logService: ILogService,
    ) { }

    async invoke(
        invocation: IToolInvocation,
        _countTokens: CountTokensCallback,
        _progress: ToolProgress,
        _token: CancellationToken
    ): Promise<IToolResult> {
        const { param1 } = invocation.parameters as { param1: string };
        // ... do work ...
        return textResult('Result text the LLM will see');
        // or: return errorResult('Error message');
    }
}

// 3. Register in SandtableToolsContribution constructor
this._register(this.toolsService.registerTool(
    myToolData,
    new MyTool(this.configurationService, this.logService)
));
```

### Helper Functions

```typescript
function textResult(value: string): IToolResult {
    return { content: [{ kind: 'text', value }] };
}

function errorResult(message: string): IToolResult {
    return { content: [{ kind: 'text', value: `Error: ${message}` }], toolResultError: message };
}
```

### Services Available in SandtableToolsContribution

The contribution class already injects these services (available for any new tool):

- `ILanguageModelToolsService` -- Tool registration
- `IFileService` -- Read/write/resolve files
- `IWorkspaceContextService` -- Workspace folders, paths
- `ISearchService` -- Text search across files (ripgrep-backed)
- `ITerminalService` -- Terminal creation and command execution
- `IConfigurationService` -- Read/write VS Code settings (where personas are stored)
- `ILogService` -- Logging

---

## The Feature: Full Persona CRUD Tools

Currently, the only persona-related tool is `sandtable_create_persona`. The user can ask the AI to create a persona, and the LLM drafts all fields and saves it. But the agent cannot **list**, **view**, **edit**, **delete**, or **activate** personas via tool calls. This means the agent is blind to what personas exist and cannot manage them conversationally.

### Required New Tools

Implement the following tools in `src/vs/workbench/contrib/sandtableLM/browser/sandtableTools.ts`, following the existing patterns:

#### 1. `sandtable_list_personas` -- List all available personas

The agent needs to see what personas exist. This is the "Read" in CRUD for the collection.

- **Returns:** A formatted list of all personas (stored + built-in fallback), showing: id, name, role, icon, isBuiltIn, temperature, and whether each is the currently active persona.
- **No parameters required.**
- **The model description should tell the LLM to use this tool when the user asks things like:** "What personas are available?", "Show me my agents", "List all personas", "Who can I talk to?"

#### 2. `sandtable_get_persona` -- Get full details of a specific persona

The agent needs to inspect a single persona in detail before editing it.

- **Parameters:** `id` (string, required) -- The persona ID. Also accept `name` (string, optional) as a fuzzy lookup alternative (case-insensitive partial match).
- **Returns:** Full persona details including the complete system prompt text, all parameters, timestamps, and whether it's the active persona.
- **The model description should tell the LLM to use this when the user wants to see the full details or system prompt of a specific persona.**

#### 3. `sandtable_edit_persona` -- Update an existing persona's fields

The agent should be able to modify any mutable field on a persona. Built-in personas can be edited (their `isBuiltIn` flag and `id` should not change).

- **Parameters:** `id` (string, required) -- The persona to edit. Plus optional fields: `name`, `role`, `systemPrompt`, `guidelines`, `temperature`, `topP`, `maxTokens`, `icon`, `model`.
- **Only the provided fields are updated** -- omitted fields remain unchanged.
- **Updates the `updatedAt` timestamp.**
- **Saves the updated personas array back to configuration.**
- **Returns:** A summary of what changed.
- **The model description should tell the LLM to use this when the user says things like:** "Change the Red Team Commander's temperature to 0.9", "Update the research analyst's system prompt", "Make the facilitator more creative".

#### 4. `sandtable_delete_persona` -- Delete a persona

- **Parameters:** `id` (string, required) -- The persona to delete.
- **Validation:** Cannot delete built-in personas (`isBuiltIn: true`). Return a clear error if attempted.
- **Side effect:** If the deleted persona was the active persona, clear `PersonaConfigKeys.ActivePersona` to `''`.
- **Returns:** Confirmation message with the deleted persona's name.

#### 5. `sandtable_activate_persona` -- Activate or deactivate a persona

The agent should be able to switch the active persona conversationally. This is the tool-call equivalent of clicking "Activate" in the UI.

- **Parameters:** `id` (string, optional) -- The persona to activate. If empty/omitted/null, deactivate the current persona (set to `''`).
- **Validation:** The persona ID must exist in the stored personas or built-ins.
- **Writes to:** `PersonaConfigKeys.ActivePersona` via `configurationService.updateValue()`.
- **Returns:** Confirmation message like "Activated persona: Red Team Commander" or "Deactivated persona. Using default settings."
- **The model description should tell the LLM to use this when the user says things like:** "Switch to the Red Team Commander", "Use the research analyst", "Activate the exercise facilitator", "Go back to default", "Deactivate the persona", "Stop using a persona".

### Implementation Notes

- All 5 new tools go in `sandtableTools.ts`, following the exact same pattern as the existing 7 tools.
- Update the `SandtableToolsContribution` constructor to register all new tools.
- Update the log message at the end: `'N workspace tools registered'` with the new count.
- The `getPersonas()` helper pattern is already established in `sandtablePersonas.contribution.ts` and `sandtablePersonasPanel.ts`: read the stored array, fall back to `BUILTIN_PERSONAS` if empty. Reuse this pattern in your tool implementations.
- For the `sandtable_create_persona` tool that already exists: no changes needed. It already works correctly.
- `runsInWorkspace: false` for all persona tools (they operate on settings, not workspace files).

---

## Stretch Goal: Advanced Persona Tool Capabilities

Beyond basic CRUD, think about what other powerful tool-calling capabilities could exist around the persona system. These are ideas for you to evaluate, prioritize, and potentially implement. Consider which ones add the most value for Sandtable's research and wargaming audience.

### Ideas to Consider

**Persona Duplication and Variation:**
- A tool that duplicates an existing persona with modifications -- "Create a version of Red Team Commander that focuses on cyber attacks" -- should the agent be able to clone-and-modify in a single tool call?

**Persona Import/Export via Chat:**
- Tools that let the agent export personas to a JSON string (for the user to copy/save) or import from a JSON string pasted into chat. The UI already supports file-based import/export, but chat-based exchange would let users share personas conversationally.

**Active Persona Introspection:**
- A tool that returns the currently active persona's full details without requiring the user to know its ID. The LLM could use this to understand its own current configuration -- "What persona am I using right now?" This creates a self-aware agent that can reason about its own behavioral parameters.

**Persona Recommendation:**
- A tool (or enhancement to `sandtable_list_personas`) that, given a user's description of what they need ("I need someone to stress-test our evacuation plan"), returns a ranked recommendation of which existing personas best fit, or suggests creating a new one. This turns the persona system into an intelligent agent broker.

**Bulk Operations:**
- Could the agent reset all personas to defaults? Could it batch-activate a sequence of personas for a multi-perspective analysis workflow?

**Persona-Aware Conversation Handoff:**
- Could a tool let the agent "hand off" the conversation to a different persona mid-chat? For example: "Let me bring in the Blue Team Defender to respond to those vulnerabilities." The tool would activate a new persona and the next response would use that persona's system prompt. Think about how this interacts with the existing `resolveActivePersona()` flow in the chat agent.

**What else?** You have deep context on the tool system, the persona data model, and the VS Code configuration service. What other tool-calling patterns would be powerful for a research and wargaming platform? Think about multi-agent workflows, scenario orchestration, and persona-as-a-service patterns.

---

## Build and Test

```bash
cd /home/mage/repos/MAGEIDE
npm run compile    # Must show 0 errors
./scripts/code.sh  # Launch the app to test
```

### Testing Checklist

- [x] `sandtable_list_personas` -- Ask "What personas are available?" in Agent mode, verify tool returns all personas
- [x] `sandtable_get_persona` -- Ask "Show me the Red Team Commander's full prompt", verify complete details returned
- [x] `sandtable_get_persona` -- Test fuzzy name lookup: "Show me details for the research analyst"
- [x] `sandtable_edit_persona` -- Ask "Change the Exercise Facilitator's temperature to 0.6", verify field updated
- [x] `sandtable_edit_persona` -- Verify `updatedAt` timestamp changes
- [x] `sandtable_delete_persona` -- Create a custom persona, then ask the agent to delete it. Verify it's gone.
- [x] `sandtable_delete_persona` -- Try to delete a built-in persona. Verify clear error message.
- [x] `sandtable_delete_persona` -- Delete the active persona. Verify active persona clears to none.
- [x] `sandtable_activate_persona` -- Ask "Switch to the Red Team Commander", verify status bar updates
- [x] `sandtable_activate_persona` -- Ask "Go back to default", verify persona deactivates
- [x] `sandtable_create_persona` (existing) -- Still works: "Create a cybersecurity persona"
- [x] Multi-tool flow -- "List my personas, then activate the research analyst" (agent chains list + activate)
- [x] Multi-tool flow -- "Show me the Blue Team Defender's prompt and make it more aggressive" (get + edit)
- [x] `npm run compile` passes with 0 errors
