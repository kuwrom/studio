import { NextRequest } from 'next/server';
import { generateVideoScriptStream } from '@/ai/flows/generate-video-script';

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json();
    const { contextSummary, fullContext, videoForm, videoLength } = body;

    if (!contextSummary) {
      return new Response('Context summary is required', { status: 400 });
    }

    // Create a TransformStream to handle the streaming
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start the async generation
    (async () => {
      try {
        // Stream the script chunks
        for await (const chunk of generateVideoScriptStream({
          contextSummary,
          fullContext,
          videoForm,
          videoLength,
        })) {
          await writer.write(encoder.encode(chunk));
        }
      } catch (error) {
        console.error('Error during script generation:', error);
        await writer.write(encoder.encode('\n\n[Error: Failed to generate script]'));
      } finally {
        await writer.close();
      }
    })();

    // Return the readable stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Error in generate-script stream API:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 