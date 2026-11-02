/*
 * Copyright (c) 2026 Chandra Kant (Ronin-CK)
 * All Rights Reserved.
 * This product and its source code are proprietary.
 */

const STYLE_ID = 'firefox-hdr-optimizer-style';
const IMAGE_STYLE_ID = 'firefox-hdr-optimizer-image-style';
const ASPECT_STYLE_ID = 'video-enhancer-aspect-style';
const SVG_FILTER_ID = 'video-enhancer-filter';
const SVG_CONTAINER_ID = 'video-enhancer-svg-container';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SHADOW_FILTER_ID = 'video-enhancer-shadow';
const DEBOUNCE_DELAY = 100;
const HUD_IDLE_TIMEOUT = 1300;

const state = {
    currentSharpness: null,
    currentWarmth: null,
    currentWarmthMode: null,
    currentShadowBoost: null,
    currentHighlights: null,
    currentTint: null,
    currentVibrance: null,
    currentPerformanceMode: false,
    isInitialized: false
};

function debounce(fn, delay) {
    let timerId = null;
    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getNumericValue(value, fallback) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}

let _svgElements = null;

function ensureSVGContainer() {
    let container = document.getElementById(SVG_CONTAINER_ID);
    const targetParent = document.fullscreenElement || document.body || document.documentElement;
    if (!targetParent) return null;

    if (!container) {
        container = document.createElement('div');
        container.id = SVG_CONTAINER_ID;
        container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.01;pointer-events:none;overflow:hidden;z-index:-1;';

        container.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" aria-hidden="true" focusable="false" style="position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0.01;pointer-events:none;">
                <!-- 1. Shadow Boost Filter -->
                <filter id="video-enhancer-shadow" color-interpolation-filters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
                    <feComponentTransfer id="ve-shadow-transfer" in="SourceGraphic" result="shadowLifted">
                        <feFuncR id="ve-shadow-r" type="identity"/>
                        <feFuncG id="ve-shadow-g" type="identity"/>
                        <feFuncB id="ve-shadow-b" type="identity"/>
                        <feFuncA type="identity"/>
                    </feComponentTransfer>
                </filter>

                <!-- 2. Combined Color & Detail Filter -->
                <filter id="video-enhancer-filter" color-interpolation-filters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
                    <!-- Smart Vibrance Matrix -->
                    <feColorMatrix id="ve-vibrance-matrix" in="SourceGraphic" result="vibranceOut" type="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/>

                    <!-- Warmth Gamma (Cinematic) -->
                    <feComponentTransfer id="ve-warmth-transfer" in="vibranceOut" result="warmthGammaOut">
                        <feFuncR id="ve-warmth-func-r" type="identity"/>
                        <feFuncG id="ve-warmth-func-g" type="identity"/>
                        <feFuncB id="ve-warmth-func-b" type="identity"/>
                        <feFuncA type="identity"/>
                    </feComponentTransfer>

                    <!-- Warmth & Tint Matrix -->
                    <feColorMatrix id="ve-warmth-matrix" in="warmthGammaOut" result="warmthOut" type="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/>

                    <!-- Highlight Rolloff -->
                    <feComponentTransfer id="ve-highlights-transfer" in="warmthOut" result="highlightsOut">
                        <feFuncR id="ve-hl-func-r" type="identity"/>
                        <feFuncG id="ve-hl-func-g" type="identity"/>
                        <feFuncB id="ve-hl-func-b" type="identity"/>
                        <feFuncA type="identity"/>
                    </feComponentTransfer>

                    <!-- Sharpness Unsharp Mask -->
                    <feGaussianBlur id="ve-sharpness-blur" in="highlightsOut" result="sharpnessBlur" stdDeviation="1.2"/>
                    <feComposite id="ve-sharpness-composite" in="highlightsOut" in2="sharpnessBlur" operator="arithmetic"
                        k1="0" k2="1" k3="0" k4="0" result="finalOut"/>
                </filter>
            </svg>
        `;
        targetParent.appendChild(container);
        _svgElements = null;
    } else if (container.parentNode !== targetParent) {
        targetParent.appendChild(container);
    }

    if (!_svgElements || !_svgElements.vMat?.isConnected) {
        _svgElements = {
            vMat: document.getElementById('ve-vibrance-matrix'),
            wTransferR: document.getElementById('ve-warmth-func-r'),
            wTransferG: document.getElementById('ve-warmth-func-g'),
            wTransferB: document.getElementById('ve-warmth-func-b'),
            wMatrix: document.getElementById('ve-warmth-matrix'),
            hlR: document.getElementById('ve-hl-func-r'),
            hlG: document.getElementById('ve-hl-func-g'),
            hlB: document.getElementById('ve-hl-func-b'),
            comp: document.getElementById('ve-sharpness-composite'),
            sbR: document.getElementById('ve-shadow-r'),
            sbG: document.getElementById('ve-shadow-g'),
            sbB: document.getElementById('ve-shadow-b')
        };
    }

    return container;
}

function updateSVGFiltersInPlace(sharpness, warmth, warmthMode = WARMTH_MODE.SIMPLE, shadowBoost = 0, highlights = 0, tint = 0, vibrance = 0, performanceMode = false) {
    if (performanceMode) {
        document.getElementById(SVG_CONTAINER_ID)?.remove();
        _svgElements = null;
        state.currentSharpness = 0;
        state.currentWarmth = 0;
        state.currentWarmthMode = null;
        state.currentShadowBoost = 0;
        state.currentHighlights = 0;
        state.currentTint = 0;
        state.currentVibrance = 0;
        state.currentPerformanceMode = true;
        return { shadowId: null, mainId: null };
    }

    const normSharpness = clamp(Math.round(sharpness), 0, 100);
    const normWarmth = clamp(warmth, -100, 100);
    const normTint = clamp(tint, -100, 100);
    const normShadowBoost = clamp(Math.round(shadowBoost), 0, 100);
    const normHighlights = clamp(Math.round(highlights), 0, 100);
    const normVibrance = clamp(Math.round(vibrance), 0, 100);
    const normMode = warmthMode === 'cinematic' ? 'cinematic' : 'simple';

    // Zero-latency fast path: skip DOM manipulation if detail parameters haven't changed
    if (
        normSharpness === state.currentSharpness &&
        normWarmth === state.currentWarmth &&
        normTint === state.currentTint &&
        normMode === state.currentWarmthMode &&
        normShadowBoost === state.currentShadowBoost &&
        normHighlights === state.currentHighlights &&
        normVibrance === state.currentVibrance &&
        state.currentPerformanceMode === false
    ) {
        return { shadowId: SHADOW_FILTER_ID, mainId: SVG_FILTER_ID };
    }

    ensureSVGContainer();
    if (!_svgElements) return { shadowId: SHADOW_FILTER_ID, mainId: SVG_FILTER_ID };

    const { vMat, wTransferR, wTransferG, wTransferB, wMatrix, hlR, hlG, hlB, comp, sbR, sbG, sbB } = _svgElements;

    // 1. Instant Vibrance Update
    if (vMat && normVibrance !== state.currentVibrance) {
        if (normVibrance <= 0) {
            vMat.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0');
        } else {
            const v = normVibrance / 100;
            const r1 = 1 + (0.10 * v);
            const r2 = -0.05 * v;
            const r3 = -0.05 * v;

            const g1 = -0.15 * v;
            const g2 = 1 + (0.42 * v);
            const g3 = -0.27 * v;

            const b1 = -0.18 * v;
            const b2 = -0.32 * v;
            const b3 = 1 + (0.50 * v);

            vMat.setAttribute('values', [
                r1.toFixed(4), r2.toFixed(4), r3.toFixed(4), '0', '0',
                g1.toFixed(4), g2.toFixed(4), g3.toFixed(4), '0', '0',
                b1.toFixed(4), b2.toFixed(4), b3.toFixed(4), '0', '0',
                '0', '0', '0', '1', '0'
            ].join(' '));
        }
    }

    // 2. Instant Warmth & Tint Update
    if ((normWarmth !== state.currentWarmth || normTint !== state.currentTint || normMode !== state.currentWarmthMode) && wTransferR) {
        if (Math.abs(normWarmth) <= 0.5 && Math.abs(normTint) <= 0.5) {
            wTransferR.setAttribute('type', 'identity');
            wTransferG?.setAttribute('type', 'identity');
            wTransferB?.setAttribute('type', 'identity');
            wMatrix?.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0');
        } else {
            const w = normWarmth / 100;
            const t = normTint / 100;

            if (normMode === 'cinematic') {
                wTransferR.setAttribute('type', 'gamma');
                wTransferR.setAttribute('amplitude', (1 + w * 0.12 - t * 0.05).toFixed(4));
                wTransferR.setAttribute('exponent', (1 - w * 0.08).toFixed(4));
                wTransferR.setAttribute('offset', (w * 0.01).toFixed(4));

                wTransferG?.setAttribute('type', 'gamma');
                wTransferG?.setAttribute('amplitude', (1 + w * 0.04 + t * 0.12).toFixed(4));
                wTransferG?.setAttribute('exponent', (1 - w * 0.02).toFixed(4));
                wTransferG?.setAttribute('offset', (t * 0.01).toFixed(4));

                wTransferB?.setAttribute('type', 'gamma');
                wTransferB?.setAttribute('amplitude', (1 - w * 0.10 - t * 0.05).toFixed(4));
                wTransferB?.setAttribute('exponent', (1 + w * 0.12).toFixed(4));
                wTransferB?.setAttribute('offset', (w * 0.025).toFixed(4));

                const fR = 1 + w * 0.07;
                const fG = 1 + t * 0.06;
                const fB = 1 - w * 0.07;
                wMatrix?.setAttribute('values', [
                    fR.toFixed(4), '0', '0', '0', '0',
                    '0', fG.toFixed(4), '0', '0', '0',
                    '0', '0', fB.toFixed(4), '0', '0',
                    '0', '0', '0', '1', '0'
                ].join(' '));
            } else {
                wTransferR.setAttribute('type', 'identity');
                wTransferG?.setAttribute('type', 'identity');
                wTransferB?.setAttribute('type', 'identity');

                const r = 1 + (w * 0.15) - (t * 0.08);
                const g = 1 + (t * 0.16);
                const b = 1 - (w * 0.15) - (t * 0.08);
                const rOffset = w * 0.02;
                const gOffset = t * 0.015;
                const bOffset = -w * 0.02;

                wMatrix?.setAttribute('values', [
                    r.toFixed(4), '0', '0', '0', rOffset.toFixed(4),
                    '0', g.toFixed(4), '0', '0', gOffset.toFixed(4),
                    '0', '0', b.toFixed(4), '0', bOffset.toFixed(4),
                    '0', '0', '0', '1', '0'
                ].join(' '));
            }
        }
    }

    // 3. Instant Highlight Rolloff Update
    if (normHighlights !== state.currentHighlights && hlR) {
        if (normHighlights <= 0) {
            hlR.setAttribute('type', 'identity');
            hlG?.setAttribute('type', 'identity');
            hlB?.setAttribute('type', 'identity');
        } else {
            const strength = normHighlights / 100;
            const exponent = (1.0 + strength * 0.35).toFixed(4);
            const amplitude = (1.0 - strength * 0.08).toFixed(4);

            for (const el of [hlR, hlG, hlB]) {
                if (el) {
                    el.setAttribute('type', 'gamma');
                    el.setAttribute('amplitude', amplitude);
                    el.setAttribute('exponent', exponent);
                    el.setAttribute('offset', '0');
                }
            }
        }
    }

    // 4. Instant Sharpness Update
    if (normSharpness !== state.currentSharpness && comp) {
        if (normSharpness <= 0) {
            comp.setAttribute('k2', '1');
            comp.setAttribute('k3', '0');
        } else {
            const strength = (normSharpness / 100) * 3;
            comp.setAttribute('k2', (1 + strength).toFixed(4));
            comp.setAttribute('k3', (-strength).toFixed(4));
        }
    }

    // 5. Instant Shadow Boost Update
    if (normShadowBoost !== state.currentShadowBoost && sbR) {
        if (normShadowBoost <= 0) {
            sbR.setAttribute('type', 'identity');
            sbG?.setAttribute('type', 'identity');
            sbB?.setAttribute('type', 'identity');
        } else {
            const strength = normShadowBoost / 100;
            const exponent = (1.0 - (strength * 0.65)).toFixed(4);

            for (const el of [sbR, sbG, sbB]) {
                if (el) {
                    el.setAttribute('type', 'gamma');
                    el.setAttribute('amplitude', '1.0');
                    el.setAttribute('exponent', exponent);
                    el.setAttribute('offset', '0');
                }
            }
        }
    }

    state.currentSharpness = normSharpness;
    state.currentWarmth = normWarmth;
    state.currentTint = normTint;
    state.currentWarmthMode = normMode;
    state.currentShadowBoost = normShadowBoost;
    state.currentHighlights = normHighlights;
    state.currentVibrance = normVibrance;
    state.currentPerformanceMode = false;

    return { shadowId: SHADOW_FILTER_ID, mainId: SVG_FILTER_ID };
}

function buildFilterString(values, performanceMode = false) {
    const intensity = getNumericValue(values.intensity, 100) / 100;
    const brightness = 100 + (getNumericValue(values.brightness, 100) - 100) * intensity;
    const contrast = 100 + (getNumericValue(values.contrast, 100) - 100) * intensity;
    const baseSaturate = getNumericValue(values.saturate, 100);
    const vibrance = getNumericValue(values.vibrance, 0) * intensity;
    const sharpness = parseInt(values.sharpness ?? 0, 10);
    const shadowBoost = getNumericValue(values.shadowBoost, 0) * intensity;
    const highlights = getNumericValue(values.highlights, 0) * intensity;
    const warmthMode = values.warmthMode || 'simple';

    const vibranceSat = (vibrance * 0.35);
    const saturate = 100 + ((baseSaturate - 100) * intensity) + vibranceSat;

    const warmth = getNumericValue(values.warmth, 0) * intensity;
    const tint = getNumericValue(values.tint, 0) * intensity;

    const filters = [];

    // Only inject SVG Shadow Boost filter when shadowBoost is non-zero
    if (!performanceMode && shadowBoost > 0.5) {
        filters.push(`url(#${SHADOW_FILTER_ID})`);
    }

    filters.push(
        `brightness(${brightness.toFixed(2)}%)`,
        `contrast(${contrast.toFixed(2)}%)`,
        `saturate(${saturate.toFixed(2)}%)`
    );

    // Instant pure CSS GPU color temperature & tint for zero-latency 60fps response
    if (Math.abs(warmth) > 0.5) {
        if (warmth > 0) {
            const sepiaPct = clamp(warmth * 0.45, 0, 50).toFixed(2);
            const hueDeg = (-warmth * 0.4).toFixed(2);
            filters.push(`sepia(${sepiaPct}%)`, `hue-rotate(${hueDeg}deg)`);
        } else {
            const hueDeg = (warmth * 0.8).toFixed(2);
            filters.push(`hue-rotate(${hueDeg}deg)`);
        }
    }

    if (Math.abs(tint) > 0.5) {
        const tintHue = (tint * 0.5).toFixed(2);
        filters.push(`hue-rotate(${tintHue}deg)`);
    }

    // Only inject SVG detail filter when detail/matrix filters are actually active
    const needsSvgDetail = !performanceMode && (
        sharpness > 0 ||
        highlights > 0.5 ||
        (warmthMode === 'cinematic' && Math.abs(warmth) > 0.5)
    );
    if (needsSvgDetail) {
        filters.push(`url(#${SVG_FILTER_ID})`);
    }

    return filters.join(' ');
}

function buildImageFilterString(values, performanceMode = false) {
    return buildFilterString(values, performanceMode);
}

let _videoStyleTag = null;
let _cachedVideoFilter = null;
let _imageStyleTag = null;
let _cachedImageFilter = null;
let _lastEnableImages = null;
let _lastAspectRatio = null;
let _lastAudioBoost = null;
let _lastAudioCompressor = null;

function ensureVideoStyleTag() {
    if (!_videoStyleTag || !_videoStyleTag.isConnected) {
        _videoStyleTag = document.getElementById(STYLE_ID);
        if (!_videoStyleTag) {
            _videoStyleTag = document.createElement('style');
            _videoStyleTag.id = STYLE_ID;
            _videoStyleTag.textContent = `
                :root {
                    --ve-video-filter: none;
                }
                video, .html5-main-video, .video-stream, .html5-video-player video,
                [class*="player"] video, [data-player] video {
                    filter: var(--ve-video-filter) !important;
                }
            `;
            const target = document.head || document.documentElement;
            target.appendChild(_videoStyleTag);
        }
    }
    return _videoStyleTag;
}

let _iframeHasContentScript = false;

function announceIframeActive() {
    if (window.top === window.self) return;
    const hasVid = Boolean(document.querySelector('video'));
    if (!hasVid) return;
    try {
        window.parent.postMessage({
            type: 'VE_IFRAME_ACTIVE',
            hasVideo: true
        }, '*');
    } catch (_) {}
}

if (window.top !== window.self) {
    announceIframeActive();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', announceIframeActive, { once: true });
    }

    // Forward mouse activity to top window so top HUD wakes up
    let lastMouseNotify = 0;
    const notifyTopMouse = () => {
        const now = Date.now();
        if (now - lastMouseNotify > 100) {
            lastMouseNotify = now;
            try {
                window.top.postMessage({ type: 'VE_MOUSE_ACTIVITY' }, '*');
            } catch (_) {}
            try {
                window.parent.postMessage({ type: 'VE_MOUSE_ACTIVITY' }, '*');
            } catch (_) {}
        }
    };

    ['mousemove', 'pointermove', 'mouseenter', 'pointerenter', 'mouseover', 'pointerover'].forEach(evt => {
        window.addEventListener(evt, notifyTopMouse, { capture: true, passive: true });
        document.addEventListener(evt, notifyTopMouse, { capture: true, passive: true });
    });

    // Forward Escape key to top window so tweak panel closes
    const notifyEscape = (e) => {
        if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
            try {
                window.top.postMessage({ type: 'VE_ESCAPE_PRESSED' }, '*');
            } catch (_) {}
            try {
                window.parent.postMessage({ type: 'VE_ESCAPE_PRESSED' }, '*');
            } catch (_) {}
        }
    };
    window.addEventListener('keydown', notifyEscape, true);
    document.addEventListener('keydown', notifyEscape, true);

    // Forward pointerdown/mousedown to top window so tweak panel closes on click outside
    const notifyOutsideClick = (e) => {
        if (e.button === 0) {
            try {
                window.top.postMessage({ type: 'VE_CLICK_OUTSIDE' }, '*');
            } catch (_) {}
            try {
                window.parent.postMessage({ type: 'VE_CLICK_OUTSIDE' }, '*');
            } catch (_) {}
        }
    };
    window.addEventListener('pointerdown', notifyOutsideClick, true);
    window.addEventListener('mousedown', notifyOutsideClick, true);
    document.addEventListener('pointerdown', notifyOutsideClick, true);
    document.addEventListener('mousedown', notifyOutsideClick, true);
}

