/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import {
	IChatAgentService,
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentHistoryEntry,
} from '../../chat/common/participants/chatAgents.js';
import { IChatProgress, IChatMarkdownContent } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { ILanguageModelsService, IChatMessage, ChatMessageRole, IChatResponsePart } from '../../chat/common/languageModels.js';
import { ILanguageModelToolsService, IToolData, CountTokensCallback } from '../../chat/common/tools/languageModelToolsService.js';
import { ICortexService } from '../../../../platform/cortex/common/cortex.js';
import { ChatConfigKeys, PersonaConfigKeys } from '../../../../platform/cortex/common/cortexConfiguration.js';
import { ICuratedPersona, BUILTIN_PERSONAS } from '../../../../platform/cortex/common/personaTypes.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const SANDTABLE_AGENT_ID = 'sandtable.chat';
const SANDTABLE_AGENT_NAME = 'Sandtable';
const MAX_TOOL_ITERATIONS = 15;

// ─── Agent Implementation ─────────────────────────────────────────────────────

/**
 * Sandtable chat agent implementation with full tool-calling support.
 *
 * This agent supports three modes:
 * - **Ask** -- Simple text chat, no tools
 * - **Edit** -- Edit/refactor code with tools and mode instructions
 * - **Agent** -- Full autonomous tool-calling loop
 *
 * Flow:
 * 1. Collects available tools from ILanguageModelToolsService
 * 2. Passes tool definitions to the LLM alongside user messages
 * 3. Detects tool_use responses from the LLM
 * 4. Invokes tools via the tools service
 * 5. Feeds tool results back to the LLM
 * 6. Repeats until the LLM responds with text (or max iterations)
 */
class SandtableChatAgentImpl extends Disposable implements IChatAgentImplementation {

