/**
 *
 * Data Model:
 * {
 *   enabled: boolean,
 *   activePreset: string,
 *   presets: {
 *     [presetName]: { brightness, contrast, saturate, warmth, warmthMode, intensity, sharpness }
 *   }
 * }
 */

// ============================================================
// Constants
// ============================================================

const WARMTH_MODE = Object.freeze({
  SIMPLE: 'simple',
  CINEMATIC: 'cinematic'
});

// Factory default values for each preset
const FACTORY_DEFAULTS = {
  subtle: {
    brightness: 102,
    contrast: 108,
    saturate: 110,
    warmth: 0,
    warmthMode: WARMTH_MODE.SIMPLE,
    intensity: 100,
    sharpness: 0
  },
  balanced: {
    brightness: 105,
    contrast: 115,
    saturate: 120,
    warmth: 0,
    warmthMode: WARMTH_MODE.SIMPLE,
    intensity: 100,
    sharpness: 0
  },
  vivid: {
    brightness: 108,
    contrast: 125,
    saturate: 140,
    warmth: 0,
    warmthMode: WARMTH_MODE.SIMPLE,
    intensity: 100,
    sharpness: 0
  },
  cinema: {
    brightness: 100,
    contrast: 120,
    saturate: 115,
    warmth: 15,
    warmthMode: WARMTH_MODE.CINEMATIC,
    intensity: 100,
    sharpness: 0
  },
  gaming: {
    brightness: 110,
    contrast: 130,
    saturate: 135,
    warmth: -5,
    warmthMode: WARMTH_MODE.SIMPLE,
    intensity: 100,
    sharpness: 0
  },
  warm: {
    brightness: 105,
    contrast: 110,
    saturate: 115,
    warmth: 25,
    warmthMode: WARMTH_MODE.CINEMATIC,
    intensity: 100,
    sharpness: 0
  }
};

// Control keys
const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'intensity', 'sharpness'];
const SELECT_KEYS = ['warmthMode'];
const ALL_SETTING_KEYS = [...SLIDER_KEYS, ...SELECT_KEYS];

const DEFAULT_ACTIVE_PRESET = 'balanced';

// ============================================================
// State
// ============================================================

let state = {
  enabled: true,
  activePreset: DEFAULT_ACTIVE_PRESET,
  presets: deepClone(FACTORY_DEFAULTS)
};

// ============================================================
// Utility Functions
// ============================================================

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isPresetModified(presetName) {
  const current = state.presets[presetName];
  const factory = FACTORY_DEFAULTS[presetName];
  if (!current || !factory) return false;

  return ALL_SETTING_KEYS.some(key => current[key] !== factory[key]);
}

// ============================================================
// Storage Functions
// ============================================================

async function loadState() {
  try {
    const stored = await browser.storage.local.get(null);

    // Merge stored data with defaults
    state.enabled = stored.enabled !== undefined ? stored.enabled : true;
    state.activePreset = stored.activePreset || DEFAULT_ACTIVE_PRESET;

    // Validate active preset exists
    if (!FACTORY_DEFAULTS[state.activePreset]) {
      state.activePreset = DEFAULT_ACTIVE_PRESET;
    }

    // Load presets - merge stored with factory defaults
    if (stored.presets) {
      state.presets = {};
      for (const presetName of Object.keys(FACTORY_DEFAULTS)) {
        state.presets[presetName] = {
          ...FACTORY_DEFAULTS[presetName],
          ...stored.presets[presetName]
        };

        // Validate warmthMode
        if (!Object.values(WARMTH_MODE).includes(state.presets[presetName].warmthMode)) {
          state.presets[presetName].warmthMode = FACTORY_DEFAULTS[presetName].warmthMode;
        }
      }
    } else {
      state.presets = deepClone(FACTORY_DEFAULTS);
    }
  } catch (e) {
    console.error('Failed to load state:', e);
    state = {
      enabled: true,
      activePreset: DEFAULT_ACTIVE_PRESET,
      presets: deepClone(FACTORY_DEFAULTS)
    };
  }
}

function saveState() {
  browser.storage.local.set({
    enabled: state.enabled,
    activePreset: state.activePreset,
    presets: state.presets
  }).catch(e => console.error('Failed to save state:', e));
}

// ============================================================
// UI Update Functions
// ============================================================

function updateToggleUI() {
  const toggle = document.getElementById('enabled-toggle');
  if (toggle) {
    toggle.checked = state.enabled;
  }
}

function updatePresetButtonsUI() {
  const items = document.querySelectorAll('.preset-item');

  items.forEach(item => {
    const presetName = item.dataset.preset;
    const btn = item.querySelector('.preset-btn');

    if (!btn) return;

    // Active state
    btn.classList.toggle('active', presetName === state.activePreset);

    // Modified indicator (shows reset button)
    item.classList.toggle('modified', isPresetModified(presetName));
  });
}

function updateSlidersUI() {
  const activeValues = state.presets[state.activePreset];
  if (!activeValues) return;

  SLIDER_KEYS.forEach(key => {
    const slider = document.getElementById(key);
    const valueDisplay = document.getElementById(`${key}-value`);

    if (slider && activeValues[key] !== undefined) {
      slider.value = activeValues[key];
      updateValueDisplay(key, activeValues[key], valueDisplay);
    }
  });
}

