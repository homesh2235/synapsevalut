import fs from 'fs/promises';
import path from 'path';
import screenshot from 'screenshot-desktop';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { matchNotes } from './storage-router.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.local') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
}

const genAI = new GoogleGenerativeAI(apiKey);
const visionModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
const embedModel = genAI.getGenerativeModel({ model: "models/gemini-embedding-001" });

export async function captureAndAutoType() {
    const tempPath = path.join(__dirname, 'temp_act.png');

    try {
        // 1. Capture screen
        await screenshot({ filename: tempPath });
        const imgBuffer = await fs.readFile(tempPath);

        // 2. Identify the intent or visible form fields
        const intentPrompt = `
Analyze this screen capture. The user wants to fill out the form or focused field using their Obsidian vault data.

RULES:
1. If this is a MULTI-FIELD FORM (like Google Forms, application portals, or registration sheets):
   - List the questions/labels of every visible empty or required field in top-to-bottom visual order.
   - Summarize the needed topics into a concise search query (e.g., "full name, college, email, phone, roll number").
2. If this is a SINGLE INPUT or chat field:
   - Identify the single piece of information requested.

Output ONLY a short search query (3 to 10 words) to query the vault. No commentary.
`;

        const intentResult = await visionModel.generateContent([
            intentPrompt,
            {
                inlineData: {
                    data: imgBuffer.toString('base64'),
                    mimeType: 'image/png'
                }
            }
        ]);

        const extractedQuery = intentResult.response.text().trim();
        console.log(`🎯 Form Context Query: "${extractedQuery}"`);

        // 3. Retrieve relevant notes from local vault
        const embedResult = await embedModel.embedContent(extractedQuery);
        const matchedNotes = await matchNotes(embedResult.embedding.values, 5);

        if (!matchedNotes || matchedNotes.length === 0) {
            console.warn("⚠️ No matching notes found in local vault.");
            return ["Information not found in vault."];
        }

        const context = matchedNotes
            .map(n => `[Vault Note: ${n.filePath}]\n${n.content}`)
            .join('\n\n---\n\n');

        // 4. Synthesize answers as an ordered JSON array
        const synthesisPrompt = `
You are SynapseVault's Auto-Filler Agent.
The screen shows an interactive form or input box.
Using ONLY the retrieved vault notes below, provide the answers for the visible form fields IN THE EXACT ORDER they appear on the screen from top to bottom.

VAULT NOTES:
${context}

TARGET FIELDS / CONTEXT:
${extractedQuery}

CRITICAL RULES:
- Output a strict JSON array of strings: ["Value1", "Value2", "Value3"]
- Each entry represents one field to be pasted before tabbing to the next field.
- If it is only a single field, output an array with 1 item: ["Value1"]
- If a value cannot be found in the vault, put an empty string "" so the user can fill it manually without breaking tab order.
- Do NOT wrap in markdown formatting or explanation. Output ONLY the raw JSON array.
`;

        const finalAnswer = await visionModel.generateContent(synthesisPrompt);
        let rawText = finalAnswer.response.text().trim();

        // Clean any markdown wrapper if returned
        if (rawText.startsWith('```json')) {
            rawText = rawText.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (rawText.startsWith('```')) {
            rawText = rawText.replace(/^```/, '').replace(/```$/, '').trim();
        }

        let fieldValues = [];
        try {
            fieldValues = JSON.parse(rawText);
            if (!Array.isArray(fieldValues)) {
                fieldValues = [String(fieldValues)];
            }
        } catch {
            // Fallback if not pure JSON
            fieldValues = [rawText];
        }

        console.log(`⚡ Form Sequence to Fill:`, fieldValues);
        return fieldValues;

    } finally {
        await fs.unlink(tempPath).catch(() => { });
    }
}