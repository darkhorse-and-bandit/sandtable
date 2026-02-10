# COP Static Assets

This directory contains offline map assets for the Sandtable Common Operating Picture (COP).
All assets must be present for the map to render with basemap tiles and labels.

## Directory Structure

```
cop-assets/
  fonts/
    Noto Sans Regular/    # PBF glyph files (0-255.pbf, 256-511.pbf, ...)
    Noto Sans Medium/     # PBF glyph files
    Noto Sans Italic/     # PBF glyph files
  sprites/
    v4/
      light.png           # Light theme sprite sheet
      light.json          # Light theme sprite index
      light@2x.png        # Light theme 2x sprite sheet
      light@2x.json       # Light theme 2x sprite index
      dark.png            # Dark theme sprite sheet
      dark.json           # Dark theme sprite index
      dark@2x.png         # Dark theme 2x sprite sheet
      dark@2x.json        # Dark theme 2x sprite index
  natural-earth.pmtiles   # Low-zoom world basemap fallback (~5-10 MB)
```

## How to Download

### Fonts and Sprites

Download from the Protomaps basemaps-assets repository:

```bash
git clone https://github.com/protomaps/basemaps-assets.git
cp -r basemaps-assets/fonts/* resources/cop-assets/fonts/
cp -r basemaps-assets/sprites/* resources/cop-assets/sprites/
```

### Natural Earth PMTiles

Download a pre-built Natural Earth PMTiles file:

```bash
# Option 1: From Protomaps downloads
curl -L -o resources/cop-assets/natural-earth.pmtiles \
  https://build.protomaps.com/20230408.pmtiles

# Option 2: Build with Tilemaker from Natural Earth data
# See https://tilemaker.org for instructions
```

## Notes

- Font PBF files are ~30 MB total across all three font stacks
- Sprite sheets are ~1 MB total
- Natural Earth PMTiles is ~5-10 MB
- Without these assets, the map will render with a plain background color only
- The COP will still function (pan, zoom, drawing, coordinates) without tiles
