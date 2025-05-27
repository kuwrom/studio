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
  summary: z.string().optional().describe('A short summary of the video idea, either a title or a one-sentence context, incorporating fetched URL content if applicable.'),
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
      return { content: textContent.substring(0, 15000) }; // Increased limit to capture more content
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
  prompt: `You are an expert in understanding video ideas and creating concise one-line summaries.

User Input: {{{input}}}

If the user's input contains a URL, use the 'fetchUrlContentTool' to retrieve the text content of that URL.
Then, combine the user's original input and any relevant fetched URL content to create a ONE-LINE summary.

IMPORTANT: The summary must be:
- EXACTLY ONE LINE (no line breaks)
- Maximum 100 characters
- A clear, concise title or topic statement
- Not a full sentence description, just a brief topic/title

Examples of good summaries:
- "React Tutorial for Beginners"
- "How to Build a Mobile App"
- "5 Tips for Better Sleep"
- "Machine Learning Explained"

If fetching the URL fails or provides no meaningful content, create the summary based on the user's input alone.
If you cannot determine a summary, ensure the summary field in your output is explicitly empty or not present.`,
});

const summarizeVideoIdeaFlow = ai.defineFlow(
  {
    name: 'summarizeVideoIdeaFlow',
    inputSchema: SummarizeVideoIdeaInputSchema,
    outputSchema: SummarizeVideoIdeaOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output?.summary) { 
      console.warn(
        'AI did not return a valid summary. Input was:',
        input.input,
        'Raw output:',
        output
      );
      return { summary: "Could not get a summary. Try rephrasing or adding more details." };
    }
    return output as SummarizeVideoIdeaOutput;
  }
);
