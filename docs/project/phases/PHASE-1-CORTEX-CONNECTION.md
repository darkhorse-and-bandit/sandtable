# Phase 1: Cortex Connection + Chat Panel

**Duration:** 10-14 days
**Dependencies:** Phase 0 complete (Sandtable builds and launches)
**Cortex changes required:** CORS configuration for Electron origin

## Objective

Build the platform service layer that connects Sandtable to Cortex, then create a native chat panel in the workbench sidebar that supports streaming conversations with models running on Cortex.

## Task Breakdown

### Task 1.1: Create Platform Service Directory Structure

Create the following files (all initially empty or with minimal boilerplate):

```
src/vs/platform/cortex/
  common/
    cortex.ts                    # ICortexService interface + all types
    cortexClient.ts              # HTTP client (fetch + SSE)
    cortexConfiguration.ts       # Settings schema
  browser/
    cortexService.ts             # Browser-side implementation
```

### Task 1.2: Define ICortexService Interface

File: `src/vs/platform/cortex/common/cortex.ts`

This defines the complete service interface and all associated types. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full interface definition.

Key design decisions:
- Service is created using `createDecorator<ICortexService>('cortexService')` following VS Code's DI pattern
- All methods return Promises (async by default)
- Streaming methods accept a callback function and a `CancellationToken`
- Connection status is exposed as an event (`onConnectionStatusChanged`)

### Task 1.3: Implement CortexClient

File: `src/vs/platform/cortex/common/cortexClient.ts`

The HTTP client that makes actual network calls to Cortex. Key methods:

**Non-streaming request:**
```typescript
async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
            ...(this.sessionCookie ? { 'Cookie': `cortex_session=${this.sessionCookie}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.abortSignal,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new CortexApiError(response.status, error.error?.message || 'Unknown error');
    }

    return response.json();
}
```

**SSE streaming:**

The streaming implementation uses `ReadableStream` with manual SSE line parsing. This follows the same pattern that Cortex's own frontend uses in `lib/chat-client.ts` -- no external dependencies (no EventSource polyfill, no LangChain).

Key behaviors:
- Parses `data:` lines from the SSE stream
- Handles `[DONE]` sentinel
- Accumulates partial JSON across chunk boundaries (buffering)
- Supports cancellation via `AbortController`
- Emits tokens via callback as they arrive

### Task 1.4: Register Settings

File: `src/vs/platform/cortex/common/cortexConfiguration.ts`

Register settings using VS Code's configuration registry:

```typescript
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
    id: 'mage',
    title: 'MAGE',
    type: 'object',
    properties: {
        'sandtable.cortex.endpoint': {
            type: 'string',
            default: 'http://localhost:8084',
            description: 'URL of the Cortex gateway (e.g., http://192.168.1.100:8084)',
        },
        'sandtable.cortex.apiKey': {
            type: 'string',
            default: '',
            description: 'API key for authenticating with Cortex inference endpoints',
        },
        'sandtable.cortex.username': {
            type: 'string',
            default: 'admin',
            description: 'Username for Cortex admin session authentication',
        },
        'sandtable.cortex.password': {
            type: 'string',
            default: '',
            description: 'Password for Cortex admin session authentication',
        },
        'sandtable.cortex.healthCheckIntervalMs': {
            type: 'number',
            default: 15000,
            description: 'How often to poll Cortex health status (in milliseconds)',
        },
        'sandtable.chat.defaultModel': {
            type: 'string',
            default: '',
            description: 'Default model for chat (empty = auto-detect first running model)',
        },
        'sandtable.chat.streamingEnabled': {
            type: 'boolean',
            default: true,
            description: 'Enable streaming responses in chat',
        },
        'sandtable.chat.systemPrompt': {
            type: 'string',
            default: 'You are a helpful coding assistant.',
            description: 'System prompt sent with every chat request',
        },
        'sandtable.chat.maxTokens': {
            type: 'number',
            default: 2048,
            description: 'Maximum tokens in chat responses',
        },
        'sandtable.chat.temperature': {
            type: 'number',
            default: 0.7,
            description: 'Temperature for chat responses (0.0 = deterministic, 1.0 = creative)',
        },
    }
});
```

### Task 1.5: Implement CortexService (Browser)

File: `src/vs/platform/cortex/browser/cortexService.ts`

This is the browser-side implementation of `ICortexService`. It:

1. Reads configuration from VS Code's `IConfigurationService`
2. Creates and manages a `CortexClient` instance
3. Runs a health check polling loop (configurable interval, default 15s)
4. Emits `onConnectionStatusChanged` events
5. Provides all the methods defined in the interface

Service registration:
```typescript
import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { ICortexService } from 'vs/platform/cortex/common/cortex';
import { CortexService } from 'vs/platform/cortex/browser/cortexService';

