import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: '.env.local' });

if (!process.env.OBSIDIAN_VAULT_PATH || !process.env.GEMINI_API_KEY) {
    console.error("Missing configuration in .env.local");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const generativeModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

async function getRecentFiles(dir, cutoffMs) {
    let results = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip hidden folders like .obsidian or .git
            if (!entry.name.startsWith('.')) {
                results = results.concat(await getRecentFiles(fullPath, cutoffMs));
            }
        } else if (entry.name.endsWith('.md')) {
            const stats = await fs.stat(fullPath);
            if (stats.mtimeMs >= cutoffMs) {
                results.push({ fullPath, name: entry.name, mtime: stats.mtime });
            }
        }
    }
    return results;
}

async function runDailyReview() {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    const now = new Date();
    const past24Hours = now.getTime() - (24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().split('T')[0];

    console.log(`\n🔍 Scanning vault for notes modified since yesterday...`);
    const recentFiles = await getRecentFiles(vaultPath, past24Hours);

    // Filter out any previous daily reviews to avoid recursive summarizing
    const relevantNotes = recentFiles.filter(f => !f.name.startsWith('Daily Review -'));

    if (relevantNotes.length === 0) {
        console.log("No notes have been created or modified in the last 24 hours.");
        return;
    }

    console.log(`✓ Found ${relevantNotes.length} recent note(s):`);
    const noteContexts = [];
    for (const file of relevantNotes) {
        console.log(`  - ${file.name}`);
        const content = await fs.readFile(file.fullPath, 'utf-8');
        noteContexts.push(`### Note: ${file.name}\n${content}`);
    }

    console.log("\n🧠 Synthesizing executive daily digest with Gemini...");

    const prompt = `
You are the SynapseVault Executive Action Agent.
Below are the raw notes, capture logs, and technical snippets created or modified by the user in their Obsidian vault over the last 24 hours.

Your job is to connect the dots and generate a structured Obsidian Markdown daily briefing for ${todayStr}.

Structure the briefing exactly as:
# 🌅 Daily Action Briefing — ${todayStr}

### 🚀 What Was Built & Accomplished
(Synthesize real outcomes, decisions made, bug fixes, or architecture finalized. Be specific.)

### 💡 Key Technical Insights & Code Snippets
(Highlight notable configurations, tools, models, or workflows discussed.)

### 📌 Open Loops & Next Priorities
(Extract unfinished tasks, pending decisions, or next steps found in the notes. Format as Obsidian checklist items with "- [ ]".)

### 🔗 Context Nodes
(Reference note titles using Obsidian [[WikiLink]] syntax.)

Notes to summarize:
${noteContexts.join('\n\n---\n\n')}
`;

    try {
        const result = await generativeModel.generateContent(prompt);
        const summaryMarkdown = result.response.text();

        const outputDir = path.join(vaultPath, 'Daily Notes');
        await fs.mkdir(outputDir, { recursive: true });

        const outputPath = path.join(outputDir, `Daily Review - ${todayStr}.md`);
        await fs.writeFile(outputPath, summaryMarkdown, 'utf-8');

        console.log(`\n=================== DAILY DIGEST SAVED ===================`);
        console.log(`✓ Created: Daily Notes/Daily Review - ${todayStr}.md`);
        console.log(`⚡ Background daemon will auto-index this review file into Supabase!`);
        console.log(`==========================================================\n`);

    } catch (err) {
        console.error("Daily review generation failed:", err.message || err);
    }
}

runDailyReview();