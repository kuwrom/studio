'use server';

/**
 * @fileOverview An AI agent that summarizes a user's video idea into a short title or one-sentence context.
 *
 * - summarizeVideoIdea - A function that handles the video idea summarization process.
 * - SummarizeVideoIdeaInput - The input type for the summarizeVideoIdea function.
 * - SummarizeVideoIdeaOutput - The return type for the summarizeVideoIdea function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeVideoIdeaInputSchema = z.object({
  input: z.string().describe('The user input, either voice or text, describing the video idea.'),
});
export type SummarizeVideoIdeaInput = z.infer<typeof SummarizeVideoIdeaInputSchema>;

const SummarizeVideoIdeaOutputSchema = z.object({
  summary: z.string().describe('A short summary of the video idea, either a title or a one-sentence context.'),
});
export type SummarizeVideoIdeaOutput = z.infer<typeof SummarizeVideoIdeaOutputSchema>;

export async function summarizeVideoIdea(input: SummarizeVideoIdeaInput): Promise<SummarizeVideoIdeaOutput> {
  return summarizeVideoIdeaFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeVideoIdeaPrompt',
  input: {schema: SummarizeVideoIdeaInputSchema},
  output: {schema: SummarizeVideoIdeaOutputSchema},
  prompt: `You are an expert in understanding video ideas and summarizing them concisely.\n\n  Given the following user input, provide a short summary of the video idea. This should be either a title for the video or a one-sentence context describing the video's topic.\n\n  User Input: {{{input}}}`,
});

const summarizeVideoIdeaFlow = ai.defineFlow(
  {
    name: 'summarizeVideoIdeaFlow',
    inputSchema: SummarizeVideoIdeaInputSchema,
    outputSchema: SummarizeVideoIdeaOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