registerSingleton(ICortexService, CortexService, InstantiationType.Delayed);
```

The service is registered with `InstantiationType.Delayed` so it only instantiates when first requested (lazy loading).

### Task 1.6: Build Status Bar Indicator

Files:
- `src/vs/workbench/contrib/sandtableStatus/browser/sandtableStatus.contribution.ts`
- `src/vs/workbench/contrib/sandtableStatus/browser/sandtableStatusBarItem.ts`

The status bar item shows Cortex connection status in the bottom bar:

| State | Display | Click Action |
|-------|---------|-------------|
| Connected | "Cortex: Connected (3 models)" with green indicator | Opens model selector quick pick |
| Disconnected | "Cortex: Disconnected" with red indicator | Opens settings to `sandtable.cortex.endpoint` |
| Connecting | "Cortex: Connecting..." with spinning indicator | No action |

Implementation uses VS Code's `IStatusbarService`:

```typescript
class SandtableStatusBarContribution extends Disposable implements IWorkbenchContribution {
    static readonly ID = 'workbench.contrib.sandtableStatus';

    private statusBarItem: IStatusbarEntryAccessor;

    constructor(
        @ICortexService private readonly cortexService: ICortexService,
        @IStatusbarService private readonly statusbarService: IStatusbarService,
    ) {
        super();
        this.statusBarItem = this.statusbarService.addEntry(
            this.getEntry(),
            'sandtable.status',
            StatusbarAlignment.LEFT,
            100
        );

        this._register(cortexService.onConnectionStatusChanged(() => {
            this.statusBarItem.update(this.getEntry());
        }));
    }
}
```

Register in `sandtableStatus.contribution.ts`:
```typescript
registerWorkbenchContribution2('workbench.contrib.sandtableStatus', SandtableStatusBarContribution, WorkbenchPhase.AfterRestored);
```

### Task 1.7: Build Chat Panel

Files:
- `src/vs/workbench/contrib/sandtableChat/browser/sandtableChat.contribution.ts`
- `src/vs/workbench/contrib/sandtableChat/browser/sandtableChatViewPane.ts`
- `src/vs/workbench/contrib/sandtableChat/browser/sandtableChatInput.ts`
- `src/vs/workbench/contrib/sandtableChat/browser/sandtableChatMessageList.ts`
- `src/vs/workbench/contrib/sandtableChat/browser/sandtableChatModelSelector.ts`
- `src/vs/workbench/contrib/sandtableChat/browser/sandtableChat.css`

#### View Container Registration

The chat panel registers as a view in the Activity Bar sidebar:

```typescript
// sandtableChat.contribution.ts