window.addEventListener('message', (event) => {
    if (event.data?.type === 'VE_MOUSE_ACTIVITY') {
        hudController?.handleMouseMove?.();
        return;
    }
    if (event.data?.type === 'VE_ESCAPE_PRESSED') {
        if (hudController?.isOpen) {
            hudController.closeTweakPanel();
        }
        return;
    }
    if (event.data?.type === 'VE_CLICK_OUTSIDE') {
        if (hudController?.isOpen) {
            hudController.closeTweakPanel();
        }
        return;
    }
    if ((event.data?.type === 'VE_IFRAME_ACTIVE' || event.data?.type === 'VE_IFRAME_READY') && event.data?.hasVideo) {
        _iframeHasContentScript = true;
        const playerIframe = findVideoPlayerIframe();
        if (playerIframe) {
            playerIframe.style.removeProperty('filter');
        }
    }
});

function findVideoPlayerIframe() {
    const iframes = document.querySelectorAll(
        'iframe#video-player, iframe.video-player, iframe[id*="video-player"], iframe[class*="video-player"], ' +
        'iframe[src*="youtube.com/embed"], iframe[src*="player.vimeo.com"], iframe[src*="dailymotion.com/embed"], ' +
        'iframe[src*="flixcloud"], iframe[src*="megacloud"], iframe[src*="rapid-cloud"], ' +
        'iframe[src*="streamtape"], iframe[src*="vidsrc"]'
    );
    for (let i = 0; i < iframes.length; i++) {
        const frame = iframes[i];
        const rect = frame.getBoundingClientRect();
        if (rect.width >= 240 && rect.height >= 140) {
            return frame;
        }
    }
    return null;
}

function updateVideoStyle(filterValue) {
    if (filterValue === _cachedVideoFilter) {
        if (!_iframeHasContentScript) {
            const playerIframe = findVideoPlayerIframe();
            if (playerIframe && playerIframe.style.getPropertyValue('filter') !== filterValue) {
                if (filterValue === 'none') {
                    playerIframe.style.removeProperty('filter');
                } else {
                    playerIframe.style.setProperty('filter', filterValue, 'important');
                }
            }
        }
        return;
    }
    _cachedVideoFilter = filterValue;

    ensureVideoStyleTag();

    // 1. Instant CSS variable on :root - zero CSS reparsing, immediate GPU compositor uniform update
    document.documentElement.style.setProperty('--ve-video-filter', filterValue);

    // 2. Direct inline style fallback for absolute top priority specificity across video elements
    const videos = document.querySelectorAll('video, .html5-main-video');
    for (let i = 0; i < videos.length; i++) {
        videos[i].style.setProperty('filter', filterValue, 'important');
    }

    // 3. Fallback for video player iframe when no local video element exists and iframe content script is inactive
    if (!videos.length && !_iframeHasContentScript) {
        const playerIframe = findVideoPlayerIframe();
        if (playerIframe) {
            if (filterValue === 'none') {
                playerIframe.style.removeProperty('filter');
            } else {
                playerIframe.style.setProperty('filter', filterValue, 'important');
            }
        }
    }
}

function ensureImageStyleTag() {
    if (!_imageStyleTag || !_imageStyleTag.isConnected) {
        _imageStyleTag = document.getElementById(IMAGE_STYLE_ID);
        if (!_imageStyleTag) {
            _imageStyleTag = document.createElement('style');
            _imageStyleTag.id = IMAGE_STYLE_ID;
            _imageStyleTag.textContent = `
                :root {
                    --ve-image-filter: none;
                }
                img:not(#video-enhancer-hud-host *):not(.html5-video-player *):not(#movie_player *):not([class*="html5-video-player"] *),
                canvas:not(#video-enhancer-hud-host *):not(.html5-video-player *):not(#movie_player *),
                [role="img"]:not(#video-enhancer-hud-host *):not(.html5-video-player *):not(#movie_player *),
                [style*="background-image"]:not(#video-enhancer-hud-host *):not(body):not(html),
                [class*="bg-cover"]:not(#video-enhancer-hud-host *):not(body):not(html),
                .chapter-img, .wp-manga-chapter-img, .page-image, .comic-page, .manga-image,
                .reading-content img, .reader-area img, .entry-content img, .viewer_item img, ._images,
                .md-page img, .md-page canvas, #comic_image_area img, .canvas-container canvas,
                ytd-thumbnail img, yt-image img, yt-img-shadow img, .ytp-videowall-still-image {
                    filter: var(--ve-image-filter) !important;
                }
            `;
            const target = document.head || document.documentElement;
            target.appendChild(_imageStyleTag);
        }
    }
    return _imageStyleTag;
}

