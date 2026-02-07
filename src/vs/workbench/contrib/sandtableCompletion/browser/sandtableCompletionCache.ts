/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from '../../../../editor/common/core/position.js';
import { computeFimCacheKey } from './sandtableFimPromptBuilder.js';

// ─── Cache Entry Interface ────────────────────────────────────────────────────

/**
 * A cached completion result with all the context needed to determine cache hits
 * and serve previously computed completions.
 */
export interface CachedCompletion {
	/** The prefix text that was sent to generate this completion */
	readonly prefix: string;
	/** The suffix text that was sent to generate this completion */
	readonly suffix: string;
	/** The generated completion text */
	readonly completion: string;
	/** Cursor position when the completion was generated (1-based) */
	readonly lineNumber: number;
	/** Cursor column when the completion was generated (1-based) */
	readonly column: number;
	/** Timestamp (ms since epoch) when this entry was cached */
	readonly timestamp: number;
	/** Cache key (hash of prefix tail + suffix head) */
	readonly cacheKey: string;
	/** Model that generated this completion */
	readonly model: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Time-to-live for cache entries in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000;

/** Maximum number of entries in the LRU cache */
const CACHE_MAX_SIZE = 10;

// ─── Completion Cache ─────────────────────────────────────────────────────────

/**
 * LRU cache for inline code completions.
 *
 * Key behaviors:
 * - Cache key is a hash of the last 200 chars of prefix + first 100 chars of suffix
 * - Cache hit: if the user moves cursor forward within an existing completion, the
 *   remaining portion of the completion is served from cache (trimmed to match)
 * - Cache invalidation: if the user types something that doesn't match the cached
 *   completion's next character, the entry is invalidated
 * - TTL: 30 seconds (completions become stale quickly as context changes)
 * - Max size: 10 entries with LRU eviction
 */
export class SandtableCompletionCache {

	/**
	 * Internal map from cache key to cached completion.
	 * Insertion order = access order (most recently accessed at the end).
	 */
	private readonly _cache = new Map<string, CachedCompletion>();

	/**
	 * Attempts to retrieve a cached completion for the given context.
	 *
	 * Returns the full cached completion text if an exact cache key match is found,
	 * or a trimmed completion if the cursor has moved forward within a previously
	 * cached completion (type-ahead / forward movement cache hit).
	 *
	 * @param prefix Current prefix text
	 * @param suffix Current suffix text
	 * @param position Current cursor position
	 * @returns The completion text to display, or `null` if no cache hit
	 */
	get(prefix: string, suffix: string, position: IPosition): string | null {
		this._evictExpired();

		const cacheKey = computeFimCacheKey(prefix, suffix);
		const entry = this._cache.get(cacheKey);

		if (entry) {
			// Exact cache key match -- refresh LRU position and return
			this._touchEntry(cacheKey);
			return entry.completion;
		}

		// Check for forward-movement cache hit:
		// If the cursor has moved forward on the same line within a previous completion,
		// the characters the user typed should match the beginning of the cached completion.
		// We serve the remaining portion.
		for (const [key, cached] of this._cache) {
			if (this._isExpired(cached)) {
				continue;
			}

			// Must be on the same line
			if (cached.lineNumber !== position.lineNumber) {
				continue;
			}

			// Cursor must have moved forward (to the right)
			const columnsAdvanced = position.column - cached.column;
			if (columnsAdvanced <= 0 || columnsAdvanced >= cached.completion.length) {
				continue;
			}

			// The characters the user typed must match the beginning of the cached completion
			const expectedTyped = cached.completion.slice(0, columnsAdvanced);
			const actualTyped = prefix.slice(-columnsAdvanced);

			if (expectedTyped === actualTyped) {
				// Cache hit -- return remaining completion
				const remaining = cached.completion.slice(columnsAdvanced);
				this._touchEntry(key);
				return remaining;
			}
		}

		return null;
	}

	/**
	 * Stores a new completion in the cache.
	 *
	 * @param prefix The prefix text that generated this completion
	 * @param suffix The suffix text at generation time
	 * @param completion The generated completion text
	 * @param position Cursor position when the completion was generated
	 * @param model Model that generated the completion
	 */
	set(
		prefix: string,
		suffix: string,
		completion: string,
		position: IPosition,
		model: string,
	): void {
		if (!completion) {
			return; // Don't cache empty completions
		}

		const cacheKey = computeFimCacheKey(prefix, suffix);

		// Remove existing entry (will be re-added at the end for LRU)
		this._cache.delete(cacheKey);

		// Evict oldest entries if at capacity
		while (this._cache.size >= CACHE_MAX_SIZE) {
			const oldestKey = this._cache.keys().next().value;
			if (oldestKey !== undefined) {
				this._cache.delete(oldestKey);
			}
		}

		const entry: CachedCompletion = {
			prefix,
			suffix,
			completion,
			lineNumber: position.lineNumber,
			column: position.column,
			timestamp: Date.now(),
			cacheKey,
			model,
		};

		this._cache.set(cacheKey, entry);
	}

	/**
	 * Invalidates (removes) a specific cache entry.
	 * Called when the user types something that doesn't match the cached completion.
	 */
	invalidate(prefix: string, suffix: string): void {
		const cacheKey = computeFimCacheKey(prefix, suffix);
		this._cache.delete(cacheKey);
	}

	/**
	 * Clears all cache entries.
	 */
	clear(): void {
		this._cache.clear();
	}

	/**
	 * Returns the current number of cache entries (useful for debugging/logging).
	 */
	get size(): number {
		return this._cache.size;
	}

	// ─── Private Helpers ──────────────────────────────────────────────────

	/**
	 * Moves an entry to the end of the Map (most recently used position).
	 */
	private _touchEntry(key: string): void {
		const entry = this._cache.get(key);
		if (entry) {
			this._cache.delete(key);
			this._cache.set(key, entry);
		}
	}

	/**
	 * Checks whether a cache entry has exceeded its TTL.
	 */
	private _isExpired(entry: CachedCompletion): boolean {
		return (Date.now() - entry.timestamp) > CACHE_TTL_MS;
	}

	/**
	 * Removes all expired entries from the cache.
	 */
	private _evictExpired(): void {
		const keysToRemove: string[] = [];
		for (const [key, entry] of this._cache) {
			if (this._isExpired(entry)) {
				keysToRemove.push(key);
			}
		}
		for (const key of keysToRemove) {
			this._cache.delete(key);
		}
	}
}
