# 🎬 Video Enhancer (Fake HDR)

<div align="center">

[![Firefox Add-on](https://img.shields.io/amo/v/video-enhancer?label=Firefox%20Add-on&logo=firefox&logoColor=white&style=for-the-badge)](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/)
[![Mozilla Add-on Users](https://img.shields.io/amo/users/video-enhancer?style=for-the-badge&logo=firefox&logoColor=white&label=Users)](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/)
[![Mozilla Add-on Rating](https://img.shields.io/amo/rating/video-enhancer?style=for-the-badge&logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

**A lightweight browser extension that enhances video playback with fake HDR-style color processing — designed specifically for LED displays with TN panel that lack punchy colors.**

[**🦊 Install for Firefox**](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/) • [Report Bug](../../issues) • [Request Feature](../../issues)

---

</div>


## 🎯 About

Video Enhancer applies **real-time CSS filter adjustments** to videos, boosting contrast, saturation, and perceived dynamic range — all without touching the video source itself.

> 💡 Think of it as a **smart color enhancer**, not true HDR. No metadata processing, no decoding changes, no GPU trickery.

Perfect for:
- 📺 LED monitors without HDR support
- 🎥 Enhancing washed-out streaming content
- 🎮 Adding vibrancy to gameplay footage
- 🎬 Customizing video appearance to your preference

---

## ✨ Features

### 🎨 Presets

Choose from carefully tuned color profiles:

| Preset | Best For |
|--------|----------|
| **Subtle** | Slight enhancement without overdoing it |
| **Balanced** | Everyday viewing with natural colors |
| **Vivid** | Punchy, vibrant content |
| **Cinema** | Film-like depth and contrast |
| **Gaming** | High visibility and saturation |
| **Warm** | Comfortable, eye-friendly tones |

### 🎚️ Manual Controls

Fine-tune your viewing experience:

- **Brightness** — Adjust overall luminance
- **Contrast** — Control light/dark separation
- **Saturation** — Boost or reduce color intensity
- **Warmth** — Shift color temperature (cool ↔ warm)
- **Intensity** — Overall effect strength

### ⚡ Performance & UX

- 🔘 **One-click toggle** — Enable/disable instantly
- 🎛️ **Live adjustments** — No page reloads required
- 💾 **Per-site settings** — Remembers your preferences
- ♻️ **Reset options** — Individual presets or everything
- 🚀 **Runs at `document_start`** — Instant effect on page load

---

## 📦 Installation

### 🦊 Firefox (Recommended)

<a href="https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/">
  <img src="https://img.shields.io/badge/Install%20from-Firefox%20Add--ons-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white" alt="Get it for Firefox"/>
</a>

Simply click the button above or visit the [Firefox Add-ons page](https://addons.mozilla.org/en-US/firefox/addon/video-enhancer/).

### 🛠️ Manual Installation (Development)

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/video-enhancer.git

# Open Firefox and navigate to
about:debugging#/runtime/this-firefox

# Click "Load Temporary Add-on"
# Select the manifest.json file from the cloned folder
