/*
 * Copyright (c) 2026 Chandra Kant (Ronin-CK)
 * All Rights Reserved.
 * Tactical Flat Neo-Anime Logic
 */

let currentPresetName = DEFAULT_ACTIVE_PRESET;
let currentScope = 'global';
let activeTabId = null;

let state = {
    enabled: true,
    presets: deepClone(PRESET_DEFAULTS),
    hostname: null,
    siteSettings: {},
    globalSettings: null,
    enableImages: false,
    presetNames: { ...DEFAULT_PRESET_NAMES },
    performanceMode: false,
    aspectRatio: 'default',
    audioBoost: 100,
    audioCompressor: false,
    themeColor: '#ff9800'
};

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function getActiveTab() {
    const isWebTab = (t) => t && t.id && (!t.url || (!t.url.startsWith('chrome-extension://') && !t.url.startsWith('moz-extension://')));

    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const valid = tabs?.find(isWebTab);
        if (valid) return valid;
    } catch (e) {
        // Ignored, fallback below
    }

    try {
        const lastFocused = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        const valid = lastFocused?.find(isWebTab);
        if (valid) return valid;
    } catch (e) {
        // Ignored
    }

    try {
        const anyActive = await browser.tabs.query({ active: true });
        const valid = anyActive?.find(isWebTab);
        if (valid) return valid;
    } catch (e) {
        // Ignored
    }

    try {
        const allTabs = await browser.tabs.query({});
        const valid = allTabs?.find(isWebTab);
        if (valid) return valid;
    } catch (e) {
        // Ignored
    }

    return null;
}

async function getCurrentHostname() {
    const tab = await getActiveTab();
    if (tab?.id) {
        activeTabId = tab.id;
    }
    if (tab?.url) {
        try {
            const url = new URL(tab.url);
            if (url.protocol.startsWith('http')) {
                return url.hostname.replace(/^www\./, '');
            }
        } catch (e) {
            console.error(e);
        }
    }
    return null;
}

async function isRestrictedPage() {
    const tab = await getActiveTab();
    if (!tab?.url) return false;
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
        state.themeColor = stored.themeColor || '#ff9800';
        applyThemeColor(state.themeColor, false);

        loadSettingsFromData(stored);

        state.globalSettings = {
            enabled: state.enabled,
            enableImages: state.enableImages,
            activePreset: currentPresetName,
            presets: deepClone(state.presets),
            performanceMode: state.performanceMode,
            aspectRatio: state.aspectRatio,
            audioBoost: state.audioBoost,
            audioCompressor: state.audioCompressor,
            enableHud: state.enableHud,
            hudFullscreenOnly: state.hudFullscreenOnly
        };

        if (hostname && state.siteSettings[hostname]) {
            currentScope = 'site';
            const globalEnableImages = state.enableImages;
            loadSettingsFromData(state.siteSettings[hostname]);
            if (state.siteSettings[hostname].enableImages === undefined) {
                state.enableImages = globalEnableImages;
            }
        }

        const siteLabel = document.getElementById('tab-site-label');
        const siteTab = document.getElementById('tab-site');
        if (siteLabel && siteTab) {
            siteLabel.textContent = hostname ? hostname.toUpperCase() : 'NO SITE';
            siteTab.disabled = !hostname;
        }

    } catch (e) {
        console.error('Video Enhancer Load State Error:', e);
        state.enabled = true;
        state.enableImages = false;
        state.enableHud = true;
        state.hudFullscreenOnly = false;
        currentPresetName = DEFAULT_ACTIVE_PRESET;
        state.presets = deepClone(PRESET_DEFAULTS);
    }
}

function loadSettingsFromData(data) {
    state.enabled = data.enabled ?? true;
    state.enableImages = data.enableImages ?? false;
    state.performanceMode = data.performanceMode ?? false;
    state.aspectRatio = data.aspectRatio || 'default';
    state.audioBoost = parseInt(data.audioBoost || 100, 10);
    state.audioCompressor = data.audioCompressor ?? false;
    state.enableHud = data.enableHud ?? true;
    state.hudFullscreenOnly = data.hudFullscreenOnly ?? false;

    if (data.activePreset === 'warm') {
        currentPresetName = 'image';
    } else {
        currentPresetName = data.activePreset || DEFAULT_ACTIVE_PRESET;
    }

    if (data.presets) {
        state.presets = validateAllPresets(data.presets);
    } else {
        state.presets = deepClone(PRESET_DEFAULTS);
    }

    if (!state.presets[currentPresetName]) {
        currentPresetName = DEFAULT_ACTIVE_PRESET;
    }
}

