/*
 * Copyright (c) 2026 Chandra Kant (Ronin-CK)
 * All Rights Reserved.
 * This product and its source code are proprietary.
 */


const DEFAULT_STATE = {
    enabled: true
};

function getHostname(url) {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        if (urlObj.protocol.startsWith('http')) {
            return urlObj.hostname.replace(/^www\./, '');
        }
    } catch (e) {
        console.error('Video Enhancer Hostname Error:', e);
    }
    return null;
}

function updateBadge(enabled, tabId, isSiteOverride = false) {
    const text = enabled ? 'ON' : 'OFF';

    let color = '#757575'; // default OFF color
    if (enabled) {
        color = isSiteOverride ? '#FFC107' : '#4CAF50';
    }

    const details = { text };
    if (tabId) details.tabId = tabId;
    browser.action.setBadgeText(details);

    const colorDetails = { color };
    if (tabId) colorDetails.tabId = tabId;
    browser.action.setBadgeBackgroundColor(colorDetails);
}

async function updateBadgeForTab(tabId) {
    try {
        const [tab, stored] = await Promise.all([
            browser.tabs.get(tabId),
            browser.storage.local.get(STORAGE_KEYS)
        ]);

        if (!tab || !tab.url) return;

        const hostname = getHostname(tab.url);
        let enabled = stored.enabled !== undefined ? stored.enabled : DEFAULT_STATE.enabled;
        let isSiteOverride = false;

        if (hostname && stored.siteSettings && stored.siteSettings[hostname]) {
            const siteEnabled = stored.siteSettings[hostname].enabled ?? true;

            if (siteEnabled !== enabled || (siteEnabled && !enabled)) {
                isSiteOverride = true;
            }
            enabled = siteEnabled;
        }

        updateBadge(enabled, tabId, isSiteOverride);
    } catch (e) {
        console.error('Video Enhancer Badge Update Error:', e);
    }
}

async function updateAllTabs() {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
        if (tab.id) {
            updateBadgeForTab(tab.id);
        }
    }
}

browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-enhancer') return;

    try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;

        const stored = await browser.storage.local.get(STORAGE_KEYS);
        const hostname = getHostname(tab.url);

        let currentEnabled;
        let isSiteScope = false;

        if (hostname && stored.siteSettings?.[hostname]) {
            isSiteScope = true;
            currentEnabled = stored.siteSettings[hostname].enabled ?? true;
        } else {
            currentEnabled = stored.enabled ?? true;
        }

        const newEnabled = !currentEnabled;

        if (isSiteScope) {
            stored.siteSettings[hostname].enabled = newEnabled;
            await browser.storage.local.set({ siteSettings: stored.siteSettings });
        } else {
            await browser.storage.local.set({ enabled: newEnabled });
        }

        browser.tabs.sendMessage(tab.id, {
            type: 'UPDATE_SETTINGS',
            settings: {
                ...stored,
                enabled: newEnabled,
                ...(isSiteScope ? stored.siteSettings[hostname] : {}),
                enabled: newEnabled
            },
            ignoreStorage: true
        }).catch(() => {});

        updateBadgeForTab(tab.id);
    } catch (e) {
        console.error('Video Enhancer Toggle Error:', e);
    }
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        updateAllTabs();
    }
});

browser.tabs.onActivated.addListener((activeInfo) => {
    updateBadgeForTab(activeInfo.tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        updateBadgeForTab(tabId);
    }
});

browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0] && tabs[0].id) {
        updateBadgeForTab(tabs[0].id);
    }
});

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'GET_TAB_HOSTNAME') {
        const hostname = getHostname(sender.tab?.url);
        return Promise.resolve({ hostname });
    }
});
