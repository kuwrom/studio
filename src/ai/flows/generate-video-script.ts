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
  const prompt = `You are an expert video script writer. Based on the following context, generate a full video script.

Context: ${input.contextSummary}

Please consider the following preferences for the video:
- Video Form: ${input.videoForm || 'long-form'} (If 'short-form', prioritize conciseness and a hook suitable for platforms like TikTok or YouTube Shorts. If 'long-form', allow for more detail and depth.)
- Desired Length: ${input.videoLength || 'Medium (3-5 mins)'} (Adapt the script's depth and number of scenes. For example, if the desired length is 'Short (1-3 mins)', aim for content that fits that duration. If 'Very Long (10+ mins)', create a more extensive script.)

Provide a detailed and engaging video script suitable for the specified form and length.`;

  const { stream } = await ai.generateStream({
    prompt,
    config: {
      temperature: 0.8,
      maxOutputTokens: 2048,
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
  const prompt = `You are an expert video script writer. Based on the following context, generate a full video script.

Context: ${input.contextSummary}

Please consider the following preferences for the video:
- Video Form: ${input.videoForm || 'long-form'} (If 'short-form', prioritize conciseness and a hook suitable for platforms like TikTok or YouTube Shorts. If 'long-form', allow for more detail and depth.)
- Desired Length: ${input.videoLength || 'Medium (3-5 mins)'} (Adapt the script's depth and number of scenes. For example, if the desired length is 'Short (1-3 mins)', aim for content that fits that duration. If 'Very Long (10+ mins)', create a more extensive script.)

Provide a detailed and engaging video script suitable for the specified form and length.`;

  const { text } = await ai.generate({
    prompt,
    config: {
      temperature: 0.8,
      maxOutputTokens: 2048,
    }
  });

  return {
    script: text || '',
    progress: 'Generated a detailed video script based on the context and preferences.',
  };
}