const MAGE_CHAT_VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(
    ViewExtensions.ViewContainersRegistry
).registerViewContainer({
    id: 'mage-chat',
    title: 'MAGE Chat',
    icon: Codicon.commentDiscussion,  // Use built-in icon initially
    order: 100,
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
    id: 'sandtable.chatView',
    name: 'Chat',
    containerIcon: Codicon.commentDiscussion,
    canToggleVisibility: true,
    canMoveView: true,
    ctorDescriptor: new SyncDescriptor(SandtableChatViewPane),
}], MAGE_CHAT_VIEW_CONTAINER);
```

#### Chat View Pane

`SandtableChatViewPane` extends `ViewPane` and composes:

1. **Model Selector** (top) -- dropdown showing running models from Cortex
2. **Message List** (middle, scrollable) -- displays conversation with markdown rendering
3. **Input Area** (bottom) -- text input with Send button and Shift+Enter for newlines

Message rendering uses VS Code's built-in `MarkdownRenderer` for:
- Syntax-highlighted code blocks
- Inline code
- Headers, lists, bold/italic
- Links

#### Streaming Display

When a streaming response is in progress:
- Assistant message element is created immediately
- Text is appended to the element as each SSE chunk arrives via the `onToken` callback
- Markdown is re-rendered periodically (not on every token -- batched every 100ms for performance)
- A "Stop" button appears to abort the stream via `AbortController`
- After stream completes, final markdown render and metrics display (tok/s, TTFT)

#### Chat Session Persistence

Uses Cortex's server-side chat session API:
- On panel open: `GET /v1/chat/sessions` to list existing sessions
- Session sidebar shows previous conversations
- New chat: `POST /v1/chat/sessions` with selected model
- Each message: `POST /v1/chat/sessions/{id}/messages` after send/receive
- Delete: `DELETE /v1/chat/sessions/{id}`

This means chat history survives IDE restarts and is accessible from any device on the network.

### Task 1.8: Register All Contributions

Add imports to `src/vs/workbench/workbench.common.main.ts`:

```typescript
// Sandtable contributions
import './contrib/sandtableChat/browser/sandtableChat.contribution';
import './contrib/sandtableStatus/browser/sandtableStatus.contribution';
```

### Task 1.9: Cortex CORS Configuration

Cortex needs to accept requests from the Electron app's origin. Add the Electron origin to Cortex's CORS configuration.

In `docker.compose.dev.yaml` (or via environment variable):

```yaml
CORS_ALLOW_ORIGINS: "http://localhost:3001,http://127.0.0.1:3001,file://,null"
```

The `file://` and `null` origins cover Electron's renderer process which may send requests with a `null` or `file://` origin depending on the protocol.

Alternatively, if using a custom protocol (e.g., `sandtable://`), add that to the CORS list.

## Testing Plan

### Unit Tests

- `CortexClient`: Mock `fetch` responses, verify SSE parsing handles partial chunks, `[DONE]`, and errors
- `CortexService`: Mock `CortexClient`, verify health check polling, connection status events
- Settings: Verify all settings have correct defaults and types

### Integration Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Connection status | Start Sandtable with Cortex running | Status bar shows "Connected" with model count |
| Connection failure | Start Sandtable without Cortex | Status bar shows "Disconnected" |
| Model discovery | Open chat panel | Model selector populated with running models |
| Basic chat | Send "Hello" to GPT-OSS 120B | Streaming response appears in chat |
| Markdown rendering | Ask model to write code | Code block renders with syntax highlighting |
| Session persistence | Chat, close IDE, reopen | Previous session appears in session list |
| Abort streaming | Click "Stop" during response | Stream stops, partial response preserved |

### Manual Testing Checklist

- [ ] Status bar shows correct connection state
- [ ] Chat panel opens from Activity Bar
- [ ] Model selector shows running models
- [ ] Can send a message and see streaming response
- [ ] Markdown with code blocks renders correctly
- [ ] Can start a new chat session
- [ ] Can switch between chat sessions
- [ ] Can delete a chat session
- [ ] "Stop" button aborts streaming
- [ ] Long responses auto-scroll
- [ ] Chat works with GPT-OSS 120B (llama.cpp engine)
- [ ] Chat works with standard vLLM models (if available)

## Definition of Done

Phase 1 is complete when:

1. `ICortexService` is fully implemented and registered as a platform service
2. `CortexClient` handles both request/response and SSE streaming
3. All `sandtable.cortex.*` and `sandtable.chat.*` settings are registered and functional
4. Status bar indicator shows real-time Cortex connection status
5. Chat panel opens from Activity Bar with model selector
6. Streaming chat conversation works with GPT-OSS 120B via Cortex
7. Chat sessions persist server-side and survive IDE restart
8. All contributions registered in `workbench.common.main.ts`
