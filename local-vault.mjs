import fs from 'fs/promises';
import path from 'path';

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function getVectorStorePath() {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH || path.join(process.cwd(), 'notes');
    return path.join(vaultPath, '.synapse_vectors.json');
}

/**
 * Saves or updates a document vector embedding in the vault
 */
export async function saveLocalEmbedding(filePath, content, embedding) {
    const storePath = getVectorStorePath();
    let store = [];
    try {
        const raw = await fs.readFile(storePath, 'utf8');
        store = JSON.parse(raw);
    } catch {
        store = [];
    }

    // Normalize path before storing
    const normalizedPath = filePath.replace(/\\/g, '/');
    const existingIdx = store.findIndex(item => item.filePath.replace(/\\/g, '/') === normalizedPath);
    const record = { filePath: normalizedPath, content, embedding, updatedAt: Date.now() };

    if (existingIdx >= 0) {
        store[existingIdx] = record;
    } else {
        store.push(record);
    }

    await fs.writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Queries the vault vector store.
 * Verifies that each referenced file still exists on disk AND is not inside Obsidian's .trash folder.
 * Automatically purges stale/deleted entries.
 */
export async function queryLocalStore(queryEmbedding, topK = 4) {
    const storePath = getVectorStorePath();
    const vaultRoot = process.env.OBSIDIAN_VAULT_PATH || path.join(process.cwd(), 'notes');

    try {
        const raw = await fs.readFile(storePath, 'utf8');
        let store = JSON.parse(raw);

        const validStore = [];
        let hasDeletedFiles = false;

        for (const doc of store) {
            const cleanDocPath = doc.filePath.replace(/\\/g, '/');

            // 1. If in Obsidian's internal .trash folder, treat as deleted
            if (cleanDocPath.includes('/.trash/') || cleanDocPath.startsWith('.trash/')) {
                hasDeletedFiles = true;
                continue;
            }

            const absoluteDocPath = path.isAbsolute(doc.filePath)
                ? doc.filePath
                : path.join(vaultRoot, doc.filePath);

            try {
                await fs.access(absoluteDocPath);
                validStore.push(doc); // File genuinely exists on disk
            } catch {
                hasDeletedFiles = true; // File deleted via Obsidian or File Explorer
            }
        }

        // Persist pruned vector store if deletions were detected
        if (hasDeletedFiles) {
            await fs.writeFile(storePath, JSON.stringify(validStore, null, 2), 'utf8');
            store = validStore;
        }

        if (store.length === 0) {
            return [];
        }

        // Score only remaining valid documents
        const scored = store.map(doc => ({
            filePath: doc.filePath,
            content: doc.content,
            similarity: cosineSimilarity(queryEmbedding, doc.embedding)
        }));

        scored.sort((a, b) => b.similarity - a.similarity);

        // Strict cosine floor to avoid weak hallucinations
        return scored.slice(0, topK).filter(s => s.similarity > 0.15);
    } catch {
        return [];
    }
}

/**
 * Purges vectors matching a deleted or renamed file path
 */
export async function deleteEmbeddingByPath(targetPath) {
    const storePath = getVectorStorePath();
    try {
        const raw = await fs.readFile(storePath, 'utf8');
        let store = JSON.parse(raw);

        const normalizedTarget = targetPath.replace(/\\/g, '/').toLowerCase();

        const updatedStore = store.filter(item => {
            const itemNorm = item.filePath.replace(/\\/g, '/').toLowerCase();
            const isMatch = itemNorm === normalizedTarget ||
                itemNorm.endsWith('/' + normalizedTarget) ||
                normalizedTarget.endsWith('/' + itemNorm);
            return !isMatch;
        });

        await fs.writeFile(storePath, JSON.stringify(updatedStore, null, 2), 'utf8');
    } catch {
        // Store does not exist or is empty
    }
}

/**
 * Resets the entire local vector database
 */
export async function wipeBrainIndex() {
    const storePath = getVectorStorePath();
    await fs.writeFile(storePath, '[]', 'utf8');
}