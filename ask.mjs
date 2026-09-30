import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchNotes } from './storage-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.local') });

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    console.error("❌ Missing GEMINI_API_KEY in .env.local");
}

const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
const embedModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

export async function askVault(queryText) {
    try {
        const embedResult = await embedModel.embedContent(queryText);
        const queryEmbedding = embedResult.embedding.values;

        const matchedNotes = await matchNotes(queryEmbedding, 4);

        if (!matchedNotes || matchedNotes.length === 0) {
            return "I couldn't find any relevant notes in your Obsidian vault.";
        }

        const context = matchedNotes
            .map(n => `[Note: ${n.filePath}]\n${n.content}`)
            .join('\n\n---\n\n');

        const prompt = `
You are the SynapseVault Second Brain Assistant.
Answer the user's question accurately using ONLY the verified facts from their Obsidian vault notes below.

CRITICAL DIRECTIVES:
- If the vault notes contain the answer, provide it directly, concisely, and factually.
- If the notes don't have the answer, reply: "I don't have records for that in your vault."
- Do NOT hallucinate.

RETRIEVED VAULT NOTES:
${context}

USER QUESTION:
${queryText}

ANSWER:
`;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();

    } catch (err) {
        console.error("❌ askVault error:", err);
        return `Query failed: ${err.message}`;
    }
}

if (process.argv[2]) {
    askVault(process.argv.slice(2).join(' ')).then(console.log);
}