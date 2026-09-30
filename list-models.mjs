import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function check() {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await res.json();

        if (data.error) {
            console.error("API Error:", data.error);
            return;
        }

        console.log("=== Available Text Generation Models ===");
        const textModels = data.models.filter(m => m.supportedGenerationMethods?.includes('generateContent'));
        textModels.forEach(m => console.log(`- ${m.name.replace('models/', '')}`));
    } catch (e) {
        console.error("Fetch failed:", e.message);
    }
}

check();