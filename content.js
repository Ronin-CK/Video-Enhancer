// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const STYLE_ID = 'firefox-hdr-optimizer-style';
const SVG_FILTER_ID = 'video-enhancer-filter';
const SVG_CONTAINER_ID = 'video-enhancer-svg-container';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const DEBOUNCE_DELAY = 100;

const WARMTH_MODE = Object.freeze({
    SIMPLE: 'simple',
    CINEMATIC: 'cinematic'
});

// Factory default presets
const PRESET_DEFAULTS = Object.freeze({
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
});

// -----------------------------------------------------------------------------
// State Management
// -----------------------------------------------------------------------------

const state = {
    currentSharpness: null,
    currentWarmth: null,
    currentWarmthMode: null,
    currentFilterId: null,
    isInitialized: false
};

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

function debounce(fn, delay) {
    let timerId = null;
    return function debounced(...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
}

function handleError(context, error) {
    console.error(`[Video Enhancer] ${context}:`, error);
}

function getNumericValue(value, fallback) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// -----------------------------------------------------------------------------
// SVG Filter Creation Helpers
// -----------------------------------------------------------------------------

function createSharpnessElements(sharpness, inputName, outputName) {
    const fragment = document.createDocumentFragment();

    const strength = (sharpness / 100) * 3;
    const k2 = 1 + strength;
    const k3 = -strength;

    const blur = document.createElementNS(SVG_NAMESPACE, 'feGaussianBlur');
    blur.setAttribute('in', inputName);
    blur.setAttribute('stdDeviation', '1.2');
    blur.setAttribute('result', 'sharpnessBlur');

    const composite = document.createElementNS(SVG_NAMESPACE, 'feComposite');
    composite.setAttribute('in', inputName);
    composite.setAttribute('in2', 'sharpnessBlur');
    composite.setAttribute('operator', 'arithmetic');
    composite.setAttribute('k1', '0');
    composite.setAttribute('k2', k2.toFixed(4));
    composite.setAttribute('k3', k3.toFixed(4));
    composite.setAttribute('k4', '0');
    composite.setAttribute('result', outputName);

    fragment.append(blur, composite);
    return fragment;
}

function createSimpleWarmthElement(warmth, inputName, outputName) {
    const w = warmth / 100;

    const r = 1 + (w * 0.15);
    const g = 1 + (w * 0.05);
    const b = 1 - (w * 0.15);
    const rOffset = w * 0.02;
    const bOffset = -w * 0.02;

    const colorMatrix = document.createElementNS(SVG_NAMESPACE, 'feColorMatrix');
    colorMatrix.setAttribute('in', inputName);
    colorMatrix.setAttribute('type', 'matrix');
    colorMatrix.setAttribute('result', outputName);
    colorMatrix.setAttribute('values', [
        r.toFixed(4), '0', '0', '0', rOffset.toFixed(4),
        '0', g.toFixed(4), '0', '0', '0',
        '0', '0', b.toFixed(4), '0', bOffset.toFixed(4),
        '0', '0', '0', '1', '0'
    ].join(' '));

    return colorMatrix;
}

function createCinematicWarmthElements(warmth, inputName, outputName) {
    const fragment = document.createDocumentFragment();
    const w = warmth / 100;

    // Stage 1: Gamma-based tonal separation
    const gammaTransfer = document.createElementNS(SVG_NAMESPACE, 'feComponentTransfer');
    gammaTransfer.setAttribute('in', inputName);
    gammaTransfer.setAttribute('result', 'gammaCorrected');

    const funcR = document.createElementNS(SVG_NAMESPACE, 'feFuncR');
    funcR.setAttribute('type', 'gamma');
    funcR.setAttribute('amplitude', (1 + w * 0.12).toFixed(4));
    funcR.setAttribute('exponent', (1 - w * 0.08).toFixed(4));
    funcR.setAttribute('offset', (w * 0.01).toFixed(4));

    const funcG = document.createElementNS(SVG_NAMESPACE, 'feFuncG');
    funcG.setAttribute('type', 'gamma');
    funcG.setAttribute('amplitude', (1 + w * 0.04).toFixed(4));
    funcG.setAttribute('exponent', (1 - w * 0.02).toFixed(4));
    funcG.setAttribute('offset', '0');

    const funcB = document.createElementNS(SVG_NAMESPACE, 'feFuncB');
    funcB.setAttribute('type', 'gamma');
    funcB.setAttribute('amplitude', (1 - w * 0.10).toFixed(4));
    funcB.setAttribute('exponent', (1 + w * 0.12).toFixed(4));
    funcB.setAttribute('offset', (w * 0.025).toFixed(4));

    const funcA = document.createElementNS(SVG_NAMESPACE, 'feFuncA');
    funcA.setAttribute('type', 'identity');

    gammaTransfer.append(funcR, funcG, funcB, funcA);
    fragment.appendChild(gammaTransfer);

    // Stage 2: Highlight color shift
    const highlightShift = document.createElementNS(SVG_NAMESPACE, 'feColorMatrix');
    highlightShift.setAttribute('in', 'gammaCorrected');
    highlightShift.setAttribute('type', 'matrix');
    highlightShift.setAttribute('result', 'highlightShifted');

    const hR = w * 0.05;
    const hB = -w * 0.05;

    highlightShift.setAttribute('values', [
        (1 + hR).toFixed(4), '0', '0', '0', '0',
        '0', '1', '0', '0', '0',
        '0', '0', (1 + hB).toFixed(4), '0', '0',
        '0', '0', '0', '1', '0'
    ].join(' '));

    fragment.appendChild(highlightShift);

    // Stage 3: Final blend
    const finalGrade = document.createElementNS(SVG_NAMESPACE, 'feColorMatrix');
    finalGrade.setAttribute('in', 'highlightShifted');
    finalGrade.setAttribute('type', 'matrix');
    finalGrade.setAttribute('result', outputName);

    const fR = 1 + (w * 0.02);
    const fB = 1 - (w * 0.02);

    finalGrade.setAttribute('values', [
        fR.toFixed(4), '0', '0', '0', '0',
        '0', '1', '0', '0', '0',
        '0', '0', fB.toFixed(4), '0', '0',
        '0', '0', '0', '1', '0'
    ].join(' '));

    fragment.appendChild(finalGrade);

    return fragment;
}

function createWarmthElements(warmth, mode, inputName, outputName) {
    if (mode === WARMTH_MODE.CINEMATIC) {
        return createCinematicWarmthElements(warmth, inputName, outputName);
    }
    return createSimpleWarmthElement(warmth, inputName, outputName);
}

function createCombinedFilterSVG(filterId, sharpness, warmth, warmthMode) {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    svg.setAttribute('xmlns', SVG_NAMESPACE);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText = 'position:absolute;width:0;height:0;';

    const filter = document.createElementNS(SVG_NAMESPACE, 'filter');
    filter.setAttribute('id', filterId);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', '100%');
    filter.setAttribute('height', '100%');

    let currentInput = 'SourceGraphic';
    let stepCount = 0;

    // Apply warmth first
    if (Math.abs(warmth) > 0.5) {
        const outputName = `step${++stepCount}`;
        const warmthElements = createWarmthElements(warmth, warmthMode, currentInput, outputName);

        if (warmthElements instanceof DocumentFragment) {
            filter.appendChild(warmthElements);
        } else {
            filter.appendChild(warmthElements);
        }
        currentInput = outputName;
    }

    // Apply sharpness second
    if (sharpness > 0) {
        const outputName = `step${++stepCount}`;
        const sharpnessElements = createSharpnessElements(sharpness, currentInput, outputName);
        filter.appendChild(sharpnessElements);
    }

    svg.appendChild(filter);
    return svg;
}

// -----------------------------------------------------------------------------
// SVG Filter Management
// -----------------------------------------------------------------------------

function updateSVGFilter(sharpness, warmth, warmthMode = WARMTH_MODE.SIMPLE) {
    const normalizedSharpness = clamp(Math.round(sharpness), 0, 100);
    const normalizedWarmth = clamp(warmth, -100, 100);
    const normalizedMode = warmthMode === WARMTH_MODE.CINEMATIC
        ? WARMTH_MODE.CINEMATIC
        : WARMTH_MODE.SIMPLE;

    const needsFilter = normalizedSharpness > 0 || Math.abs(normalizedWarmth) > 0.5;

    if (
        normalizedSharpness === state.currentSharpness &&
        normalizedWarmth === state.currentWarmth &&
        normalizedMode === state.currentWarmthMode
    ) {
        return state.currentFilterId;
    }

    let container = document.getElementById(SVG_CONTAINER_ID);

    if (!needsFilter) {
        container?.remove();
        state.currentSharpness = 0;
        state.currentWarmth = 0;
        state.currentWarmthMode = null;
        state.currentFilterId = null;
        return null;
    }

    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => {
            updateSVGFilter(normalizedSharpness, normalizedWarmth, normalizedMode);
            loadAndApplySettings();
        }, { once: true });
        return null;
    }

    if (!container) {
        container = document.createElement('div');
        container.id = SVG_CONTAINER_ID;
        container.style.cssText =
            'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;';
        document.body.appendChild(container);
    }

    const modePrefix = normalizedMode === WARMTH_MODE.CINEMATIC ? 'c' : 's';
    const filterId = `${SVG_FILTER_ID}-${modePrefix}${normalizedWarmth.toFixed(0)}-sh${normalizedSharpness}`;

    const svg = createCombinedFilterSVG(filterId, normalizedSharpness, normalizedWarmth, normalizedMode);
    container.replaceChildren(svg);

    state.currentSharpness = normalizedSharpness;
    state.currentWarmth = normalizedWarmth;
    state.currentWarmthMode = normalizedMode;
    state.currentFilterId = filterId;

    return filterId;
}