function updateImageStyle(enableImages, validated, performanceMode = false) {
    if (!enableImages) {
        if (_lastEnableImages === false) return;
        _lastEnableImages = false;
        _cachedImageFilter = null;
        if (_imageStyleTag) {
            _imageStyleTag.remove();
            _imageStyleTag = null;
        }
        document.documentElement.style.removeProperty('--ve-image-filter');
        return;
    }

    _lastEnableImages = true;
    ensureImageStyleTag();

    const imageFilter = buildImageFilterString(validated, performanceMode);
    if (imageFilter === _cachedImageFilter) return;
    _cachedImageFilter = imageFilter;

    document.documentElement.style.setProperty('--ve-image-filter', imageFilter);
}

function updateVideoAspect(aspectRatio) {
    const val = aspectRatio || 'default';
    if (val === _lastAspectRatio) return;
    _lastAspectRatio = val;

    const target = document.head || document.documentElement;
    let style = document.getElementById(ASPECT_STYLE_ID);

    if (val === 'default') {
        style?.remove();
        return;
    }

    if (!style) {
        style = document.createElement('style');
        style.id = ASPECT_STYLE_ID;
        target.appendChild(style);
    }

    let css = '';
    if (val === 'fill') {
        css = 'video, .html5-main-video { object-fit: cover !important; }';
    } else if (val === 'stretch') {
        css = 'video, .html5-main-video { object-fit: fill !important; }';
    } else if (val === 'crop219') {
        css = 'video, .html5-main-video { transform: scale(1.334) !important; transform-origin: center center !important; }';
    } else if (val === 'flip') {
        css = 'video, .html5-main-video { transform: scaleX(-1) !important; transform-origin: center center !important; }';
    }
    style.textContent = css;
}

const audioNodesMap = new WeakMap();
let sharedAudioCtx = null;

function applyAudioEnhancements(boost = 100, compressorActive = false) {
    const boostLevel = clamp(parseInt(boost || 100, 10), 100, 400);
    const compActive = Boolean(compressorActive);

    if (boostLevel === _lastAudioBoost && compActive === _lastAudioCompressor) return;
    _lastAudioBoost = boostLevel;
    _lastAudioCompressor = compActive;

    const needsAudio = boostLevel > 100 || compActive;
    const videos = document.querySelectorAll('video');
    if (!videos.length && !needsAudio) return;

    if (!sharedAudioCtx && needsAudio) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            sharedAudioCtx = new AudioContextClass();
        } catch (e) {
            return;
        }
    }

    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended' && needsAudio) {
        const resumeCtx = () => {
            sharedAudioCtx?.resume();
            window.removeEventListener('click', resumeCtx);
            window.removeEventListener('keydown', resumeCtx);
        };
        window.addEventListener('click', resumeCtx, { once: true });
        window.addEventListener('keydown', resumeCtx, { once: true });
    }

    videos.forEach(video => {
        try {
            let nodes = audioNodesMap.get(video);
            if (!nodes && needsAudio && sharedAudioCtx) {
                const source = sharedAudioCtx.createMediaElementSource(video);
                const gainNode = sharedAudioCtx.createGain();
                const compressorNode = sharedAudioCtx.createDynamicsCompressor();

                compressorNode.threshold.setValueAtTime(-24, sharedAudioCtx.currentTime);
                compressorNode.knee.setValueAtTime(30, sharedAudioCtx.currentTime);
                compressorNode.ratio.setValueAtTime(12, sharedAudioCtx.currentTime);
                compressorNode.attack.setValueAtTime(0.003, sharedAudioCtx.currentTime);
                compressorNode.release.setValueAtTime(0.25, sharedAudioCtx.currentTime);

                source.connect(compressorNode);
                compressorNode.connect(gainNode);
                gainNode.connect(sharedAudioCtx.destination);

                nodes = { source, gainNode, compressorNode };
                audioNodesMap.set(video, nodes);
            }

            if (nodes && sharedAudioCtx) {
                const gainMultiplier = boostLevel / 100;
                nodes.gainNode.gain.setValueAtTime(gainMultiplier, sharedAudioCtx.currentTime);
                nodes.compressorNode.threshold.setValueAtTime(compActive ? -24 : 0, sharedAudioCtx.currentTime);
            }
        } catch (e) {
            // Cross-origin audio or already captured stream
        }
    });
}

function handleFullscreenChange() {
    const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
    const container = document.getElementById(SVG_CONTAINER_ID);
    if (!container) return;

    if (fsElement) {
        if (fsElement.nodeName === 'VIDEO' && fsElement.parentNode) {
            fsElement.parentNode.insertBefore(container, fsElement);
        } else if (typeof fsElement.appendChild === 'function') {
            try {
                fsElement.appendChild(container);
            } catch (e) {
                if (fsElement.parentNode) fsElement.parentNode.insertBefore(container, fsElement);
            }
        }
    } else if (document.body && container.parentNode !== document.body) {
        document.body.appendChild(container);
    }
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

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
        const tint = getNumericValue(validated.tint, 0) * intensity;
        const warmthMode = validated.warmthMode || 'simple';
        const shadowBoost = getNumericValue(validated.shadowBoost, 0) * intensity;
        const highlights = getNumericValue(validated.highlights, 0) * intensity;
        const vibrance = getNumericValue(validated.vibrance, 0) * intensity;
        const performanceMode = data.performanceMode ?? false;
        const enableImages = data.enableImages ?? false;

        updateSVGFiltersInPlace(sharpness, warmth, warmthMode, shadowBoost, highlights, tint, vibrance, performanceMode);
        const filterValue = buildFilterString(validated, performanceMode);

        updateVideoStyle(filterValue);
        updateImageStyle(enableImages, validated, performanceMode);
        updateVideoAspect(data.aspectRatio);
        applyAudioEnhancements(data.audioBoost, data.audioCompressor);

        state.isInitialized = true;
    } catch (error) {
        console.error('Video Enhancer Apply Error:', error);
    }
}

function removeFilters() {

    document.getElementById(STYLE_ID)?.remove();
    _videoStyleTag = null;
    _cachedVideoFilter = null;

    document.getElementById(IMAGE_STYLE_ID)?.remove();
    _imageStyleTag = null;
    _cachedImageFilter = null;
    _lastEnableImages = null;

    document.getElementById(SVG_CONTAINER_ID)?.remove();
    _svgElements = null;

    document.documentElement.style.removeProperty('--ve-video-filter');
    document.documentElement.style.removeProperty('--ve-image-filter');

    const videos = document.querySelectorAll('video, .html5-main-video');
    for (let i = 0; i < videos.length; i++) {
        videos[i].style.removeProperty('filter');
    }

    const playerIframe = findVideoPlayerIframe();
    if (playerIframe) {
        playerIframe.style.removeProperty('filter');
    }

    updateVideoAspect('default');
    applyAudioEnhancements(100, false);

    _lastAspectRatio = null;
    _lastAudioBoost = null;
    _lastAudioCompressor = null;
    state.currentSharpness = null;
    state.currentWarmth = null;
    state.currentTint = null;
    state.currentWarmthMode = null;
    state.currentShadowBoost = null;
    state.currentHighlights = null;
    state.currentVibrance = null;
    state.currentPerformanceMode = false;
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
        const response = await new Promise((resolve) => {
            browser.runtime.sendMessage({ type: 'GET_TAB_HOSTNAME' }, (res) => {
                if (browser.runtime.lastError) resolve(null);
                else resolve(res);
            });
        });
        if (response?.hostname) {
            _cachedIframeHostname = response.hostname;
            return _cachedIframeHostname;
        }
    } catch (e) {}
    return window.location.hostname.replace(/^www\./, '');
}

function resolveSettings(data, hostname) {
    let resolved = data ? { ...data } : {};
    resolved.presets = validateAllPresets(data?.presets);
    resolved.activePreset = data?.activePreset || DEFAULT_ACTIVE_PRESET;
    resolved.enabled = data?.enabled !== undefined ? data.enabled : true;

    if (data?.siteSettings && data.siteSettings[hostname]) {
        resolved = {
            ...resolved,
            ...data.siteSettings[hostname],
            presets: validateAllPresets(data.siteSettings[hostname].presets || data.presets)
        };
    }
    resolved.enableImages = (data?.siteSettings?.[hostname]?.enableImages !== undefined)
        ? data.siteSettings[hostname].enableImages
        : (data?.enableImages ?? false);

    if (resolved.activePreset === 'warm') {
        resolved.activePreset = 'image';
    }
    resolved.presets = validateAllPresets(resolved.presets);
    return resolved;
}

// ==========================================
// FULLSCREEN OSD & QUICK-TWEAK HUD CONTROLLER
// ==========================================

function getLuminanceContrast(hex) {
    if (!hex) return '#000000';
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 >= 140 ? '#000000' : '#ffffff';
}

class VideoEnhancerHUD {
    constructor() {
        this.host = document.createElement('div');
        this.host.id = 'video-enhancer-hud-host';
        this.shadow = this.host.attachShadow({ mode: 'open' });

        this.rawStoredData = null;
        this.hostname = null;
        this.currentSettings = {
            enabled: true,
            activePreset: 'balanced',
            presets: deepClone(PRESET_DEFAULTS)
        };
        this.isOpen = false;
        this.currentSubtab = 'basic';
        this.osdTimer = null;
        this.mouseIdleTimer = null;
        this.isMiniHovered = false;
        this.handleMouseMove = null;

        this.debouncedSaveWorkingSettings = debounce(() => this.saveWorkingSettings(), 250);
        this.savedPosition = null;

        this.buildDOM();
        this.bindEvents();
    }