function saveState() {
    const data = {
        enabled: state.enabled,
        enableImages: state.enableImages,
        activePreset: currentPresetName,
        presets: state.presets,
        performanceMode: state.performanceMode,
        aspectRatio: state.aspectRatio,
        audioBoost: state.audioBoost,
        audioCompressor: state.audioCompressor,
        presetNames: state.presetNames,
        enableHud: state.enableHud ?? true,
        hudFullscreenOnly: state.hudFullscreenOnly ?? false
    };

    if (currentScope === 'global') {
        browser.storage.local.set(data).catch(console.error);
        state.globalSettings = deepClone(data);
    } else if (currentScope === 'site' && state.hostname) {
        if (!state.siteSettings) state.siteSettings = {};
        state.siteSettings[state.hostname] = data;
        browser.storage.local.set({
            siteSettings: state.siteSettings,
            enableImages: state.enableImages
        }).catch(console.error);
    }

    updateTabsUI();
}

function switchScope(newScope) {
    if (newScope === currentScope) return;
    if (newScope === 'site' && !state.hostname) return;

    currentScope = newScope;

    if (newScope === 'site') {
        const siteData = state.siteSettings[state.hostname];
        if (siteData) {
            const currentImgSetting = state.enableImages;
            loadSettingsFromData(siteData);
            if (siteData.enableImages === undefined) {
                state.enableImages = currentImgSetting;
            }
        } else if (state.globalSettings) {
            loadSettingsFromData(state.globalSettings);
        }
    } else {
        if (state.globalSettings) {
            loadSettingsFromData(state.globalSettings);
        } else {
            loadState();
            return;
        }
    }
    updateAllUI();
    broadcastChanges();
}

function resetSiteOverride() {
    if (state.hostname && state.siteSettings[state.hostname]) {
        delete state.siteSettings[state.hostname];
        browser.storage.local.set({ siteSettings: state.siteSettings }).catch(console.error);

        if (state.globalSettings) {
            loadSettingsFromData(state.globalSettings);
        }
        updateAllUI();
        broadcastChanges();
        showToast('SITE OVERRIDE REMOVED');
    }
}

function updateToggleUI() {
    const toggle = document.getElementById('enabled-toggle');
    if (toggle) toggle.checked = state.enabled;

    const imgToggle = document.getElementById('images-toggle');
    if (imgToggle) imgToggle.checked = state.enableImages;

    const perfToggle = document.getElementById('performance-toggle');
    if (perfToggle) perfToggle.checked = state.performanceMode;

    const compToggle = document.getElementById('compressor-toggle');
    if (compToggle) compToggle.checked = state.audioCompressor;

    const hudToggle = document.getElementById('hud-toggle');
    if (hudToggle) hudToggle.checked = state.enableHud ?? true;

    const aspectSelect = document.getElementById('aspectRatio');
    if (aspectSelect) aspectSelect.value = state.aspectRatio || 'default';

    const audioSlider = document.getElementById('audioBoost');
    if (audioSlider) {
        audioSlider.value = state.audioBoost || 100;
        updateSliderFill(audioSlider);
        const audioVal = document.getElementById('audioBoost-value');
        if (audioVal) audioVal.textContent = `${state.audioBoost}%`;
    }
}

