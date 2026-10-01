const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

const DEFAULT_SETTINGS = {
    geminiApiKey: '',
    licenseKey: '',
    isPro: false
};

module.exports = class SynapsePlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // 1. Settings Tab
        this.addSettingTab(new SynapseSettingTab(this.app, this));

        // 2. Ribbon Icon: Launch Dynamic Island
        this.addRibbonIcon('sparkles', 'Launch Synapse Dynamic Island', () => {
            this.startAgentDaemon();
        });

        // 3. Command Palette: Launch Dynamic Island
        this.addCommand({
            id: 'synapse-launch-daemon',
            name: 'Launch Dynamic Island Overlay',
            callback: () => this.startAgentDaemon()
        });

        // 4. Command Palette: Wipe Brain Store
        this.addCommand({
            id: 'synapse-wipe-memory',
            name: 'Wipe AI Memory Store',
            callback: async () => {
                await this.clearVectorStore();
            }
        });

        // 5. Native Vault Event Listeners: Auto-prune vector index on note removal or rename
        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                try {
                    const { deleteEmbeddingByPath } = await import('./local-vault.mjs');
                    await deleteEmbeddingByPath(file.path);
                    new Notice(`Synapse: Removed "${file.name}" from AI memory.`);
                } catch (err) {
                    console.error('Failed to sync deletion with vector store:', err);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                try {
                    const { deleteEmbeddingByPath } = await import('./local-vault.mjs');
                    await deleteEmbeddingByPath(oldPath);
                } catch (err) {
                    console.error('Failed to sync rename with vector store:', err);
                }
            })
        );

        // Auto-launch daemon if key is configured
        if (this.settings.geminiApiKey) {
            this.startAgentDaemon();
        } else {
            new Notice('Synapse: Please configure your Gemini API Key in Settings.');
        }
    }

    async clearVectorStore() {
        try {
            const vaultPath = this.app.vault.adapter.getBasePath();
            const storePath = path.join(vaultPath, '.synapse_vectors.json');
            await fs.writeFile(storePath, '[]', 'utf8');
            new Notice('🧹 Synapse AI memory index has been completely wiped.');
        } catch (err) {
            new Notice('❌ Failed to clear memory: ' + err.message);
        }
    }

    startAgentDaemon() {
        if (this.daemonProcess) {
            new Notice('Synapse Dynamic Island is already active.');
            return;
        }

        const pluginDir = path.dirname(__filename);
        const vaultPath = this.app.vault.adapter.getBasePath();

        const env = {
            ...process.env,
            GEMINI_API_KEY: this.settings.geminiApiKey,
            OBSIDIAN_VAULT_PATH: vaultPath,
            SYNAPSE_LICENSE_KEY: this.settings.licenseKey
        };

        this.daemonProcess = spawn('npx', ['electron', path.join(pluginDir, 'island-window.mjs')], {
            cwd: pluginDir,
            env,
            shell: true,
            stdio: 'ignore'
        });

        new Notice('Synapse Dynamic Island launched at top of screen.');

        this.daemonProcess.on('exit', () => {
            this.daemonProcess = null;
        });
    }

    stopAgentDaemon() {
        if (this.daemonProcess) {
            this.daemonProcess.kill();
            this.daemonProcess = null;
            new Notice('Synapse Dynamic Island stopped.');
        }
    }

    onunload() {
        this.stopAgentDaemon();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
};

class SynapseSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Synapse Vault — Settings' });

        // Gemini API Key
        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Enter your Google Gemini API key to power local vision, ghost-typing, and search.')
            .addText(text => text
                .setPlaceholder('AIzaSy...')
                .setValue(this.plugin.settings.geminiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));

        // License Activation
        new Setting(containerEl)
            .setName('Synapse Pro License')
            .setDesc('Unlock unlimited Screen Snaps (Alt+S) and Ghost-Typing (Alt+F).')
            .addText(text => text
                .setPlaceholder('SYN-XXXX-XXXX')
                .setValue(this.plugin.settings.licenseKey)
                .onChange(async (value) => {
                    this.plugin.settings.licenseKey = value.trim();
                    await this.plugin.saveSettings();
                }))
            .addButton(btn => btn
                .setButtonText(this.plugin.settings.isPro ? 'Pro Active' : 'Activate')
                .setCta()
                .onClick(async () => {
                    btn.setButtonText('Verifying...');
                    try {
                        const { activateLicense } = await import('./license.mjs');
                        const res = await activateLicense(this.plugin.settings.licenseKey);
                        if (res.success) {
                            this.plugin.settings.isPro = true;
                            await this.plugin.saveSettings();
                            new Notice('✅ Synapse Pro successfully activated!');
                            this.display();
                        } else {
                            new Notice(`❌ Activation failed: ${res.message}`);
                            btn.setButtonText('Activate');
                        }
                    } catch (e) {
                        new Notice(`❌ Activation error: ${e.message}`);
                        btn.setButtonText('Activate');
                    }
                }));

        // Data Management
        containerEl.createEl('h3', { text: 'Privacy & Data Controls' });

        new Setting(containerEl)
            .setName('Clear AI Memory Index')
            .setDesc('Completely empties all vector embeddings (.synapse_vectors.json). Markdown notes remain untouched.')
            .addButton(btn => btn
                .setButtonText('Wipe Brain')
                .setWarning()
                .onClick(async () => {
                    await this.plugin.clearVectorStore();
                }));
    }
}