function updateSelectsUI() {
  const activeValues = state.presets[state.activePreset];
  if (!activeValues) return;

  SELECT_KEYS.forEach(key => {
    const select = document.getElementById(key);
    if (select && activeValues[key] !== undefined) {
      select.value = activeValues[key];
    }
  });

  // Update warmth mode state
  updateWarmthModeState();
}

function updateWarmthModeState() {
  const activeValues = state.presets[state.activePreset];
  const warmthModeSelect = document.getElementById('warmthMode');
  const warmthModeContainer = document.getElementById('warmth-mode-container');
  const warmthModeBadge = document.getElementById('warmth-mode-badge');

  if (!warmthModeSelect || !activeValues) return;

  // Check if warmth is active
  const warmthValue = activeValues.warmth || 0;
  const isWarmthActive = Math.abs(warmthValue) > 0;

  // Enable/disable based on warmth value
  if (warmthModeContainer) {
    warmthModeContainer.classList.toggle('disabled', !isWarmthActive);
  }
  warmthModeSelect.disabled = !isWarmthActive;

  // Update badge text
  if (warmthModeBadge) {
    const modeText = activeValues.warmthMode === WARMTH_MODE.CINEMATIC ? 'Cinematic' : 'Simple';
    warmthModeBadge.textContent = isWarmthActive ? modeText : 'Inactive';
  }
}

function updateValueDisplay(key, value, element) {
  if (!element) return;

  switch (key) {
    case 'warmth':
      const sign = value > 0 ? '+' : '';
      element.textContent = `${sign}${value}°`;
      break;
    case 'sharpness':
      element.textContent = value === 0 ? 'Off' : `${value}%`;
      break;
    default:
      element.textContent = `${value}%`;
  }
}

function updateAllUI() {
  updateToggleUI();
  updatePresetButtonsUI();
  updateSlidersUI();
  updateSelectsUI();
}

// ============================================================
// Event Handlers
// ============================================================

function handleToggleChange(e) {
  state.enabled = e.target.checked;
  saveState();
}

function handlePresetClick(e) {
  const item = e.target.closest('.preset-item');
  if (!item) return;

  const presetName = item.dataset.preset;
  if (!presetName || presetName === state.activePreset) return;

  // Switch to new preset
  state.activePreset = presetName;

  // Update UI to reflect new preset's values
  updatePresetButtonsUI();
  updateSlidersUI();
  updateSelectsUI();

  // Save state
  saveState();
}

function handlePresetReset(e) {
  // Stop event from bubbling to preset button
  e.stopPropagation();

  const item = e.target.closest('.preset-item');
  if (!item) return;

  const presetName = item.dataset.preset;
  if (!presetName || !FACTORY_DEFAULTS[presetName]) return;

  // Reset this preset to factory defaults
  state.presets[presetName] = deepClone(FACTORY_DEFAULTS[presetName]);

  // Update UI
  updatePresetButtonsUI();

  // If this is the active preset, also update sliders and selects
  if (presetName === state.activePreset) {
    updateSlidersUI();
    updateSelectsUI();
  }

  // Save state
  saveState();
}

function handleSliderInput(e) {
  const key = e.target.id;
  const value = parseInt(e.target.value, 10);

  // Update active preset's value
  if (state.presets[state.activePreset]) {
    state.presets[state.activePreset][key] = value;
  }

  // Update value display
  const valueDisplay = document.getElementById(`${key}-value`);
  updateValueDisplay(key, value, valueDisplay);

  // Update modified indicator on preset button
  updatePresetButtonsUI();

  // Special handling for warmth slider
  if (key === 'warmth') {
    updateWarmthModeState();
  }

  // Save state
  saveState();
}

function handleSelectChange(e) {
  const key = e.target.id;
  const value = e.target.value;

  // Update active preset's value
  if (state.presets[state.activePreset]) {
    state.presets[state.activePreset][key] = value;
  }

  // Update badge for warmth mode
  if (key === 'warmthMode') {
    const badge = document.getElementById('warmth-mode-badge');
    if (badge) {
      badge.textContent = value === WARMTH_MODE.CINEMATIC ? 'Cinematic' : 'Simple';
    }
  }

  // Update modified indicator on preset button
  updatePresetButtonsUI();

  // Save state
  saveState();
}

// ============================================================
// Initialization
// ============================================================

function attachEventListeners() {
  // Toggle
  const toggle = document.getElementById('enabled-toggle');
  if (toggle) {
    toggle.addEventListener('change', handleToggleChange);
  }

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', handlePresetClick);
  });

  // Preset reset buttons
  document.querySelectorAll('.preset-reset').forEach(btn => {
    btn.addEventListener('click', handlePresetReset);
  });

  // Sliders
  SLIDER_KEYS.forEach(key => {
    const slider = document.getElementById(key);
    if (slider) {
      slider.addEventListener('input', handleSliderInput);
    }
  });

  // Selects
  SELECT_KEYS.forEach(key => {
    const select = document.getElementById(key);
    if (select) {
      select.addEventListener('change', handleSelectChange);
    }
  });
}

async function init() {
  await loadState();
  updateAllUI();
  attachEventListeners();
}

// Start
init();
