import { queryLocalStore } from './local-vault.mjs';

// Clean and sanitize the key
const rawKey = process.env.GEMINI_API_KEY || '';
let cleanKey = rawKey.replace(/["'\s]/g, '').trim();
if (cleanKey.includes('AQ.') && cleanKey.startsWith('AIzaSy')) {
    cleanKey = cleanKey.slice(cleanKey.indexOf('AQ.'));
}

if (!cleanKey) {
    console.error('Missing or invalid GEMINI_API_KEY environment variable.');
}

/**
 * Universal Gemini API caller
 */
async function callGemini(endpoint, body, version = 'v1beta') {
    const url = `https://generativelanguage.googleapis.com/${version}/${endpoint}?key=${encodeURIComponent(cleanKey)}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`[${res.status}] ${data.error?.message || JSON.stringify(data)}`);
    }
    return data;
}

/**
 * Generates embeddings
 */
async function getQueryEmbedding(text) {
    // Try embedding call using the verified working route
    try {
        const data = await callGemini('models/text-embedding-004:embedContent', {
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] }
        }, 'v1');
        return data.embedding.values;
    } catch (err) {
        // Fallback if your discovered model was gemini-embedding-001
        const data = await callGemini('models/gemini-embedding-001:embedContent', {
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text }] }
        }, 'v1beta');
        return data.embedding.values;
    }
}

/**
 * Handles RAG query against the local Obsidian vault
 */
export async function askVault(userQuery) {
    if (!cleanKey) {
        return 'Gemini API key is not configured. Please add it in Synapse settings.';
    }

    try {
        const queryVector = await getQueryEmbedding(userQuery);
        const contextDocs = await queryLocalStore(queryVector, 4);

        // Hard guard: No matching content in vault
        if (!contextDocs || contextDocs.length === 0) {
            return "I don't have any notes or records regarding that in your vault.";
        }

        const vaultContext = contextDocs
            .map(doc => `[Source: ${doc.filePath}]\n${doc.content}`)
            .join('\n\n---\n\n');

        const prompt = `You are Synapse Vault AI, a local assistant for Obsidian.
Answer the user's inquiry strictly and solely using the provided Vault Context.
Rules:
1. If the information is not explicitly found in the Vault Context, state verbatim: "I don't have any record of that in your vault."
2. Do not use outside knowledge or hallucinate details.
3. Keep answers concise, factual, and direct.

--- VAULT CONTEXT ---
${vaultContext}

User Question: ${userQuery}`;

        const data = await callGemini('models/gemini-1.5-flash:generateContent', {
            contents: [{ parts: [{ text: prompt }] }]
        }, 'v1beta');

        return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    } catch (error) {
        console.error('Error during askVault execution:', error);
        return `Error processing query: ${error.message}`;
    }
}

// Standalone CLI testing execution
if (process.argv[1]?.endsWith('ask.mjs')) {
    const query = process.argv.slice(2).join(' ') || 'What is the emergency contact bypass code for Dr. Chloe Lin?';
    console.log(`🔎 Querying vault: "${query}"...`);
    askVault(query).then(ans => {
        console.log('\n--- Agent Response ---');
        console.log(ans);
    });
}