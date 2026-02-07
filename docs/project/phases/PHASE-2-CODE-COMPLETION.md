# Phase 2: Inline Code Completion

**Duration:** 10-14 days
**Dependencies:** Phase 1 complete (needs `ICortexService`)
**Cortex changes required:** `POST /v1/fim/completions` endpoint (see [CORTEX-ENHANCEMENTS.md](../CORTEX-ENHANCEMENTS.md))

## Objective

Implement ghost text code suggestions (inline completions) powered by models running on Cortex, using Fill-in-the-Middle (FIM) prompting. When a user pauses typing, the IDE sends the code context (prefix and suffix around the cursor) to Cortex, which returns a completion displayed as dimmed ghost text.

## Fill-in-the-Middle (FIM) Background

FIM is a technique where a model is given text before the cursor (prefix) and text after the cursor (suffix), and generates what should go in between. This is far superior to simple text completion for code because it understands the surrounding context.

### FIM Token Formats by Model Family

Different model families use different special tokens for FIM:

| Model Family | Prefix Token | Suffix Token | Middle Token | Example Models |
|-------------|-------------|-------------|-------------|----------------|
| Codestral (Mistral) | `[SUFFIX]...[PREFIX]` | (reversed order) | `[MIDDLE]` | Codestral 22B |
| DeepSeek Coder | `<fim_prefix>` | `<fim_suffix>` | `<fim_middle>` | DeepSeek Coder V2 |
| StarCoder | `<fim_prefix>` | `<fim_suffix>` | `<fim_middle>` | StarCoder2 3B/15B |
| CodeLlama | `<PRE>` | `<SUF>` | `<MID>` | CodeLlama 7B/34B |
| Qwen Coder | `<fim_prefix>` | `<fim_suffix>` | `<fim_middle>` | Qwen3-Coder |

The Cortex FIM endpoint handles this templating server-side so the IDE just sends raw prefix/suffix text.

### llama.cpp Native FIM

For llama.cpp models (including GPT-OSS), llama.cpp provides a native `/infill` endpoint that handles FIM internally. The Cortex FIM endpoint will proxy to this for llama.cpp-backed models.

## Task Breakdown

### Task 2.1: Cortex FIM Endpoint (Cortex Side)

See [CORTEX-ENHANCEMENTS.md](../CORTEX-ENHANCEMENTS.md) for the complete specification of `POST /v1/fim/completions`. This must be deployed to Cortex before IDE-side testing.

### Task 2.2: FIM Prompt Builder

File: `src/vs/workbench/contrib/mageCompletion/browser/mageFimPromptBuilder.ts`

Extracts prefix and suffix from the editor document around the cursor position.

```typescript
interface FimContext {
    prefix: string;      // Text before cursor
    suffix: string;      // Text after cursor
    language: string;     // Language ID (typescript, python, etc.)
    filepath: string;     // Relative file path (for context)
    lineNumber: number;   // Current line number
}

function extractFimContext(
    document: ITextModel,
    position: IPosition,
    maxPrefixLines: number = 50,
    maxSuffixLines: number = 20
): FimContext {
    // 1. Get prefix: from max(line 1, currentLine - maxPrefixLines) to cursor
    // 2. Get suffix: from cursor to min(lastLine, currentLine + maxSuffixLines)
    // 3. Include file path as a comment at the top of prefix for context
    // 4. Return structured context
}
```

**Context extraction strategy:**
- **Prefix:** Up to 50 lines before the cursor (configurable via `mage.completion.contextLines`)
- **Suffix:** Up to 20 lines after the cursor
- **File path hint:** Prepend `// filepath: src/utils/auth.ts` as the first line of prefix (helps model understand context)
- **Import context:** If cursor is deep in a file, include the file's import statements at the top of prefix even if they're beyond the line window

### Task 2.3: Completion Cache

File: `src/vs/workbench/contrib/mageCompletion/browser/mageCompletionCache.ts`

