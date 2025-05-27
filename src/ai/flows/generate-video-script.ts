'use server';

/**
 * @fileOverview Video script generation flow with streaming support.
 *
 * - generateVideoScript - A function that generates a video script based on a summarized context.
 * - generateVideoScriptStream - A function that streams video script generation.
 * - GenerateVideoScriptInput - The input type for the generateVideoScript function.
 * - GenerateVideoScriptOutput - The return type for the generateVideoScript function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateVideoScriptInputSchema = z.object({
  contextSummary: z
    .string()
    .describe('A short summary (title or one-sentence context) of the video idea.'),
  fullContext: z
    .string()
    .optional()
    .describe('The full conversation history including all user inputs, fetched URL content, and detailed descriptions.'),
  videoForm: z.enum(['long-form', 'short-form']).optional().describe("The desired form of the video, e.g., 'long-form' for detailed content or 'short-form' for concise, punchy content like for TikTok or YouTube Shorts."),
  videoLength: z.string().optional().describe("The desired length of the video, typically a label describing a minute range (e.g., 'Short (1-3 mins)', 'Medium (3-5 mins)', 'Very Long (10+ mins)'). The AI will adapt the script based on this description.")
});
export type GenerateVideoScriptInput = z.infer<typeof GenerateVideoScriptInputSchema>;

const GenerateVideoScriptOutputSchema = z.object({
  script: z.string().describe('The full video script.'),
  progress: z.string().describe('Progress of script generation'),
});
export type GenerateVideoScriptOutput = z.infer<typeof GenerateVideoScriptOutputSchema>;

// Streaming function that returns an async generator
export async function* generateVideoScriptStream(input: GenerateVideoScriptInput) {
  const prompt = `Create a video script about: ${input.contextSummary}

Video type: ${input.videoForm || 'long-form'}
Target length: ${input.videoLength || 'Medium (3-5 mins)'}

Write a natural, conversational script that someone can read while recording their video. Output only the script itself - no introductions, explanations, or closing notes.`;

  const { stream } = await ai.generateStream({
    prompt,
    config: {
      temperature: 0.8,
      maxOutputTokens: 4096,
    }
  });

  // Stream the text chunks as they arrive
  for await (const chunk of stream) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

// Keep the non-streaming version for backward compatibility
export async function generateVideoScript(input: GenerateVideoScriptInput): Promise<GenerateVideoScriptOutput> {
  const prompt = `Create a video script about: ${input.contextSummary}

Video type: ${input.videoForm || 'long-form'}
Target length: ${input.videoLength || 'Medium (3-5 mins)'}

Write a natural, conversational script that someone can read while recording their video. Output only the script itself - no introductions, explanations, or closing notes.`;

  const { text } = await ai.generate({
    prompt,
    config: {
      temperature: 0.8,
      maxOutputTokens: 4096,
    }
  });

  return {
    script: text || '',
    progress: 'Generated a detailed video script based on the context and preferences.',
  };
}

