/*
 * Copyright (c) 2026 Chandra Kant (Ronin-CK)
 * All Rights Reserved.
 * This product and its source code are proprietary.
 */

const STYLE_ID = 'firefox-hdr-optimizer-style';
const SVG_FILTER_ID = 'video-enhancer-filter';
const SVG_CONTAINER_ID = 'video-enhancer-svg-container';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const DEBOUNCE_DELAY = 100;

const SHADOW_FILTER_ID = 'video-enhancer-shadow';

const state = {
    currentSharpness: null,
    currentWarmth: null,
    currentWarmthMode: null,
    currentShadowBoost: null,
    currentShadowFilterId: null,
    currentMainFilterId: null,
    isInitialized: false
};

function debounce(fn, delay) {
    let timerId = null;
    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
}

function getNumericValue(value, fallback) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}

const createSharpnessElements = (sharpness, inputName, outputName) => {
    const f = document.createDocumentFragment();
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

    f.append(blur, composite);
    return f;
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
    const frag = document.createDocumentFragment();
    const w = warmth / 100;

    const gt = document.createElementNS(SVG_NAMESPACE, 'feComponentTransfer');
    gt.setAttribute('in', inputName);
    gt.setAttribute('result', 'gammaCorrected');

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

    gt.append(funcR, funcG, funcB, funcA);
    frag.appendChild(gt);

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

    frag.appendChild(highlightShift);

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

    frag.appendChild(finalGrade);
    return frag;
}

function createWarmthElements(warmth, mode, inputName, outputName) {
    if (mode === 'cinematic') {
        return createCinematicWarmthElements(warmth, inputName, outputName);
    }
    return createSimpleWarmthElement(warmth, inputName, outputName);
}

function createShadowBoostElements(shadowBoost, inputName, outputName) {
    const frag = document.createDocumentFragment();
    const strength = shadowBoost / 100;

    const exponent = 1.0 - (strength * 0.65);

    const amplitude = 1.0 - (strength * 0.03);

    const offset = strength * 0.035;

    const transfer = document.createElementNS(SVG_NAMESPACE, 'feComponentTransfer');
    transfer.setAttribute('in', inputName);
    transfer.setAttribute('result', outputName);

    for (const channel of ['feFuncR', 'feFuncG', 'feFuncB']) {
        const func = document.createElementNS(SVG_NAMESPACE, channel);
        func.setAttribute('type', 'gamma');
        func.setAttribute('amplitude', amplitude.toFixed(4));
        func.setAttribute('exponent', exponent.toFixed(4));
        func.setAttribute('offset', offset.toFixed(4));
        transfer.appendChild(func);
    }

    const funcA = document.createElementNS(SVG_NAMESPACE, 'feFuncA');
    funcA.setAttribute('type', 'identity');
    transfer.appendChild(funcA);

    frag.appendChild(transfer);
    return frag;
}

function createShadowBoostSVG(filterId, shadowBoost) {
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

    const elements = createShadowBoostElements(shadowBoost, 'SourceGraphic', 'shadowLifted');
    filter.appendChild(elements);

    svg.appendChild(filter);
    return svg;
}

