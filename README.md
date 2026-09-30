# Synapse Vault AI 🧠⚡

> A local-first, Dynamic Island AI copilot for Obsidian with multimodal screen indexing and automated multi-field form traversal.

Synapse Vault connects an intelligent floating Dynamic Island to your Obsidian vault. Capture any screen context into structured Markdown, chat privately with your notes using local semantic search, and automatically fill web forms using the data stored in your second brain.

---

## Features

- **Floating Dynamic Island:** Unobtrusive, hardware-accelerated desktop overlay designed to stay out of the way until needed.
- **Ghost-Typer (`Alt + F`):** Reads the current active window or Google Form, finds the matching facts in your Obsidian vault, and automatically pastes and tabs through the fields.
- **Universal Screen Snap (`Alt + S`):** Captures any visible text, documentation, table, or code snippet directly into structured Markdown notes inside your vault.
- **Local-First & Private:** Embeddings and notes are stored locally in your vault (`.synapse_vectors.json`). Your data never touches an external database.
- **Semantic Vault Search:** Query your knowledge base conversationally via the floating drawer powered by Gemini 3.1 Flash-Lite.

---

##  Quick Start

### 1. Installation
Clone this repository into your Obsidian plugins folder:
\`\`\`bash
cd "<Your-Obsidian-Vault>/.obsidian/plugins/"
git clone https://github.com/yourusername/synapse-vault.git
cd synapse-vault
npm install
\`\`\`

### 2. Configuration
1. Open Obsidian $\rightarrow$ **Settings** $\rightarrow$ **Community Plugins** and enable **Synapse Vault AI**.
2. Open Synapse Settings:
   - Paste your **Gemini API Key** (used for local embeddings and visual extraction).
3. Click the **Sparkles** icon in the Obsidian ribbon to launch the Dynamic Island.

---

## ⌨️ Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Alt + S` | **Screen Snap** | Transcribes screen content and indexes it into your local vault. |
| `Alt + F` | **Ghost-Typer** | Synthesizes vault data and auto-fills the focused field or form. |
| `Click Pill` | **Chat Drawer** | Expand the floating chat drawer to query your second brain directly. |

---

## 💎 Pricing & Plans

Synapse Vault operates on a transparent freemium model:

- **Free Tier (Default):**
  - Unlimited local semantic search & chat.
  - 15 Free Screen Snaps (`Alt + S`).
  - 10 Free Ghost-Type Form Automations (`Alt + F`).
  - 100% private, local storage inside your vault.

- **Pro Tier ($39 Lifetime / $6 Monthly):**
  - Unlimited Screen Snaps.
  - Unlimited Ghost-Typer form fillings.
  - Optional Multi-Device Synapse Cloud Sync.
  - [Get a Synapse Pro License Key](https://synapse.lemonsqueezy.com)

---

## Tech Stack

- **Platform:** Obsidian Plugin API, Electron
- **AI Models:** Google Gemini 3.1 Flash-Lite, Gemini Embedding 001
- **Vector Search:** Local Cosine Similarity Vector Store
- **OS Automation:** Windows Script Host (WSH Keystroke Traversal)

---

## 📄 License

MIT License. Designed and built for the Obsidian community.