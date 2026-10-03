const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');

const LEMON_API_BASE = 'https://api.lemonsqueezy.com/v1/licenses';

class SynapseDynamicIsland {
    constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        this.islandEl = null;
        this.isExpanded = false;
    }

    mount() {
        if (document.getElementById('synapse-dynamic-island')) return;

        this.islandEl = createDiv({ cls: 'synapse-dynamic-island', attr: { id: 'synapse-dynamic-island' } });
        Object.assign(this.islandEl.style, {
            position: 'fixed',
            top: '18px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '9999',
            backgroundColor: '#09090b',
            color: '#f4f4f5',
            borderRadius: '24px',
            padding: '8px 20px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            cursor: 'pointer',
            maxWidth: '90vw',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            fontFamily: 'var(--font-interface)'
        });

        this.renderCollapsed();
        document.body.appendChild(this.islandEl);
    }

    renderCollapsed(label = 'Synapse Vault Agent') {
        this.isExpanded = false;
        this.islandEl.empty();
        this.islandEl.style.width = 'auto';
        this.islandEl.style.flexDirection = 'row';

        const dot = this.islandEl.createDiv();
        Object.assign(dot.style, {
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            backgroundColor: this.plugin.settings.isPro ? '#38bdf8' : '#22c55e'
        });

        const text = this.islandEl.createSpan({ text: label });
        text.style.fontSize = '12px';
        text.style.fontWeight = '600';

        const shortcutHint = this.islandEl.createSpan({ text: 'Alt+S' });
        Object.assign(shortcutHint.style, {
            fontSize: '10px',
            opacity: '0.5',
            padding: '2px 6px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '4px'
        });

        this.islandEl.onclick = () => this.expand();
    }

    expand() {
        if (this.isExpanded) return;
        this.isExpanded = true;
        this.islandEl.empty();
        this.islandEl.style.width = '480px';
        this.islandEl.style.flexDirection = 'column';
        this.islandEl.style.borderRadius = '16px';
        this.islandEl.style.padding = '16px';

        const header = this.islandEl.createDiv();
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.width = '100%';

        const title = header.createSpan({
            text: this.plugin.settings.isPro ? '✦ Synapse Agent [PRO]' : '✦ Synapse Agent [Free Tier]'
        });
        title.style.fontWeight = '700';
        title.style.fontSize = '13px';

        const closeBtn = header.createSpan({ text: '✕' });
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.renderCollapsed();
        };

        const input = this.islandEl.createEl('input', {
            type: 'text',
            placeholder: 'Ask Synapse Agent anything about your vault...'
        });
        Object.assign(input.style, {
            width: '100%',
            margin: '12px 0 8px 0',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backgroundColor: '#18181b',
            color: '#fff',
            outline: 'none',
            fontSize: '13px'
        });
        setTimeout(() => input.focus(), 50);

        const output = this.islandEl.createDiv();
        Object.assign(output.style, {
            width: '100%',
            fontSize: '12px',
            lineHeight: '1.6',
            color: '#d4d4d8',
            maxHeight: '220px',
            overflowY: 'auto'
        });

        input.onkeydown = async (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                const query = input.value.trim();
                if (!this.plugin.settings.geminiApiKey) {
                    new Notice('Please configure your Gemini API Key in Synapse Settings.');
                    return;
                }

                output.setText('Agent scanning vault context...');
                try {
                    const files = this.app.vault.getMarkdownFiles();
                    const limit = this.plugin.settings.isPro ? files.length : Math.min(files.length, 5);
                    let context = '';

                    for (let i = 0; i < limit; i++) {
                        const content = await this.app.vault.cachedRead(files[i]);
                        context += `\n---\nNote: ${files[i].basename}\n${content.slice(0, 1000)}`;
                        if (context.length > 12000) break;
                    }

                    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.plugin.settings.geminiModel}:generateContent?key=${this.plugin.settings.geminiApiKey}`;
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: `You are Synapse Vault Agent. Answer based on these notes:\n\n${context}\n\nUser Question: ${query}`
                                }]
                            }]
                        })
                    });

                    const data = await res.json();
                    output.setText(data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response returned.');
                } catch (err) {
                    output.setText(`Agent error: ${err.message}`);
                }
            }
        };
    }

    destroy() {
        this.islandEl?.remove();
    }
}

module.exports = class SynapseVaultPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        // Mount Dynamic Island UI
        this.island = new SynapseDynamicIsland(this.app, this);
        this.island.mount();

        // Alt + S Command
        this.addCommand({
            id: 'synapse-agent-search',
            name: 'Ask Synapse Agent',
            hotkeys: [{ modifiers: ['Alt'], key: 's' }],
            callback: () => {
                this.island.expand();
            }
        });

        // Alt + F Command
        this.addCommand({
            id: 'synapse-toggle-island',
            name: 'Toggle Dynamic Island',
            hotkeys: [{ modifiers: ['Alt'], key: 'f' }],
            callback: () => {
                if (this.island.islandEl.style.display === 'none') {
                    this.island.islandEl.style.display = 'flex';
                } else {
                    this.island.islandEl.style.display = 'none';
                }
            }
        });

        this.addRibbonIcon('sparkles', 'Synapse Agent', () => {
            this.island.expand();
        });

        this.addSettingTab(new SynapseSettingTab(this.app, this));
    }

    onunload() {
        this.island?.destroy();
    }

    async loadSettings() {
        this.settings = Object.assign({
            geminiApiKey: '',
            geminiModel: 'gemini-1.5-flash',
            isPro: false,
            licenseKey: '',
            checkoutUrl: 'https://lemonsqueezy.com'
        }, await this.loadData());
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
        containerEl.createEl('h2', { text: 'Synapse Vault AI Settings' });

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Enter your Google Gemini API key')
            .addText((text) =>
                text
                    .setPlaceholder('AIzaSy...')
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (v) => {
                        this.plugin.settings.geminiApiKey = v.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Pro License Key')
            .setDesc('Lemon Squeezy license key for Pro tier')
            .addText((text) =>
                text
                    .setPlaceholder('Enter license key')
                    .setValue(this.plugin.settings.licenseKey)
                    .onChange(async (v) => {
                        this.plugin.settings.licenseKey = v.trim();
                        await this.plugin.saveSettings();
                    })
            )
            .addButton((btn) =>
                btn.setButtonText(this.plugin.settings.isPro ? 'Pro Active' : 'Activate Pro').onClick(async () => {
                    this.plugin.settings.isPro = true;
                    await this.plugin.saveSettings();
                    new Notice('Synapse Pro Tier Unlocked!');
                    this.display();
                })
            );
    }
}