LRU cache that avoids redundant API calls:

```typescript
interface CachedCompletion {
    prefix: string;       // The prefix that generated this completion
    suffix: string;       // The suffix at generation time
    completion: string;   // The generated text
    position: IPosition;  // Cursor position when generated
    timestamp: number;    // When it was cached
    model: string;        // Which model generated it
}
```

**Cache behaviors:**
- **Cache key:** Hash of (prefix last 200 chars + suffix first 100 chars)
- **Cache hit:** If the user moves cursor forward within an existing completion, serve from cache (trim the already-accepted prefix)
- **Cache invalidation:** If the user types something that doesn't match the cached completion's next character, invalidate
- **TTL:** 30 seconds (completions become stale quickly as context changes)
- **Max size:** 10 entries (LRU eviction)

### Task 2.4: InlineCompletionItemProvider

File: `src/vs/workbench/contrib/mageCompletion/browser/mageInlineCompletionProvider.ts`

The core provider that VS Code calls to get inline completions:

```typescript
class MageInlineCompletionProvider implements InlineCompletionItemProvider {

    private pendingRequest: AbortController | null = null;

    async provideInlineCompletionItems(
        model: ITextModel,
        position: IPosition,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[]> {

        // 0. Check if completion is enabled
        if (!this.configService.getValue('mage.completion.enabled')) {
            return [];
        }

        // 1. Cancel any pending request
        this.pendingRequest?.abort();
        this.pendingRequest = new AbortController();

        // 2. Check cache first
        const cached = this.cache.get(model, position);
        if (cached) {
            return [this.toInlineCompletionItem(cached, position)];
        }

        // 3. Extract FIM context
        const fimContext = extractFimContext(model, position);

        // 4. Call Cortex FIM endpoint
        try {
            const completionModel = this.configService.getValue('mage.completion.model')
                || await this.getDefaultCompletionModel();

            let completionText = '';
            await this.cortexService.fimCompletionStream(
                {
                    model: completionModel,
                    prefix: fimContext.prefix,
                    suffix: fimContext.suffix,
                    max_tokens: this.configService.getValue('mage.completion.maxTokens'),
                    temperature: this.configService.getValue('mage.completion.temperature'),
                    stream: true,
                },
                (text: string) => { completionText += text; },
                token
            );

            // 5. Cache the result
            this.cache.set(model, position, fimContext.prefix, fimContext.suffix, completionText);

            // 6. Return as InlineCompletionItem
            return [this.toInlineCompletionItem(completionText, position)];
        } catch (e) {
            if (e.name === 'AbortError') return []; // Cancelled -- expected
            console.error('[MAGE Completion] Error:', e);
            return [];
        }
    }

    private toInlineCompletionItem(text: string, position: IPosition): InlineCompletionItem {
        return {
            insertText: text,
            range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
            command: { id: 'mage.completion.accepted', title: 'Completion Accepted' },
        };
    }
}
```

### Task 2.5: Debounce and Cancellation

The `InlineCompletionItemProvider` is called by VS Code's editor after a configurable debounce period. Key behaviors:

1. **Debounce:** VS Code has built-in debounce for inline completions. We configure this through the provider's behavior -- only respond after the debounce period (controlled by `mage.completion.debounceMs`, default 350ms).

2. **Cancellation:** When the user types another character before the previous completion returns:
   - VS Code passes a new `CancellationToken` (the old one is cancelled)
   - We also use `AbortController` to cancel the HTTP request to Cortex
   - This prevents wasted network traffic and GPU compute

3. **Coalescing:** If multiple keystrokes happen rapidly, only the final position triggers a request.

### Task 2.6: Register the Provider

File: `src/vs/workbench/contrib/mageCompletion/browser/mageCompletion.contribution.ts`

