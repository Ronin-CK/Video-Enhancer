const DEFAULT_STATE = {
    enabled: true
};

// get hostname from url
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
    browser.browserAction.setBadgeText(details);

    const colorDetails = { color };
    if (tabId) colorDetails.tabId = tabId;
    browser.browserAction.setBadgeBackgroundColor(colorDetails);
}

async function updateBadgeForTab(tabId) {
    try {
        const [tab, stored] = await Promise.all([
            browser.tabs.get(tabId),
            browser.storage.local.get(null)
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

// update badges for all tabs
async function updateAllTabs() {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
        if (tab.id) {
            updateBadgeForTab(tab.id);
        }
    }
}

// update badge when storage changes
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        updateAllTabs();
    }
});

// tab events
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
