import fs from 'fs/promises';
import path from 'path';

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecA[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getVectorStorePath() {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH || path.join(process.cwd(), 'notes');
    return path.join(vaultPath, '.synapse_vectors.json');
}

export async function saveLocalEmbedding(filePath, content, embedding) {
    const storePath = getVectorStorePath();
    let store = [];
    try {
        const raw = await fs.readFile(storePath, 'utf8');
        store = JSON.parse(raw);
    } catch {
        store = [];
    }

    const existingIdx = store.findIndex(item => item.filePath === filePath);
    if (existingIdx >= 0) {
        store[existingIdx] = { filePath, content, embedding, updatedAt: Date.now() };
    } else {
        store.push({ filePath, content, embedding, updatedAt: Date.now() });
    }

    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
    console.log('💾 Stored vector embedding in vault.');
}

export async function queryLocalStore(queryEmbedding, topK = 4) {
    const storePath = getVectorStorePath();
    try {
        const raw = await fs.readFile(storePath, 'utf8');
        const store = JSON.parse(raw);

        const scored = store.map(doc => ({
            filePath: doc.filePath,
            content: doc.content,
            similarity: cosineSimilarity(queryEmbedding, doc.embedding)
        }));

        scored.sort((a, b) => b.similarity - a.similarity);
        return scored.slice(0, topK).filter(s => s.similarity > 0.10);
    } catch {
        return [];
    }
}