    buildDOM() {
        const style = document.createElement('style');
        style.textContent = `
            :host {
                all: initial;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                color: #f0f0f5;
                box-sizing: border-box;
                overflow: hidden;
            }
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
            .ic {
                width: 13px;
                height: 13px;
                stroke: currentColor;
                stroke-width: 1.8;
                stroke-linecap: round;
                stroke-linejoin: round;
                fill: none;
                vertical-align: middle;
                display: inline-block;
                flex-shrink: 0;
            }
            .unskew {
                display: inline-block;
                transform: skewX(12deg);
            }
            .ve-skew-btn {
                appearance: none;
                background: #16161b;
                border: 1px solid #282834;
                color: #f0f0f5;
                transform: skewX(-12deg);
                cursor: pointer;
                font-family: inherit;
                font-weight: 700;
                text-transform: uppercase;
                outline: none;
                box-shadow: none !important;
                transition: background 0.1s, border-color 0.1s;
            }
            .ve-skew-btn:hover {
                background: #22222b;
                border-color: var(--accent-color, #ff9800);
            }
            .ve-skew-btn.active {
                background: var(--accent-color, #ff9800) !important;
                border-color: var(--accent-color, #ff9800) !important;
                color: var(--accent-text, #000000) !important;
            }

            /* OSD Pill */
            .ve-osd-pill {
                position: absolute;
                top: 28px;
                left: 50%;
                transform: translateX(-50%) skewX(-12deg) translateY(-12px);
                background: #0c0c0f;
                border: 1px solid var(--accent-color, #ff9800);
                padding: 7px 16px;
                color: #f0f0f5;
                font-size: 11.5px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease, transform 0.2s ease;
                z-index: 2147483647;
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .ve-osd-pill.visible {
                opacity: 1;
                transform: translateX(-50%) skewX(-12deg) translateY(0);
            }
            .ve-brand-tag {
                background: var(--accent-color, #ff9800);
                color: var(--accent-text, #000000);
                font-size: 9px;
                font-weight: 900;
                padding: 1px 4px;
                transform: skewX(-12deg);
                display: inline-block;
                margin-right: 6px;
            }
            .ve-brand-tag > span {
                display: inline-block;
                transform: skewX(12deg);
            }

            /* Mini HUD */
            .ve-mini-hud {
                position: absolute;
                top: 18px;
                right: 18px;
                display: flex;
                align-items: center;
                gap: 6px;
                background: #0c0c0f;
                border: 1px solid #282834;
                padding: 4px 6px 4px 10px;
                transform: skewX(-12deg);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease, transform 0.2s ease;
                z-index: 2147483646;
                user-select: none;
                touch-action: none;
                cursor: grab;
            }
            .ve-mini-hud.visible {
                opacity: 0.98 !important;
                pointer-events: auto !important;
            }
            .ve-mini-hud.dragging {
                cursor: grabbing !important;
                opacity: 0.98 !important;
                pointer-events: auto !important;
            }
            .ve-mini-hud.hidden {
                display: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
                visibility: hidden !important;
            }
            .ve-live-dot {
                color: var(--accent-color, #ff9800);
                font-size: 11px;
                margin-right: 4px;
            }
            .ve-mini-status {
                font-size: 10.5px;
                font-weight: 800;
                letter-spacing: 0.5px;
                color: #f0f0f5;
                text-transform: uppercase;
            }
            .ve-mini-btn {
                padding: 4px 8px;
                font-size: 9.5px;
                letter-spacing: 0.5px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }

            /* Outside Click Dismissal Backdrop */
            .ve-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: transparent;
                display: none;
                pointer-events: auto;
                z-index: 2147483640;
            }
            .ve-backdrop.open {
                display: block;
            }

            /* Tweak Panel */
            .ve-tweak-panel {
                position: absolute;
                top: 18px;
                left: 18px;
                width: 310px;
                max-height: calc(100% - 36px);
                background: #0c0c0f;
                border: 1px solid #282834;
                padding: 12px 14px;
                display: none;
                flex-direction: column;
                overflow-y: auto;
                overflow-x: hidden;
                pointer-events: auto;
                z-index: 2147483647;
                scrollbar-width: thin;
                scrollbar-color: #282834 transparent;
            }
            .ve-tweak-panel.open {
                display: flex;
            }
            .ve-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #282834;
                cursor: grab;
                user-select: none;
                touch-action: none;
            }
            .ve-header.dragging {
                cursor: grabbing;
            }
            .ve-brand {
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 0.8px;
                display: flex;
                align-items: center;
                gap: 6px;
                color: #f0f0f5;
            }
            .ve-close-btn {
                background: transparent;
                border: none;
                color: #828292;
                cursor: pointer;
                padding: 2px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .ve-close-btn:hover {
                color: #f0f0f5;
            }

            /* Flat Toggle */
            .ve-toggle {
                position: relative;
                width: 36px;
                height: 18px;
                cursor: pointer;
                display: inline-block;
            }
            .ve-toggle input {
                opacity: 0;
                width: 0;
                height: 0;
                position: absolute;
            }
            .ve-toggle-track {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: #16161b;
                border: 1px solid #282834;
                transform: skewX(-12deg);
                transition: background 0.15s, border-color 0.15s;
            }
            .ve-toggle input:checked + .ve-toggle-track {
                background: var(--accent-color, #ff9800);
                border-color: var(--accent-color, #ff9800);
            }
            .ve-toggle-thumb {
                position: absolute;
                top: 2px;
                left: 2px;
                width: 14px;
                height: 12px;
                background: #828292;
                transform: skewX(-12deg);
                transition: transform 0.15s, background 0.15s;
            }
            .ve-toggle input:checked ~ .ve-toggle-thumb {
                transform: translateX(16px) skewX(-12deg);
                background: #000000;
            }

            /* Scope bar */
            .ve-scope-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                background: #16161b;
                padding: 5px 8px;
                border: 1px solid #282834;
            }
            .ve-scope-tag {
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.5px;
                color: var(--accent-color, #ff9800);
                text-transform: uppercase;
            }
            .ve-reset-site-btn {
                padding: 3px 6px;
                font-size: 9px;
                background: var(--warning-color, #ff9800);
                color: #000;
                border-color: var(--warning-color, #ff9800);
                display: none;
            }
            .ve-reset-site-btn.visible {
                display: block;
            }

            /* Preset grid */
            .ve-section-title {
                font-size: 9.5px;
                font-weight: 800;
                letter-spacing: 0.8px;
                color: #828292;
                margin-bottom: 6px;
                text-transform: uppercase;
            }
            .ve-preset-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 4px;
                margin-bottom: 12px;
            }
            .ve-preset-btn {
                width: 100%;
                padding: 6px 2px;
                font-size: 9.5px;
                letter-spacing: 0.5px;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Subtabs */
            .ve-section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .ve-adjust-subnav {
                display: flex;
                gap: 4px;
            }
            .ve-subtab-btn {
                padding: 3px 6px;
                font-size: 9px;
                letter-spacing: 0.5px;
            }

            /* Sliders */
            .ve-control-row {
                margin-bottom: 8px;
            }
            .ve-control-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 3px;
            }
            .ve-control-name {
                font-size: 9.5px;
                font-weight: 700;
                letter-spacing: 0.5px;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                color: #828292;
                text-transform: uppercase;
            }
            .ve-control-val {
                font-size: 10px;
                font-weight: 800;
                color: var(--accent-color, #ff9800);
                font-family: monospace;
            }
            .ve-control-val-wrap {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .ve-btn-slider-reset {
                background: transparent;
                border: none;
                padding: 1px 2px;
                color: #66667a;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                opacity: 0.35;
                transition: opacity 0.15s ease, color 0.15s ease, transform 0.2s ease;
            }
            .ve-btn-slider-reset:hover {
                opacity: 1;
                color: var(--accent-color, #ff9800);
                transform: rotate(-45deg);
            }
            .ve-ic-reset {
                width: 10.5px;
                height: 10.5px;
                stroke: currentColor;
                stroke-width: 2.2;
                fill: none;
                stroke-linecap: round;
                stroke-linejoin: round;
            }
            .ve-range {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                border-radius: 0;
                outline: none;
                cursor: pointer;
                background: #1c1c24;
                border: none;
            }
            .ve-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 7px;
                height: 12px;
                background: #ffffff;
                border: 1px solid #000000;
                cursor: pointer;
                transform: skewX(-12deg);
                border-radius: 0;
                transition: background 0.1s;
            }
            .ve-range::-webkit-slider-thumb:hover {
                background: var(--accent-color, #ff9800);
            }
            .ve-range::-moz-range-thumb {
                width: 7px;
                height: 12px;
                background: #ffffff;
                border: 1px solid #000000;
                cursor: pointer;
                transform: skewX(-12deg);
                border-radius: 0;
                transition: background 0.1s;
            }
            .ve-range::-moz-range-thumb:hover {
                background: var(--accent-color, #ff9800);
            }
        `;
        this.shadow.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.className = 've-hud-wrapper';
        wrapper.innerHTML = `
            <!-- OSD Pill -->
            <div id="ve-osd" class="ve-osd-pill">
                <span class="unskew">
                    <span class="ve-brand-tag"><span>HDR</span></span>
                    <span id="ve-osd-text">VIDEO ENHANCER</span>
                </span>
            </div>

            <!-- Mini HUD -->
            <div id="ve-mini-hud" class="ve-mini-hud" title="Drag to move • Click TWEAK to expand • Double-click to reset">
                <span class="unskew">
                    <span class="ve-live-dot">●</span>
                    <span class="ve-mini-status" id="ve-mini-status">HDR · ACTIVE</span>
                </span>
                <button type="button" id="ve-btn-open-hud" class="ve-skew-btn ve-mini-btn" title="Open Quick-Tweak Panel (Alt+Shift+H)">
                    <span class="unskew">
                        <svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        TWEAK
                    </span>
                </button>
            </div>

            <!-- Backdrop for outside click dismissal -->
            <div id="ve-backdrop" class="ve-backdrop"></div>

            <!-- Fullscreen Tweak Panel -->
            <div id="ve-tweak-panel" class="ve-tweak-panel">
                <div class="ve-header" id="ve-header" title="Drag to reposition panel • Double-click to reset">
                    <div class="ve-brand">
                        <span class="ve-brand-tag"><span>HDR</span></span>
                        <span>QUICK TWEAK</span>
                        <svg class="ic" style="opacity: 0.45; margin-left: 2px;" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <label class="ve-toggle" title="Toggle Enhancer Engine">
                            <input type="checkbox" id="ve-toggle-enabled">
                            <div class="ve-toggle-track"></div>
                            <div class="ve-toggle-thumb"></div>
                        </label>
                        <button type="button" id="ve-btn-close-hud" class="ve-close-btn" title="Close Panel (Esc)">
                            <svg class="ic" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                <div class="ve-scope-bar">
                    <span class="ve-scope-tag" id="ve-scope-label">GLOBAL</span>
                    <button type="button" id="ve-btn-reset-site" class="ve-skew-btn ve-reset-site-btn" title="Reset site to global defaults">
                        <span class="unskew">RESET SITE</span>
                    </button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin: 8px 0 6px 0;">
                    <div class="ve-section-title" style="margin: 0;">ACTIVE PRESET</div>
                    <button type="button" id="ve-btn-reset-preset" class="ve-skew-btn ve-mini-btn" title="Reset active preset to factory defaults" style="padding: 2px 7px; font-size: 8.5px; border-color: #383848;">
                        <span class="unskew">RESET</span>
                    </button>
                </div>
                <div class="ve-preset-grid" id="ve-preset-grid"></div>

                <div class="ve-section-header">
                    <div class="ve-section-title">ADJUSTMENTS</div>
                    <div class="ve-adjust-subnav">
                        <button type="button" class="ve-skew-btn ve-subtab-btn active" id="ve-subtab-basic">
                            <span class="unskew">BASIC TONE</span>
                        </button>
                        <button type="button" class="ve-skew-btn ve-subtab-btn" id="ve-subtab-hdr">
                            <span class="unskew">HDR & DETAIL</span>
                        </button>
                    </div>
                </div>

                <!-- Subview: Basic Tone -->
                <div id="ve-subview-basic">
                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>BRIGHTNESS</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="brightness" title="Reset Brightness to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-brightness">100%</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-brightness" min="50" max="150" value="100">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>CONTRAST</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="contrast" title="Reset Contrast to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-contrast">100%</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-contrast" min="50" max="200" value="100">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>SATURATION</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="saturate" title="Reset Saturation to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-saturate">100%</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-saturate" min="50" max="200" value="100">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><polygon points="6 3 18 3 22 9 12 22 2 9"/></svg>VIBRANCE</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="vibrance" title="Reset Vibrance to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-vibrance">OFF</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-vibrance" min="0" max="100" value="0">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>INTENSITY</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="intensity" title="Reset Intensity to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-intensity">100%</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-intensity" min="0" max="100" value="100">
                    </div>
                </div>

                <!-- Subview: HDR & Detail -->
                <div id="ve-subview-hdr" style="display: none;">
                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>SHADOW BOOST</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="shadowBoost" title="Reset Shadow Boost to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-shadowBoost">OFF</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-shadowBoost" min="0" max="100" value="0">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>HIGHLIGHT ROLLOFF</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="highlights" title="Reset Highlight Rolloff to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-highlights">OFF</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-highlights" min="0" max="100" value="0">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><polygon points="12 2 2 22 22 22"/></svg>SHARPNESS</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="sharpness" title="Reset Sharpness to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-sharpness">OFF</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-sharpness" min="0" max="100" value="0">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>WARMTH</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="warmth" title="Reset Warmth to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-warmth">0°</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-warmth" min="-30" max="30" value="0">
                    </div>

                    <div class="ve-control-row">
                        <div class="ve-control-top">
                            <span class="ve-control-name"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/></svg>TINT</span>
                            <div class="ve-control-val-wrap">
                                <button type="button" class="ve-btn-slider-reset" data-slider="tint" title="Reset Tint to default">
                                    <svg viewBox="0 0 24 24" class="ve-ic-reset"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                </button>
                                <span class="ve-control-val" id="ve-val-tint">0</span>
                            </div>
                        </div>
                        <input type="range" class="ve-range" id="ve-slider-tint" min="-30" max="30" value="0">
                    </div>
                </div>
            </div>
        `;
        this.shadow.appendChild(wrapper);

        this.osd = this.shadow.getElementById('ve-osd');
        this.osdText = this.shadow.getElementById('ve-osd-text');
        this.miniHud = this.shadow.getElementById('ve-mini-hud');
        this.miniStatus = this.shadow.getElementById('ve-mini-status');
        this.panel = this.shadow.getElementById('ve-tweak-panel');
        this.backdrop = this.shadow.getElementById('ve-backdrop');
        this.scopeLabel = this.shadow.getElementById('ve-scope-label');
        this.resetSiteBtn = this.shadow.getElementById('ve-btn-reset-site');
        this.enabledToggle = this.shadow.getElementById('ve-toggle-enabled');
        this.presetGrid = this.shadow.getElementById('ve-preset-grid');
    }

