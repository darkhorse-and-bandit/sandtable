/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelIdentifier } from './cortexProviderTypes.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Separator between provider ID and model name in compound model references.
 * Chosen because '::' never appears in model names (unlike '/' and ':').
 */
export const MODEL_SEPARATOR = '::';

// ─── Model Reference Utilities ────────────────────────────────────────────────

/**
 * Checks whether a model reference string contains a provider prefix.
 * @example isCompoundModelRef("cortex::gpt-oss-120b") // true
 * @example isCompoundModelRef("gpt-oss-120b") // false
 */
export function isCompoundModelRef(modelRef: string): boolean {
	return modelRef.includes(MODEL_SEPARATOR);
}

/**
 * Parses a compound model reference into provider ID and model name.
 * Returns null for bare model names (no provider prefix).
 *
 * @example parseModelReference("cortex-local::gpt-oss-120b")
 *   // { providerId: "cortex-local", modelName: "gpt-oss-120b" }
 * @example parseModelReference("ollama::deepseek-coder-v2:6.7b")
 *   // { providerId: "ollama", modelName: "deepseek-coder-v2:6.7b" }
 * @example parseModelReference("gpt-oss-120b")
 *   // null (bare name, no provider prefix)
 */
export function parseModelReference(modelRef: string): IModelIdentifier | null {
	const idx = modelRef.indexOf(MODEL_SEPARATOR);
	if (idx < 0) {
		return null;
	}
	return {
		providerId: modelRef.substring(0, idx),
		modelName: modelRef.substring(idx + MODEL_SEPARATOR.length),
	};
}

/**
 * Creates a compound model reference from a provider ID and model name.
 * @example formatModelReference("cortex-local", "gpt-oss-120b")
 *   // "cortex-local::gpt-oss-120b"
 */
export function formatModelReference(providerId: string, modelName: string): string {
	return `${providerId}${MODEL_SEPARATOR}${modelName}`;
}

/**
 * Extracts the bare model name from a potentially compound reference.
 * If the reference has a provider prefix, strips it. Otherwise returns as-is.
 */
export function extractModelName(modelRef: string): string {
	const parsed = parseModelReference(modelRef);
	return parsed ? parsed.modelName : modelRef;
}
