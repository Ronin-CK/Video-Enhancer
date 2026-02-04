const WARMTH_MODE = {
  SIMPLE: 'simple',
  CINEMATIC: 'cinematic'
};

const FACTORY_DEFAULTS = {
  subtle: { brightness: 102, contrast: 108, saturate: 110, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  balanced: { brightness: 105, contrast: 115, saturate: 120, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  vivid: { brightness: 108, contrast: 125, saturate: 140, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  cinema: { brightness: 100, contrast: 120, saturate: 115, warmth: 15, warmthMode: WARMTH_MODE.CINEMATIC, intensity: 100, sharpness: 0 },
  gaming: { brightness: 110, contrast: 130, saturate: 135, warmth: -5, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  warm: { brightness: 105, contrast: 110, saturate: 115, warmth: 25, warmthMode: WARMTH_MODE.CINEMATIC, intensity: 100, sharpness: 0 }
};

const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'intensity', 'sharpness'];
const SELECT_KEYS = ['warmthMode'];
const ALL_SETTING_KEYS = [...SLIDER_KEYS, ...SELECT_KEYS];
const DEFAULT_ACTIVE_PRESET = 'balanced';

let state = {
  enabled: true,
  activePreset: DEFAULT_ACTIVE_PRESET,
  presets: deepClone(FACTORY_DEFAULTS),
  scope: 'global', // 'global' | 'site'
  hostname: null,
  siteSettings: {},
  globalSettings: null
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function isPresetModified(presetName) {
  const current = state.presets[presetName];
  const factory = FACTORY_DEFAULTS[presetName];
  if (!current || !factory) return false;
  return ALL_SETTING_KEYS.some(key => current[key] !== factory[key]);
}

async function getCurrentHostname() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol.startsWith('http')) return url.hostname;
    } catch (e) { console.error(e); }
  }
  return null;
}

async function loadState() {
  try {
    const [stored, hostname] = await Promise.all([
      browser.storage.local.get(null),
      getCurrentHostname()
    ]);

    state.hostname = hostname;
    state.siteSettings = stored.siteSettings || {};

    // Always load global first to have a baseline
    loadSettingsFromData(stored);

    // Cache global for fast switching back
    state.globalSettings = {
      enabled: state.enabled,
      activePreset: state.activePreset,
      presets: deepClone(state.presets)
    };

    const siteTab = document.getElementById('tab-site');
    if (siteTab) {
      siteTab.textContent = hostname || "No Site";
      siteTab.disabled = !hostname;
    }

  } catch (e) {
    console.error(e);
    // Fallback defaults
    state.enabled = true;
    state.activePreset = DEFAULT_ACTIVE_PRESET;
    state.presets = deepClone(FACTORY_DEFAULTS);
  }
}

function loadSettingsFromData(data) {
  state.enabled = data.enabled ?? true;
  state.activePreset = data.activePreset || DEFAULT_ACTIVE_PRESET;

  if (!FACTORY_DEFAULTS[state.activePreset]) {
    state.activePreset = DEFAULT_ACTIVE_PRESET;
  }

  if (data.presets) {
    state.presets = {};
    for (const name of Object.keys(FACTORY_DEFAULTS)) {
      state.presets[name] = { ...FACTORY_DEFAULTS[name], ...data.presets[name] };
      // Sanity check enum
      if (!Object.values(WARMTH_MODE).includes(state.presets[name].warmthMode)) {
        state.presets[name].warmthMode = FACTORY_DEFAULTS[name].warmthMode;
      }
    }
  } else {
    state.presets = deepClone(FACTORY_DEFAULTS);
  }
}

function saveState() {
  const data = {
    enabled: state.enabled,
    activePreset: state.activePreset,
    presets: state.presets
  };

  if (state.scope === 'global') {
    browser.storage.local.set(data).catch(console.error);
  } else if (state.scope === 'site' && state.hostname) {
    state.siteSettings[state.hostname] = data;
    browser.storage.local.set({ siteSettings: state.siteSettings }).catch(console.error);
  }
}

function switchScope(newScope) {
  if (newScope === state.scope) return;
  if (newScope === 'site' && !state.hostname) return;

  state.scope = newScope;


  if (newScope === 'site') {
    const siteData = state.siteSettings[state.hostname];
    if (siteData) loadSettingsFromData(siteData);
    // If no site data sucks, we just keep current settings as starting point for this site
  } else {
    // Restore cached global settings so we don't lose previous edits
    if (state.globalSettings) {
      state.enabled = state.globalSettings.enabled;
      state.activePreset = state.globalSettings.activePreset;
      state.presets = deepClone(state.globalSettings.presets);
    } else {
      loadState();
      return;
    }
  }
  updateAllUI();
}

