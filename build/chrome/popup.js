/*
 * Copyright (c) 2026 Chandra Kant (Ronin-CK)
 * All Rights Reserved.
 * This product and its source code are proprietary.
 */


let currentPresetName = DEFAULT_ACTIVE_PRESET;
let currentScope = 'global';

let state = {
    enabled: true,
    presets: deepClone(PRESET_DEFAULTS),
    hostname: null,
    siteSettings: {},
    globalSettings: null,
    enableImages: false,
    presetNames: { ...DEFAULT_PRESET_NAMES }
};

function getEl(id) { return document.getElementById(id); }

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function isPresetModified(presetName) {
    const current = state.presets[presetName];
    const factory = PRESET_DEFAULTS[presetName];
    if (!current || !factory) return false;
    return ALL_SETTING_KEYS.some(key => current[key] !== factory[key]);
}

async function getCurrentHostname() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
        try {
            const url = new URL(tab.url);
            if (url.protocol.startsWith('http')) {
                return url.hostname.replace(/^www\./, '');
            }
        } catch (e) { console.error(e); }
    }
    return null;
}

async function isRestrictedPage() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return true;
    const url = tab.url;
    return !url.startsWith('http://') && !url.startsWith('https://');
}

async function loadState() {
    try {
        const [stored, hostname] = await Promise.all([
            browser.storage.local.get(STORAGE_KEYS),
            getCurrentHostname()
        ]);

        state.hostname = hostname;
        state.siteSettings = stored.siteSettings || {};
        state.presetNames = { ...DEFAULT_PRESET_NAMES, ...(stored.presetNames || {}) };

        loadSettingsFromData(stored);

        state.globalSettings = {
            enabled: state.enabled,
            enableImages: state.enableImages,
            activePreset: currentPresetName,
            presets: deepClone(state.presets)
        };

        if (hostname && state.siteSettings[hostname]) {
            currentScope = 'site';
            loadSettingsFromData(state.siteSettings[hostname]);
        }

        const siteTab = document.getElementById('tab-site');
        if (siteTab) {
            siteTab.textContent = hostname || "No Site";
            siteTab.disabled = !hostname;
        }

    } catch (e) {
        console.error(e);
        state.enabled = true;
        state.enableImages = false;
        currentPresetName = DEFAULT_ACTIVE_PRESET;
        state.presets = deepClone(PRESET_DEFAULTS);
    }
}

function loadSettingsFromData(data) {
    state.enabled = data.enabled ?? true;
    state.enableImages = data.enableImages ?? false;
    currentPresetName = data.activePreset || DEFAULT_ACTIVE_PRESET;

    if (!PRESET_DEFAULTS[currentPresetName]) {
        currentPresetName = DEFAULT_ACTIVE_PRESET;
    }

    if (data.presets) {
        state.presets = validateAllPresets(data.presets);
        for (const name of Object.keys(PRESET_DEFAULTS)) {
            if (data.presets[name]?.name) {
                state.presets[name].name = data.presets[name].name;
            } else {
                state.presets[name].name = PRESET_DEFAULTS[name]?.name || DEFAULT_PRESET_NAMES[name];
            }
        }
    } else {
        state.presets = deepClone(PRESET_DEFAULTS);
    }
}

function saveState() {
    const data = {
        enabled: state.enabled,
        enableImages: state.enableImages,
        activePreset: currentPresetName,
        presets: state.presets
    };

    if (currentScope === 'global') {
        browser.storage.local.set(data).catch(console.error);
        state.globalSettings = deepClone(data);
    } else if (currentScope === 'site' && state.hostname) {
        if (!state.siteSettings) state.siteSettings = {};
        state.siteSettings[state.hostname] = data;
        browser.storage.local.set({ siteSettings: state.siteSettings }).catch(console.error);
    }
}

function switchScope(newScope) {
    if (newScope === currentScope) return;
    if (newScope === 'site' && !state.hostname) return;

    currentScope = newScope;

    if (newScope === 'site') {
        const siteData = state.siteSettings[state.hostname];
        if (siteData) loadSettingsFromData(siteData);
    } else {
        if (state.hostname && state.siteSettings[state.hostname]) {
            delete state.siteSettings[state.hostname];
            browser.storage.local.set({ siteSettings: state.siteSettings }).catch(console.error);
        }

        if (state.globalSettings) {
            state.enabled = state.globalSettings.enabled;
            state.enableImages = state.globalSettings.enableImages;
            currentPresetName = state.globalSettings.activePreset;
            state.presets = deepClone(state.globalSettings.presets);
        } else {
            loadState();
            return;
        }
    }
    updateAllUI();
    broadcastChanges();
}

function updateToggleUI() {
    const toggle = document.getElementById('enabled-toggle');
    if (toggle) toggle.checked = state.enabled;

    const imgToggle = document.getElementById('images-toggle');
    if (imgToggle) imgToggle.checked = state.enableImages;
}