function renderPresetButtons() {
    const grid = document.getElementById('preset-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const allKeys = Object.keys(state.presets);

    allKeys.forEach(key => {
        const isCustom = !PRESET_DEFAULTS[key];
        const displayName = (state.presetNames[key] || DEFAULT_PRESET_NAMES[key] || key).toUpperCase();

        const item = document.createElement('div');
        item.className = `preset-item ${isCustom ? 'custom-item' : ''}`;
        item.dataset.preset = key;

        const btn = document.createElement('button');
        btn.className = `skew-btn preset-btn ${key === currentPresetName ? 'active' : ''}`;
        const span = document.createElement('span');
        span.className = 'unskew';
        span.textContent = displayName;
        btn.appendChild(span);
        btn.title = 'Click to activate · Right-click to rename';
        btn.addEventListener('click', handlePresetClick);
        btn.addEventListener('contextmenu', handlePresetRightClick);

        item.appendChild(btn);

        if (isCustom) {
            const delBtn = document.createElement('button');
            delBtn.className = 'preset-action-btn preset-delete';
            delBtn.title = 'Delete custom preset';
            delBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:9px;height:9px;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;fill:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            delBtn.addEventListener('click', (e) => handlePresetDelete(e, key));
            item.appendChild(delBtn);
        }

        grid.appendChild(item);
    });
}

function updatePresetButtonsUI() {
    const grid = document.getElementById('preset-grid');
    if (!grid) return;
    const items = grid.querySelectorAll('.preset-item');
    if (items.length !== Object.keys(state.presets).length) {
        renderPresetButtons();
        return;
    }
    items.forEach(item => {
        const btn = item.querySelector('.preset-btn');
        if (btn) {
            btn.classList.toggle('active', item.dataset.preset === currentPresetName);
        }
    });
}

function handleCreateCustomPreset() {
    const customId = `custom_${Date.now()}`;
    const baseVals = state.presets[currentPresetName] || PRESET_DEFAULTS.balanced;
    const newPreset = deepClone(baseVals);

    const count = Object.keys(state.presets).filter(k => !PRESET_DEFAULTS[k]).length + 1;
    const newName = `Custom ${count}`;

    state.presets[customId] = newPreset;
    state.presetNames[customId] = newName;
    currentPresetName = customId;

    browser.storage.local.set({ presetNames: state.presetNames }).catch(console.error);
    saveState();
    updateAllUI();
    broadcastChanges();
    showToast(`CREATED "${newName.toUpperCase()}"`);
}

function handlePresetDelete(e, key) {
    e.stopPropagation();
    delete state.presets[key];
    delete state.presetNames[key];

    if (currentPresetName === key) {
        currentPresetName = DEFAULT_ACTIVE_PRESET;
    }

    browser.storage.local.set({ presetNames: state.presetNames }).catch(console.error);
    saveState();
    updateAllUI();
    broadcastChanges();
    showToast('PRESET DELETED');
}

function handleResetActivePreset() {
    const factory = PRESET_DEFAULTS[currentPresetName] || PRESET_DEFAULTS.balanced;
    const defaultName = DEFAULT_PRESET_NAMES[currentPresetName] || currentPresetName;

    state.presets[currentPresetName] = deepClone(factory);
    if (DEFAULT_PRESET_NAMES[currentPresetName]) {
        state.presetNames[currentPresetName] = defaultName;
        browser.storage.local.set({ presetNames: state.presetNames }).catch(console.error);
    }

    updatePresetButtonsUI();
    updateSlidersUI();
    updateSelectsUI();
    broadcastChanges();
    saveState();

    const displayName = (state.presetNames[currentPresetName] || defaultName).toUpperCase();
    showToast(`RESET ${displayName} TO DEFAULT`);
}

function updateSlidersUI() {
    const vals = state.presets[currentPresetName];
    if (!vals) return;

    SLIDER_KEYS.forEach(key => {
        const slider = document.getElementById(key);
        if (slider) {
            const fallbackDef = SLIDER_RANGES[key]?.def ?? 0;
            const value = vals[key] !== undefined ? vals[key] : (PRESET_DEFAULTS[currentPresetName]?.[key] ?? fallbackDef);
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

    if (!select || !vals) return;

    const isActive = Math.abs(vals.warmth || 0) > 0;
    if (container) {
        container.style.display = isActive ? 'block' : 'none';
    }
    select.disabled = !isActive;
}

function updateValueDisplay(key, value, el) {
    if (!el) return;
    if (key === 'warmth') el.textContent = `${value > 0 ? '+' : ''}${value}°`;
    else if (key === 'tint') el.textContent = `${value > 0 ? '+' : ''}${value}`;
    else if (key === 'sharpness' || key === 'shadowBoost' || key === 'highlights' || key === 'vibrance') {
        el.textContent = value === 0 ? 'OFF' : `${value}%`;
    } else {
        el.textContent = `${value}%`;
    }
}

function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const pct = ((val - min) / (max - min)) * 100;

    // Solid flat split color fill, zero gradients!
    slider.style.background = `linear-gradient(to right,
        var(--accent-color) 0%,
        var(--accent-color) ${pct}%,
        #1c1c24 ${pct}%,
        #1c1c24 100%)`;
}

function updateTabsUI() {
    document.getElementById('tab-global')?.classList.toggle('active', currentScope === 'global');
    document.getElementById('tab-site')?.classList.toggle('active', currentScope === 'site');

    const resetSiteBtn = document.getElementById('btn-reset-site');
    const siteTab = document.getElementById('tab-site');
    const hasSiteOverride = Boolean(state.hostname && state.siteSettings && state.siteSettings[state.hostname]);

    if (siteTab) {
        siteTab.classList.toggle('has-override', hasSiteOverride && currentScope !== 'site');
    }

    if (resetSiteBtn) {
        resetSiteBtn.classList.toggle('visible', hasSiteOverride && currentScope === 'site');
    }
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
    const isChecked = e.target.checked;
    state.enableImages = isChecked;
    if (state.globalSettings) {
        state.globalSettings.enableImages = isChecked;
    }
    browser.storage.local.set({ enableImages: isChecked }).catch(console.error);

    if (currentScope === 'site' && state.hostname) {
        if (!state.siteSettings) state.siteSettings = {};
        if (!state.siteSettings[state.hostname]) {
            state.siteSettings[state.hostname] = {};
        }
        state.siteSettings[state.hostname].enableImages = isChecked;
        browser.storage.local.set({ siteSettings: state.siteSettings }).catch(console.error);
    }
    saveState();
    broadcastChanges();
    showToast(isChecked ? 'IMAGE ENHANCE ON' : 'IMAGE ENHANCE OFF');
}

function togglePerformanceMode(e) {
    state.performanceMode = e.target.checked;
    saveState();
    broadcastChanges();
    showToast(state.performanceMode ? 'PERFORMANCE MODE ON' : 'QUALITY MODE ON');
}

function toggleCompressor(e) {
    state.audioCompressor = e.target.checked;
    saveState();
    broadcastChanges();
}

function toggleHud(e) {
    const isChecked = e.target.checked;
    state.enableHud = isChecked;
    saveState();
    broadcastChanges();

    const hudMsg = { type: 'SET_HUD_ENABLED', enabled: isChecked };
    if (activeTabId) {
        browser.tabs.sendMessage(activeTabId, hudMsg).catch(() => {});
    } else {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            if (tabs[0]?.id) browser.tabs.sendMessage(tabs[0].id, hudMsg).catch(() => {});
        });
    }

    showToast(isChecked ? 'VIDEO HUD ENABLED' : 'VIDEO HUD DISABLED');
}

function handleAspectChange(e) {
    state.aspectRatio = e.target.value;
    saveState();
    broadcastChanges();
}

function handleAudioBoostInput(e) {
    state.audioBoost = parseInt(e.target.value, 10);
    const label = document.getElementById('audioBoost-value');
    if (label) label.textContent = `${state.audioBoost}%`;
    updateSliderFill(e.target);
    broadcastChanges();
    debouncedSave();
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

function handlePresetRightClick(e) {
    e.preventDefault();
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;

    const item = btn.closest('.preset-item');
    const key = item.dataset.preset;

    const originalName = state.presetNames[key] || DEFAULT_PRESET_NAMES[key] || key;
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
        const factoryDefault = DEFAULT_PRESET_NAMES[key] || key;
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

function handleSliderInput(e) {
    const key = e.target.id;
    const val = parseInt(e.target.value, 10);

    if (state.presets[currentPresetName]) {
        state.presets[currentPresetName][key] = val;
    }

    if (currentScope === 'site' && state.hostname) {
        if (!state.siteSettings) state.siteSettings = {};
        if (!state.siteSettings[state.hostname]) {
            state.siteSettings[state.hostname] = {
                enabled: state.enabled,
                enableImages: state.enableImages,
                activePreset: currentPresetName,
                presets: state.presets,
                performanceMode: state.performanceMode,
                aspectRatio: state.aspectRatio,
                audioBoost: state.audioBoost,
                audioCompressor: state.audioCompressor,
                presetNames: state.presetNames
            };
        }
        updateTabsUI();
    }

    updateValueDisplay(key, val, document.getElementById(`${key}-value`));
    updateSliderFill(e.target);

    if (key === 'warmth') updateWarmthModeState();

    broadcastChanges();
    debouncedSave();
}

function handleSliderDblClick(e) {
    const key = e.target.id;
    const factory = PRESET_DEFAULTS[currentPresetName] || PRESET_DEFAULTS.balanced;
    const defVal = factory[key] !== undefined ? factory[key] : (SLIDER_RANGES[key]?.def ?? 0);

    e.target.value = defVal;

    if (state.presets[currentPresetName]) {
        state.presets[currentPresetName][key] = defVal;
    }

    updateValueDisplay(key, defVal, document.getElementById(`${key}-value`));
    updateSliderFill(e.target);

    if (key === 'warmth') updateWarmthModeState();

    broadcastChanges();
    saveState();
}

function makeValueDisplayEditable(labelEl, sliderId) {
    labelEl.addEventListener('click', () => {
        const slider = document.getElementById(sliderId);
        if (!slider) return;

        const currentVal = parseInt(slider.value, 10);
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'control-val-input';
        input.value = currentVal;
        input.min = slider.min;
        input.max = slider.max;

        labelEl.replaceWith(input);
        input.focus();
        input.select();

        const commitValue = () => {
            let newVal = parseInt(input.value, 10);
            if (isNaN(newVal)) newVal = currentVal;
            newVal = clamp(newVal, parseInt(slider.min, 10), parseInt(slider.max, 10));

            slider.value = newVal;
            if (state.presets[currentPresetName]) {
                state.presets[currentPresetName][sliderId] = newVal;
            }

            labelEl.textContent = '';
            input.replaceWith(labelEl);
            updateValueDisplay(sliderId, newVal, labelEl);
            updateSliderFill(slider);

            if (sliderId === 'warmth') updateWarmthModeState();

            broadcastChanges();
            saveState();
        };

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') input.blur();
            if (ev.key === 'Escape') {
                input.value = currentVal;
                input.blur();
            }
        });

        input.addEventListener('blur', commitValue, { once: true });
    });
}

function broadcastChanges() {
    const payload = {
        type: 'UPDATE_SETTINGS',
        settings: {
            enabled: state.enabled,
            enableImages: state.enableImages,
            activePreset: currentPresetName,
            presets: state.presets,
            performanceMode: state.performanceMode,
            aspectRatio: state.aspectRatio,
            audioBoost: state.audioBoost,
            audioCompressor: state.audioCompressor,
            enableHud: state.enableHud ?? true,
            hudFullscreenOnly: state.hudFullscreenOnly ?? false
        },
        ignoreStorage: true
    };

    if (activeTabId) {
        browser.tabs.sendMessage(activeTabId, payload).catch(() => {});
    } else {
        getActiveTab().then(tab => {
            if (tab?.id) {
                activeTabId = tab.id;
                browser.tabs.sendMessage(activeTabId, payload).catch(() => {});
            }
        }).catch(() => {});
    }
}

function handleSelectChange(e) {
    const key = e.target.id;
    if (state.presets[currentPresetName]) {
        state.presets[currentPresetName][key] = e.target.value;
    }

    updatePresetButtonsUI();
    saveState();
    broadcastChanges();
}

function switchCategory(targetViewId) {
    document.querySelectorAll('.category-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetViewId);
    });
    document.querySelectorAll('.category-view').forEach(view => {
        view.classList.toggle('hidden', view.id !== targetViewId);
    });
}

