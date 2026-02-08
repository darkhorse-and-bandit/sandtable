# Funspace: Editor Background Image

**Status:** Implemented
**Date:** 2026-02-07
**Category:** Visual Customization

## What It Does

Allows users to set a custom background image behind the code text in the editor area. The image appears as a subtle texture or watermark beneath the code, with configurable opacity, color overlay, and blur to ensure text remains perfectly readable.

Sandtable ships with 5 bundled SVG backgrounds, and users can also provide a path to any image file on their system.

## How It Looks

With default settings (opacity 0.08, auto-overlay), the background is an extremely subtle texture -- barely visible, but adding a nice ambient feel to the editor. Users who want a more prominent background can increase the opacity.

## Settings

All settings are under the `sandtable.appearance.*` namespace:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `sandtable.appearance.backgroundImage` | string | `''` | Image path or bundled name (e.g., `bundled:topo-lines`). Empty = disabled. |
| `sandtable.appearance.backgroundOpacity` | number | `0.08` | Image opacity (0.0-1.0). Low values = subtle watermark. |
| `sandtable.appearance.backgroundOverlayColor` | string | `''` | Semi-transparent color overlay. Empty = auto-derive from theme. |
| `sandtable.appearance.backgroundBlur` | number | `0` | Blur in pixels (0-20). Softens busy images. |
| `sandtable.appearance.backgroundSize` | string | `'cover'` | CSS background-size: `cover`, `contain`, or `auto`. |
| `sandtable.appearance.backgroundPosition` | string | `'center'` | CSS background-position value. |

## Bundled Backgrounds

Five SVG backgrounds ship with Sandtable, stored at:

```
src/vs/workbench/contrib/sandtableAppearance/browser/media/backgrounds/
```

| Name | Setting Value | Description |
|------|-------------|-------------|
| Topo Lines | `bundled:topo-lines` | Topographic contour lines -- fits the "sandtable" military terrain theme |
| Grid Blueprint | `bundled:grid-blueprint` | Engineering blueprint grid with crosshairs |
| Dark Gradient | `bundled:dark-gradient` | Abstract dark color gradient with subtle accent blobs |
| Sandtable Watermark | `bundled:sandtable-watermark` | Centered "SANDTABLE" text watermark with decorative frame |
| Circuit Board | `bundled:circuit-board` | PCB circuit board traces with connection nodes and IC pads |

All are pure SVG (tiny file size, infinite scaling, theme-neutral at any opacity).

## User Custom Images

Users provide a **local file path** (e.g., `/home/mage/Pictures/mountains.jpg`). The image stays on the user's filesystem -- it is not copied or uploaded anywhere. The path is stored in the `sandtable.appearance.backgroundImage` setting, and at runtime the contribution converts it to a `vscode-file://vscode-app/...` URL for CSS injection.

The `vscode-file://` protocol handler in Electron (defined in `src/vs/platform/protocol/electron-main/protocolMainService.ts`) already allows serving `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, and `.svg` files from anywhere on the filesystem, so no protocol changes were needed.

## How It Works Technically

### DOM Structure

The Monaco editor renders code inside this DOM hierarchy:

```
.monaco-editor
  └── .overflow-guard          (position: relative, overflow: hidden, isolation: isolate)
       ├── ::before             ** INJECTED: background image layer (z-index: -1) **
       ├── ::after              ** INJECTED: color overlay layer (z-index: 0) **
       ├── margin
       ├── scrollbar
       ├── editorCanvas (if GPU)
       ├── overlay widgets
       └── minimap
```

### CSS Injection

The contribution (`sandtableAppearance.contribution.ts`) creates a dedicated `<style>` element in the document `<head>` using `createStyleSheet()` from VS Code's DOM utilities. When settings change, the stylesheet content is rebuilt entirely -- no reload required.

The generated CSS looks like:

```css
.monaco-editor .overflow-guard::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: url('vscode-file://vscode-app/path/to/image.svg');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.08;
}

.monaco-editor .overflow-guard::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: rgba(30, 30, 30, 0.85);
}
```

### Stacking Context

The key CSS addition to the editor core is `isolation: isolate` on `.monaco-editor .overflow-guard` (in `src/vs/editor/browser/widget/codeEditor/editor.css`). This creates a stacking context so the `z-index: -1` pseudo-element stays within the overflow-guard boundary rather than falling behind the parent `.monaco-editor` element.

### Auto-Overlay

When `backgroundOverlayColor` is empty (the default), the contribution reads the current theme's `editorBackground` color via `IThemeService` and generates an overlay at:
- 85% opacity for dark themes (lets a bit of image peek through)
- 90% opacity for light themes (needs more coverage for readability)

This means users only need to select an image and adjust opacity -- the overlay automatically matches their theme.

### Theme Reactivity

The contribution watches both `IConfigurationService.onDidChangeConfiguration` (for settings changes) and `IThemeService.onDidColorThemeChange` (for theme switches). When the user switches themes, the auto-overlay recalculates immediately.

### GPU Rendering Note

VS Code has an experimental GPU-accelerated rendering path (`editor.experimentalGpuAcceleration`) that renders text via a `<canvas>` element at `z-index: 0` inside `.overflow-guard`. When GPU rendering is ON, the opaque canvas obscures the background image. The contribution logs a warning when this is detected.

## File Inventory

| File | Purpose |
|------|---------|
| `src/vs/workbench/contrib/sandtableAppearance/browser/sandtableAppearance.contribution.ts` | Core contribution: CSS injection, config watching, URI resolution, auto-overlay |
| `src/vs/workbench/contrib/sandtableAppearance/browser/media/backgrounds/*.svg` | 5 bundled SVG background images |
| `src/vs/platform/cortex/common/cortexConfiguration.ts` | `AppearanceConfigKeys` enum and 6 registered settings |
| `src/vs/workbench/contrib/sandtableSettings/browser/sandtableSettingsPage.ts` | "Appearance" section in Sandtable Settings (image selector, sliders, preview) |
| `src/vs/editor/browser/widget/codeEditor/editor.css` | `isolation: isolate` on `.overflow-guard` |
| `src/vs/workbench/workbench.common.main.ts` | Contribution import |

## Settings Page

The Sandtable Settings page (`Ctrl+Shift+P` > "Sandtable Settings" > "Appearance" tab) provides:

- **Dropdown selector** with None, 5 bundled options, and "Custom file path..."
- **Custom path input** that appears when "Custom file path..." is selected
- **Remove Background button**
- **Live preview** showing a code snippet with the current background settings applied
- **Opacity slider** (0.00 - 1.00, step 0.01)
- **Overlay color input** (leave empty for auto-theme)
- **Blur slider** (0 - 20px)
- **Size input** (cover / contain / auto)
- **Position input** (CSS background-position)

All controls update the editor background in real-time via the configuration service.
