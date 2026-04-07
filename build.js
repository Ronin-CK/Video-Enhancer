const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const BUILD_DIR = path.join(__dirname, 'build');
const CHROME_DIR = path.join(BUILD_DIR, 'chrome');
const FIREFOX_DIR = path.join(BUILD_DIR, 'firefox');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function build() {
    console.log('Building Video Enhancer for Chrome and Firefox...');
    
    ensureDir(CHROME_DIR);
    ensureDir(FIREFOX_DIR);

    const files = fs.readdirSync(SRC_DIR);
    
    files.forEach(file => {
        if (file === 'manifest.json') return;
        
        const srcPath = path.join(SRC_DIR, file);
        if (fs.statSync(srcPath).isFile()) {
            fs.copyFileSync(srcPath, path.join(CHROME_DIR, file));
            fs.copyFileSync(srcPath, path.join(FIREFOX_DIR, file));
        }
    });

    const manifestPath = path.join(SRC_DIR, 'manifest.json');
    const baseManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const chromeManifest = { ...baseManifest };
    delete chromeManifest.browser_specific_settings;
    chromeManifest.background = {
        "service_worker": "background_loader.js"
    };

    const firefoxManifest = { ...baseManifest };
    firefoxManifest.browser_specific_settings = {
        "gecko": {
            "id": "video-controller@ronin-ck.com",
            "strict_min_version": "142.0"
        }
    };
    firefoxManifest.background = {
        "scripts": [
            "shared.js",
            "background.js"
        ]
    };

    fs.writeFileSync(
        path.join(CHROME_DIR, 'manifest.json'), 
        JSON.stringify(chromeManifest, null, 4)
    );
    console.log(`[${new Date().toLocaleTimeString()}] ✔ Chrome build updated at build/chrome`);

    fs.writeFileSync(
        path.join(FIREFOX_DIR, 'manifest.json'), 
        JSON.stringify(firefoxManifest, null, 4)
    );
    console.log(`[${new Date().toLocaleTimeString()}] ✔ Firefox build updated at build/firefox`);
}

// Initial build
build();

// Watch mode
if (process.argv.includes('--watch')) {
    console.log('\n👀 Watching src/ for changes...');
    
    // Simple debounce to prevent double-builds on double-saves
    let timeoutId;
    fs.watch(SRC_DIR, (eventType, filename) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            console.log(`\nDetected change in ${filename}, rebuilding...`);
            try {
                build();
            } catch (err) {
                console.error('Build failed:', err.message);
            }
        }, 100);
    });
}