	constructor(
		private readonly languageModelsService: ILanguageModelsService,
		private readonly toolsService: ILanguageModelToolsService,
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) {
		super();
	}

	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<IChatAgentResult> {
		this.logService.debug(`[Sandtable Agent] Received request: ${request.message.substring(0, 100)}...`);

		try {
			// Resolve which model to use
			const modelId = await this.resolveModelId(request.userSelectedModelId);
			if (!modelId) {
				const errorContent: IChatMarkdownContent = {
					kind: 'markdownContent',
					content: new MarkdownString('**No models available.** Please configure at least one provider in Sandtable Settings and ensure models are accessible.'),
				};
				progress([errorContent]);
				return { errorDetails: { message: 'No models available' } };
			}

			this.logService.debug(`[Sandtable Agent] Using model: ${modelId}`);

			// Get model metadata for tool filtering
			const modelMeta = this.languageModelsService.lookupLanguageModel(modelId);

			// Collect available tools
			const tools = this.collectTools(modelMeta, request);
			this.logService.debug(`[Sandtable Agent] ${tools.length} tools available`);

			// Build messages from history + current request
			const messages = this.buildMessages(request, history);

			// Run the tool-calling loop
			const result = await this.runToolLoop(modelId, messages, tools, progress, request, token);
			return result;

		} catch (e) {
			if (token.isCancellationRequested) {
				return {};
			}

			const errorMsg = e instanceof Error ? e.message : String(e);
			this.logService.error(`[Sandtable Agent] Request failed: ${errorMsg}`);

			const errorContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: new MarkdownString(`**Error:** ${errorMsg}`),
			};
			progress([errorContent]);

			return {
				errorDetails: { message: errorMsg },
			};
		}
	}

	// ─── Tool-Calling Loop ─────────────────────────────────────────────────

	/**
	 * The core agent loop that handles tool calling:
	 * 1. Send messages + tools to LLM
	 * 2. If response contains tool_use -> execute tools, add results, repeat
	 * 3. If response contains text -> stream to UI, done
	 */
	private async runToolLoop(
		modelId: string,
		messages: IChatMessage[],
		tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }>,
		progress: (parts: IChatProgress[]) => void,
		request: IChatAgentRequest,
		token: CancellationToken
	): Promise<IChatAgentResult> {
		let totalTokens = 0;
		let lastPromptTokens = 0;
		let totalCompletionTokens = 0;
		let iteration = 0;

		while (iteration < MAX_TOOL_ITERATIONS && !token.isCancellationRequested) {
			iteration++;

			// Send request to LLM with tools
			// Persona overrides take priority over default configuration
			const persona = this.resolveActivePersona();
			const options: Record<string, unknown> = {
				temperature: persona?.temperature ?? this.configurationService.getValue<number>(ChatConfigKeys.Temperature) ?? 0.7,
				max_tokens: persona?.maxTokens ?? this.configurationService.getValue<number>(ChatConfigKeys.MaxTokens) ?? 4096,
			};

			// Apply top_p if the persona specifies it
			if (persona?.topP !== undefined) {
				options['top_p'] = persona.topP;
			}

			// Only pass tools in Agent mode
			if (tools.length > 0) {
				options['tools'] = tools;
			}

			const response = await this.languageModelsService.sendChatRequest(
				modelId,
				new ExtensionIdentifier('sandtable.cortex'),
				messages,
				options,
				token
			);

			// Collect all response parts
			const responseParts: IChatResponsePart[] = [];
			for await (const parts of response.stream) {
				if (token.isCancellationRequested) {
					break;
				}
				const partsArray = Array.isArray(parts) ? parts : [parts];
				responseParts.push(...partsArray);
			}

			// Capture real token usage from the provider result (if available)
			const resultData = await response.result;
			if (resultData?.promptTokens !== undefined) {
				lastPromptTokens = resultData.promptTokens;
			}
			if (resultData?.completionTokens !== undefined) {
				totalCompletionTokens += resultData.completionTokens;
			}

			// Separate text parts and tool_use parts
			const textParts = responseParts.filter(p => p.type === 'text');
			const toolUseParts = responseParts.filter(p => p.type === 'tool_use');

			// Stream any text content to the chat panel
			if (textParts.length > 0) {
				const textContent = textParts.map(p => p.type === 'text' ? p.value : '').join('');
				if (textContent) {
					totalTokens += textParts.length;
					progress([{
						kind: 'markdownContent',
						content: new MarkdownString(textContent),
					} satisfies IChatMarkdownContent]);
				}
			}

			// If no tool calls, we're done
			if (toolUseParts.length === 0) {
				// Use real token usage from the API if available, otherwise fall back to heuristic estimation
				const estimatedPromptTokens = Math.ceil(messages.reduce((sum, m) =>
					sum + m.content.reduce((s, p) => s + (p.type === 'text' ? p.value.length : 0), 0), 0) / 4);
				this.logService.debug(`[Sandtable Agent] Completed after ${iteration} iteration(s), prompt: ${lastPromptTokens || estimatedPromptTokens} tokens (${lastPromptTokens ? 'real' : 'estimated'}), completion: ${totalCompletionTokens || totalTokens} tokens`);
				return {
					metadata: { modelId, iterations: iteration },
					usage: {
						promptTokens: lastPromptTokens || estimatedPromptTokens,
						completionTokens: totalCompletionTokens || totalTokens,
					},
				};
			}

			// Process tool calls
			this.logService.debug(`[Sandtable Agent] Iteration ${iteration}: ${toolUseParts.length} tool call(s)`);

			// Add the assistant message with tool calls to history
			const toolCallContentParts = toolUseParts.map(p => {
				if (p.type !== 'tool_use') { return { type: 'text' as const, value: '' }; }
				return {
					type: 'tool_use' as const,
					name: p.name,
					toolCallId: p.toolCallId,
					parameters: p.parameters,
				};
			});

			// Include any text content alongside tool calls
			const assistantParts: IChatMessage['content'] = [];
			const textContent = textParts.map(p => p.type === 'text' ? p.value : '').join('');
			if (textContent) {
				assistantParts.push({ type: 'text', value: textContent });
			}
			assistantParts.push(...toolCallContentParts);

			messages.push({
				role: ChatMessageRole.Assistant,
				content: assistantParts,
			});

			// Execute each tool call and collect results
			for (const toolPart of toolUseParts) {
				if (toolPart.type !== 'tool_use' || token.isCancellationRequested) {
					continue;
				}

				const toolName = toolPart.name;
				const toolCallId = toolPart.toolCallId;
				const toolParams = toolPart.parameters;

				// Begin a native tool invocation via the tools service.
				// This creates a persistent ChatToolInvocation that appears in the
				// chat panel with proper icons, state transitions, and collapsible
				// input/output display -- replacing the old transient progressMessage.
				this.toolsService.beginToolCall({
					toolCallId,
					toolId: toolName,
					chatRequestId: request.requestId,
					sessionResource: request.sessionResource,
				});

				this.logService.debug(`[Sandtable Agent] Invoking tool: ${toolName}(${JSON.stringify(toolParams).substring(0, 200)})`);

				try {
					// Create a simple token counter
					const countTokens: CountTokensCallback = async (input: string) => Math.ceil(input.length / 4);

					// Invoke the tool via the tools service.
					// This internally calls prepareToolInvocation() on the tool to get
					// invocationMessage/pastTenseMessage, transitions through Executing ->
					// Completed states, and captures the result for collapsible display.
					const toolResult = await this.toolsService.invokeTool(
						{
							callId: toolCallId,
							toolId: toolName,
							parameters: toolParams as Record<string, unknown>,
							tokenBudget: 4096,
							context: {
								sessionId: request.sessionResource.toString(),
								sessionResource: request.sessionResource,
							},
							chatRequestId: request.requestId,
						},
						countTokens,
						token
					);

					// Convert tool result to text
					const resultText = toolResult.content
						.map(part => {
							if (part.kind === 'text') { return part.value; }
							return '[binary data]';
						})
						.join('\n');

					this.logService.debug(`[Sandtable Agent] Tool ${toolName} returned: ${resultText.substring(0, 200)}...`);

					// Add tool result to message history
					messages.push({
						role: ChatMessageRole.User, // tool results go as user role with tool_result type
						content: [{
							type: 'tool_result',
							toolCallId,
							value: [{ type: 'text', value: resultText }],
						}],
					});

				} catch (toolError) {
					const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
					this.logService.error(`[Sandtable Agent] Tool ${toolName} failed: ${errorMsg}`);

					// Add error result to message history so the LLM knows
					messages.push({
						role: ChatMessageRole.User,
						content: [{
							type: 'tool_result',
							toolCallId,
							value: [{ type: 'text', value: `Error executing tool ${toolName}: ${errorMsg}` }],
							isError: true,
						}],
					});
				}
			}

			// Continue the loop -- LLM will see tool results and decide next action
		}

		if (iteration >= MAX_TOOL_ITERATIONS) {
			progress([{
				kind: 'markdownContent',
				content: new MarkdownString(`*Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}). Stopping.*`),
			} satisfies IChatMarkdownContent]);
		}

		const estimatedPromptTokens = Math.ceil(messages.reduce((sum, m) =>
			sum + m.content.reduce((s, p) => s + (p.type === 'text' ? p.value.length : 0), 0), 0) / 4);
		return {
			metadata: { modelId, iterations: iteration },
			usage: {
				promptTokens: lastPromptTokens || estimatedPromptTokens,
				completionTokens: totalCompletionTokens || totalTokens,
			},
		};
	}

	// ─── Tool Collection ───────────────────────────────────────────────────

	/**
	 * Collect available tools from ILanguageModelToolsService and convert
	 * them to the OpenAI-compatible tools format for the LLM request.
	 */
	private collectTools(
		modelMeta: ReturnType<typeof this.languageModelsService.lookupLanguageModel>,
		request: IChatAgentRequest
	): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
		// Get all tools available for this model
		const allTools = Array.from(this.toolsService.getTools(modelMeta ?? undefined));

		// Filter by user-selected tools (if specified)
		let filteredTools: IToolData[];
		if (request.userSelectedTools && Object.keys(request.userSelectedTools).length > 0) {
			filteredTools = allTools.filter(tool =>
				request.userSelectedTools![tool.id] !== false // Include unless explicitly disabled
			);
		} else {
			filteredTools = allTools;
		}

		// Convert to OpenAI-compatible tool format
		return filteredTools.map(tool => ({
			type: 'function' as const,
			function: {
				name: tool.id,
				description: tool.modelDescription || tool.displayName || tool.id,
				parameters: tool.inputSchema || { type: 'object', properties: {} },
			},
		}));
	}

	// ─── Model Resolution ──────────────────────────────────────────────────

	/**
	 * Resolve the model ID to use for this request.
	 * Priority: user-selected model > persona model > configured default > first available model
	 */
	private async resolveModelId(userSelectedModelId?: string): Promise<string | undefined> {
		// If user explicitly selected a model in the chat panel picker, use it
		if (userSelectedModelId) {
			return userSelectedModelId;
		}

		const allModelIds = this.languageModelsService.getLanguageModelIds();

		// Check active persona's preferred model
		const persona = this.resolveActivePersona();
		if (persona?.model) {
			const match = allModelIds.find(id =>
				id === persona.model ||
				id === `cortex::${persona.model}` ||
				id.endsWith(`::${persona.model}`)
			);
			if (match) {
				this.logService.debug(`[Sandtable Agent] Using persona "${persona.name}" preferred model: ${match}`);
				return match;
			}
		}

		// Check configured default model
		const configuredModel = this.configurationService.getValue<string>(ChatConfigKeys.DefaultModel);
		if (configuredModel) {
			const match = allModelIds.find(id =>
				id === configuredModel ||
				id === `cortex::${configuredModel}` ||
				id.endsWith(`::${configuredModel}`)
			);
			if (match) {
				return match;
			}
		}

		// Fall back to first available model from any provider
		if (allModelIds.length > 0) {
			return allModelIds[0];
		}

		return undefined;
	}

	// ─── Message Building ──────────────────────────────────────────────────

	// ─── Persona Resolution ───────────────────────────────────────────────

	/**
	 * Resolve the currently active persona from configuration.
	 * Returns undefined if no persona is active.
	 */
	private resolveActivePersona(): ICuratedPersona | undefined {
		const activeId = this.configurationService.getValue<string>(PersonaConfigKeys.ActivePersona) || '';
		if (!activeId) {
			return undefined;
		}

		const stored = this.configurationService.getValue<ICuratedPersona[]>(PersonaConfigKeys.Personas) ?? [];
		const personas = stored.length > 0 ? stored : [...BUILTIN_PERSONAS];
		return personas.find(p => p.id === activeId);
	}

	// ─── Message Building ──────────────────────────────────────────────────

	/**
	 * Build the message list for the LLM from chat history and the current request.
	 *
	 * The system prompt is determined by:
	 * 1. Active persona's system prompt (if a persona is active)
	 * 2. Default system prompt from chat settings
	 *
	 * In Edit mode, mode instructions (describing selected files and intent) are
	 * appended to the system prompt so the LLM has full context.
	 *
	 * If the persona has behavioral guidelines, they are also appended.
	 */
	private buildMessages(request: IChatAgentRequest, history: IChatAgentHistoryEntry[]): IChatMessage[] {
		const messages: IChatMessage[] = [];

		// Resolve active persona
		const persona = this.resolveActivePersona();

		// System prompt: persona overrides default
		let systemPrompt: string;
		if (persona) {
			systemPrompt = persona.systemPrompt;
			this.logService.debug(`[Sandtable Agent] Using persona system prompt: "${persona.name}"`);

			// Append behavioral guidelines if present
			if (persona.guidelines) {
				systemPrompt += '\n\nBehavioral guidelines: ' + persona.guidelines;
			}
		} else {
			systemPrompt = this.configurationService.getValue<string>(ChatConfigKeys.SystemPrompt) || 'You are a helpful AI research assistant with access to workspace tools. Use tools when needed to read files, edit code, run commands, and search the workspace.';
		}

		// In Edit mode, append mode instructions (VS Code provides instructions
		// about the files that are selected and the editing context)
		if (request.modeInstructions?.content) {
			systemPrompt += '\n\n' + request.modeInstructions.content;
		}

		messages.push({
			role: ChatMessageRole.System,
			content: [{ type: 'text', value: systemPrompt }],
		});

		// Add history
		for (const entry of history) {
			if (entry.request?.message) {
				messages.push({
					role: ChatMessageRole.User,
					content: [{ type: 'text', value: entry.request.message }],
				});
			}

			if (entry.response) {
				const responseText = entry.response
					.filter((part): part is IChatMarkdownContent => part.kind === 'markdownContent')
					.map(part => part.content.value)
					.join('');

				if (responseText) {
					messages.push({
						role: ChatMessageRole.Assistant,
						content: [{ type: 'text', value: responseText }],
					});
				}
			}
		}

		// Current user message
		messages.push({
			role: ChatMessageRole.User,
			content: [{ type: 'text', value: request.message }],
		});

		return messages;
	}
}