function updateToggleUI() {
  const toggle = document.getElementById('enabled-toggle');
  if (toggle) toggle.checked = state.enabled;
}

function updatePresetButtonsUI() {
  document.querySelectorAll('.preset-item').forEach(item => {
    const name = item.dataset.preset;
    const btn = item.querySelector('.preset-btn');
    if (!btn) return;

    btn.classList.toggle('active', name === state.activePreset);
    item.classList.toggle('modified', isPresetModified(name));
  });
}

function updateSlidersUI() {
  const vals = state.presets[state.activePreset];
  if (!vals) return;

  SLIDER_KEYS.forEach(key => {
    const slider = document.getElementById(key);
    if (slider && vals[key] !== undefined) {
      slider.value = vals[key];
      updateValueDisplay(key, vals[key], document.getElementById(`${key}-value`));
    }
  });
}

function updateSelectsUI() {
  const vals = state.presets[state.activePreset];
  if (!vals) return;

  SELECT_KEYS.forEach(key => {
    const el = document.getElementById(key);
    if (el && vals[key] !== undefined) el.value = vals[key];
  });
  updateWarmthModeState();
}

function updateWarmthModeState() {
  const vals = state.presets[state.activePreset];
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
  else if (key === 'sharpness') el.textContent = value === 0 ? 'Off' : `${value}%`;
  else el.textContent = `${value}%`;
}

function updateTabsUI() {
  document.getElementById('tab-global')?.classList.toggle('active', state.scope === 'global');
  document.getElementById('tab-site')?.classList.toggle('active', state.scope === 'site');
}

function updateAllUI() {
  updateTabsUI();
  updateToggleUI();
  updatePresetButtonsUI();
  updateSlidersUI();
  updateSelectsUI();
}

function handleToggleChange(e) {
  state.enabled = e.target.checked;
  saveState();
}

function handlePresetClick(e) {
  const item = e.target.closest('.preset-item');
  if (!item) return;

  const name = item.dataset.preset;
  if (!name || name === state.activePreset) return;

  state.activePreset = name;

  updatePresetButtonsUI();
  updateSlidersUI();
  updateSelectsUI();
  saveState();
}

function handlePresetReset(e) {
  e.stopPropagation();
  const item = e.target.closest('.preset-item');
  if (!item) return;

  const name = item.dataset.preset;
  if (FACTORY_DEFAULTS[name]) {
    state.presets[name] = deepClone(FACTORY_DEFAULTS[name]);
    updatePresetButtonsUI();

    if (name === state.activePreset) {
      updateSlidersUI();
      updateSelectsUI();
    }
    saveState();
  }
}

// 300ms debounce prevents disk thrashing while dragging sliders
const debouncedSave = debounce(saveState, 300);

function handleSliderInput(e) {
  const key = e.target.id;
  const val = parseInt(e.target.value, 10);

  if (state.presets[state.activePreset]) {
    state.presets[state.activePreset][key] = val;
  }

  updateValueDisplay(key, val, document.getElementById(`${key}-value`));
  updatePresetButtonsUI();

  if (key === 'warmth') updateWarmthModeState();

  broadcastChanges();
  debouncedSave();
}

function broadcastChanges() {
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    if (tabs[0]?.id) {
      browser.tabs.sendMessage(tabs[0].id, {
        type: 'UPDATE_SETTINGS',
        settings: {
          enabled: state.enabled,
          activePreset: state.activePreset,
          presets: state.presets
        }
      }).catch(() => { });
    }
  });
}

function handleSelectChange(e) {
  const key = e.target.id;
  if (state.presets[state.activePreset]) {
    state.presets[state.activePreset][key] = e.target.value;
  }

  if (key === 'warmthMode') {
    const badge = document.getElementById('warmth-mode-badge');
    if (badge) badge.textContent = e.target.value === WARMTH_MODE.CINEMATIC ? 'Cinematic' : 'Simple';
  }

  updatePresetButtonsUI();
  saveState();
}

function attachEventListeners() {
  document.getElementById('enabled-toggle')?.addEventListener('change', handleToggleChange);

  document.querySelectorAll('.preset-btn').forEach(b => b.addEventListener('click', handlePresetClick));
  document.querySelectorAll('.preset-reset').forEach(b => b.addEventListener('click', handlePresetReset));

  SLIDER_KEYS.forEach(k => document.getElementById(k)?.addEventListener('input', handleSliderInput));
  SELECT_KEYS.forEach(k => document.getElementById(k)?.addEventListener('change', handleSelectChange));

  document.getElementById('tab-global')?.addEventListener('click', () => switchScope('global'));
  document.getElementById('tab-site')?.addEventListener('click', () => switchScope('site'));
}

async function init() {
  await loadState();
  updateAllUI();
  attachEventListeners();
}

init();