function switchSubTab(subTarget) {
    document.querySelectorAll('.subtab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === subTarget);
    });
    document.querySelectorAll('.adjust-subview').forEach(view => {
        view.classList.toggle('hidden', view.id !== subTarget);
    });
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

        showToast('SETTINGS EXPORTED');
    }).catch(err => {
        console.error('Export error:', err);
        showToast('EXPORT FAILED');
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
                for (const [k, v] of Object.entries(data.presetNames)) {
                    if (typeof v === 'string') {
                        cleaned[k] = v.slice(0, 30);
                    }
                }
                data.presetNames = cleaned;
            }
            if (data.activePreset && !data.presets?.[data.activePreset] && !PRESET_DEFAULTS[data.activePreset]) {
                data.activePreset = DEFAULT_ACTIVE_PRESET;
            }

            await browser.storage.local.set(data);
            await loadState();
            updateAllUI();
            broadcastChanges();

            showToast('SETTINGS IMPORTED');
        } catch (err) {
            console.error('Import error:', err);
            showToast('INVALID SETTINGS');
        }
    });

    input.click();
}

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = '';
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
}

function getContrastColor(hexColor) {
    if (!hexColor) return '#000000';
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 140 ? '#000000' : '#ffffff';
}

function applyThemeColor(color, shouldSave = false) {
    if (!color) return;
    state.themeColor = color;
    const textColor = getContrastColor(color);
    document.documentElement.style.setProperty('--accent-color', color);
    document.documentElement.style.setProperty('--accent-text', textColor);

    const norm = color.toLowerCase();
    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.classList.toggle('active', (sw.dataset.color || '').toLowerCase() === norm);
    });

    const picker = document.getElementById('theme-color-picker');
    if (picker && picker.value.toLowerCase() !== norm) {
        picker.value = norm;
    }

    const dot = document.getElementById('theme-custom-dot');
    if (dot) {
        dot.style.background = color;
    }

    document.querySelectorAll('input[type="range"]').forEach(updateSliderFill);

    if (shouldSave) {
        browser.storage.local.set({ themeColor: color }).catch(console.error);
        showToast('THEME UPDATED');
    }
}

