
'use server';

/**
 * @fileOverview An AI agent that summarizes a user's video idea into a short title or one-sentence context.
 * It can also fetch content from URLs provided in the input.
 *
 * - summarizeVideoIdea - A function that handles the video idea summarization process.
 * - SummarizeVideoIdeaInput - The input type for the summarizeVideoIdea function.
 * - SummarizeVideoIdeaOutput - The return type for the summarizeVideoIdea function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeVideoIdeaInputSchema = z.object({
  input: z.string().describe('The user input, either voice or text, describing the video idea. This may include URLs.'),
});
export type SummarizeVideoIdeaInput = z.infer<typeof SummarizeVideoIdeaInputSchema>;

const SummarizeVideoIdeaOutputSchema = z.object({
  summary: z.string().describe('A short summary of the video idea, either a title or a one-sentence context, incorporating fetched URL content if applicable.'),
});
export type SummarizeVideoIdeaOutput = z.infer<typeof SummarizeVideoIdeaOutputSchema>;

// Schema for the fetch URL content tool
const FetchUrlContentInputSchema = z.object({
  url: z.string().url().describe('The URL to fetch content from.'),
});
const FetchUrlContentOutputSchema = z.object({
  content: z.string().optional().describe('The fetched text content from the URL.'),
  error: z.string().optional().describe('An error message if fetching failed.'),
});

// Genkit tool to fetch content from a URL
const fetchUrlContentTool = ai.defineTool(
  {
    name: 'fetchUrlContentTool',
    description: 'Fetches the text content from a given URL. Use this tool if the user provides a web link and you need to understand its content to incorporate into the video idea.',
    inputSchema: FetchUrlContentInputSchema,
    outputSchema: FetchUrlContentOutputSchema,
  },
  async (input) => {
    try {
      const response = await fetch(input.url);
      if (!response.ok) {
        return { error: `Failed to fetch URL: ${response.status} ${response.statusText}` };
      }
      const html = await response.text();
      // Basic HTML to text conversion: strip HTML tags and clean up whitespace
      const textContent = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
                               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
                               .replace(/<[^>]+>/g, ' ') // Remove all other HTML tags, leaving spaces
                               .replace(/\s\s+/g, ' ') // Replace multiple spaces with single space
                               .trim();
      
      if (!textContent) {
        return { error: 'No meaningful text content found at the URL.' };
      }
      return { content: textContent.substring(0, 5000) }; // Limit content length
    } catch (error: any) {
      return { error: `Error fetching or parsing URL: ${error.message}` };
    }
  }
);

export async function summarizeVideoIdea(input: SummarizeVideoIdeaInput): Promise<SummarizeVideoIdeaOutput> {
  return summarizeVideoIdeaFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeVideoIdeaPrompt',
  input: {schema: SummarizeVideoIdeaInputSchema},
  output: {schema: SummarizeVideoIdeaOutputSchema},
  tools: [fetchUrlContentTool], // Make the tool available to the prompt
  prompt: `You are an expert in understanding video ideas and summarizing them concisely.

User Input: {{{input}}}

If the user's input contains a URL, use the 'fetchUrlContentTool' to retrieve the text content of that URL.
Then, combine the user's original input and any relevant fetched URL content to provide a short summary of the video idea.
This summary should be either a title for the video or a one-sentence context describing the video's topic.
If fetching the URL fails, returns an error, or provides no meaningful content, summarize based on the user's input alone and briefly mention that the URL could not be fully processed.
Ensure the final summary is concise and directly reflects the core idea.`,
});

const summarizeVideoIdeaFlow = ai.defineFlow(
  {
    name: 'summarizeVideoIdeaFlow',
    inputSchema: SummarizeVideoIdeaInputSchema,
    outputSchema: SummarizeVideoIdeaOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);
