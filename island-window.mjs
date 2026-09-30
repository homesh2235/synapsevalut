import { app, BrowserWindow, screen, globalShortcut, clipboard, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { captureAndAutoType } from './act.mjs';
import { askVault } from './ask.mjs';

// Force GPU rasterization for smooth 60 FPS transitions and blurs
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env.local from project root
dotenv.config({ path: path.join(__dirname, '.env.local') });

let islandWindow = null;
let isBusy = false;

// Helper function for delays between form keystrokes
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Free Trial & Quota Management ---
const USAGE_FILE = path.join(__dirname, '.usage.json');
const FREE_LIMITS = { captures: 15, autoTypes: 10 };

function getUsage() {
    // Developer override: Set SYNAPSE_DEV_MODE=true in .env.local to bypass limits
    if (process.env.SYNAPSE_DEV_MODE === 'true') {
        return { captures: 0, autoTypes: 0, isPro: true };
    }

    try {
        if (fs.existsSync(USAGE_FILE)) {
            return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
        }
    } catch (e) {
        console.warn('Could not read usage file, initializing defaults.');
    }
    return { captures: 0, autoTypes: 0, isPro: false };
}

function checkAndConsumeCredit(type) {
    const usage = getUsage();
    if (usage.isPro) return { allowed: true, remaining: Infinity, isPro: true };

    const currentCount = usage[type] || 0;
    const limit = FREE_LIMITS[type];

    if (currentCount >= limit) {
        return { allowed: false, remaining: 0, isPro: false };
    }

    usage[type] = currentCount + 1;
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
    return { allowed: true, remaining: limit - usage[type], isPro: false };
}

function broadcastQuota() {
    if (islandWindow && !islandWindow.isDestroyed()) {
        const usage = getUsage();
        islandWindow.webContents.send('user:quota', {
            isPro: usage.isPro,
            remainingCaptures: usage.isPro ? Infinity : Math.max(0, FREE_LIMITS.captures - (usage.captures || 0)),
            remainingAutoTypes: usage.isPro ? Infinity : Math.max(0, FREE_LIMITS.autoTypes - (usage.autoTypes || 0))
        });
    }
}

// --- Window Lifecycle ---
function createDynamicIsland() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;

    // Fixed canvas size prevents Chromium DWM redraw buffering/flicker on toggle
    const winWidth = 460;
    const winHeight = 220;

    islandWindow = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        x: Math.round((width - winWidth) / 2),
        y: 12,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    islandWindow.loadFile(path.join(__dirname, 'ui', 'island.html'));
    islandWindow.setIgnoreMouseEvents(true, { forward: true });

    islandWindow.webContents.on('did-finish-load', () => {
        broadcastQuota();
    });
}

function updateStatus(status, message) {
    if (islandWindow && !islandWindow.isDestroyed()) {
        islandWindow.webContents.send('island:status', { status, message });
        broadcastQuota();
    }
}

// --- Alt + S: High-Fidelity Universal Screen Capture ---
function triggerCaptureSequence() {
    if (isBusy) return;

    const { allowed } = checkAndConsumeCredit('captures');
    if (!allowed) {
        updateStatus('paywall', 'Capture Limit Reached');
        return;
    }

    isBusy = true;
    updateStatus('capturing', 'Capturing Screen...');

    setTimeout(() => {
        updateStatus('analyzing', 'Indexing to Vault...');

        const snapScriptPath = path.join(__dirname, 'snap.mjs');
        exec(`node "${snapScriptPath}"`, { cwd: __dirname }, (error, stdout, stderr) => {
            isBusy = false;
            if (error) {
                console.error('❌ Snap execution error:', stderr || error.message);
                updateStatus('error', 'Capture Failed');
            } else {
                console.log('✅ Snap output:\n', stdout);
                updateStatus('done', 'Saved to Vault');
            }
        });
    }, 120);
}

// --- Alt + F: Screen Context & Multi-Field Ghost-Typer ---
function triggerAutoTypeSequence() {
    if (isBusy) return;

    const { allowed } = checkAndConsumeCredit('autoTypes');
    if (!allowed) {
        updateStatus('paywall', 'Ghost Typer Limit Reached');
        return;
    }

    isBusy = true;
    updateStatus('capturing', 'Scanning Fields...');

    setTimeout(async () => {
        try {
            updateStatus('analyzing', 'Extracting answers...');
            const valuesToFill = await captureAndAutoType();

            if (!valuesToFill || valuesToFill.length === 0) {
                updateStatus('error', 'No data found');
                isBusy = false;
                return;
            }

            updateStatus('done', `Filling ${valuesToFill.length} field(s)...`);

            // Field-by-field keystroke execution loop
            for (let i = 0; i < valuesToFill.length; i++) {
                const val = valuesToFill[i];

                if (val && String(val).trim() !== '') {
                    clipboard.writeText(String(val));

                    // Paste into the currently focused input box
                    await new Promise((resolve) => {
                        exec(`powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('^v')"`, () => resolve());
                    });
                }

                // If there are subsequent fields on screen, send Tab to advance
                if (i < valuesToFill.length - 1) {
                    await sleep(140);
                    await new Promise((resolve) => {
                        exec(`powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('{TAB}')"`, () => resolve());
                    });
                    await sleep(140);
                }
            }

            isBusy = false;
            setTimeout(() => {
                updateStatus('done', 'Form Populated!');
            }, 300);

        } catch (err) {
            console.error('❌ Auto-type error:', err);
            updateStatus('error', 'Action Failed');
            isBusy = false;
        }
    }, 120);
}
ipcMain.on('island:mouse', (_, shouldCapture) => {
    if (islandWindow && !islandWindow.isDestroyed()) {
        if (shouldCapture) {
            islandWindow.setIgnoreMouseEvents(false);
        } else {
            islandWindow.setIgnoreMouseEvents(true, { forward: true });
        }
    }
});
// Direct in-process query to askVault (retrieves strictly from local Obsidian vault)
ipcMain.on('vault:ask', async (_, question) => {
    console.log(`\n💬 Received Vault Question: "${question}"`);
    try {
        const answer = await askVault(question);
        console.log(`✅ Vault Answer Ready:\n`, answer);

        if (islandWindow && !islandWindow.isDestroyed()) {
            islandWindow.webContents.send('vault:answer', { answer });
        }
    } catch (err) {
        console.error('❌ Vault query failed:', err);
        if (islandWindow && !islandWindow.isDestroyed()) {
            islandWindow.webContents.send('vault:answer', {
                answer: "An error occurred while querying your local vault."
            });
        }
    }
});

// --- App Bootstrap ---
app.whenReady().then(() => {
    createDynamicIsland();

    globalShortcut.register('Alt+S', () => {
        triggerCaptureSequence();
    });

    globalShortcut.register('Alt+F', () => {
        triggerAutoTypeSequence();
    });

    console.log('🚀 SynapseVault Dynamic Island online:');
    console.log('  👉 Alt + S: Universal Screen Snap to Obsidian Vault');
    console.log('  👉 Alt + F: Context-aware Multi-field Ghost Typer');
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});