async function checkRestrictedPage() {
    const restricted = await isRestrictedPage();
    const banner = document.getElementById('restricted-banner');
    if (banner) {
        banner.classList.toggle('visible', Boolean(restricted));
    }
}

function attachEventListeners() {
    document.getElementById('enabled-toggle')?.addEventListener('change', toggleEnabled);
    document.getElementById('images-toggle')?.addEventListener('change', toggleImagesEnabled);
    document.getElementById('performance-toggle')?.addEventListener('change', togglePerformanceMode);
    document.getElementById('compressor-toggle')?.addEventListener('change', toggleCompressor);
    document.getElementById('hud-toggle')?.addEventListener('change', toggleHud);
    document.getElementById('aspectRatio')?.addEventListener('change', handleAspectChange);
    document.getElementById('audioBoost')?.addEventListener('input', handleAudioBoostInput);

    SLIDER_KEYS.forEach(k => {
        const slider = document.getElementById(k);
        const label = document.getElementById(`${k}-value`);
        if (slider) {
            slider.addEventListener('input', handleSliderInput);
            slider.addEventListener('change', () => saveState());
            slider.addEventListener('dblclick', handleSliderDblClick);
        }
        if (label && slider) {
            makeValueDisplayEditable(label, k);
        }
    });

    document.querySelectorAll('.btn-slider-reset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = btn.dataset.slider;
            if (key === 'audioBoost') {
                const slider = document.getElementById('audioBoost');
                if (slider) {
                    slider.value = 100;
                    state.audioBoost = 100;
                    const label = document.getElementById('audioBoost-value');
                    if (label) label.textContent = '100%';
                    updateSliderFill(slider);
                    broadcastChanges();
                    saveState();
                }
                return;
            }

            const slider = document.getElementById(key);
            if (!slider) return;

            const factory = PRESET_DEFAULTS[currentPresetName] || PRESET_DEFAULTS.balanced;
            const defVal = factory[key] !== undefined ? factory[key] : (SLIDER_RANGES[key]?.def ?? 0);

            slider.value = defVal;
            if (state.presets[currentPresetName]) {
                state.presets[currentPresetName][key] = defVal;
            }

            updateValueDisplay(key, defVal, document.getElementById(`${key}-value`));
            updateSliderFill(slider);

            if (key === 'warmth') updateWarmthModeState();

            broadcastChanges();
            saveState();
        });
    });

    SELECT_KEYS.forEach(k => document.getElementById(k)?.addEventListener('change', handleSelectChange));

    document.getElementById('tab-global')?.addEventListener('click', () => switchScope('global'));
    document.getElementById('tab-site')?.addEventListener('click', () => switchScope('site'));
    document.getElementById('btn-reset-site')?.addEventListener('click', (e) => {
        e.stopPropagation();
        resetSiteOverride();
    });

    document.querySelectorAll('.category-tab').forEach(btn => {
        btn.addEventListener('click', () => switchCategory(btn.dataset.target));
    });

    document.querySelectorAll('.subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSubTab(btn.dataset.sub));
    });

    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            applyThemeColor(sw.dataset.color, true);
        });
    });

    const colorPicker = document.getElementById('theme-color-picker');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => applyThemeColor(e.target.value, false));
        colorPicker.addEventListener('change', (e) => applyThemeColor(e.target.value, true));
    }

    document.getElementById('btn-reset-preset')?.addEventListener('click', handleResetActivePreset);
    document.getElementById('preset-add-btn')?.addEventListener('click', handleCreateCustomPreset);
    document.getElementById('btn-export')?.addEventListener('click', exportSettings);
    document.getElementById('btn-import')?.addEventListener('click', importSettings);

    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            // Avoid interrupting an active slider or text input interaction in popup
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
                return;
            }
            loadState().then(() => {
                updateAllUI();
            }).catch(console.error);
        }
    });
}

async function init() {
    await loadState();
    updateAllUI();
    attachEventListeners();
    checkRestrictedPage();

    setTimeout(() => {
        document.body.classList.remove('preload');
    }, 80);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
