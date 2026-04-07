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
    anime: { brightness: 104, contrast: 110, saturate: 142, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 70, sharpness: 12, shadowBoost: 45 },
    balanced: { brightness: 105, contrast: 115, saturate: 120, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 50, sharpness: 0, shadowBoost: 0 },
    vivid: { brightness: 110, contrast: 130, saturate: 150, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 75, sharpness: 10, shadowBoost: 0 },
    cinema: { brightness: 100, contrast: 120, saturate: 110, warmth: 12, warmthMode: WARMTH_MODE.CINEMATIC, intensity: 60, sharpness: 0, shadowBoost: 20 },
    gaming: { brightness: 112, contrast: 135, saturate: 140, warmth: -8, warmthMode: WARMTH_MODE.SIMPLE, intensity: 80, sharpness: 20, shadowBoost: 10 },
    warm: { brightness: 104, contrast: 108, saturate: 118, warmth: 22, warmthMode: WARMTH_MODE.CINEMATIC, intensity: 55, sharpness: 0, shadowBoost: 0 }
};

const DEFAULT_PRESET_NAMES = {
    anime: 'Anime',
    balanced: 'Balanced',
    vivid: 'Vivid',
    cinema: 'Cinema',
    gaming: 'Gaming',
    warm: 'Warm'
};

const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'intensity', 'sharpness', 'shadowBoost'];
const SELECT_KEYS = ['warmthMode'];
const ALL_SETTING_KEYS = [...SLIDER_KEYS, ...SELECT_KEYS];
const DEFAULT_ACTIVE_PRESET = 'balanced';

const SLIDER_RANGES = {
    brightness: { min: 50, max: 150 },
    contrast: { min: 50, max: 200 },
    saturate: { min: 50, max: 200 },
    warmth: { min: -30, max: 30 },
    intensity: { min: 0, max: 100 },
    sharpness: { min: 0, max: 100 },
    shadowBoost: { min: 0, max: 100 }
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
            : factory[key];
    }

    cleaned.warmthMode = Object.values(WARMTH_MODE).includes(preset?.warmthMode)
        ? preset.warmthMode
        : factory.warmthMode;

    return cleaned;
}

function validateAllPresets(presets) {
    const result = {};
    for (const key of Object.keys(PRESET_DEFAULTS)) {
        result[key] = validatePreset(presets?.[key], key);
    }
    return result;
}

const STORAGE_KEYS = ['enabled', 'activePreset', 'presets', 'siteSettings', 'enableImages', 'presetNames'];
