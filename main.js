const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_SETTINGS = {
    geminiApiKey: '',
    licenseKey: '',
    isPro: false
};

module.exports = class SynapsePlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.addSettingTab(new SynapseSettingTab(this.app, this));

        this.addRibbonIcon('sparkles', 'Launch Synapse Agent', () => {
            this.startAgentDaemon();
        });

        if (this.settings.geminiApiKey) {
            this.startAgentDaemon();
        } else {
            new Notice('Synapse: Please add your Gemini API Key in Plugin Settings.');
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

        new Notice('Synapse Dynamic Island launched at top of screen!');

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

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Enter your Google Gemini API key to power local vision and search.')
            .addText(text => text
                .setPlaceholder('AIzaSy...')
                .setValue(this.plugin.settings.geminiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));

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
                        const { activateLicense } = require('./license.mjs');
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
    }
}