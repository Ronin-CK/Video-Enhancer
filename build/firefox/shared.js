/*
 * Copyright (c) 2026 Chandra Kant (Ronin-CK)
 * All Rights Reserved.
 * This product and its source code are proprietary.
 */

// cross-browser polyfill: Chrome uses 'chrome', Firefox uses 'browser'
if (typeof globalThis.browser === 'undefined') {
    globalThis.browser = chrome;
}

const WARMTH_MODE = {
    SIMPLE: 'simple',
    CINEMATIC: 'cinematic'
};

const PRESET_DEFAULTS = {
    anime: { brightness: 100, contrast: 110, saturate: 130, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, sharpness: 16, shadowBoost: 25, highlights: 10, tint: 0, vibrance: 20 },
    balanced: { brightness: 101, contrast: 107, saturate: 110, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, sharpness: 0, shadowBoost: 14, highlights: 14, tint: 0, vibrance: 12 },
    vivid: { brightness: 103, contrast: 115, saturate: 122, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, sharpness: 18, shadowBoost: 18, highlights: 24, tint: 0, vibrance: 20 },
    cinema: { brightness: 100, contrast: 112, saturate: 106, warmth: 7, warmthMode: WARMTH_MODE.CINEMATIC, sharpness: 0, shadowBoost: 18, highlights: 28, tint: -2, vibrance: 8 },
    gaming: { brightness: 104, contrast: 115, saturate: 116, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, sharpness: 20, shadowBoost: 38, highlights: 20, tint: 0, vibrance: 18 },
    image: { brightness: 102, contrast: 112, saturate: 114, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, sharpness: 24, shadowBoost: 28, highlights: 25, tint: 0, vibrance: 16 }
};

const DEFAULT_PRESET_NAMES = {
    anime: 'Anime',
    balanced: 'Balanced',
    vivid: 'Vivid',
    cinema: 'Cinema',
    gaming: 'Gaming',
    image: 'Image'
};

const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'sharpness', 'shadowBoost', 'highlights', 'tint', 'vibrance'];
const SELECT_KEYS = ['warmthMode'];
const DEFAULT_ACTIVE_PRESET = 'balanced';

const SLIDER_RANGES = {
    brightness: { min: 50, max: 150, def: 100 },
    contrast: { min: 75, max: 135, def: 100 },
    saturate: { min: 50, max: 200, def: 100 },
    warmth: { min: -30, max: 30, def: 0 },
    sharpness: { min: 0, max: 100, def: 0 },
    shadowBoost: { min: 0, max: 100, def: 0 },
    highlights: { min: 0, max: 100, def: 0 },
    tint: { min: -30, max: 30, def: 0 },
    vibrance: { min: 0, max: 100, def: 0 }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

const PERFORMANCE_DEFAULT_HOSTS = [
    'youtube.com',
    'youtube-nocookie.com',
    'youtu.be',
    'twitch.tv',
    'kick.com'
];

function isPerformanceDefaultHost(hostname) {
    if (!hostname) return false;
    const h = String(hostname).toLowerCase().replace(/^www\./, '');
    return PERFORMANCE_DEFAULT_HOSTS.some(host => h === host || h.endsWith('.' + host));
}

function isYouTubeHost(hostname) {
    return isPerformanceDefaultHost(hostname);
}

function validatePreset(preset, fallbackKey) {
    const factory = PRESET_DEFAULTS[fallbackKey] || PRESET_DEFAULTS.balanced;
    const cleaned = { ...factory };

    for (const key of SLIDER_KEYS) {
        const raw = parseFloat(preset?.[key]);
        const range = SLIDER_RANGES[key];
        cleaned[key] = Number.isFinite(raw)
            ? clamp(Math.round(raw), range.min, range.max)
            : (factory[key] !== undefined ? factory[key] : (range?.def ?? 0));
    }

    // Cleanly migrate legacy default sharpness (8) to 0 for balanced preset to ensure stutter-free 60fps playback
    if (fallbackKey === 'balanced' && preset?.sharpness === 8) {
        cleaned.sharpness = 0;
    }

    cleaned.warmthMode = Object.values(WARMTH_MODE).includes(preset?.warmthMode)
        ? preset.warmthMode
        : factory.warmthMode;

    if (preset?.name) {
        cleaned.name = String(preset.name).slice(0, 30);
    }

    return cleaned;
}

function validateAllPresets(presets, presetVersion = '3.6.3') {
    const isUpgraded = presetVersion === '3.6.0' || presetVersion === '3.6.1' || presetVersion === '3.6.2' || presetVersion === '3.6.3';
    const result = {};
    for (const key of Object.keys(PRESET_DEFAULTS)) {
        if (!isUpgraded) {
            result[key] = deepClone(PRESET_DEFAULTS[key]);
        } else {
            result[key] = validatePreset(presets?.[key], key);
        }
    }
    if (presets && typeof presets === 'object') {
        for (const [key, val] of Object.entries(presets)) {
            // Cleanly migrate legacy 'warm' preset to 'image'
            if (key === 'warm') continue;
            if (!result[key] && val && typeof val === 'object') {
                result[key] = validatePreset(val, 'balanced');
            }
        }
    }
    return result;
}

const STORAGE_KEYS = [
    'enabled',
    'activePreset',
    'presets',
    'presetVersion',
    'siteSettings',
    'enableImages',
    'presetNames',
    'performanceMode',
    'aspectRatio',
    'audioBoost',
    'audioCompressor',
    'themeColor',
    'enableHud',
    'hudPosition'
];