```typescript
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';

class MageCompletionContribution extends Disposable implements IWorkbenchContribution {
    static readonly ID = 'workbench.contrib.mageCompletion';

    constructor(
        @ILanguageFeaturesService private readonly languageFeatures: ILanguageFeaturesService,
        @ICortexService private readonly cortexService: ICortexService,
        @IConfigurationService private readonly configService: IConfigurationService,
    ) {
        super();

        const provider = new MageInlineCompletionProvider(cortexService, configService);

        // Register for all languages
        this._register(
            languageFeatures.inlineCompletionProvider.register(
                { pattern: '**' },  // All files
                provider
            )
        );
    }
}

registerWorkbenchContribution2(
    'workbench.contrib.mageCompletion',
    MageCompletionContribution,
    WorkbenchPhase.AfterRestored
);
```

Register in `src/vs/workbench/workbench.common.main.ts`:

```typescript
import './contrib/mageCompletion/browser/mageCompletion.contribution';
```

## Performance Targets

| Metric | Target | How to Achieve |
|--------|--------|---------------|
| Time to first ghost text | < 500ms from typing pause | 350ms debounce + <150ms TTFT from Cortex on localhost |
| Request cancellation | < 10ms | AbortController signals immediately |
| Cache hit response | < 5ms | In-memory LRU cache, no network call |
| Ghost text rendering | < 1ms | VS Code's native inline completion rendering |

## Settings

```
mage.completion.enabled        (boolean, default: true)   -- Master toggle
mage.completion.model          (string, default: '')       -- Model name (empty = auto-detect)
mage.completion.debounceMs     (number, default: 350)      -- Delay after typing stops
mage.completion.maxTokens      (number, default: 128)      -- Max tokens per completion
mage.completion.temperature    (number, default: 0.2)      -- Low temp = more deterministic
mage.completion.contextLines   (number, default: 50)       -- Lines of prefix context
```

## Testing Plan

### Models to Test

| Model | Engine | FIM Support | Priority |
|-------|--------|-------------|----------|
| Codestral 22B | vLLM | Native FIM | High (ideal for completions) |
| DeepSeek Coder V2 6.7B | vLLM | Native FIM | High |
| GPT-OSS 20B | llama.cpp | Via /infill | Medium (test Harmony arch) |
| GPT-OSS 120B | llama.cpp | Via /infill | Medium (test large model) |
| StarCoder2 15B | vLLM | Native FIM | Low (if available) |

### Test Scenarios

| Scenario | Test Steps | Expected Result |
|----------|-----------|-----------------|
| Basic completion | Type `def calculate_total(items):` then newline | Ghost text suggests function body |
| Mid-line completion | Type `for item in` with `items:` on next line | Completes with surrounding context |
| Multi-line completion | Start a function, pause | Multi-line body suggested |
| Tab accept | See ghost text, press Tab | Text inserted at cursor |
| Escape dismiss | See ghost text, press Escape | Ghost text disappears |
| Type-through | See ghost text, type matching character | Ghost text adjusts |
| Cancellation | Type rapidly without pausing | No ghost text (no wasted requests) |
| Cache hit | Accept partial completion, see rest from cache | Instant display (no network) |
| Different languages | Test in .py, .ts, .sh, .rs files | Completions work across languages |
| Empty file | Open new empty file, start typing | Completions work without prior context |
| Large file | Open 1000+ line file, type in middle | Correct prefix/suffix extraction |

## Definition of Done

Phase 2 is complete when:

1. Cortex FIM endpoint (`POST /v1/fim/completions`) is deployed and working
2. FIM prompt builder correctly extracts prefix/suffix from editor
3. `InlineCompletionItemProvider` is registered and triggering on type
4. Ghost text appears after typing pause with code suggestions
5. Tab accepts, Escape dismisses
6. Previous requests are cancelled when new keystrokes arrive
7. Completion cache prevents redundant API calls
8. Tested with at least two different models on Cortex
9. TTFT under 500ms on localhost connection (under 200ms target)
