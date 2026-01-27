/**
 * Fake HDR Extension - Popup Controller
 *
 * Data Model:
 * {
 *   enabled: boolean,
 *   activePreset: string,
 *   presets: {
 *     [presetName]: { brightness, contrast, saturate, warmth, intensity }
 *   }
 * }
 */

// Factory default values for each preset
const FACTORY_DEFAULTS = {
  subtle:   { brightness: 102, contrast: 108, saturate: 110, warmth: 0, intensity: 100 },
  balanced: { brightness: 105, contrast: 115, saturate: 120, warmth: 0, intensity: 100 },
  vivid:    { brightness: 108, contrast: 125, saturate: 140, warmth: 0, intensity: 100 },
  cinema:   { brightness: 100, contrast: 120, saturate: 115, warmth: 10, intensity: 100 },
  gaming:   { brightness: 110, contrast: 130, saturate: 135, warmth: -5, intensity: 100 },
  warm:     { brightness: 105, contrast: 110, saturate: 115, warmth: 20, intensity: 100 }
};

const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'warmth', 'intensity'];
const DEFAULT_ACTIVE_PRESET = 'balanced';

// Current state
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

  return SLIDER_KEYS.some(key => current[key] !== factory[key]);
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

    // Load presets - merge stored with factory defaults
    if (stored.presets) {
      state.presets = {};
      for (const presetName of Object.keys(FACTORY_DEFAULTS)) {
        state.presets[presetName] = {
          ...FACTORY_DEFAULTS[presetName],
          ...stored.presets[presetName]
        };
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
  toggle.checked = state.enabled;
}

function updatePresetButtonsUI() {
  const items = document.querySelectorAll('.preset-item');

  items.forEach(item => {
    const presetName = item.dataset.preset;
    const btn = item.querySelector('.preset-btn');

    // Active state
    if (presetName === state.activePreset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }

    // Modified indicator (shows reset button)
    if (isPresetModified(presetName)) {
      item.classList.add('modified');
    } else {
      item.classList.remove('modified');
    }
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

function updateValueDisplay(key, value, element) {
  if (!element) return;

  if (key === 'warmth') {
    element.textContent = `${value}°`;
  } else {
    element.textContent = `${value}%`;
  }
}

function updateAllUI() {
  updateToggleUI();
  updatePresetButtonsUI();
  updateSlidersUI();
}

// ============================================================
// Event Handlers
// ============================================================

function handleToggleChange(e) {
  state.enabled = e.target.checked;
  saveState();
}

function handlePresetClick(e) {
  // Find the preset item container
  const item = e.target.closest('.preset-item');
  if (!item) return;

  const presetName = item.dataset.preset;
  if (!presetName || presetName === state.activePreset) return;

  // Switch to new preset
  state.activePreset = presetName;

  // Update UI to reflect new preset's values
  updatePresetButtonsUI();
  updateSlidersUI();

  // Save state
  saveState();
}

function handlePresetReset(e) {
  // Stop event from bubbling to preset button
  e.stopPropagation();

  // Find the preset item container
  const item = e.target.closest('.preset-item');
  if (!item) return;

  const presetName = item.dataset.preset;
  if (!presetName) return;

  // Reset this preset to factory defaults
  state.presets[presetName] = deepClone(FACTORY_DEFAULTS[presetName]);

  // Update UI
  updatePresetButtonsUI();

  // If this is the active preset, also update sliders
  if (presetName === state.activePreset) {
    updateSlidersUI();
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

  // Save state
  saveState();
}

// ============================================================
// Initialization
// ============================================================

function attachEventListeners() {
  // Toggle
  document.getElementById('enabled-toggle').addEventListener('change', handleToggleChange);

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
}

async function init() {
  await loadState();
  updateAllUI();
  attachEventListeners();
}

// Start
init();