function updatePresetButtonsUI() {
    document.querySelectorAll('.preset-item').forEach(item => {
        const key = item.dataset.preset;
        const btn = item.querySelector('.preset-btn');
        if (!btn) return;

        const displayName = state.presetNames[key] || DEFAULT_PRESET_NAMES[key] || key;
        btn.textContent = displayName;

        btn.classList.toggle('active', key === currentPresetName);
        item.classList.toggle('modified', isPresetModified(key));
    });
}

function updateSlidersUI() {
    const vals = state.presets[currentPresetName];
    if (!vals) return;

    SLIDER_KEYS.forEach(key => {
        const slider = document.getElementById(key);
        if (slider) {
            const value = vals[key] !== undefined ? vals[key] : (PRESET_DEFAULTS[currentPresetName]?.[key] ?? 100);
            slider.value = value;
            updateValueDisplay(key, value, document.getElementById(`${key}-value`));
            updateSliderFill(slider);
        }
    });
}

function updateSelectsUI() {
    const vals = state.presets[currentPresetName];
    if (!vals) return;

    SELECT_KEYS.forEach(key => {
        const el = document.getElementById(key);
        if (el && vals[key] !== undefined) el.value = vals[key];
    });
    updateWarmthModeState();
}

function updateWarmthModeState() {
    const vals = state.presets[currentPresetName];
    const select = document.getElementById('warmthMode');
    const container = document.getElementById('warmth-mode-container');
    const badge = document.getElementById('warmth-mode-badge');

    if (!select || !vals) return;

    const isActive = Math.abs(vals.warmth || 0) > 0;

    if (container) container.classList.toggle('disabled', !isActive);
    select.disabled = !isActive;

    if (badge) {
        badge.textContent = isActive
            ? (vals.warmthMode === WARMTH_MODE.CINEMATIC ? 'Cinematic' : 'Simple')
            : 'Inactive';
    }
}

function updateValueDisplay(key, value, el) {
    if (!el) return;
    if (key === 'warmth') el.textContent = `${value > 0 ? '+' : ''}${value}°`;
    else if (key === 'sharpness' || key === 'shadowBoost') el.textContent = value === 0 ? 'Off' : `${value}%`;
    else el.textContent = `${value}%`;
}

function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const pct = ((val - min) / (max - min)) * 100;

    if (slider.id === 'warmth') {
        const midPct = ((-min) / (max - min)) * 100; // where 0 sits
        slider.style.background = `linear-gradient(to right,
            #5b9bd5 0%,
            #8eb8e0 ${midPct * 0.5}%,
            var(--surface-color) ${midPct}%,
            #e8a84c ${midPct + (100 - midPct) * 0.5}%,
            #d4782f 100%)`;
        slider.style.setProperty('--fill-pct', `${pct}%`);
    } else {
        slider.style.background = `linear-gradient(to right,
            var(--accent-color) 0%,
            var(--accent-color) ${pct}%,
            var(--surface-color) ${pct}%,
            var(--surface-color) 100%)`;
    }
}

function updateTabsUI() {
    document.getElementById('tab-global')?.classList.toggle('active', currentScope === 'global');
    document.getElementById('tab-site')?.classList.toggle('active', currentScope === 'site');
}

function updateAllUI() {
    updateTabsUI();
    updateToggleUI();
    updatePresetButtonsUI();
    updateSlidersUI();
    updateSelectsUI();
}

function toggleEnabled(e) {
    state.enabled = e.target.checked;
    saveState();
    broadcastChanges();
}

function toggleImagesEnabled(e) {
    state.enableImages = e.target.checked;
    saveState();
    broadcastChanges();
}

function handlePresetClick(e) {
    const item = e.target.closest('.preset-item');
    if (!item) return;

    const name = item.dataset.preset;
    if (!name || name === currentPresetName) return;

    currentPresetName = name;

    updatePresetButtonsUI();
    updateSlidersUI();
    updateSelectsUI();
    broadcastChanges();
    saveState();
}

function handlePresetReset(e) {
    e.stopPropagation();
    const item = e.target.closest('.preset-item');
    if (!item) return;

    const key = item.dataset.preset;
    if (PRESET_DEFAULTS[key]) {
        state.presetNames[key] = DEFAULT_PRESET_NAMES[key];
        browser.storage.local.set({ presetNames: state.presetNames }).catch(console.error);

        state.presets[key] = deepClone(PRESET_DEFAULTS[key]);

        const btn = item.querySelector('.preset-btn');
        if (btn) {
            btn.classList.add('reset-flash');
            setTimeout(() => btn.classList.remove('reset-flash'), 600);
        }

        updatePresetButtonsUI();

        if (key === currentPresetName) {
            updateSlidersUI();
            updateSelectsUI();
        }
        broadcastChanges();
        saveState();
    }
}

function handlePresetRightClick(e) {
    e.preventDefault();
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;

    const item = btn.closest('.preset-item');
    const key = item.dataset.preset;

    const originalName = state.presetNames[key] || DEFAULT_PRESET_NAMES[key];
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'preset-rename-input';
    input.value = originalName;

    btn.textContent = '';
    btn.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
        let newName = input.value.trim();
        const factoryDefault = DEFAULT_PRESET_NAMES[key];

        if (!newName) newName = factoryDefault;

        state.presetNames[key] = newName;
        browser.storage.local.set({ presetNames: state.presetNames }).catch(console.error);
        updatePresetButtonsUI();
    };

    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            input.blur();
        }
        if (ev.key === 'Escape') {
            ev.preventDefault();
            input.value = originalName;
            input.blur();
        }
    });

    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('click', (ev) => ev.stopPropagation());
}

