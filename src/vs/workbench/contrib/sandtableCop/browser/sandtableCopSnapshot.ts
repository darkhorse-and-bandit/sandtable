/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sandtable Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SandtableCopMapRenderer } from './sandtableCopMapRenderer.js';

// ─── CopSnapshotCapture ───────────────────────────────────────────────────────

/**
 * Captures the current COP map view as a PNG screenshot and saves it to the
 * workspace. Uses MapLibre's canvas toDataURL() API.
 *
 * The MapLibre Map must have been created with `preserveDrawingBuffer: true`
 * for toDataURL() to return non-blank images.
 */
export class CopSnapshotCapture {

	constructor(
		private readonly fileService: IFileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly logService: ILogService,
	) { }

	/**
	 * Capture the current map view as a PNG file saved to the workspace.
	 *
	 * @param mapRenderer The active COP map renderer (must have a loaded map)
	 * @param filename Optional output filename (default: map-snapshot-{timestamp}.png)
	 * @returns The relative file path of the saved snapshot, or an error message
	 */
	async capture(
		mapRenderer: SandtableCopMapRenderer | undefined,
		filename?: string,
	): Promise<string> {
		if (!mapRenderer || !mapRenderer.map) {
			throw new Error('COP map is not open. Open the Common Operating Picture first, then try again.');
		}

		const map = mapRenderer.map;

		// Force a fresh render and wait for it to complete.
		// MapLibre may not have a current frame in the WebGL buffer if the tab
		// was backgrounded (the browser suspends rendering for non-visible canvases).
		// triggerRepaint() requests a new frame; the 'render' event fires after
		// WebGL draw calls complete, ensuring toDataURL() captures actual content.
		await new Promise<void>((resolve) => {
			const onRender = () => {
				map.off('render', onRender);
				resolve();
			};
			map.on('render', onRender);
			map.triggerRepaint();

			// Safety timeout in case the render event doesn't fire (e.g., map is idle
			// with nothing to draw). 500ms is more than enough for a single frame.
			setTimeout(() => {
				map.off('render', onRender);
				resolve();
			}, 500);
		});

		// Get the WebGL canvas and convert to PNG data URI
		let dataUrl: string;
		try {
			const canvas = map.getCanvas() as HTMLCanvasElement;
			dataUrl = canvas.toDataURL('image/png');
		} catch (err) {
			throw new Error(`Failed to capture map canvas: ${err instanceof Error ? err.message : String(err)}`);
		}

		if (!dataUrl || dataUrl === 'data:,') {
			throw new Error('Map canvas returned empty image. The map may not have finished rendering.');
		}

		// Convert data URI to binary buffer
		const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
		const binaryString = atob(base64Data);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		const buffer = VSBuffer.wrap(bytes);

		// Determine output file path
		const workspaceFolder = this.workspaceService.getWorkspace().folders[0];
		if (!workspaceFolder) {
			throw new Error('No workspace folder open. Cannot save snapshot.');
		}

		const outputFilename = filename || `map-snapshot-${Date.now()}.png`;
		const snapshotDir = '.sandtable/cop/snapshots';
		const relativePath = `${snapshotDir}/${outputFilename}`;
		const fileUri = URI.joinPath(workspaceFolder.uri, relativePath);

		// Ensure the directory exists by writing the file
		// (IFileService.writeFile creates parent directories automatically)
		try {
			await this.fileService.writeFile(fileUri, buffer);
		} catch (err) {
			throw new Error(`Failed to save snapshot to "${relativePath}": ${err instanceof Error ? err.message : String(err)}`);
		}

		this.logService.info(`[COP Snapshot] Saved map snapshot to ${relativePath} (${bytes.length} bytes)`);
		return relativePath;
	}
}