// -----------------------------------------------------------------------------
// CSS Filter Management
// -----------------------------------------------------------------------------

function buildFilterString(values, svgFilterId) {
    const intensity = getNumericValue(values.intensity, 100) / 100;

    const brightness = 100 + (getNumericValue(values.brightness, 100) - 100) * intensity;
    const contrast = 100 + (getNumericValue(values.contrast, 100) - 100) * intensity;
    const saturate = 100 + (getNumericValue(values.saturate, 100) - 100) * intensity;

    const filters = [
        `brightness(${brightness.toFixed(2)}%)`,
        `contrast(${contrast.toFixed(2)}%)`,
        `saturate(${saturate.toFixed(2)}%)`
    ];

    if (svgFilterId) {
        filters.push(`url(#${svgFilterId})`);
    }

    return filters.join(' ');
}

function updateStyleElement(filterValue) {
    let style = document.getElementById(STYLE_ID);

    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = `
        video,
        .html5-main-video,
        .video-stream,
        .html5-video-player video,
        [class*="player"] video,
        [data-player] video {
            filter: ${filterValue} !important;
        }

        img,
        picture,
        svg:not(#${SVG_CONTAINER_ID} svg),
        [role="img"],
        ytd-thumbnail,
        .ytp-videowall-still-image,
        yt-image,
        yt-img-shadow,
        .thumbnail,
        [class*="thumbnail"],
        [class*="poster"] {
            filter: none !important;
        }
    `;
}