const debouncedSave = debounce(saveState, 300);

function handleSliderChange(e) {
    saveState();
}

function handleSliderInput(e) {
    const key = e.target.id;
    const val = parseInt(e.target.value, 10);

    if (state.presets[currentPresetName]) {
        state.presets[currentPresetName][key] = val;
    }

    updateValueDisplay(key, val, document.getElementById(`${key}-value`));
    updateSliderFill(e.target);
    updatePresetButtonsUI();

    if (key === 'warmth') updateWarmthModeState();

    broadcastChanges();
    debouncedSave();
}

function handleSliderDblClick(e) {
    const key = e.target.id;
    const factory = PRESET_DEFAULTS[currentPresetName];
    if (!factory || factory[key] === undefined) return;

    e.target.value = factory[key];

    if (state.presets[currentPresetName]) {
        state.presets[currentPresetName][key] = factory[key];
    }

    updateValueDisplay(key, factory[key], document.getElementById(`${key}-value`));
    updateSliderFill(e.target);
    updatePresetButtonsUI();

    if (key === 'warmth') updateWarmthModeState();

    broadcastChanges();
    saveState();
}

function broadcastChanges() {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (tabs[0]?.id) {
            browser.tabs.sendMessage(tabs[0].id, {
                type: 'UPDATE_SETTINGS',
                settings: {
                    enabled: state.enabled,
                    enableImages: state.enableImages,
                    activePreset: currentPresetName,
                    presets: state.presets
                },
                ignoreStorage: true
            }).catch(() => { });
        }
    });
}

function handleSelectChange(e) {
    const key = e.target.id;
    if (state.presets[currentPresetName]) {
        state.presets[currentPresetName][key] = e.target.value;
    }

    if (key === 'warmthMode') {
        const badge = document.getElementById('warmth-mode-badge');
        if (badge) badge.textContent = e.target.value === WARMTH_MODE.CINEMATIC ? 'Cinematic' : 'Simple';
    }

    updatePresetButtonsUI();
    saveState();
}


function exportSettings() {
    browser.storage.local.get(STORAGE_KEYS).then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `video-enhancer-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Settings exported!');
    }).catch(err => {
        console.error('Export error:', err);
        showToast('Export failed');
    });
}

function importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (data.presets) {
                data.presets = validateAllPresets(data.presets);
            }
            if (data.presetNames) {
                const cleaned = {};
                for (const key of Object.keys(PRESET_DEFAULTS)) {
                    if (typeof data.presetNames[key] === 'string') {
                        cleaned[key] = data.presetNames[key].slice(0, 20); // cap length
                    }
                }
                data.presetNames = cleaned;
            }
            if (data.activePreset && !PRESET_DEFAULTS[data.activePreset]) {
                data.activePreset = DEFAULT_ACTIVE_PRESET;
            }

            await browser.storage.local.set(data);
            await loadState();
            updateAllUI();
            broadcastChanges();

            showToast('Settings imported!');
        } catch (err) {
            console.error('Import error:', err);
            showToast('Invalid file');
        }
    });

    input.click();
}

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
}

async function checkRestrictedPage() {
    const restricted = await isRestrictedPage();
    const banner = document.getElementById('restricted-banner');
    const mainContent = document.getElementById('main-content');

    if (restricted && banner && mainContent) {
        banner.classList.add('visible');
        mainContent.classList.add('restricted');
    }
}

function attachEventListeners() {
    document.getElementById('enabled-toggle')?.addEventListener('change', toggleEnabled);
    document.getElementById('images-toggle')?.addEventListener('change', toggleImagesEnabled);

    document.querySelectorAll('.preset-btn').forEach(b => {
        b.addEventListener('click', handlePresetClick);
        b.addEventListener('contextmenu', handlePresetRightClick);
    });
    document.querySelectorAll('.preset-reset').forEach(b => b.addEventListener('click', handlePresetReset));

    SLIDER_KEYS.forEach(k => {
        const slider = document.getElementById(k);
        if (slider) {
            slider.addEventListener('input', handleSliderInput);
            slider.addEventListener('change', handleSliderChange);
            slider.addEventListener('dblclick', handleSliderDblClick);
        }
    });
    SELECT_KEYS.forEach(k => document.getElementById(k)?.addEventListener('change', handleSelectChange));

    document.getElementById('tab-global')?.addEventListener('click', () => switchScope('global'));
    document.getElementById('tab-site')?.addEventListener('click', () => switchScope('site'));

    document.getElementById('btn-export')?.addEventListener('click', exportSettings);
    document.getElementById('btn-import')?.addEventListener('click', importSettings);
}

async function init() {
    await loadState();
    updateAllUI();
    attachEventListeners();
    checkRestrictedPage();
}

init();
