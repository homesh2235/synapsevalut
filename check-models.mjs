import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: '.env.local' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function list() {
  try {
    const response = await ai.models.list();
    console.log("=== Available Models on Your Key ===");
    for await (const model of response) {
      if (model.name.includes('embed')) {
        console.log(`- ${model.name} (Supported: ${model.supportedActions || model.supportedGenerationMethods})`);
      }
    }
  } catch (err) {
    console.error("List failed:", err.message);
  }
}

list();