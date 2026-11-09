<div align="center">
  <img src="src/icon.svg" width="70" height="70" alt="Video Enhancer Logo">
  <h1>Video Enhancer</h1>

[![Firefox Add-on](https://img.shields.io/amo/v/video-enhancer?label=Firefox%20Add-on&logo=firefox&logoColor=white&style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/)

[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v3.6.0-4285F4?logo=googlechrome&logoColor=white&style=for-the-badge)](#)
[![Mozilla Add-on Users](https://img.shields.io/amo/users/video-enhancer?style=for-the-badge&logo=firefox&logoColor=white&label=Users)](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/)
[![License](https://img.shields.io/badge/License-All_Rights_Reserved-red.svg?style=for-the-badge)](LICENSE)

**A lightweight, cross-browser (Firefox/Chrome) extension that enhances video playback with fake HDR-style color processing and shadow recovery — designed specifically for LED displays that lack punchy colors or crush dark details.**

[**Install for Firefox**](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/) • [Report Bug](../../issues) • [Request Feature](../../issues)

---

</div>

## What's New in v3.6.0

- **Direct 1:1 Pipeline (Intensity Removed)**: Completely eliminated the compounding Intensity multiplier. All 9 visual controls now operate directly with true 1:1 precision.
- **Anti-Blooming Sharpness Mask**: Upgraded edge convolution with a 33-point luminance protection mask tapering off in extreme highlights ($L = 0.84 \to 1.00$), eliminating white cloth glow and halo artifacts.
- **Decoupled & Skin-Protected Vibrance**: Vibrance operates independently from standard saturation with dedicated skin-tone and neutral highlight protection.
- **Highlight Rolloff Engine Overhaul**: Fixed Gecko/Zen browser SVG filter cache invalidation with forced repaint cycles and a calibrated compression knee curve (18% knee, 40% compression, 1.35 power).
- **Calibrated Contrast Range**: Scaled contrast between 75% and 135% (100% default) to prevent highlight bleaching and dynamic range clipping.
- **Tuned Anime Default Preset**: Anime profile calibrated for optimal vibrant viewing: Brightness 100%, Contrast 110%, Saturation 130%, Vibrance 20%, Shadow Boost 25%, Highlight Rolloff 10%, Sharpness 16%.
- **Deep Codebase Optimization**: Pruned all dead methods, unused constants, and legacy state properties across the extension.

---

## About

Video Enhancer applies **real-time SVG & CSS filter pipeline adjustments** to videos across the web, boosting contrast, saturation, and perceived dynamic range — all without touching the video source itself.

> Think of it as a **smart color enhancer**, not true HDR. No metadata processing, no decoding changes, no GPU trickery.

Perfect for:

- LED/IPS monitors that struggle with deep blacks or shadow detail
- Watching Anime with vibrant colors without losing dark scene data
- Enhancing washed-out streaming content
- Adding vibrancy to gameplay footage
- Customizing video appearance to your exact panel's characteristics

---

## Features

### Presets

Choose from carefully tuned color profiles, or customize their core values.

| Preset             | Best For                                                     |
| ------------------ | ------------------------------------------------------------ |
| **Anime**    | Vibrant colors, edge clarity, and massive shadow recovery    |
| **Balanced** | Everyday viewing with natural colors                         |
| **Vivid**    | Punchy, highly saturated content                             |
| **Cinema**   | Film-like depth, warm tones, and cinematic contrast          |
| **Gaming**   | High visibility and bold saturation                          |
| **Image**    | High-clarity photo, thumbnail, and illustration enhancement  |

*(Right-click any preset button to rename it, or hit "+" to create your own custom presets!)*

### Advanced Manual Controls

Fine-tune your viewing experience using our custom dual-stage filter pipeline:

- **Shadow Boost** — Recovers crushed details in dark areas with a pure black anchor to avoid milky blacks
- **Highlight Rolloff** — Smooth anti-clipping protection preventing blown-out whites in bright scenes
- **Brightness & Contrast** — Calibrated luminance and separation controls (contrast range tuned 75%–135% to protect dynamic range)
- **Saturation & Vibrance** — Decoupled chrominance boost with skin-tone protection and neutral highlight safeguarding
- **Warmth & Tint** — 2-axis color grading: Temperature (Cool ↔ Warm) with Simple or Cinematic split-toning, and Tint (Green ↔ Magenta)
- **Sharpness** — Enhanced edge clarity via custom SVG convolution matrices featuring a 33-point luminance protection mask to prevent white cloth blooming and halo artifacts

### Playback & Utility Tools

- **Aspect Ratio & Ultrawide Zoom** — Easily crop 16:9 videos to 21:9 (no black bars), stretch, fill, or mirror (flip horizontal)
- **Audio Booster & Dialogue Compressor** — Boost quiet audio up to 400% and enable night mode dialogue leveling via Web Audio API

### Performance & UX

- **Performance Mode** — Fast CSS-only GPU accelerated pipeline for high frame-rate (4K/60fps) or battery-saving playback
- **Custom Presets** — Create, duplicate, rename, and delete unlimited custom viewing profiles
- **Direct Value Editing** — Click any percentage or degree value to type an exact number directly
- **Cross-Browser** — Full Manifest V3 support for both Chrome and Firefox
- **Keyboard Shortcut** — Hit `Alt+Shift+V` to toggle the enhancer instantly (great when in fullscreen!)
- **Import / Export** — Backup your custom presets as JSON files and share them with friends
- **Image Enhancement** — Optional toggle to apply your color tuning to thumbnails and images, not just videos
- **Per-site Memory** — Remembers custom settings per site without losing global defaults
- **Double-Click Reset** — Double-click any slider thumb to instantly snap it back to preset defaults

---

## Development & Building

Because Chrome strictly requires `service_worker` for Manifest V3, and Firefox strictly requires `scripts`, this extension uses a minimal node build script to generate dedicated browser builds from a single source folder.

### 1. Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/video-enhancer.git
cd video-enhancer
```

### 2. File Structure

- **`src/`** — **Edit your code here.** This is the source of truth containing all logic and the base `manifest.json`.
- **`build.js`** — Our lightweight packager.
- **`build/`** — The auto-generated output folder. Do not edit files in here!

### 3. Build the Extension

```bash
# Generate the build/chrome and build/firefox folders
node build.js

# Watch for changes and auto-rebuild (Recommended for development)
node build.js --watch
```

### 4. Load the Extension

- **Chrome / Brave / Edge:** Go to `chrome://extensions`, enable "Developer mode", click **Load unpacked**, and select the `build/chrome` folder.
- **Firefox:** Go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and select the `manifest.json` file inside the `build/firefox` folder.
