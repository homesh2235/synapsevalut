/* ==========================================================================
   Synapse Vault AI - Clean Obsidian Plugin (No child_process)
   ========================================================================== */

const { Plugin, PluginSettingTab, Setting, Notice, Modal } = require('obsidian');

const LEMON_API_BASE = 'https://api.lemonsqueezy.com/v1/licenses';

async function activateLemonLicense(licenseKey, instanceName = 'Obsidian-Desktop') {
    if (!licenseKey || !licenseKey.trim()) {
        return { valid: false, message: 'Please enter a valid license key.' };
    }
    try {
        const res = await fetch(`${LEMON_API_BASE}/activate`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                license_key: licenseKey.trim(),
                instance_name: instanceName
            })
        });
        const data = await res.json();
        if (data.activated) {
            return {
                valid: true,
                instanceId: data.instance?.id,
                customerEmail: data.meta?.customer_email,
                message: 'License activated successfully!'
            };
        }
        return { valid: false, message: data.error || 'Invalid or inactive license key.' };
    } catch (err) {
        return { valid: false, message: `Network error: ${err.message}` };
    }
}

async function validateLemonLicense(licenseKey, instanceId) {
    if (!licenseKey) return { valid: false };
    try {
        const res = await fetch(`${LEMON_API_BASE}/validate`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                license_key: licenseKey.trim(),
                instance_id: instanceId || ''
            })
        });
        const data = await res.json();
        return { valid: data.valid && data.license_key?.status === 'active' };
    } catch (err) {
        return { valid: false };
    }
}

const DEFAULT_SETTINGS = {
    geminiApiKey: '',
    geminiModel: 'gemini-1.5-flash',
    isPro: false,
    licenseKey: '',
    instanceId: '',
    checkoutUrl: 'https://lemonsqueezy.com'
};

class SynapseAskModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Synapse Vault AI - Query Vault' });

        const desc = contentEl.createEl('p', {
            text: this.plugin.settings.isPro
                ? '⚡ Pro Mode Active: Semantic search enabled across your vault.'
                : '⚪ Free Tier: Basic note search. Upgrade to Pro for unlimited semantic RAG.'
        });
        desc.style.color = 'var(--text-muted)';

        const queryInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Ask anything about your notes...'
        });
        queryInput.style.width = '100%';
        queryInput.style.marginBottom = '12px';
        queryInput.style.padding = '8px';

        const resultBox = contentEl.createEl('div');
        resultBox.style.whiteSpace = 'pre-wrap';
        resultBox.style.marginTop = '12px';
        resultBox.style.maxHeight = '300px';
        resultBox.style.overflowY = 'auto';

        const submitBtn = contentEl.createEl('button', { text: 'Ask Synapse' });
        submitBtn.style.marginTop = '8px';

        submitBtn.onclick = async () => {
            const query = queryInput.value.trim();
            if (!query) {
                new Notice('Please enter a query.');
                return;
            }
            if (!this.plugin.settings.geminiApiKey) {
                new Notice('Please configure your Gemini API Key in settings.');
                return;
            }

            resultBox.setText('Synthesizing answer from your notes...');

            try {
                const files = this.app.vault.getMarkdownFiles();
                let contextSnippet = '';
                const limit = this.plugin.settings.isPro ? files.length : Math.min(files.length, 5);

                for (let i = 0; i < limit; i++) {
                    const content = await this.app.vault.cachedRead(files[i]);
                    contextSnippet += `\n--- Note: ${files[i].basename} ---\n${content.slice(0, 1000)}`;
                    if (contextSnippet.length > 12000) break;
                }

                const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.plugin.settings.geminiModel}:generateContent?key=${this.plugin.settings.geminiApiKey}`;
                const payload = {
                    contents: [{
                        parts: [{
                            text: `You are an AI knowledge assistant for an Obsidian vault. Answer using this note context:\n\nContext:\n${contextSnippet}\n\nQuestion: ${query}`
                        }]
                    }]
                };

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
                resultBox.setText(answer);
            } catch (err) {
                resultBox.setText(`Error: ${err.message}`);
            }
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}

class SynapseSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Synapse Vault AI Settings' });
        containerEl.createEl('h3', { text: 'Pro Membership & Licensing' });

        const statusBadge = this.plugin.settings.isPro
            ? '🟢 Pro Subscription Active'
            : '⚪ Free Tier (Limited to 5 notes per query)';

        new Setting(containerEl)
            .setName('Membership Status')
            .setDesc(`Current tier: ${statusBadge}`)
            .addButton((btn) => {
                btn.setButtonText('Upgrade to Pro ($6/mo)')
                    .setCta()
                    .onClick(() => {
                        window.open(this.plugin.settings.checkoutUrl, '_blank');
                    });
            });

        let enteredKey = this.plugin.settings.licenseKey || '';

        new Setting(containerEl)
            .setName('Lemon Squeezy License Key')
            .setDesc('Enter the license key received upon subscribing.')
            .addText((text) =>
                text
                    .setPlaceholder('XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX')
                    .setValue(this.plugin.settings.licenseKey || '')
                    .onChange((value) => {
                        enteredKey = value;
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText(this.plugin.settings.isPro ? 'Re-verify' : 'Activate Pro')
                    .onClick(async () => {
                        new Notice('Verifying subscription with Lemon Squeezy...');
                        const result = await activateLemonLicense(enteredKey);

                        if (result.valid) {
                            this.plugin.settings.isPro = true;
                            this.plugin.settings.licenseKey = enteredKey;
                            this.plugin.settings.instanceId = result.instanceId;
                            await this.plugin.saveSettings();
                            new Notice('🎉 Synapse Vault AI Pro Activated!');
                            this.display();
                        } else {
                            this.plugin.settings.isPro = false;
                            await this.plugin.saveSettings();
                            new Notice(`❌ Activation failed: ${result.message}`);
                        }
                    })
            );

        new Setting(containerEl)
            .setName('Checkout URL')
            .setDesc('Your Lemon Squeezy product purchase link.')
            .addText((text) =>
                text
                    .setPlaceholder('https://your-store.lemonsqueezy.com/buy/...')
                    .setValue(this.plugin.settings.checkoutUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.checkoutUrl = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl('h3', { text: 'AI Model Configuration' });

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Google Gemini API Key for note indexing.')
            .addText((text) =>
                text
                    .setPlaceholder('Enter your Gemini API Key')
                    .setValue(this.plugin.settings.geminiApiKey || '')
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Gemini Model')
            .setDesc('Select generation model.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('gemini-1.5-flash', 'Gemini 1.5 Flash (Fast)')
                    .addOption('gemini-1.5-pro', 'Gemini 1.5 Pro (Deep reasoning)')
                    .setValue(this.plugin.settings.geminiModel)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiModel = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}

module.exports = class SynapseVaultPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        if (this.settings.isPro && this.settings.licenseKey) {
            validateLemonLicense(this.settings.licenseKey, this.settings.instanceId).then(async (status) => {
                if (!status.valid) {
                    this.settings.isPro = false;
                    await this.saveSettings();
                }
            });
        }

        this.addRibbonIcon('sparkles', 'Ask Synapse Vault AI', () => {
            new SynapseAskModal(this.app, this).open();
        });

        this.addCommand({
            id: 'ask-synapse-vault',
            name: 'Ask Synapse Vault AI',
            callback: () => {
                new SynapseAskModal(this.app, this).open();
            }
        });

        this.addSettingTab(new SynapseSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
};