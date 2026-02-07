/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition } from '../../../../editor/common/core/position.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';

// ─── FIM Context Interface ────────────────────────────────────────────────────

/**
 * Structured context extracted from the editor for a Fill-in-the-Middle request.
 * Contains the code before the cursor (prefix), code after the cursor (suffix),
 * and metadata about the file and position.
 */
export interface FimContext {
	/** Code text before the cursor, including optional file path hint and imports */
	readonly prefix: string;
	/** Code text after the cursor */
	readonly suffix: string;
	/** Language identifier (e.g., 'typescript', 'python', 'rust') */
	readonly language: string;
	/** Relative file path for context (e.g., 'src/utils/auth.ts') */
	readonly filepath: string;
	/** Current line number (1-based) */
	readonly lineNumber: number;
	/** Current column number (1-based) */
	readonly column: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default maximum number of prefix lines to include */
const DEFAULT_MAX_PREFIX_LINES = 50;

/** Maximum number of suffix lines to include (suffix is less important than prefix) */
const MAX_SUFFIX_LINES = 20;

/** Common comment prefixes used for the file path hint, keyed by language */
const COMMENT_PREFIX_MAP: Record<string, string> = {
	'typescript': '//',
	'javascript': '//',
	'typescriptreact': '//',
	'javascriptreact': '//',
	'java': '//',
	'c': '//',
	'cpp': '//',
	'csharp': '//',
	'go': '//',
	'rust': '//',
	'swift': '//',
	'kotlin': '//',
	'scala': '//',
	'dart': '//',
	'php': '//',
	'python': '#',
	'ruby': '#',
	'perl': '#',
	'r': '#',
	'shell': '#',
	'shellscript': '#',
	'bash': '#',
	'powershell': '#',
	'yaml': '#',
	'toml': '#',
	'makefile': '#',
	'dockerfile': '#',
	'lua': '--',
	'haskell': '--',
	'sql': '--',
	'html': '<!--',
	'xml': '<!--',
	'css': '/*',
	'scss': '//',
	'less': '//',
};

/** Languages that commonly use import statements at the top of the file */
const IMPORT_LANGUAGES = new Set([
	'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
	'python', 'java', 'go', 'rust', 'csharp', 'kotlin', 'scala', 'dart',
	'swift', 'cpp', 'c',
]);

/** Regex patterns that match import/include statements for various languages */
const IMPORT_PATTERNS: RegExp[] = [
	/^import\s/,            // TypeScript, JavaScript, Python, Java, Go, Dart, Kotlin, Scala, Swift
	/^from\s.*\simport\s/,  // Python
	/^require\s*\(/,        // JavaScript (CommonJS)
	/^using\s/,             // C#
	/^#include\s/,          // C, C++
	/^use\s/,               // Rust
	/^package\s/,           // Go, Java, Kotlin
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extracts Fill-in-the-Middle context from the editor model around the cursor position.
 *
 * The prefix includes:
 * - A file path hint comment (helps the model understand context)
 * - Import statements from the top of the file (even if outside the line window)
 * - Up to `maxPrefixLines` lines of code before the cursor
 *
 * The suffix includes:
 * - Up to MAX_SUFFIX_LINES lines of code after the cursor
 *
 * @param document The text model (editor document)
 * @param position The cursor position (1-based line and column)
 * @param maxPrefixLines Maximum number of prefix context lines (configurable via settings)
 * @returns Structured FIM context for sending to the inference API
 */
export function extractFimContext(
	document: ITextModel,
	position: IPosition,
	maxPrefixLines: number = DEFAULT_MAX_PREFIX_LINES,
): FimContext {
	const totalLines = document.getLineCount();
	const cursorLine = position.lineNumber;
	const cursorColumn = position.column;
	const language = document.getLanguageId();
	const filepath = _extractRelativeFilePath(document);

	// ── Build prefix ──────────────────────────────────────────────────────

	// Determine the range of lines for the prefix
	const prefixStartLine = Math.max(1, cursorLine - maxPrefixLines);

	// Get the prefix text: from prefixStartLine to the cursor position
	const prefixRange: IRange = {
		startLineNumber: prefixStartLine,
		startColumn: 1,
		endLineNumber: cursorLine,
		endColumn: cursorColumn,
	};
	let prefixText = document.getValueInRange(prefixRange);

	// If the cursor is deep in the file and imports are outside the prefix window,
	// prepend the import block so the model has dependency context
	const importBlock = _extractImportBlock(document, language, prefixStartLine);
	if (importBlock) {
		prefixText = importBlock + '\n\n' + prefixText;
	}

	// Prepend file path hint as a comment
	const filePathHint = _buildFilePathHint(filepath, language);
	if (filePathHint) {
		prefixText = filePathHint + '\n' + prefixText;
	}

	// ── Build suffix ──────────────────────────────────────────────────────

	const suffixEndLine = Math.min(totalLines, cursorLine + MAX_SUFFIX_LINES);

	const suffixRange: IRange = {
		startLineNumber: cursorLine,
		startColumn: cursorColumn,
		endLineNumber: suffixEndLine,
		endColumn: document.getLineMaxColumn(suffixEndLine),
	};
	const suffixText = document.getValueInRange(suffixRange);

	return {
		prefix: prefixText,
		suffix: suffixText,
		language,
		filepath,
		lineNumber: cursorLine,
		column: cursorColumn,
	};
}

/**
 * Computes a lightweight hash key for caching based on the tail of the prefix
 * and the head of the suffix. This avoids hashing the entire context every time.
 *
 * @param prefix The full prefix text
 * @param suffix The full suffix text
 * @returns A string key suitable for use as a cache map key
 */
export function computeFimCacheKey(prefix: string, suffix: string): string {
	const prefixTail = prefix.slice(-200);
	const suffixHead = suffix.slice(0, 100);
	return _simpleHash(prefixTail + '|FIM|' + suffixHead);
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts a relative file path from the document URI.
 * Strips common workspace prefixes to get a clean relative path.
 */
function _extractRelativeFilePath(document: ITextModel): string {
	const uri = document.uri;

	if (!uri || uri.scheme === 'untitled') {
		return 'untitled';
	}

	const fullPath = uri.path;

	// Try to extract a sensible relative path
	// Common patterns: /home/user/project/src/file.ts -> src/file.ts
	// Look for common project root markers
	const rootMarkers = ['/src/', '/lib/', '/app/', '/packages/', '/components/'];
	for (const marker of rootMarkers) {
		const idx = fullPath.indexOf(marker);
		if (idx !== -1) {
			return fullPath.slice(idx + 1); // Remove leading slash
		}
	}

	// Fallback: return the last 3 path segments
	const segments = fullPath.split('/').filter(Boolean);
	if (segments.length > 3) {
		return segments.slice(-3).join('/');
	}

	return segments.join('/');
}

/**
 * Builds a file path hint comment appropriate for the given language.
 * E.g., `// filepath: src/utils/auth.ts` for TypeScript.
 */
function _buildFilePathHint(filepath: string, language: string): string {
	if (!filepath || filepath === 'untitled') {
		return '';
	}

	const commentPrefix = COMMENT_PREFIX_MAP[language] || '//';

	// Handle languages with block comment openers
	if (commentPrefix === '<!--') {
		return `<!-- filepath: ${filepath} -->`;
	}
	if (commentPrefix === '/*') {
		return `/* filepath: ${filepath} */`;
	}

	return `${commentPrefix} filepath: ${filepath}`;
}

/**
 * Extracts import/include statements from the top of the file.
 * Only returns them if they fall outside the prefix window (i.e., the cursor is
 * deep enough in the file that the normal prefix doesn't include imports).
 *
 * @returns Import block text, or empty string if imports are already in the prefix window
 */
function _extractImportBlock(document: ITextModel, language: string, prefixStartLine: number): string {
	// Only extract imports for languages that commonly use them
	if (!IMPORT_LANGUAGES.has(language)) {
		return '';
	}

	// If the prefix already starts at line 1, imports are included
	if (prefixStartLine <= 1) {
		return '';
	}

	const importLines: string[] = [];
	const totalLines = Math.min(document.getLineCount(), prefixStartLine - 1);

	// Scan from the top of the file, collecting import lines
	// Stop when we hit a non-import, non-blank, non-comment line
	let foundNonImport = false;
	for (let lineNum = 1; lineNum <= totalLines && !foundNonImport; lineNum++) {
		const lineText = document.getLineContent(lineNum).trim();

		// Skip blank lines and common single-line comments at the top
		if (lineText === '' || lineText.startsWith('//') || lineText.startsWith('#') || lineText.startsWith('/*') || lineText.startsWith('*') || lineText.startsWith('*/')) {
			continue;
		}

		// Check if this line matches an import pattern
		const isImport = IMPORT_PATTERNS.some(pattern => pattern.test(lineText));
		if (isImport) {
			importLines.push(document.getLineContent(lineNum));
		} else {
			// First non-import line signals end of import block
			foundNonImport = true;
		}
	}

	if (importLines.length === 0) {
		return '';
	}

	return importLines.join('\n');
}

/**
 * Simple, fast string hash function (FNV-1a variant).
 * Produces a hex string suitable for use as a cache key.
 * Not cryptographic -- purely for cache key generation.
 */
function _simpleHash(input: string): string {
	let hash = 0x811c9dc5; // FNV offset basis
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = (hash * 0x01000193) | 0; // FNV prime, keep as 32-bit integer
	}
	// Convert to unsigned 32-bit, then to hex string
	return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Builds a range that covers the text that would be replaced by the completion.
 * For FIM completions, this is typically an empty range at the cursor position
 * (the completion is inserted, not replacing existing text).
 */
export function buildInsertionRange(position: IPosition): Range {
	return new Range(
		position.lineNumber,
		position.column,
		position.lineNumber,
		position.column,
	);
}