// ─── Workbench Contribution ───────────────────────────────────────────────────

/**
 * Registers the Sandtable chat agent with VS Code's IChatAgentService.
 *
 * This makes "Sandtable" the default chat participant in the built-in Chat panel.
 * The agent supports Ask mode (simple text), Edit mode (inline code changes),
 * and Agent mode (full tool-calling loop).
 */
class SandtableChatAgentContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sandtableChatAgent';

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@ICortexService _cortexService: ICortexService, // retained for DI -- routing goes through ILanguageModelsService
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.logService.info('[Sandtable Agent] Registering Sandtable chat agent with tool support');

		// Register agent data (metadata)
		this._register(this.chatAgentService.registerAgent(SANDTABLE_AGENT_ID, {
			id: SANDTABLE_AGENT_ID,
			name: SANDTABLE_AGENT_NAME,
			fullName: 'Sandtable AI Assistant',
			description: 'AI-powered research and analysis assistant with workspace tools.',
			isDefault: true,
			isCore: true,
			extensionId: nullExtensionDescription.identifier,
			extensionVersion: '1.0.0',
			extensionPublisherId: 'sandtable',
			extensionDisplayName: 'Sandtable',
			metadata: {
				helpTextPrefix: 'Ask Sandtable anything. In Edit mode, ask for code changes to open files. In Agent mode, tools are available for reading files, editing code, running commands, and searching the workspace.',
			},
			slashCommands: [],
			locations: [ChatAgentLocation.Chat, ChatAgentLocation.Terminal, ChatAgentLocation.EditorInline],
			modes: [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent],
			disambiguation: [],
		}));

		// Register agent implementation (the actual handler)
		const agentImpl = this._register(new SandtableChatAgentImpl(
			this.languageModelsService,
			this.toolsService,
			this.configurationService,
			this.logService,
		));
		this._register(this.chatAgentService.registerAgentImplementation(SANDTABLE_AGENT_ID, agentImpl));

		this.logService.info('[Sandtable Agent] Sandtable chat agent registered with tool support');
	}
}

registerWorkbenchContribution2(
	SandtableChatAgentContribution.ID,
	SandtableChatAgentContribution,
	WorkbenchPhase.AfterRestored
);
