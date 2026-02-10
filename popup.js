var WARMTH_MODE = {
  SIMPLE: 'simple',
  CINEMATIC: 'cinematic'
};

const FACTORY_DEFAULTS = {
  subtle: { name: 'Subtle', brightness: 102, contrast: 108, saturate: 110, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  balanced: { name: 'Balanced', brightness: 105, contrast: 115, saturate: 120, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  vivid: { name: 'Vivid', brightness: 108, contrast: 125, saturate: 140, warmth: 0, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  cinema: { name: 'Cinema', brightness: 100, contrast: 120, saturate: 115, warmth: 15, warmthMode: WARMTH_MODE.CINEMATIC, intensity: 100, sharpness: 0 },
  gaming: { name: 'Gaming', brightness: 110, contrast: 130, saturate: 135, warmth: -5, warmthMode: WARMTH_MODE.SIMPLE, intensity: 100, sharpness: 0 },
  warm: { name: 'Warm', brightness: 105, contrast: 110, saturate: 115, warmth: 25, warmthMode: WARMTH_MODE.CINEMATIC, intensity: 100, sharpness: 0 }
};

const DEFAULT_PRESET_NAMES = {
  subtle: 'Subtle',
  balanced: 'Balanced',
  vivid: 'Vivid',
  cinema: 'Cinema',
  gaming: 'Gaming',
  warm: 'Warm'
};

const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'intensity', 'sharpness'];
const SELECT_KEYS = ['warmthMode'];
const ALL_SETTING_KEYS = [...SLIDER_KEYS, ...SELECT_KEYS];
const DEFAULT_ACTIVE_PRESET = 'balanced';

var currentPresetName = DEFAULT_ACTIVE_PRESET;
var currentScope = 'global';

let state = {
  enabled: true,
  presets: deepClone(FACTORY_DEFAULTS),
  hostname: null,
  siteSettings: {},
  globalSettings: null,
  enableImages: false,
  presetNames: { ...DEFAULT_PRESET_NAMES }
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

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
  const factory = FACTORY_DEFAULTS[presetName];
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

async function loadState() {
  try {
    const [stored, hostname] = await Promise.all([
      browser.storage.local.get(null),
      getCurrentHostname()
    ]);

    state.hostname = hostname;
    state.siteSettings = stored.siteSettings || {};
    state.presetNames = { ...DEFAULT_PRESET_NAMES, ...(stored.presetNames || {}) };

    // Always load global first to have a baseline
    loadSettingsFromData(stored);

    // Cache global for fast switching back
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
    // Fallback defaults
    state.enabled = true;
    state.enableImages = false;
    currentPresetName = DEFAULT_ACTIVE_PRESET;
    state.presets = deepClone(FACTORY_DEFAULTS);
  }
}

function loadSettingsFromData(data) {
  state.enabled = data.enabled ?? true;
  state.enableImages = data.enableImages ?? false;
  currentPresetName = data.activePreset || DEFAULT_ACTIVE_PRESET;

  if (!FACTORY_DEFAULTS[currentPresetName]) {
    currentPresetName = DEFAULT_ACTIVE_PRESET;
  }

  if (data.presets) {
    state.presets = {};
    for (const name of Object.keys(FACTORY_DEFAULTS)) {
      state.presets[name] = { ...FACTORY_DEFAULTS[name], ...data.presets[name] };
      if (!state.presets[name].name) {
        state.presets[name].name = FACTORY_DEFAULTS[name].name;
      }
      // Sanity check enum
      if (!Object.values(WARMTH_MODE).includes(state.presets[name].warmthMode)) {
        state.presets[name].warmthMode = FACTORY_DEFAULTS[name].warmthMode;
      }
    }
  } else {
    state.presets = deepClone(FACTORY_DEFAULTS);
  }
}

// save current settings to storage
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

// switch between global and site-specific views
function switchScope(newScope) {
  if (newScope === currentScope) return;
  if (newScope === 'site' && !state.hostname) return;

  currentScope = newScope;

  if (newScope === 'site') {
    const siteData = state.siteSettings[state.hostname];
    if (siteData) loadSettingsFromData(siteData);
  } else {
    // restore cached global state
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

    // Use global names
    const displayName = state.presetNames[key] || DEFAULT_PRESET_NAMES[key] || key;
    btn.textContent = displayName;

    btn.classList.toggle('active', key === currentPresetName);
    item.classList.toggle('modified', isPresetModified(key));
  });
}

function updateSlidersUI() {
  const vals = state.presets[currentPresetName];
  if (!vals) return;

  const bSlider = getEl('brightness');
  if (bSlider) {
    bSlider.value = vals.brightness;
    updateValueDisplay('brightness', vals.brightness, getEl('brightness-value'));
  }

  const cSlider = getEl('contrast');
  if (cSlider) {
    cSlider.value = vals.contrast;
    updateValueDisplay('contrast', vals.contrast, getEl('contrast-value'));
  }

  SLIDER_KEYS.slice(2).forEach(key => {
    const slider = document.getElementById(key);
    if (slider) {
      if (vals[key] !== undefined) {
        slider.value = vals[key];
        updateValueDisplay(key, vals[key], document.getElementById(`${key}-value`));
      } else {
        slider.value = 100;
      }
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
  else if (key === 'sharpness') el.textContent = value === 0 ? 'Off' : `${value}%`;
  else el.textContent = `${value}%`;
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
  if (FACTORY_DEFAULTS[key]) {
    // Reset name to factory default
    state.presetNames[key] = DEFAULT_PRESET_NAMES[key];
    browser.storage.local.set({ presetNames: state.presetNames }).catch(console.error);

    state.presets[key] = deepClone(FACTORY_DEFAULTS[key]);

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

    // If empty string, revert to factory default name
    if (!newName) newName = factoryDefault;

    state.presetNames[key] = newName;

    // Always save names globally
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

// debounce to avoid storage spam while dragging
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
      slider.addEventListener('change', handleSliderChange); // save on release
    }
  });
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