function updateSVGFilters(sharpness, warmth, warmthMode = WARMTH_MODE.SIMPLE, shadowBoost = 0) {
    const normSharpness = clamp(Math.round(sharpness), 0, 100);
    const normWarmth = clamp(warmth, -100, 100);
    const normShadowBoost = clamp(Math.round(shadowBoost), 0, 100);
    const normMode = warmthMode === 'cinematic' ? 'cinematic' : 'simple';
    const needsMain = normSharpness > 0 || Math.abs(normWarmth) > 0.5;
    const needsShadow = normShadowBoost > 0;

    if (normSharpness === state.currentSharpness &&
        normWarmth === state.currentWarmth &&
        normMode === state.currentWarmthMode &&
        normShadowBoost === state.currentShadowBoost) {
        return { shadowId: state.currentShadowFilterId, mainId: state.currentMainFilterId };
    }

    let container = document.getElementById(SVG_CONTAINER_ID);

    if (!needsMain && !needsShadow) {
        container?.remove();
        state.currentSharpness = 0;
        state.currentWarmth = 0;
        state.currentWarmthMode = null;
        state.currentShadowBoost = 0;
        state.currentShadowFilterId = null;
        state.currentMainFilterId = null;
        return { shadowId: null, mainId: null };
    }

    if (!document.body) {
        return { shadowId: null, mainId: null };
    }

    if (!container) {
        container = document.createElement('div');
        container.id = SVG_CONTAINER_ID;
        container.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;';
        document.body.appendChild(container);
    }

    const fragment = document.createDocumentFragment();
    let shadowFilterId = null;
    let mainFilterId = null;

    if (needsShadow) {
        shadowFilterId = `${SHADOW_FILTER_ID}-sb${normShadowBoost}`;
        fragment.appendChild(createShadowBoostSVG(shadowFilterId, normShadowBoost));
    }

    if (needsMain) {
        const modePrefix = normMode === 'cinematic' ? 'c' : 's';
        mainFilterId = `${SVG_FILTER_ID}-${modePrefix}${normWarmth.toFixed(0)}-sh${normSharpness}`;
        fragment.appendChild(createCombinedFilterSVG(mainFilterId, normSharpness, normWarmth, normMode));
    }

    container.replaceChildren(fragment);

    state.currentSharpness = normSharpness;
    state.currentWarmth = normWarmth;
    state.currentWarmthMode = normMode;
    state.currentShadowBoost = normShadowBoost;
    state.currentShadowFilterId = shadowFilterId;
    state.currentMainFilterId = mainFilterId;

    return { shadowId: shadowFilterId, mainId: mainFilterId };
}

function buildFilterString(values, shadowFilterId, mainFilterId) {
    const intensity = getNumericValue(values.intensity, 100) / 100;
    const brightness = 100 + (getNumericValue(values.brightness, 100) - 100) * intensity;
    const contrast = 100 + (getNumericValue(values.contrast, 100) - 100) * intensity;
    const saturate = 100 + (getNumericValue(values.saturate, 100) - 100) * intensity;

    const filters = [];

    if (shadowFilterId) filters.push(`url(#${shadowFilterId})`);

    filters.push(
        `brightness(${brightness.toFixed(2)}%)`,
        `contrast(${contrast.toFixed(2)}%)`,
        `saturate(${saturate.toFixed(2)}%)`
    );

    if (mainFilterId) filters.push(`url(#${mainFilterId})`);

    return filters.join(' ');
}

function updateStyleElement(filterValue, enableImages) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
    }

    const target = document.head || document.documentElement;
    if (style.parentNode !== target) {
        target.appendChild(style);
    }

    const imageFilter = enableImages ? `${filterValue} !important` : 'none !important';

    style.textContent = `
        video, .html5-main-video, .video-stream, .html5-video-player video,
        [class*="player"] video, [data-player] video {
            filter: ${filterValue} !important;
        }

        img, picture, svg:not(#${SVG_CONTAINER_ID} svg), [role="img"],
        ytd-thumbnail, .ytp-videowall-still-image, yt-image, yt-img-shadow,
        .thumbnail, [class*="thumbnail"], [class*="poster"],
        [style*="url"] {
            filter: ${imageFilter};
        }
    `;
}

function applyFilters(data) {
    try {
        if (!data || data.enabled === false) {
            removeFilters();
            return;
        }

        const presets = data.presets || PRESET_DEFAULTS;
        const rawValues = presets[data.activePreset || 'balanced'] || PRESET_DEFAULTS.balanced;
        const activeValues = { ...PRESET_DEFAULTS[data.activePreset || 'balanced'], ...rawValues };

        const validated = validatePreset(activeValues, data.activePreset || 'balanced');

        const intensity = getNumericValue(validated.intensity, 100) / 100;
        const sharpness = parseInt(validated.sharpness ?? 0, 10);
        const warmth = getNumericValue(validated.warmth, 0) * intensity;
        const warmthMode = validated.warmthMode || 'simple';
        const shadowBoost = getNumericValue(validated.shadowBoost, 0) * intensity;
        const enableImages = data.enableImages ?? false;

        const { shadowId, mainId } = updateSVGFilters(sharpness, warmth, warmthMode, shadowBoost);
        updateStyleElement(buildFilterString(validated, shadowId, mainId), enableImages);

        state.isInitialized = true;
    } catch (error) {
        console.error('Video Enhancer Apply Error:', error);
    }
}