    bindEvents() {
        // Mini HUD Open Button
        this.shadow.getElementById('ve-btn-open-hud')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTweakPanel();
        });

        // Close Button
        this.shadow.getElementById('ve-btn-close-hud')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTweakPanel();
        });

        // Master Toggle
        this.enabledToggle?.addEventListener('change', (e) => {
            e.stopPropagation();
            if (!this.currentSettings) return;
            this.currentSettings.enabled = e.target.checked;
            applyFilters(this.currentSettings);
            this.saveWorkingSettings();
            this.showOSD(this.currentSettings.enabled ? 'ENHANCER: ACTIVE' : 'ENHANCER: BYPASS');
        });

        // Reset Site Button
        this.resetSiteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.resetSiteOverride();
        });

        // Reset Preset Button
        this.shadow.getElementById('ve-btn-reset-preset')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.resetActivePreset();
        });

        // Subtabs
        const subBasic = this.shadow.getElementById('ve-subtab-basic');
        const subHdr = this.shadow.getElementById('ve-subtab-hdr');
        const viewBasic = this.shadow.getElementById('ve-subview-basic');
        const viewHdr = this.shadow.getElementById('ve-subview-hdr');

        subBasic?.addEventListener('click', (e) => {
            e.stopPropagation();
            subBasic.classList.add('active');
            subHdr?.classList.remove('active');
            viewBasic.style.display = 'block';
            viewHdr.style.display = 'none';
        });

        subHdr?.addEventListener('click', (e) => {
            e.stopPropagation();
            subHdr.classList.add('active');
            subBasic?.classList.remove('active');
            viewHdr.style.display = 'block';
            viewBasic.style.display = 'none';
        });

        // Sliders
        const sliderKeys = ['brightness', 'contrast', 'saturate', 'vibrance', 'intensity', 'shadowBoost', 'highlights', 'sharpness', 'warmth', 'tint'];
        sliderKeys.forEach((key) => {
            const slider = this.shadow.getElementById(`ve-slider-${key}`);
            if (!slider) return;

            slider.addEventListener('input', (e) => {
                e.stopPropagation();
                const val = parseInt(e.target.value, 10);
                this.onSliderInput(key, val);
            });

            slider.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const activeP = this.currentSettings?.activePreset || DEFAULT_ACTIVE_PRESET;
                const factory = PRESET_DEFAULTS[activeP] || PRESET_DEFAULTS.balanced;
                const defVal = factory[key] !== undefined ? factory[key] : (SLIDER_RANGES[key]?.def ?? 0);
                slider.value = defVal;
                this.onSliderInput(key, defVal);
            });
        });

        // Individual Slider Reset Buttons
        this.shadow.querySelectorAll('.ve-btn-slider-reset').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = btn.dataset.slider;
                const slider = this.shadow.getElementById(`ve-slider-${key}`);
                if (!slider) return;

                const activeP = this.currentSettings?.activePreset || DEFAULT_ACTIVE_PRESET;
                const factory = PRESET_DEFAULTS[activeP] || PRESET_DEFAULTS.balanced;
                const defVal = factory[key] !== undefined ? factory[key] : (SLIDER_RANGES[key]?.def ?? 0);

                slider.value = defVal;
                this.onSliderInput(key, defVal);
            });
        });

        // Stop keyboard/mouse/pointer/touch propagation inside panel, mini HUD, and host
        // This prevents YouTube from intercepting slider drag as a long-press (which triggers 2x speed)
        // or player hotkeys (Space, K, J, L, Arrow keys) while adjusting sliders
        const ISOLATED_EVENTS = [
            'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'pointerover', 'pointerout',
            'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'auxclick',
            'touchstart', 'touchmove', 'touchend', 'touchcancel',
            'keydown', 'keyup', 'keypress', 'wheel'
        ];

        ISOLATED_EVENTS.forEach(evt => {
            this.panel?.addEventListener(evt, (e) => {
                e.stopPropagation();
                if (evt === 'keydown' && e.key === 'Escape') {
                    e.preventDefault();
                    this.closeTweakPanel();
                }
            });
            this.miniHud?.addEventListener(evt, (e) => {
                e.stopPropagation();
            });
            this.host.addEventListener(evt, (e) => {
                e.stopPropagation();
            });
        });

        // Draggable panel by its header
        const header = this.shadow.getElementById('ve-header');
        let isPanelDragging = false;
        let panelGrabOffsetX = 0;
        let panelGrabOffsetY = 0;
        let hasPanelDragged = false;

        if (header && this.panel) {
            header.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.ve-toggle') || e.target.closest('.ve-close-btn')) return;
                if (e.button !== 0) return;

                e.preventDefault();
                e.stopPropagation();

                isPanelDragging = true;
                hasPanelDragged = false;
                header.classList.add('dragging');
                try {
                    header.setPointerCapture(e.pointerId);
                } catch (_) {}

                const panelRect = this.panel.getBoundingClientRect();
                panelGrabOffsetX = e.clientX - panelRect.left;
                panelGrabOffsetY = e.clientY - panelRect.top;
            });

            header.addEventListener('pointermove', (e) => {
                if (!isPanelDragging) return;
                e.preventDefault();
                e.stopPropagation();
                hasPanelDragged = true;

                const panelWidth = this.panel.offsetWidth || 310;
                const panelHeight = this.panel.offsetHeight || 440;

                const targetLeft = e.clientX - panelGrabOffsetX;
                const targetTop = e.clientY - panelGrabOffsetY;

                const clamped = this.clampWithinBounds(targetLeft, targetTop, panelWidth, panelHeight);

                this.panel.style.right = 'auto';
                this.panel.style.bottom = 'auto';
                this.panel.style.left = `${clamped.left}px`;
                this.panel.style.top = `${clamped.top}px`;
            });

            const stopPanelDrag = (e) => {
                if (isPanelDragging) {
                    e.preventDefault();
                    e.stopPropagation();
                    isPanelDragging = false;
                    header.classList.remove('dragging');
                    try {
                        header.releasePointerCapture(e.pointerId);
                    } catch (_) {}

                    if (hasPanelDragged) {
                        const currentLeft = parseFloat(this.panel.style.left);
                        const currentTop = parseFloat(this.panel.style.top);
                        if (!isNaN(currentLeft) && !isNaN(currentTop)) {
                            this.saveHudPosition(currentLeft, currentTop);
                            if (this.miniHud) {
                                const miniClamped = this.clampWithinBounds(currentLeft, currentTop, this.miniHud.offsetWidth || 150, this.miniHud.offsetHeight || 32);
                                this.miniHud.style.left = `${miniClamped.left}px`;
                                this.miniHud.style.top = `${miniClamped.top}px`;
                            }
                        }
                    }
                }
            };

            header.addEventListener('pointerup', stopPanelDrag);
            header.addEventListener('pointercancel', stopPanelDrag);

            header.addEventListener('dblclick', (e) => {
                if (e.target.closest('.ve-toggle') || e.target.closest('.ve-close-btn')) return;
                e.stopPropagation();
                this.resetHudPosition(true);
            });
        }

        // Draggable Mini HUD ("tweak bar")
        let isMiniDragging = false;
        let miniGrabOffsetX = 0;
        let miniGrabOffsetY = 0;
        let hasMiniDragged = false;

        if (this.miniHud) {
            this.miniHud.addEventListener('pointerdown', (e) => {
                if (e.target.closest('#ve-btn-open-hud')) return;
                if (e.button !== 0) return;

                e.preventDefault();
                e.stopPropagation();

                isMiniDragging = true;
                hasMiniDragged = false;
                this.miniHud.classList.add('dragging');
                try {
                    this.miniHud.setPointerCapture(e.pointerId);
                } catch (_) {}

                const miniRect = this.miniHud.getBoundingClientRect();
                miniGrabOffsetX = e.clientX - miniRect.left;
                miniGrabOffsetY = e.clientY - miniRect.top;
            });

            this.miniHud.addEventListener('pointermove', (e) => {
                if (!isMiniDragging) return;
                e.preventDefault();
                e.stopPropagation();
                hasMiniDragged = true;

                const miniWidth = this.miniHud.offsetWidth || 150;
                const miniHeight = this.miniHud.offsetHeight || 32;

                const targetLeft = e.clientX - miniGrabOffsetX;
                const targetTop = e.clientY - miniGrabOffsetY;

                const clamped = this.clampWithinBounds(targetLeft, targetTop, miniWidth, miniHeight);

                this.miniHud.style.right = 'auto';
                this.miniHud.style.bottom = 'auto';
                this.miniHud.style.left = `${clamped.left}px`;
                this.miniHud.style.top = `${clamped.top}px`;
            });

            const stopMiniDrag = (e) => {
                if (isMiniDragging) {
                    e.preventDefault();
                    e.stopPropagation();
                    isMiniDragging = false;
                    this.miniHud.classList.remove('dragging');
                    try {
                        this.miniHud.releasePointerCapture(e.pointerId);
                    } catch (_) {}

                    if (hasMiniDragged) {
                        const currentLeft = parseFloat(this.miniHud.style.left);
                        const currentTop = parseFloat(this.miniHud.style.top);
                        if (!isNaN(currentLeft) && !isNaN(currentTop)) {
                            this.saveHudPosition(currentLeft, currentTop);
                        }
                    }
                }
            };

            this.miniHud.addEventListener('pointerup', stopMiniDrag);
            this.miniHud.addEventListener('pointercancel', stopMiniDrag);

            this.miniHud.addEventListener('dblclick', (e) => {
                if (e.target.closest('#ve-btn-open-hud')) return;
                e.stopPropagation();
                this.resetHudPosition(true);
            });

            this.miniHud.addEventListener('pointerenter', () => {
                if (this.isOpen) return;
                this.isMiniHovered = true;
                clearTimeout(this.mouseIdleTimer);
                this.miniHud.classList.remove('hidden');
                this.miniHud.classList.add('visible');
            });

            this.miniHud.addEventListener('pointerleave', () => {
                this.isMiniHovered = false;
                if (this.isOpen) return;
                clearTimeout(this.mouseIdleTimer);
                this.mouseIdleTimer = setTimeout(() => {
                    if (!this.isOpen && !this.isMiniHovered) {
                        this.miniHud?.classList.remove('visible');
                    }
                }, HUD_IDLE_TIMEOUT);
            });

            this.miniHud.addEventListener('pointermove', () => {
                if (this.isOpen) return;
                this.isMiniHovered = true;
                clearTimeout(this.mouseIdleTimer);
                this.miniHud.classList.remove('hidden');
                this.miniHud.classList.add('visible');
            });
        }

        this.panel?.addEventListener('pointerenter', () => {
            clearTimeout(this.mouseIdleTimer);
        });

        // Close tweak panel when clicking on the backdrop
        const handleBackdropDismiss = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeTweakPanel();
        };
        this.backdrop?.addEventListener('pointerdown', handleBackdropDismiss);
        this.backdrop?.addEventListener('mousedown', handleBackdropDismiss);
        this.backdrop?.addEventListener('click', handleBackdropDismiss);

        // Close tweak panel automatically when clicking outside
        const handleOutsideDismiss = (e) => {
            if (!this.isOpen) return;
            if (e.button !== 0) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (path.includes(this.panel) || path.includes(this.miniHud)) return;
            this.closeTweakPanel();
        };
        window.addEventListener('pointerdown', handleOutsideDismiss, true);
        window.addEventListener('mousedown', handleOutsideDismiss, true);
        document.addEventListener('pointerdown', handleOutsideDismiss, true);
        document.addEventListener('mousedown', handleOutsideDismiss, true);

        const handleEscapeDismiss = (e) => {
            if (this.isOpen && (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27)) {
                e.preventDefault();
                e.stopPropagation();
                this.closeTweakPanel();
            }
        };
        this.panel?.addEventListener('keydown', handleEscapeDismiss);
        this.backdrop?.addEventListener('keydown', handleEscapeDismiss);
        document.addEventListener('keydown', handleEscapeDismiss, true);
        window.addEventListener('keydown', handleEscapeDismiss, true);

        // Window keyboard shortcuts for Fullscreen
        window.addEventListener('keydown', (e) => {
            // Close Tweak Panel first on Escape without exiting browser fullscreen
            if (this.isOpen && (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27)) {
                e.preventDefault();
                e.stopPropagation();
                this.closeTweakPanel();
                return;
            }

            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

            // Alt+Shift+H: Toggle Video / Media Quick-Tweak HUD (on any video, image or media page)
            if (e.altKey && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
                if (!this.isHudEnabled()) return;
                e.preventDefault();
                e.stopPropagation();
                this.toggleTweakPanel();
                return;
            }

            // [ and ]: Cycle presets while in fullscreen or panel is open
            if (this.isHudEnabled() && (document.fullscreenElement || this.isOpen || this.hasEligibleContent()) && !e.altKey && !e.ctrlKey && !e.metaKey) {
                if (document.fullscreenElement || this.isOpen) {
                    if (e.key === '[' || e.key === '{') {
                        e.preventDefault();
                        e.stopPropagation();
                        this.cyclePreset(-1);
                    } else if (e.key === ']' || e.key === '}') {
                        e.preventDefault();
                        e.stopPropagation();
                        this.cyclePreset(1);
                    }
                }
            }
        }, true);

        // Auto-show Mini HUD on mousemove / pointermove, auto-hide after HUD_IDLE_TIMEOUT idle
        this.handleMouseMove = () => {
            if (!this.isHudEnabled() || this.isOpen) return;

            if (!this.hasEligibleContent()) {
                if (this.isMounted) {
                    this.unmount();
                }
                return;
            }

            const bounds = this.getContainerBounds();
            if (!this.isPlayerInView(bounds)) {
                return;
            }

            if (!this.isMounted) {
                this.mount();
            }

            this.applySavedPosition();

            if (this.miniHud) {
                this.miniHud.style.display = '';
                this.miniHud.classList.remove('hidden');
                this.miniHud.classList.add('visible');
            }
            clearTimeout(this.mouseIdleTimer);
            this.mouseIdleTimer = setTimeout(() => {
                if (!this.isOpen && !this.isMiniHovered) {
                    this.miniHud?.classList.remove('visible');
                }
            }, HUD_IDLE_TIMEOUT);
        };

        const captureOpts = { capture: true, passive: true };
        window.addEventListener('mousemove', this.handleMouseMove, captureOpts);
        window.addEventListener('pointermove', this.handleMouseMove, captureOpts);
        document.addEventListener('mousemove', this.handleMouseMove, captureOpts);
        document.addEventListener('pointermove', this.handleMouseMove, captureOpts);
        window.addEventListener('focus', this.handleMouseMove, captureOpts);

        // Fullscreen change handler to re-mount host into active fullscreen element
        // and maintain proportional HUD position across windowed and fullscreen modes
        const handleFullscreen = () => {
            this.mount();
            this.applySavedPosition();
            if (this.isHudEnabled()) {
                this.flashMiniHud();
            }
            // Reflow safety: re-apply after fullscreen layout reflow stabilizes
            setTimeout(() => {
                this.mount();
                this.applySavedPosition();
            }, 60);
        };
        document.addEventListener('fullscreenchange', handleFullscreen);
        document.addEventListener('webkitfullscreenchange', handleFullscreen);
        window.addEventListener('resize', () => {
            this.applySavedPosition();
        }, { passive: true });
        window.addEventListener('scroll', () => {
            this.applySavedPosition();
        }, { passive: true, capture: true });
        document.addEventListener('scroll', () => {
            this.applySavedPosition();
        }, { passive: true, capture: true });
    }

    hasVideo() {
        const videos = document.querySelectorAll('video');
        for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            const rect = v.getBoundingClientRect();
            if (rect.width >= 160 && rect.height >= 90) {
                return true;
            }
            if ((v.videoWidth >= 160 || v.offsetWidth >= 160) && window.getComputedStyle(v).display !== 'none') {
                return true;
            }
        }
        return false;
    }

    isImageEnhancementEnabled() {
        return Boolean(this.currentSettings?.enableImages);
    }

    isEligiblePage() {
        const host = (window.location.hostname || '').toLowerCase();
        return host.includes('reanime') ||
               host.includes('aniwatch') ||
               host.includes('hianime') ||
               host.includes('crunchyroll') ||
               host.includes('9anime');
    }

    hasEligibleContent() {
        // Child iframes should never mount a HUD - only the top window hosts the HUD
        if (window.top !== window.self) return false;

        // 1. If this frame contains a real video element, it hosts the HUD directly on the video player
        if (this.hasVideo()) return true;

        // 2. If this page hosts a video player iframe (e.g. reanime.to), top frame hosts the HUD for it
        if (findVideoPlayerIframe()) {
            return true;
        }

        // 3. Eligible anime/video streaming sites (e.g. reanime.to/home)
        if (this.isEligiblePage()) {
            return true;
        }

        return false;
    }

    isHudEnabled() {
        return this.currentSettings ? (this.currentSettings.enableHud !== false) : true;
    }

    setHudEnabled(enabled) {
        if (!this.currentSettings) this.currentSettings = {};
        this.currentSettings.enableHud = enabled;
        if (!enabled) {
            this.unmount();
        } else {
            this.mount();
            this.showOSD('VIDEO HUD ENABLED');
            this.flashMiniHud();
        }
    }

    flashMiniHud() {
        if (!this.isMounted || !this.isHudEnabled() || this.isOpen) return;
        this.miniHud?.classList.remove('hidden');
        this.miniHud?.classList.add('visible');
        clearTimeout(this.mouseIdleTimer);
        this.mouseIdleTimer = setTimeout(() => {
            if (!this.isOpen && !this.isMiniHovered) {
                this.miniHud?.classList.remove('visible');
            }
        }, HUD_IDLE_TIMEOUT);
    }

    mount() {
        if (!this.isHudEnabled() || !this.hasEligibleContent()) {
            this.unmount();
            return;
        }

        let target = document.fullscreenElement || document.webkitFullscreenElement || document.body || document.documentElement;
        if (!target) {
            this.unmount();
            return;
        }

        if (this.host.parentElement !== target) {
            target.appendChild(this.host);
        }

        this.host.style.display = 'block';
        this.host.style.position = 'fixed';
        this.host.style.top = '0px';
        this.host.style.left = '0px';
        this.host.style.width = '100vw';
        this.host.style.height = '100vh';
        this.host.style.zIndex = '2147483647';
        this.host.style.pointerEvents = 'none';

        this.isMounted = true;
        this.applySavedPosition();

        // Bind hover events to player elements and containers so entering the video wakes up HUD
        const bindTargetEvents = (el) => {
            if (!el || el._veMouseBound || typeof this.handleMouseMove !== 'function') return;
            el._veMouseBound = true;
            ['pointerenter', 'mouseenter', 'mouseover', 'pointerover', 'pointermove', 'mousemove'].forEach(evt => {
                el.addEventListener(evt, this.handleMouseMove, { capture: true, passive: true });
            });
        };

        bindTargetEvents(document.querySelector('.html5-video-player'));
        bindTargetEvents(document.querySelector('#movie_player'));
        bindTargetEvents(document.querySelector('[data-player]'));
        bindTargetEvents(document.querySelector('video'));
        bindTargetEvents(document.querySelector('video')?.parentElement);
        const playerIframe = findVideoPlayerIframe();
        if (playerIframe) {
            bindTargetEvents(playerIframe);
            bindTargetEvents(playerIframe.parentElement);
            bindTargetEvents(playerIframe.parentElement?.parentElement);
        }

        if (window.top !== window.self && this.hasVideo()) {
            announceIframeActive();
        }

        const playerEl = this.getVideoPlayerElement();
        if (window.ResizeObserver && playerEl && this._observedPlayer !== playerEl) {
            if (this._playerResizeObserver) {
                this._playerResizeObserver.disconnect();
            }
            this._playerResizeObserver = new ResizeObserver(() => {
                this.applySavedPosition();
            });
            this._playerResizeObserver.observe(playerEl);
            this._observedPlayer = playerEl;
        }
    }

    unmount() {
        this.isMounted = false;
        this.isOpen = false;
        this.panel?.classList.remove('open');
        this.miniHud?.classList.remove('visible');
        this.osd?.classList.remove('visible');
        clearTimeout(this.osdTimer);
        clearTimeout(this.mouseIdleTimer);

        if (this._playerResizeObserver) {
            this._playerResizeObserver.disconnect();
            this._playerResizeObserver = null;
            this._observedPlayer = null;
        }

        if (this.host.parentElement) {
            this.host.parentElement.removeChild(this.host);
        }
    }

    updateData(data, hostname, resolvedSettings) {
        this.rawStoredData = deepClone(data);
        this.hostname = hostname;
        this.currentSettings = deepClone(resolvedSettings);

        if (data.hudPosition && typeof data.hudPosition.xRatio === 'number' && typeof data.hudPosition.yRatio === 'number') {
            this.savedPosition = data.hudPosition;
        } else if (data.hudPosition === null) {
            this.savedPosition = null;
        }

        if (!this.isHudEnabled() || !this.hasEligibleContent()) {
            this.unmount();
            return;
        }

        this.mount();
        this.applySavedPosition();

        // Apply theme color
        const theme = data.themeColor || '#ff9800';
        const textCol = getLuminanceContrast(theme);
        this.shadow.host.style.setProperty('--accent-color', theme);
        this.shadow.host.style.setProperty('--accent-text', textCol);

        // Update Mini HUD text
        const isEnabled = this.currentSettings.enabled ?? true;
        const activeName = (this.currentSettings.presetNames?.[this.currentSettings.activePreset] || this.currentSettings.activePreset || 'BALANCED').toUpperCase();
        if (this.miniStatus) {
            this.miniStatus.textContent = isEnabled ? `HDR · ${activeName}` : 'HDR · OFF';
        }

        // Update Tweak Panel
        if (this.enabledToggle) {
            this.enabledToggle.checked = isEnabled;
        }

        this.updateScopeUI();
        this.renderPresetButtons();
        this.updateSlidersUI();
        this.flashMiniHud();
    }

    updateScopeUI() {
        const hostname = this.hostname;
        const hasSiteOverride = Boolean(hostname && this.rawStoredData?.siteSettings?.[hostname]);

        if (this.scopeLabel) {
            this.scopeLabel.textContent = hostname ? hostname.toUpperCase() : 'GLOBAL';
        }
        if (this.resetSiteBtn) {
            this.resetSiteBtn.classList.toggle('visible', hasSiteOverride);
        }
    }

    renderPresetButtons() {
        if (!this.presetGrid || !this.currentSettings) return;
        this.presetGrid.innerHTML = '';

        const presets = this.currentSettings.presets || PRESET_DEFAULTS;
        const presetNames = this.currentSettings.presetNames || DEFAULT_PRESET_NAMES;
        const activeKey = this.currentSettings.activePreset || DEFAULT_ACTIVE_PRESET;

        Object.keys(presets).forEach(key => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.presetKey = key;
            btn.className = `ve-skew-btn ve-preset-btn ${key === activeKey ? 'active' : ''}`;
            const label = (presetNames[key] || DEFAULT_PRESET_NAMES[key] || key).toUpperCase();
            const span = document.createElement('span');
            span.className = 'unskew';
            span.textContent = label;
            btn.appendChild(span);
            btn.title = `Switch to ${label} preset`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.activatePreset(key);
            });
            this.presetGrid.appendChild(btn);
        });
    }

    updatePresetButtonsActiveState() {
        if (!this.presetGrid) return;
        const activeKey = this.currentSettings?.activePreset || DEFAULT_ACTIVE_PRESET;
        const btns = this.presetGrid.querySelectorAll('.ve-preset-btn');
        btns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.presetKey === activeKey);
        });
    }

    updateSlidersUI() {
        if (!this.currentSettings) return;
        const activeKey = this.currentSettings.activePreset || DEFAULT_ACTIVE_PRESET;
        const vals = this.currentSettings.presets?.[activeKey] || PRESET_DEFAULTS[activeKey] || PRESET_DEFAULTS.balanced;

        const sliderKeys = ['brightness', 'contrast', 'saturate', 'vibrance', 'intensity', 'shadowBoost', 'highlights', 'sharpness', 'warmth', 'tint'];
        sliderKeys.forEach(key => {
            const slider = this.shadow.getElementById(`ve-slider-${key}`);
            if (slider && vals[key] !== undefined) {
                slider.value = vals[key];
                this.updateValueDisplay(key, vals[key]);
                this.updateSliderFill(slider, vals[key]);
            }
        });
    }

    updateValueDisplay(key, val) {
        const el = this.shadow.getElementById(`ve-val-${key}`);
        if (!el) return;

        if (key === 'warmth') el.textContent = `${val > 0 ? '+' : ''}${val}°`;
        else if (key === 'tint') el.textContent = `${val > 0 ? '+' : ''}${val}`;
        else if (key === 'sharpness' || key === 'shadowBoost' || key === 'highlights' || key === 'vibrance') {
            el.textContent = val === 0 ? 'OFF' : `${val}%`;
        } else {
            el.textContent = `${val}%`;
        }
    }

    updateSliderFill(slider, val) {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const pct = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right,
            var(--accent-color, #ff9800) 0%,
            var(--accent-color, #ff9800) ${pct}%,
            #1c1c24 ${pct}%,
            #1c1c24 100%)`;
    }

    broadcastLiveSettings() {
        try {
            browser.runtime.sendMessage({
                type: 'SYNC_TAB_SETTINGS',
                settings: this.currentSettings
            }).catch(() => {});
        } catch (e) {}
    }

    onSliderInput(key, val) {
        if (!this.currentSettings) this.currentSettings = {};
        if (!this.currentSettings.presets) {
            this.currentSettings.presets = deepClone(PRESET_DEFAULTS);
        }
        const activeKey = this.currentSettings.activePreset || DEFAULT_ACTIVE_PRESET;
        if (!this.currentSettings.presets[activeKey]) {
            this.currentSettings.presets[activeKey] = deepClone(PRESET_DEFAULTS[activeKey] || PRESET_DEFAULTS.balanced);
        }
        this.currentSettings.presets[activeKey][key] = val;

        applyFilters(this.currentSettings);

        const slider = this.shadow.getElementById(`ve-slider-${key}`);
        if (slider) this.updateSliderFill(slider, val);
        this.updateValueDisplay(key, val);

        this.broadcastLiveSettings();
        this.debouncedSaveWorkingSettings();
    }

    activatePreset(presetName) {
        if (!this.currentSettings) this.currentSettings = {};
        this.currentSettings.activePreset = presetName;

        applyFilters(this.currentSettings);
        this.broadcastLiveSettings();
        this.saveWorkingSettings();

        const label = (this.currentSettings.presetNames?.[presetName] || DEFAULT_PRESET_NAMES[presetName] || presetName).toUpperCase();
        this.showOSD('PRESET CHANGED', `[ ${label} ]`);

        if (this.miniStatus) {
            this.miniStatus.textContent = `HDR · ${label}`;
        }

        this.updatePresetButtonsActiveState();
        this.updateSlidersUI();
    }

    resetActivePreset() {
        if (!this.currentSettings) this.currentSettings = {};
        const activeKey = this.currentSettings.activePreset || DEFAULT_ACTIVE_PRESET;
        const factory = PRESET_DEFAULTS[activeKey] || PRESET_DEFAULTS.balanced;
        const defaultName = DEFAULT_PRESET_NAMES[activeKey] || activeKey;

        if (!this.currentSettings.presets) this.currentSettings.presets = deepClone(PRESET_DEFAULTS);
        this.currentSettings.presets[activeKey] = deepClone(factory);

        if (DEFAULT_PRESET_NAMES[activeKey] && this.currentSettings.presetNames) {
            this.currentSettings.presetNames[activeKey] = defaultName;
        }

        applyFilters(this.currentSettings);
        this.broadcastLiveSettings();
        this.saveWorkingSettings();

        const label = (this.currentSettings.presetNames?.[activeKey] || defaultName).toUpperCase();
        this.showOSD('PRESET RESET', `[ ${label} ]`);

        this.updateSlidersUI();
        this.updatePresetButtonsActiveState();
    }

    cyclePreset(direction) {
        if (!this.currentSettings) return;
        const presets = Object.keys(this.currentSettings.presets || PRESET_DEFAULTS);
        if (!presets.length) return;

        const currentIdx = presets.indexOf(this.currentSettings.activePreset);
        const nextIdx = (currentIdx + direction + presets.length) % presets.length;
        this.activatePreset(presets[nextIdx]);
    }

    saveWorkingSettings() {
        if (!this.currentSettings || !this.rawStoredData) return;
        const hostname = this.hostname;

        // Ensure site override exists when tweaking on this domain
        if (hostname) {
            if (!this.rawStoredData.siteSettings) this.rawStoredData.siteSettings = {};
            this.rawStoredData.siteSettings[hostname] = {
                enabled: this.currentSettings.enabled,
                enableImages: this.currentSettings.enableImages,
                activePreset: this.currentSettings.activePreset,
                presets: this.currentSettings.presets,
                performanceMode: this.currentSettings.performanceMode,
                aspectRatio: this.currentSettings.aspectRatio,
                audioBoost: this.currentSettings.audioBoost,
                audioCompressor: this.currentSettings.audioCompressor,
                presetNames: this.currentSettings.presetNames
            };

            ignoreStorageUpdateUntil = Date.now() + 600;
            browser.storage.local.set({ siteSettings: this.rawStoredData.siteSettings }).catch(console.error);
        } else {
            ignoreStorageUpdateUntil = Date.now() + 600;
            browser.storage.local.set({
                enabled: this.currentSettings.enabled,
                activePreset: this.currentSettings.activePreset,
                presets: this.currentSettings.presets
            }).catch(console.error);
        }

        this.updateScopeUI();
    }

    resetSiteOverride() {
        if (!this.hostname || !this.rawStoredData?.siteSettings?.[this.hostname]) return;

        delete this.rawStoredData.siteSettings[this.hostname];
        ignoreStorageUpdateUntil = Date.now() + 600;
        browser.storage.local.set({ siteSettings: this.rawStoredData.siteSettings }).catch(console.error);

        // Restore global settings
        const globalData = {
            ...this.rawStoredData,
            presets: this.rawStoredData.presets || PRESET_DEFAULTS,
            activePreset: this.rawStoredData.activePreset || DEFAULT_ACTIVE_PRESET
        };
        this.currentSettings = deepClone(globalData);
        applyFilters(this.currentSettings);

        this.showOSD('SITE OVERRIDE REMOVED');
        this.updateScopeUI();
        this.renderPresetButtons();
        this.updateSlidersUI();
    }

    showOSD(title, sub = '') {
        if (!this.osd || !this.osdText) return;
        if (!this.isHudEnabled() || !this.hasEligibleContent()) return;

        this.mount();

        this.osdText.textContent = sub ? `${title} · ${sub}` : title;
        this.osd.classList.add('visible');

        clearTimeout(this.osdTimer);
        this.osdTimer = setTimeout(() => {
            this.osd.classList.remove('visible');
        }, 1600);
    }

    getVideoPlayerElement() {
        if (document.fullscreenElement) {
            return document.fullscreenElement;
        }

        // 1. YouTube and custom web player containers
        const playerContainer = document.querySelector('.html5-video-player') ||
                                document.querySelector('#movie_player') ||
                                document.querySelector('[data-player]');
        if (playerContainer) {
            const rect = playerContainer.getBoundingClientRect();
            if (rect.width >= 160 && rect.height >= 90) {
                return playerContainer;
            }
        }

        // 2. Video player iframes (e.g. streaming anime players)
        const iframe = findVideoPlayerIframe();
        if (iframe) {
            const rect = iframe.getBoundingClientRect();
            if (rect.width >= 160 && rect.height >= 90) {
                return iframe;
            }
        }

        // 3. Visible HTML5 video element with valid player dimensions
        const videos = document.querySelectorAll('video');
        for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            const rect = v.getBoundingClientRect();
            if (rect.width >= 160 && rect.height >= 90) {
                const parent = v.parentElement;
                if (parent) {
                    const pRect = parent.getBoundingClientRect();
                    if (Math.abs(pRect.width - rect.width) < 20 && Math.abs(pRect.height - rect.height) < 20) {
                        return parent;
                    }
                }
                return v;
            }
        }

        return null;
    }

    getContainerBounds() {
        const player = this.getVideoPlayerElement();
        if (player) {
            const rect = player.getBoundingClientRect();
            if (rect.width >= 160 && rect.height >= 90) {
                return {
                    width: rect.width,
                    height: rect.height,
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    isPlayer: true
                };
            }
        }
        return {
            width: window.innerWidth || document.documentElement.clientWidth || 320,
            height: window.innerHeight || document.documentElement.clientHeight || 240,
            left: 0,
            top: 0,
            right: window.innerWidth || 320,
            bottom: window.innerHeight || 240,
            isPlayer: false
        };
    }

    isPlayerInView(bounds) {
        if (!bounds || !bounds.isPlayer) return true;
        return (
            bounds.bottom > 30 &&
            bounds.top < (window.innerHeight - 30) &&
            bounds.right > 30 &&
            bounds.left < (window.innerWidth - 30)
        );
    }

    clampWithinBounds(targetLeft, targetTop, width, height, padding = 10) {
        const bounds = this.getContainerBounds();

        // 1. Calculate horizontal bounds relative to player
        let minLeft = bounds.left + padding;
        let maxLeft = bounds.left + bounds.width - width - padding;

        if (maxLeft < minLeft) {
            maxLeft = minLeft;
        }

        const vpMinLeft = padding;
        const vpMaxLeft = Math.max(padding, window.innerWidth - width - padding);

        minLeft = Math.max(vpMinLeft, minLeft);
        maxLeft = Math.min(vpMaxLeft, maxLeft);
        if (maxLeft < minLeft) maxLeft = minLeft;

        const clampedLeft = Math.max(minLeft, Math.min(targetLeft, maxLeft));

        // 2. Calculate vertical bounds relative to player
        let minTop = bounds.top + padding;
        let maxTop = bounds.top + bounds.height - height - padding;

        if (maxTop < minTop) {
            maxTop = minTop;
        }

        const vpMinTop = padding;
        const vpMaxTop = Math.max(padding, window.innerHeight - height - padding);

        minTop = Math.max(vpMinTop, minTop);
        maxTop = Math.min(vpMaxTop, maxTop);
        if (maxTop < minTop) maxTop = minTop;

        const clampedTop = Math.max(minTop, Math.min(targetTop, maxTop));

        return { left: clampedLeft, top: clampedTop };
    }

    getMiniHudDimensions() {
        if (this.miniHud && this.miniHud.offsetWidth > 0) {
            this._cachedMiniWidth = this.miniHud.offsetWidth;
            this._cachedMiniHeight = this.miniHud.offsetHeight;
        }
        return {
            width: this._cachedMiniWidth || 150,
            height: this._cachedMiniHeight || 32
        };
    }

    applySavedPosition() {
        const bounds = this.getContainerBounds();
        const { width: miniWidth, height: miniHeight } = this.getMiniHudDimensions();

        if (!this.isPlayerInView(bounds)) {
            if (this.miniHud) this.miniHud.style.visibility = 'hidden';
            if (this.panel) this.panel.style.visibility = 'hidden';
            return;
        } else {
            if (this.miniHud) this.miniHud.style.visibility = '';
            if (this.panel) this.panel.style.visibility = '';
        }

        const maxAvailableW = Math.max(1, bounds.width - miniWidth);
        const maxAvailableH = Math.max(1, bounds.height - miniHeight);

        let miniLeft, miniTop;
        if (this.savedPosition && typeof this.savedPosition.xRatio === 'number' && typeof this.savedPosition.yRatio === 'number') {
            const targetMiniLeft = bounds.left + Math.round(this.savedPosition.xRatio * maxAvailableW);
            const targetMiniTop = bounds.top + Math.round(this.savedPosition.yRatio * maxAvailableH);
            const clamped = this.clampWithinBounds(targetMiniLeft, targetMiniTop, miniWidth, miniHeight);
            miniLeft = clamped.left;
            miniTop = clamped.top;
        } else {
            const parsedLeft = parseFloat(this.miniHud?.style?.left);
            const parsedTop = parseFloat(this.miniHud?.style?.top);
            if (!isNaN(parsedLeft) && !isNaN(parsedTop) && parsedLeft > 0 && parsedTop > 0) {
                const clamped = this.clampWithinBounds(parsedLeft, parsedTop, miniWidth, miniHeight);
                miniLeft = clamped.left;
                miniTop = clamped.top;
            } else {
                // Default: bottom-right corner of player bounds, clamped within player
                const targetMiniLeft = bounds.left + bounds.width - miniWidth - 20;
                const targetMiniTop = bounds.top + bounds.height - miniHeight - 20;
                const clamped = this.clampWithinBounds(targetMiniLeft, targetMiniTop, miniWidth, miniHeight);
                miniLeft = clamped.left;
                miniTop = clamped.top;
            }
        }

        // Position Mini HUD
        if (this.miniHud) {
            this.miniHud.style.right = 'auto';
            this.miniHud.style.bottom = 'auto';
            this.miniHud.style.left = `${miniLeft}px`;
            this.miniHud.style.top = `${miniTop}px`;
        }

        // Position Tweak Panel (if open)
        if (this.panel && this.isOpen) {
            const panelWidth = (this.panel.offsetWidth > 0) ? this.panel.offsetWidth : 310;
            const panelHeight = (this.panel.offsetHeight > 0) ? this.panel.offsetHeight : 440;

            // Anchor Tweak Panel directly to where the Mini HUD is located within player
            let panelLeft;
            const playerRight = bounds.left + bounds.width;
            if (miniLeft + panelWidth <= playerRight - 10) {
                panelLeft = miniLeft;
            } else {
                panelLeft = (miniLeft + miniWidth) - panelWidth;
            }

            let panelTop;
            const playerBottom = bounds.top + bounds.height;
            if (miniTop + panelHeight <= playerBottom - 10) {
                panelTop = miniTop;
            } else {
                panelTop = (miniTop + miniHeight) - panelHeight;
            }

            const clamped = this.clampWithinBounds(panelLeft, panelTop, panelWidth, panelHeight);

            this.panel.style.right = 'auto';
            this.panel.style.bottom = 'auto';
            this.panel.style.left = `${clamped.left}px`;
            this.panel.style.top = `${clamped.top}px`;
        }
    }

    saveHudPosition(leftPx, topPx) {
        const bounds = this.getContainerBounds();
        const { width: miniWidth, height: miniHeight } = this.getMiniHudDimensions();

        const maxAvailableW = Math.max(1, bounds.width - miniWidth);
        const maxAvailableH = Math.max(1, bounds.height - miniHeight);

        const xRatio = Math.max(0, Math.min(1, (leftPx - bounds.left) / maxAvailableW));
        const yRatio = Math.max(0, Math.min(1, (topPx - bounds.top) / maxAvailableH));

        this.savedPosition = { xRatio, yRatio };

        if (typeof browser !== 'undefined' && browser.storage?.local) {
            ignoreStorageUpdateUntil = Date.now() + 500;
            browser.storage.local.set({ hudPosition: this.savedPosition }).catch(() => {});
        }
    }

    resetHudPosition(persist = true) {
        this.savedPosition = null;
        this.applySavedPosition();
        if (persist && typeof browser !== 'undefined' && browser.storage?.local) {
            ignoreStorageUpdateUntil = Date.now() + 500;
            browser.storage.local.remove('hudPosition').catch(() => {});
            this.showOSD('HUD POSITION RESET');
        }
    }

    resetPanelPosition() {
        this.resetHudPosition(false);
    }

    resetMiniHudPosition() {
        this.resetHudPosition(false);
    }

    updatePositionFromStorage(newPos) {
        if (newPos && typeof newPos.xRatio === 'number' && typeof newPos.yRatio === 'number') {
            this.savedPosition = newPos;
        } else {
            this.savedPosition = null;
        }
        this.applySavedPosition();
    }

    openTweakPanel() {
        if (!this.isHudEnabled() || !this.hasEligibleContent()) return;
        this.mount();

        this.isOpen = true;
        this.isMiniHovered = false;
        clearTimeout(this.mouseIdleTimer);

        // Anchor tweak panel directly where the Mini HUD is located before hiding Mini HUD
        this.applySavedPosition();

        this.panel?.classList.add('open');
        this.backdrop?.classList.add('open');
        this.miniHud?.classList.add('hidden');
        this.miniHud?.classList.remove('visible');
        if (this.miniHud) this.miniHud.style.display = 'none';

        try {
            window.focus();
        } catch (_) {}
        if (this.panel) {
            this.panel.tabIndex = -1;
            this.panel.focus();
        }
    }

    closeTweakPanel() {
        this.isOpen = false;
        this.panel?.classList.remove('open');
        this.backdrop?.classList.remove('open');
        if (this.miniHud) {
            this.miniHud.style.display = '';
            this.miniHud.classList.remove('hidden');
        }
        this.applySavedPosition();
        this.flashMiniHud();

        if (this.panel) {
            this.panel.blur();
        }
    }

    toggleTweakPanel() {
        if (this.isOpen) {
            this.closeTweakPanel();
        } else {
            this.openTweakPanel();
        }
    }

    syncFromExternal(settings) {
        if (!settings) return;
        const prevPreset = this.currentSettings?.activePreset;
        const prevPresetsList = this.currentSettings?.presets ? Object.keys(this.currentSettings.presets).join(',') : '';

        if (this.currentSettings) {
            this.currentSettings = { ...this.currentSettings, ...settings };
        } else {
            this.currentSettings = deepClone(settings);
        }

        // If HUD is not mounted or host is not attached to DOM, skip all DOM work!
        if (!this.isMounted || !this.host.parentElement) {
            return;
        }

        if (!this.isHudEnabled()) {
            this.unmount();
            return;
        }

        // Only rebuild preset buttons if preset keys actually changed
        const newPresetsList = this.currentSettings?.presets ? Object.keys(this.currentSettings.presets).join(',') : '';
        if (prevPresetsList !== newPresetsList) {
            this.renderPresetButtons();
        } else if (prevPreset !== this.currentSettings.activePreset) {
            this.updatePresetButtonsActiveState();
        }

        // Only update tweak panel sliders if the tweak panel is open on screen
        if (this.isOpen) {
            this.updateSlidersUI();
        }

        if (this.enabledToggle && this.enabledToggle.checked !== (this.currentSettings.enabled ?? true)) {
            this.enabledToggle.checked = this.currentSettings.enabled ?? true;
        }

        const activeName = (this.currentSettings.presetNames?.[this.currentSettings.activePreset] || this.currentSettings.activePreset || 'BALANCED').toUpperCase();
        const newMiniStatus = this.currentSettings.enabled ? `HDR · ${activeName}` : 'HDR · OFF';
        if (this.miniStatus && this.miniStatus.textContent !== newMiniStatus) {
            this.miniStatus.textContent = newMiniStatus;
        }
    }
}

