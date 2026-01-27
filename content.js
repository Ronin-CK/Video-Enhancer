const STYLE_ID = 'firefox-hdr-optimizer-style';

// Default preset values (factory defaults)
const PRESET_DEFAULTS = {
    subtle:   { brightness: 102, contrast: 108, saturate: 110, warmth: 0, intensity: 100 },
    balanced: { brightness: 105, contrast: 115, saturate: 120, warmth: 0, intensity: 100 },
    vivid:    { brightness: 108, contrast: 125, saturate: 140, warmth: 0, intensity: 100 },
    cinema:   { brightness: 100, contrast: 120, saturate: 115, warmth: 10, intensity: 100 },
    gaming:   { brightness: 110, contrast: 130, saturate: 135, warmth: -5, intensity: 100 },
    warm:     { brightness: 105, contrast: 110, saturate: 115, warmth: 20, intensity: 100 }
};

function applyFilters(data) {
    // Check if enabled
    if (!data || data.enabled === false) {
        removeFilters();
        return;
    }

    // Get active preset name and its values
    const activePresetName = data.activePreset || 'balanced';
    const presets = data.presets || PRESET_DEFAULTS;
    const activeValues = presets[activePresetName] || PRESET_DEFAULTS.balanced;

    // Extract values
    const intensity = (activeValues.intensity ?? 100) / 100;
    const b = 100 + ((activeValues.brightness ?? 100) - 100) * intensity;
    const c = 100 + ((activeValues.contrast ?? 100) - 100) * intensity;
    const sat = 100 + ((activeValues.saturate ?? 100) - 100) * intensity;
    const warmth = (activeValues.warmth ?? 0) * intensity;

    // Get or create style element
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
    }

    // Build filter string
    const filterValue = `brightness(${b}%) contrast(${c}%) saturate(${sat}%) hue-rotate(${warmth}deg)`;

    style.textContent = `
    /* Target video elements */
    video,
    .html5-main-video,
    .video-stream,
    .html5-video-player video,
    [class*="player"] video {
        filter: ${filterValue} !important;
    }

    /* Protect images from filtering */
    img,
    picture,
    [role="img"],
    ytd-thumbnail,
    .ytp-videowall-still-image,
    yt-image,
    yt-img-shadow {
        filter: none !important;
    }
    `;
}

function removeFilters() {
    const style = document.getElementById(STYLE_ID);
    if (style) {
        style.remove();
    }
}

// Initial load
browser.storage.local.get(null).then(applyFilters).catch(() => {
    // Apply balanced preset by default
    applyFilters({ enabled: true, activePreset: 'balanced', presets: PRESET_DEFAULTS });
});

// Listen for storage changes
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        browser.storage.local.get(null).then(applyFilters);
    }
});

// Re-apply on dynamic content changes
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
                browser.storage.local.get(null).then(applyFilters);
                return;
            }
        }
    }
});

if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
}
