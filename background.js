// default extension state
const DEFAULT_STATE = {
    enabled: true
};

// update browser badge state
function updateBadge(enabled) {
    if (enabled) {
        browser.browserAction.setBadgeText({ text: 'ON' });
        browser.browserAction.setBadgeBackgroundColor({ color: '#4CAF50' });
    } else {
        browser.browserAction.setBadgeText({ text: 'OFF' });
        browser.browserAction.setBadgeBackgroundColor({ color: '#757575' });
    }
}

// update badge when storage changes
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
        updateBadge(changes.enabled.newValue);
    }
});

// set initial badge state
browser.storage.local.get('enabled').then((data) => {
    const enabled = data.enabled !== undefined ? data.enabled : DEFAULT_STATE.enabled;
    updateBadge(enabled);
});
