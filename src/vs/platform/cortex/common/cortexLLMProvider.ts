/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILLMProvider } from './llmProvider.js';
import {
	ICortexModelDetail, ICortexDryRunResult,
	ICortexGPUMetric, ICortexSystemSummary, ICortexThroughput,
	ICortexIDEStatus,
	ICortexChatSession, ICortexChatSessionDetail,
	ICortexCreateSessionRequest, ICortexSessionMessage,
} from './cortex.js';

// ─── ICortexLLMProvider ───────────────────────────────────────────────────────

/**
 * Extended provider interface for Cortex-specific capabilities.
 * Only the Cortex provider implements this -- other providers are inference-only.
 */
export interface ICortexLLMProvider extends ILLMProvider {
	/** Identifies this as a Cortex provider */
	readonly isCortex: true;

	// --- Admin: Model Management ---
	listAllModels(): Promise<ICortexModelDetail[]>;
	startModel(modelId: number): Promise<void>;
	stopModel(modelId: number): Promise<void>;
	getModelLogs(modelId: number, diagnose?: boolean): Promise<string>;
	dryRunModel(modelId: number): Promise<ICortexDryRunResult>;

	// --- System Monitoring ---
	getSystemSummary(): Promise<ICortexSystemSummary>;
	getGPUMetrics(): Promise<ICortexGPUMetric[]>;
	getThroughputMetrics(): Promise<ICortexThroughput>;
	getIDEStatus(): Promise<ICortexIDEStatus>;

	// --- Chat Sessions ---
	listChatSessions(): Promise<ICortexChatSession[]>;
	getChatSession(sessionId: string): Promise<ICortexChatSessionDetail>;
	createChatSession(request: ICortexCreateSessionRequest): Promise<ICortexChatSession>;
	addMessageToSession(sessionId: string, message: ICortexSessionMessage): Promise<void>;
	deleteChatSession(sessionId: string): Promise<void>;
}
