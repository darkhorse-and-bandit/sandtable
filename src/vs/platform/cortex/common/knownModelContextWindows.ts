/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ─── Known Model Context Window Reference Table ──────────────────────────────
//
// Static table providing default context window sizes for well-known model
// families. Used when the curated model config does not specify
// contextWindowTokens and the model is from an external provider (not Cortex,
// which has getModelConstraints()).
//
// Ordered from most-specific pattern to least-specific; first match wins.

/**
 * Specification for a known model family's context window and output limits.
 */
export interface IKnownModelSpec {
	/** Glob pattern to match model names (e.g., "gpt-5*", "deepseek-v3*") */
	pattern: string;
	/** Total context window size in tokens */
	contextWindowTokens: number;
	/** Maximum output tokens */
	maxOutputTokens: number;
	/** Whether this model supports tool calling */
	toolCalling?: boolean;
}

export const KNOWN_MODEL_CONTEXT_WINDOWS: IKnownModelSpec[] = [
	// ─── OpenAI GPT-5 Family ──────────────────────────────────────────
	{ pattern: 'gpt-5*',                contextWindowTokens: 400_000,    maxOutputTokens: 128_000,  toolCalling: true  },
	{ pattern: 'gpt-5-mini*',           contextWindowTokens: 400_000,    maxOutputTokens: 128_000,  toolCalling: true  },
	{ pattern: 'gpt-5-nano*',           contextWindowTokens: 400_000,    maxOutputTokens: 128_000,  toolCalling: true  },

	// ─── OpenAI GPT-5.1/5.2 ──────────────────────────────────────────
	{ pattern: 'gpt-5.1*',              contextWindowTokens: 400_000,    maxOutputTokens: 128_000,  toolCalling: true  },
	{ pattern: 'gpt-5.2*',              contextWindowTokens: 400_000,    maxOutputTokens: 128_000,  toolCalling: true  },

	// ─── OpenAI GPT-4.1 Family ────────────────────────────────────────
	{ pattern: 'gpt-4.1*',              contextWindowTokens: 1_047_576,  maxOutputTokens: 32_768,   toolCalling: true  },
	{ pattern: 'gpt-4.1-mini*',         contextWindowTokens: 1_047_576,  maxOutputTokens: 32_768                      },
	{ pattern: 'gpt-4.1-nano*',         contextWindowTokens: 1_047_576,  maxOutputTokens: 32_768                      },

	// ─── OpenAI GPT-4o Family ─────────────────────────────────────────
	{ pattern: 'gpt-4o*',               contextWindowTokens: 128_000,    maxOutputTokens: 16_384                      },
	{ pattern: 'gpt-4o-mini*',          contextWindowTokens: 128_000,    maxOutputTokens: 16_384                      },
	{ pattern: 'chatgpt-4o*',           contextWindowTokens: 128_000,    maxOutputTokens: 16_384                      },

	// ─── OpenAI GPT-4 Turbo ──────────────────────────────────────────
	{ pattern: 'gpt-4-turbo*',          contextWindowTokens: 128_000,    maxOutputTokens: 4_096                       },
	{ pattern: 'gpt-4-1106*',           contextWindowTokens: 128_000,    maxOutputTokens: 4_096                       },
	{ pattern: 'gpt-4-0125*',           contextWindowTokens: 128_000,    maxOutputTokens: 4_096                       },

	// ─── OpenAI GPT-4 Base ───────────────────────────────────────────
	{ pattern: 'gpt-4',                 contextWindowTokens: 8_192,      maxOutputTokens: 8_192                       },
	{ pattern: 'gpt-4-32k*',            contextWindowTokens: 32_768,     maxOutputTokens: 32_768                      },

	// ─── OpenAI o-Series (Reasoning) ──────────────────────────────────
	{ pattern: 'o4-mini*',              contextWindowTokens: 200_000,    maxOutputTokens: 100_000,  toolCalling: true  },
	{ pattern: 'o3*',                   contextWindowTokens: 200_000,    maxOutputTokens: 100_000                     },
	{ pattern: 'o3-mini*',              contextWindowTokens: 200_000,    maxOutputTokens: 100_000                     },
	{ pattern: 'o1*',                   contextWindowTokens: 200_000,    maxOutputTokens: 100_000                     },
	{ pattern: 'o1-mini*',              contextWindowTokens: 128_000,    maxOutputTokens: 65_536                      },
	{ pattern: 'o1-preview*',           contextWindowTokens: 128_000,    maxOutputTokens: 32_768                      },

	// ─── OpenAI GPT-3.5 ──────────────────────────────────────────────
	{ pattern: 'gpt-3.5-turbo*',        contextWindowTokens: 16_385,     maxOutputTokens: 4_096                       },

	// ─── OpenAI GPT-OSS (Open-Weight) ─────────────────────────────────
	{ pattern: 'gpt-oss*',              contextWindowTokens: 128_000,    maxOutputTokens: 16_384,   toolCalling: true  },

	// ─── Anthropic Claude ─────────────────────────────────────────────
	{ pattern: 'claude-4.5-opus*',      contextWindowTokens: 200_000,    maxOutputTokens: 64_000,   toolCalling: true  },
	{ pattern: 'claude-4.5-sonnet*',    contextWindowTokens: 200_000,    maxOutputTokens: 64_000,   toolCalling: true  },
	{ pattern: 'claude-4*',             contextWindowTokens: 200_000,    maxOutputTokens: 64_000,   toolCalling: true  },
	{ pattern: 'claude-3.7*',           contextWindowTokens: 200_000,    maxOutputTokens: 128_000,  toolCalling: true  },
	{ pattern: 'claude-3.5*',           contextWindowTokens: 200_000,    maxOutputTokens: 8_192,    toolCalling: true  },
	{ pattern: 'claude-3*',             contextWindowTokens: 200_000,    maxOutputTokens: 4_096,    toolCalling: true  },

	// ─── DeepSeek ─────────────────────────────────────────────────────
	{ pattern: 'deepseek-chat*',        contextWindowTokens: 128_000,    maxOutputTokens: 8_192                       },
	{ pattern: 'deepseek-coder*',       contextWindowTokens: 128_000,    maxOutputTokens: 8_192                       },
	{ pattern: 'deepseek-reasoner*',    contextWindowTokens: 128_000,    maxOutputTokens: 64_000                      },
	{ pattern: 'deepseek-r1*',          contextWindowTokens: 128_000,    maxOutputTokens: 64_000                      },
	{ pattern: 'deepseek-v3*',          contextWindowTokens: 128_000,    maxOutputTokens: 8_192                       },
	{ pattern: 'deepseek*',             contextWindowTokens: 128_000,    maxOutputTokens: 8_192                       },

	// ─── Qwen ─────────────────────────────────────────────────────────
	{ pattern: 'qwen3*',                contextWindowTokens: 131_072,    maxOutputTokens: 8_192,    toolCalling: true  },
	{ pattern: 'qwen2.5-coder*',        contextWindowTokens: 131_072,    maxOutputTokens: 8_192                       },
	{ pattern: 'qwen2.5*',              contextWindowTokens: 131_072,    maxOutputTokens: 8_192                       },
	{ pattern: 'qwq*',                  contextWindowTokens: 32_000,     maxOutputTokens: 8_192                       },
	{ pattern: 'qwen*',                 contextWindowTokens: 32_000,     maxOutputTokens: 8_192                       },

	// ─── Meta Llama ───────────────────────────────────────────────────
	{ pattern: 'llama-4*',              contextWindowTokens: 131_072,    maxOutputTokens: 8_192,    toolCalling: true  },
	{ pattern: 'llama-3.3*',            contextWindowTokens: 131_072,    maxOutputTokens: 2_048                       },
	{ pattern: 'llama-3.2*',            contextWindowTokens: 131_072,    maxOutputTokens: 2_048                       },
	{ pattern: 'llama-3.1*',            contextWindowTokens: 131_072,    maxOutputTokens: 2_048                       },
	{ pattern: 'llama-3*',              contextWindowTokens: 8_192,      maxOutputTokens: 2_048                       },
	{ pattern: 'llama*',                contextWindowTokens: 8_192,      maxOutputTokens: 2_048                       },

	// ─── Mistral ──────────────────────────────────────────────────────
	{ pattern: 'mistral-nemo*',         contextWindowTokens: 128_000,    maxOutputTokens: 4_096                       },
	{ pattern: 'mistral-large*',        contextWindowTokens: 32_000,     maxOutputTokens: 4_096,    toolCalling: true  },
	{ pattern: 'mistral-small*',        contextWindowTokens: 32_000,     maxOutputTokens: 4_096                       },
	{ pattern: 'mistral-medium*',       contextWindowTokens: 32_000,     maxOutputTokens: 4_096                       },
	{ pattern: 'mixtral*',              contextWindowTokens: 32_000,     maxOutputTokens: 4_096                       },
	{ pattern: 'mistral*',              contextWindowTokens: 32_000,     maxOutputTokens: 4_096                       },

	// ─── Google Gemini ────────────────────────────────────────────────
	{ pattern: 'gemini-2.5*',           contextWindowTokens: 1_048_000,  maxOutputTokens: 64_000,   toolCalling: true  },
	{ pattern: 'gemini-2.0*',           contextWindowTokens: 1_048_000,  maxOutputTokens: 8_192                       },
	{ pattern: 'gemini-1.5*',           contextWindowTokens: 1_048_000,  maxOutputTokens: 8_192                       },
	{ pattern: 'gemma-3*',              contextWindowTokens: 128_000,    maxOutputTokens: 8_192                       },
	{ pattern: 'gemma*',                contextWindowTokens: 8_192,      maxOutputTokens: 8_192                       },

	// ─── Microsoft Phi ────────────────────────────────────────────────
	{ pattern: 'phi-4*',                contextWindowTokens: 16_000,     maxOutputTokens: 16_000                      },
	{ pattern: 'phi-3*',                contextWindowTokens: 4_096,      maxOutputTokens: 4_096                       },
	{ pattern: 'phi*',                  contextWindowTokens: 4_096,      maxOutputTokens: 4_096                       },

	// ─── Cohere Command ───────────────────────────────────────────────
	{ pattern: 'command-r-plus*',       contextWindowTokens: 128_000,    maxOutputTokens: 4_096,    toolCalling: true  },
	{ pattern: 'command-r*',            contextWindowTokens: 128_000,    maxOutputTokens: 4_096                       },
	{ pattern: 'command*',              contextWindowTokens: 4_096,      maxOutputTokens: 4_096                       },
];

/**
 * Look up context window size for a model name using the known models table.
 * Matches against the bare model name (without provider prefix).
 * Returns undefined if no match is found.
 */
export function lookupKnownModelSpec(modelName: string): IKnownModelSpec | undefined {
	const bare = modelName.includes('::') ? modelName.split('::')[1] : modelName;
	const lower = bare.toLowerCase();
	for (const spec of KNOWN_MODEL_CONTEXT_WINDOWS) {
		if (matchesGlobPattern(spec.pattern, lower)) {
			return spec;
		}
	}
	return undefined;
}

/**
 * Simple glob matching: supports trailing * only (e.g., "gpt-5*" matches "gpt-5-2025-08-06").
 */
function matchesGlobPattern(pattern: string, value: string): boolean {
	const lower = pattern.toLowerCase();
	if (lower.endsWith('*')) {
		return value.startsWith(lower.slice(0, -1));
	}
	return value === lower;
}
