import assert from 'node:assert/strict';
import test from 'node:test';
import type { GoogleGenAI } from '@google/genai';
import { generateGeminiText } from '../src/server/gemini.ts';

test('a geração limita o custo da resposta e rejeita uma resposta vazia', async (t) => {
  const models = {
    generateContent: async (_request: Parameters<GoogleGenAI['models']['generateContent']>[0]) => ({
      text: '  Texto do provedor  ',
    }),
  };
  const generate = t.mock.method(models, 'generateContent');
  const client = { models } as unknown as GoogleGenAI;
  const config = { systemInstruction: 'Analise os dados recebidos.' };
  assert.equal(await generateGeminiText(client, '{}', config), 'Texto do provedor');
  assert.equal(generate.mock.calls[0].arguments[0].config?.maxOutputTokens, 1200);

  generate.mock.mockImplementation(async () => ({ text: ' ' }));
  await assert.rejects(generateGeminiText(client, '{}', config), { code: 'invalid_gemini_reply' });
});
