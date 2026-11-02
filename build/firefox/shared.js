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
    anime: { brightness: 104, contrast: 114, saturate: 136, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 75, sharpness: 16, shadowBoost: 30, highlights: 18, tint: 0, vibrance: 20 },
    balanced: { brightness: 102, contrast: 112, saturate: 115, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 65, sharpness: 6, shadowBoost: 15, highlights: 12, tint: 0, vibrance: 12 },
    vivid: { brightness: 106, contrast: 124, saturate: 135, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 80, sharpness: 14, shadowBoost: 10, highlights: 22, tint: 0, vibrance: 25 },
    cinema: { brightness: 100, contrast: 118, saturate: 106, warmth: 12, warmthMode: WARMTH_MODE.CINEMATIC, intensity: 70, sharpness: 0, shadowBoost: 22, highlights: 30, tint: -2, vibrance: 8 },
    gaming: { brightness: 108, contrast: 126, saturate: 125, warmth: -6, warmthMode: WARMTH_MODE.SIMPLE, intensity: 85, sharpness: 24, shadowBoost: 45, highlights: 15, tint: 0, vibrance: 16 },
    image: { brightness: 102, contrast: 120, saturate: 130, warmth: 2, warmthMode: WARMTH_MODE.SIMPLE, intensity: 80, sharpness: 32, shadowBoost: 40, highlights: 28, tint: 0, vibrance: 22 }
};

const DEFAULT_PRESET_NAMES = {
    anime: 'Anime',
    balanced: 'Balanced',
    vivid: 'Vivid',
    cinema: 'Cinema',
    gaming: 'Gaming',
    image: 'Image'
};

const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'intensity', 'sharpness', 'shadowBoost', 'highlights', 'tint', 'vibrance'];
const SELECT_KEYS = ['warmthMode'];
const ALL_SETTING_KEYS = [...SLIDER_KEYS, ...SELECT_KEYS];
const DEFAULT_ACTIVE_PRESET = 'balanced';

const SLIDER_RANGES = {
    brightness: { min: 50, max: 150, def: 100 },
    contrast: { min: 50, max: 200, def: 100 },
    saturate: { min: 50, max: 200, def: 100 },
    warmth: { min: -30, max: 30, def: 0 },
    intensity: { min: 0, max: 100, def: 100 },
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

    cleaned.warmthMode = Object.values(WARMTH_MODE).includes(preset?.warmthMode)
        ? preset.warmthMode
        : factory.warmthMode;

    if (preset?.name) {
        cleaned.name = String(preset.name).slice(0, 30);
    }

    return cleaned;
}

function validateAllPresets(presets) {
    const result = {};
    for (const key of Object.keys(PRESET_DEFAULTS)) {
        result[key] = validatePreset(presets?.[key], key);
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
