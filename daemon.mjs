import fs from 'fs/promises';
import path from 'path';
import chokidar from 'chokidar';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: '.env.local' });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.GEMINI_API_KEY) {
    console.error("Missing keys in .env.local! Check NEXT_PUBLIC_SUPABASE_URL and GEMINI_API_KEY.");
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
const vaultPath = process.env.OBSIDIAN_VAULT_PATH;

async function getEmbedding(text) {
    const result = await embeddingModel.embedContent(text.slice(0, 8000));
    return result.embedding.values;
}

function extractBacklinks(content) {
    const matches = content.match(/\[\[(.*?)\]\]/g) || [];
    return matches.map(m => m.replace(/\[\[\vert{}\]\]/g, '').split('|')[0].trim());
}

async function syncNote(filePath) {
    try {
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(vaultPath, filePath);
        const title = path.basename(filePath, '.md');
        const backlinks = extractBacklinks(rawContent);

        console.log(`[Embedding] Processing [[${title}]] with Gemini...`);
        const embedding = await getEmbedding(rawContent);

        const { error } = await supabase.from('vault_nodes').upsert({
            file_path: relativePath,
            user_id: process.env.USER_ID || 'homesh',
            title,
            content: rawContent,
            embedding,
            backlinks,
            updated_at: new Date().toISOString()
        }, { onConflict: 'file_path' });

        if (error) {
            console.error(`[Supabase Error on ${title}]:`, error.message);
        } else {
            console.log(`✓ Indexed to Cloud Vector DB: [[${title}]]`);
        }
    } catch (err) {
        console.error(`Failed to process ${filePath}:`, err.message);
    }
}

console.log(`=========================================`);
console.log(`  SynapseVault Daemon: ACTIVE            `);
console.log(`  Watching: ${vaultPath}                 `);
console.log(`=========================================`);

const watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: false
});

watcher.on('add', p => {
    if (p.endsWith('.md')) syncNote(p);
});
watcher.on('change', p => {
    if (p.endsWith('.md')) syncNote(p);
});