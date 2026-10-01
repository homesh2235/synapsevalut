// test-key.mjs
let rawKey = process.env.GEMINI_API_KEY || "AQ.Ab8RN6IAZFQh46oaVXZR0nJKNHGgLDDEpA-V639NfcMYdoVmw";
let cleanKey = rawKey.replace(/["'\s]/g, '').trim();

if (cleanKey.includes('AQ.') && cleanKey.startsWith('AIzaSy')) {
    cleanKey = cleanKey.slice(cleanKey.indexOf('AQ.'));
}

console.log('--- Synapse Vault Auth Diagnostic ---');
console.log('Key Prefix :', cleanKey.slice(0, 10) + '...');
console.log('Key Length :', cleanKey.length);

async function findAndTestEmbeddingModel() {
    const versions = ['v1beta', 'v1'];

    for (const ver of versions) {
        console.log(`\n🔍 Checking available models in API version [${ver}]...`);
        const listUrl = `https://generativelanguage.googleapis.com/${ver}/models?key=${encodeURIComponent(cleanKey)}`;

        try {
            const res = await fetch(listUrl);
            const data = await res.json();

            if (!res.ok) {
                console.log(`❌ ${ver} list failed [${res.status}]:`, data.error?.message || data.error?.status);
                continue;
            }

            // Filter for models supporting embedContent
            const embeddingModels = (data.models || []).filter(m =>
                m.supportedGenerationMethods?.includes('embedContent')
            );

            console.log(`Available embedding models in ${ver}:`, embeddingModels.map(m => m.name.replace('models/', '')));

            if (embeddingModels.length > 0) {
                const targetModel = embeddingModels[0].name.replace('models/', '');
                console.log(`\n🚀 Testing embedContent with model: "${targetModel}" on [${ver}]...`);

                const embedUrl = `https://generativelanguage.googleapis.com/${ver}/models/${targetModel}:embedContent?key=${encodeURIComponent(cleanKey)}`;
                const embedRes = await fetch(embedUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: `models/${targetModel}`,
                        content: { parts: [{ text: 'Synapse connection test' }] }
                    })
                });

                const embedData = await embedRes.json();
                if (embedRes.ok && embedData.embedding?.values) {
                    console.log(`\n🎉 SUCCESS! Working configuration found:`);
                    console.log(`-------------------------------------------`);
                    console.log(`API Version : ${ver}`);
                    console.log(`Model Name  : ${targetModel}`);
                    console.log(`Dimensions  : ${embedData.embedding.values.length}`);
                    console.log(`-------------------------------------------`);
                    return;
                } else {
                    console.log(`❌ embedContent failed:`, embedData.error?.message);
                }
            }
        } catch (err) {
            console.log(`Network error on ${ver}:`, err.message);
        }
    }
}

findAndTestEmbeddingModel();