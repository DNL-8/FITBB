import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from '@google/genai';
import { ApiHttpError } from './firebaseRest.ts';

const GEMINI_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 8_000;

let client: { apiKey: string; instance: GoogleGenAI } | undefined;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  if (client?.apiKey !== apiKey) {
    client = {
      apiKey,
      instance: new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_TIMEOUT_MS } }),
    };
  }
  return client.instance;
}

export async function generateGeminiText(
  ai: GoogleGenAI,
  contents: string,
  config: Pick<GenerateContentConfig, 'systemInstruction' | 'responseMimeType' | 'responseSchema'>,
  maxOutputTokens = 1200
): Promise<string> {
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash',
    contents,
    config: { ...config, maxOutputTokens, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
  });
  const text = response.text?.trim();
  if (!text || text.length > MAX_OUTPUT_CHARS) {
    throw new ApiHttpError(502, 'A resposta do Oráculo ficou vazia ou excedeu o limite.', 'invalid_gemini_reply');
  }
  return text;
}