// -----------------------------------------------------------------------------
// Core Filter Application
// -----------------------------------------------------------------------------

function applyFilters(data) {
    try {
        if (!data || data.enabled === false) {
            removeFilters();
            return;
        }

        const activePresetName = data.activePreset || 'balanced';
        const presets = data.presets || PRESET_DEFAULTS;
        const activeValues = presets[activePresetName] || PRESET_DEFAULTS.balanced;

        const intensity = getNumericValue(activeValues.intensity, 100) / 100;
        const sharpness = parseInt(activeValues.sharpness ?? 0, 10);
        const warmth = getNumericValue(activeValues.warmth, 0) * intensity;
        const warmthMode = activeValues.warmthMode || WARMTH_MODE.SIMPLE;

        const svgFilterId = updateSVGFilter(sharpness, warmth, warmthMode);
        const filterValue = buildFilterString(activeValues, svgFilterId);
        updateStyleElement(filterValue);

        state.isInitialized = true;
    } catch (error) {
        handleError('applyFilters', error);
    }
}

function removeFilters() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(SVG_CONTAINER_ID)?.remove();

    state.currentSharpness = null;
    state.currentWarmth = null;
    state.currentWarmthMode = null;
    state.currentFilterId = null;
}

// -----------------------------------------------------------------------------
// Settings Management
// -----------------------------------------------------------------------------

function loadAndApplySettings() {
    browser.storage.local.get(null)
        .then(applyFilters)
        .catch((error) => {
            handleError('loadAndApplySettings', error);
            applyFilters({
                enabled: true,
                activePreset: 'balanced',
                presets: PRESET_DEFAULTS
            });
        });
}

const debouncedLoadSettings = debounce(loadAndApplySettings, DEBOUNCE_DELAY);

// -----------------------------------------------------------------------------
// Event Listeners & Observers
// -----------------------------------------------------------------------------

function initStorageListener() {
    browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            loadAndApplySettings();
        }
    });
}

function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                const isVideo = node.nodeName === 'VIDEO';
                const containsVideo = node.querySelector?.('video');

                if (isVideo || containsVideo) {
                    debouncedLoadSettings();
                    return;
                }
            }
        }
    });

    const startObserving = () => {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    if (document.body) {
        startObserving();
    } else {
        document.addEventListener('DOMContentLoaded', startObserving, { once: true });
    }

    return observer;
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

function init() {
    loadAndApplySettings();
    initStorageListener();
    initMutationObserver();
}

init();