function removeFilters() {
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(SVG_CONTAINER_ID)?.remove();
    state.currentSharpness = null;
    state.currentWarmth = null;
    state.currentWarmthMode = null;
    state.currentShadowBoost = null;
    state.currentShadowFilterId = null;
    state.currentMainFilterId = null;
}

let _cachedIframeHostname = null;

async function getHostnameAsync() {
    if (window.top === window.self) {
        return window.location.hostname.replace(/^www\./, '');
    }
    if (_cachedIframeHostname) return _cachedIframeHostname;
    try {
        if (document.referrer) {
            _cachedIframeHostname = new URL(document.referrer).hostname.replace(/^www\./, '');
            return _cachedIframeHostname;
        }
    } catch (e) {}
    try {
        const response = await browser.runtime.sendMessage({ type: 'GET_TAB_HOSTNAME' });
        if (response?.hostname) {
            _cachedIframeHostname = response.hostname;
            return _cachedIframeHostname;
        }
    } catch (e) {}
    return window.location.hostname.replace(/^www\./, '');
}

function getHostname() {
    if (window.top === window.self) {
        return window.location.hostname.replace(/^www\./, '');
    }
    if (_cachedIframeHostname) return _cachedIframeHostname;
    try {
        if (document.referrer) {
            return new URL(document.referrer).hostname.replace(/^www\./, '');
        }
    } catch (e) {}
    return window.location.hostname.replace(/^www\./, '');
}

function resolveSettings(data, hostname) {
    if (data.siteSettings && data.siteSettings[hostname]) {
        return {
            ...data.siteSettings[hostname],
            presets: data.siteSettings[hostname].presets || data.presets || PRESET_DEFAULTS
        };
    }
    return data;
}

function loadAndApplySettings(source = 'unknown') {
    Promise.all([
        browser.storage.local.get(STORAGE_KEYS),
        getHostnameAsync()
    ])
        .then(([data, hostname]) => {
            const resolved = resolveSettings(data, hostname);
            applyFilters(resolved);
        })
        .catch((error) => {
            console.error('Video Enhancer Load Error:', error);
        });
}

const debouncedLoadSettings = debounce(() => loadAndApplySettings('debounce'), DEBOUNCE_DELAY);

let ignoreStorageUpdateUntil = 0;

function initStorageListener() {
    browser.storage.onChanged.addListener((changes, area) => {
        if (Date.now() < ignoreStorageUpdateUntil) return;
        if (area === 'local') loadAndApplySettings('storage-change');
    });

    browser.runtime.onMessage.addListener((message) => {
        if (message.type === 'UPDATE_SETTINGS' && message.settings) {
            if (message.ignoreStorage) {
                ignoreStorageUpdateUntil = Date.now() + 500;
            }
            applyFilters(message.settings);
        }
    });
}

function initMutationObserver() {
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.removedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE && node.id === SVG_CONTAINER_ID) {
                    debouncedLoadSettings();
                    return;
                }
            }
            for (const node of m.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.nodeName === 'VIDEO' || node.querySelector?.('video')) {
                    debouncedLoadSettings();
                    return;
                }
            }
        }
    });

    const startObserving = () => {
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.body) startObserving();
    else document.addEventListener('DOMContentLoaded', startObserving, { once: true });
    return observer;
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

    if (Math.abs(warmth) > 0.5) {
        const outputName = `step${++stepCount}`;
        const warmthElements = createWarmthElements(warmth, warmthMode, currentInput, outputName);
        filter.appendChild(warmthElements);
        currentInput = outputName;
    }

    if (sharpness > 0) {
        const outputName = `step${++stepCount}`;
        const sharpnessElements = createSharpnessElements(sharpness, currentInput, outputName);
        filter.appendChild(sharpnessElements);
    }

    svg.appendChild(filter);
    return svg;
}

function init() {
    loadAndApplySettings('init');
    initStorageListener();
    initMutationObserver();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            loadAndApplySettings('DOMContentLoaded');
        }, { once: true });
    } else {
        setTimeout(() => loadAndApplySettings('fallback-timeout'), 0);
    }
}

init();
