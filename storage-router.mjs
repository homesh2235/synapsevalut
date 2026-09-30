import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// --- Local Cosine Similarity ---
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
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

function getSupabaseClient() {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    }
    return null;
}

/**
 * Saves note embedding locally, and mirrors to Supabase if Cloud Sync is enabled.
 */
export async function saveEmbedding(filePath, content, embedding) {
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
    console.log('💾 Indexed to local vault storage.');

    // Optional: Cloud Sync for Pro users
    const isCloudSyncEnabled = process.env.SYNAPSE_CLOUD_SYNC === 'true';
    const supabase = getSupabaseClient();
    if (isCloudSyncEnabled && supabase) {
        try {
            const { error } = await supabase.from('vault_notes').insert({
                file_path: filePath,
                content,
                embedding
            });
            if (error) console.warn('⚠️ Supabase Cloud Sync warning:', error.message);
            else console.log('☁️ Synced to Synapse Cloud (Supabase).');
        } catch (e) {
            console.warn('⚠️ Cloud Sync bypassed (offline or config missing).');
        }
    }
}

/**
 * Retrieves top matching notes. Reads locally first; falls back to cloud if enabled and local is empty.
 */
export async function matchNotes(queryEmbedding, topK = 4) {
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
        const localMatches = scored.slice(0, topK).filter(s => s.similarity > 0.10);

        if (localMatches.length > 0) return localMatches;
    } catch { }

    // Cloud fallback if local cache is empty or user is on a new device
    const isCloudSyncEnabled = process.env.SYNAPSE_CLOUD_SYNC === 'true';
    const supabase = getSupabaseClient();
    if (isCloudSyncEnabled && supabase) {
        const { data } = await supabase.rpc('match_notes', {
            query_embedding: queryEmbedding,
            match_threshold: 0.15,
            match_count: topK
        });
        if (data && data.length > 0) {
            return data.map(d => ({ filePath: d.file_path, content: d.content }));
        }
    }

    return [];
}