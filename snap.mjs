import fs from 'fs/promises';
import path from 'path';
import screenshot from 'screenshot-desktop';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { saveEmbedding } from './storage-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.local') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ Missing GEMINI_API_KEY in .env.local");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const visionModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
const embedModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

async function snapAndSave() {
    const tempPath = path.join(__dirname, 'temp_capture.png');

    try {
        await screenshot({ filename: tempPath });
        const imgBuffer = await fs.readFile(tempPath);

        const prompt = `
You are SynapseVault's Universal Knowledge Engine.
Extract the exact visible text, data, code, and values from the screen into clean Obsidian Markdown.

- Transcribe names, colleges, credentials, code, and tables verbatim.
- No meta-commentary like "The user is typing".
- Output ONLY the markdown content.
`;

        const result = await visionModel.generateContent([
            prompt,
            {
                inlineData: {
                    data: imgBuffer.toString('base64'),
                    mimeType: 'image/png'
                }
            }
        ]);

        const markdownContent = result.response.text().trim();
        const vaultPath = process.env.OBSIDIAN_VAULT_PATH || path.join(__dirname, 'notes');
        await fs.mkdir(vaultPath, { recursive: true });

        const date = new Date();
        const dateTag = date.toISOString().split('T')[0];
        const timeTag = date.toTimeString().split(' ')[0].replace(/:/g, '-');
        const noteFileName = `Synapse_${dateTag}_${timeTag}.md`;
        const targetFilePath = path.join(vaultPath, noteFileName);

        await fs.writeFile(targetFilePath, markdownContent, 'utf8');
        console.log(`✅ Saved note: ${noteFileName}`);

        // Generate embedding & route to local storage (and cloud if enabled)
        const embedResult = await embedModel.embedContent(markdownContent);
        await saveEmbedding(noteFileName, markdownContent, embedResult.embedding.values);

    } catch (err) {
        console.error("❌ Capture engine error:", err);
        process.exit(1);
    } finally {
        await fs.unlink(tempPath).catch(() => { });
    }
}

snapAndSave();