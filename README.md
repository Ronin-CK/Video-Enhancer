<div align="center">
  <img src="src/icon.svg" width="70" height="70" alt="Video Enhancer Logo">
  <h1>Video Enhancer</h1>

[![Firefox Add-on](https://img.shields.io/amo/v/video-enhancer?label=Firefox%20Add-on&logo=firefox&logoColor=white&style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/)

[![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-v3.3.1-4285F4?logo=googlechrome&logoColor=white&style=for-the-badge)](#)
[![Mozilla Add-on Users](https://img.shields.io/amo/users/video-enhancer?style=for-the-badge&logo=firefox&logoColor=white&label=Users)](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/)
[![License](https://img.shields.io/badge/License-All_Rights_Reserved-red.svg?style=for-the-badge)](LICENSE)

**A lightweight, cross-browser (Firefox/Chrome) extension that enhances video playback with fake HDR-style color processing and shadow recovery — designed specifically for LED displays that lack punchy colors or crush dark details.**

[**🦊 Install for Firefox**](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/) • [Report Bug](../../issues) • [Request Feature](../../issues)

---

</div>

## About

Video Enhancer applies **real-time SVG & CSS filter pipeline adjustments** to videos across the web, boosting contrast, saturation, and perceived dynamic range — all without touching the video source itself.

> 💡 Think of it as a **smart color enhancer**, not true HDR. No metadata processing, no decoding changes, no GPU trickery.

Perfect for:

- LED/IPS monitors that struggle with deep blacks or shadow detail
- Watching Anime with vibrant colors without losing dark scene data
- Enhancing washed-out streaming content
- Adding vibrancy to gameplay footage
- Customizing video appearance to your exact panel's characteristics

---

## ✨ Features

### Presets

Choose from carefully tuned color profiles, or customize their core values.

| Preset             | Best For                                                     |
| ------------------ | ------------------------------------------------------------ |
| **Anime**    | Vibrant colors, sharpened edges, and massive shadow recovery |
| **Balanced** | Everyday viewing with natural colors                         |
| **Vivid**    | Punchy, highly saturated content                             |
| **Cinema**   | Film-like depth, warm tones, and cinematic contrast          |
| **Gaming**   | High visibility and bold saturation                          |
| **Warm**     | Comfortable, eye-friendly tones                              |

*(Right-click any preset button to rename it to whatever you want!)*

### 🎚️ Advanced Manual Controls

Fine-tune your viewing experience using our custom dual-stage filter pipeline:

- **Shadow Boost** — Recovers crushed details in dark areas using non-linear SVG gamma correction (Runs *before* contrast!)
- **Brightness** — Adjust overall luminance
- **Contrast** — Control light/dark separation
- **Saturation** — Boost or reduce color intensity
- **Warmth** — Shift color temperature (cool ↔ warm gradient)
- **Sharpness** — Enhance edge clarity via custom SVG matrices
- **Intensity** — Scale the overall effect strength from 0% to 100%

### ⚡ Performance & UX

- **Cross-Browser** — Full Manifest V3 support for both Chrome and Firefox
- **Keyboard Shortcut** — Hit `Alt+Shift+V` to toggle the enhancer instantly (great when in fullscreen!)
- **Import / Export** — Backup your custom presets as JSON files and share them with friends
- **Image Enhancement** — Optional toggle to apply your color tuning to thumbnails and images, not just videos
- **Per-site Memory** — Remembers exactly which sites you enable/disable it on
- **Double-Click Reset** — Double-click any slider thumb to instantly snap it back to factory zero

---

## 🛠️ Development & Building

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