let hudController = null;

function loadAndApplySettings(source = 'unknown') {
    Promise.all([
        browser.storage.local.get(STORAGE_KEYS),
        getHostnameAsync()
    ])
        .then(([data, hostname]) => {
            const resolved = resolveSettings(data, hostname);
            applyFilters(resolved);
            if (hudController) {
                hudController.updateData(data, hostname, resolved);
            }
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
        if (area === 'local') {
            if (changes.enableHud !== undefined) {
                hudController?.setHudEnabled(changes.enableHud.newValue ?? true);
            }
            if (changes.hudPosition !== undefined) {
                hudController?.updatePositionFromStorage(changes.hudPosition.newValue);
            }
            if (changes.enableImages !== undefined) {
                if (hudController) {
                    if (!hudController.currentSettings) hudController.currentSettings = {};
                    hudController.currentSettings.enableImages = changes.enableImages.newValue;
                    if (!hudController.hasEligibleContent()) {
                        hudController.unmount();
                    }
                }
            }
            loadAndApplySettings('storage-change');
        }
    });

    browser.runtime.onMessage.addListener((message) => {
        if (message.type === 'SET_HUD_ENABLED') {
            hudController?.setHudEnabled(message.enabled);
            return;
        }
        if (message.type === 'UPDATE_SETTINGS' && message.settings) {
            if (message.ignoreStorage) {
                ignoreStorageUpdateUntil = Date.now() + 500;
            }
            applyFilters(message.settings);
            if (hudController) {
                hudController.syncFromExternal(message.settings);
            }
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
                if (node.nodeType === Node.ELEMENT_NODE && (node.nodeName === 'VIDEO' || node.querySelector?.('video') || node.nodeName === 'IFRAME' || node.querySelector?.('iframe'))) {
                    if (!hudController?.hasEligibleContent()) {
                        hudController?.unmount();
                    }
                    return;
                }
            }
            for (const node of m.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                const hasVid = node.nodeName === 'VIDEO' || Boolean(node.querySelector?.('video'));
                const hasIframe = node.nodeName === 'IFRAME' || Boolean(node.querySelector?.('iframe#video-player, iframe[src*="flixcloud"], iframe[src*="megacloud"], iframe.video-player, iframe'));
                if (hasVid || hasIframe) {
                    _cachedVideoFilter = null;
                    debouncedLoadSettings();
                    if (hudController?.isHudEnabled() && hudController?.hasEligibleContent()) {
                        hudController.mount();
                        hudController.flashMiniHud();
                    }
                    if (window.top !== window.self) {
                        announceIframeActive();
                    }
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

function init() {
    hudController = new VideoEnhancerHUD();
    try {
        window.hudController = hudController;
    } catch (_) {}
    loadAndApplySettings('init');
    initStorageListener();
    initMutationObserver();

    // Intercept pushState & replaceState for single-page apps (Next.js / Nuxt / React, e.g. reanime.to)
    const wrapHistoryMethod = (method) => {
        const original = history[method];
        if (typeof original === 'function') {
            history[method] = function (...args) {
                const result = original.apply(this, args);
                try {
                    window.dispatchEvent(new Event('ve-location-change'));
                } catch (e) {}
                return result;
            };
        }
    };
    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');
    window.addEventListener('popstate', () => {
        try {
            window.dispatchEvent(new Event('ve-location-change'));
        } catch (e) {}
    });

    window.addEventListener('ve-location-change', () => {
        _cachedVideoFilter = null;
        debouncedLoadSettings();
        if (hudController?.isHudEnabled() && hudController?.hasEligibleContent()) {
            hudController.mount();
            hudController.flashMiniHud();
        }
    });

    window.addEventListener('yt-navigate-finish', () => {
        _cachedVideoFilter = null;
        debouncedLoadSettings();
        if (hudController?.isHudEnabled() && hudController?.hasEligibleContent()) {
            hudController.mount();
            hudController.flashMiniHud();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            loadAndApplySettings('DOMContentLoaded');
        }, { once: true });
    } else {
        setTimeout(() => loadAndApplySettings('fallback-timeout'), 0);
    }
}

init();
