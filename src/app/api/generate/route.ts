import { NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { prisma } from '@/lib/db';
import { SYSTEM_PROMPT, createAIClient } from '@/lib/fast-agent-config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, projectId } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const minimax = createAIClient();

    // Fetch context if projectId provided
    let contextFiles: Record<string, string> = {};
    let isEdit = false;

    if (projectId) {
      const latestFragment = await prisma.fragment.findFirst({
        where: { message: { projectId } },
        orderBy: { createdAt: "desc" },
      });
      if (latestFragment && latestFragment.files) {
        contextFiles = latestFragment.files as Record<string, string>;
        isEdit = true;
      }
    }

    // Build context prompt
    const contextParts: string[] = [];

    if (Object.keys(contextFiles).length > 0) {
        contextParts.push('\n### Current File List:');
        for (const path of Object.keys(contextFiles)) {
            contextParts.push(`- ${path}`);
        }

        contextParts.push('\n### Current File Contents:');
        for (const [path, content] of Object.entries(contextFiles)) {
             // Truncate huge files if needed
            contextParts.push(`\n<file path="${path}">\n${content}\n</file>`);
        }
    }

    if (isEdit) {
        contextParts.push('\nEDIT MODE ACTIVE');
        contextParts.push('This is an incremental update to an existing application.');
        contextParts.push('DO NOT regenerate App.jsx, index.css, or other core files unless explicitly requested.');
        contextParts.push('ONLY create or modify the specific files needed for the user\'s request.');
    } else {
         contextParts.push('\n🎨 FIRST GENERATION MODE - CREATE SOMETHING BEAUTIFUL!');
         contextParts.push('\nThis is the user\'s FIRST experience. Make it impressive:');
         contextParts.push('1. **USE TAILWIND PROPERLY** - Use standard Tailwind color classes');
         contextParts.push('2. **NO PLACEHOLDERS** - Use real content, not lorem ipsum');
         contextParts.push('3. **COMPLETE COMPONENTS** - Header, Hero, Features, Footer minimum');
         contextParts.push('4. **VISUAL POLISH** - Shadows, hover states, transitions');
         contextParts.push('5. **STANDARD CLASSES** - bg-white, text-gray-900, bg-blue-500, NOT bg-background');
    }

    const fullPrompt = `CONTEXT:\n${contextParts.join('\n')}\n\nUSER REQUEST:\n${prompt}`;

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    const sendProgress = async (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        await writer.write(encoder.encode(message));
    };

    (async () => {
        try {
            await sendProgress({ type: 'status', message: 'Generating code...' });

            const result = await streamText({
                model: minimax('MiniMax-M2'),
                messages: [
                    {
                        role: 'system',
                        content: SYSTEM_PROMPT + `\n\n🚨 CRITICAL CODE GENERATION RULES - VIOLATION = FAILURE 🚨:
1. NEVER truncate ANY code - ALWAYS write COMPLETE files
2. NEVER use "..." anywhere in your code - this causes syntax errors
3. NEVER cut off strings mid-sentence - COMPLETE every string
4. NEVER leave incomplete class names or attributes
5. ALWAYS close ALL tags, quotes, brackets, and parentheses
6. If you run out of space, prioritize completing the current file

CRITICAL STRING RULES TO PREVENT SYNTAX ERRORS:
- NEVER write: className="px-8 py-4 bg-black text-white font-bold neobrut-border neobr...
- ALWAYS write: className="px-8 py-4 bg-black text-white font-bold neobrut-border neobrut-shadow"
- COMPLETE every className attribute
- COMPLETE every string literal
- NO ellipsis (...) ANYWHERE in code
`
                    },
                    {
                        role: 'user',
                        content: fullPrompt + `

CRITICAL: You MUST complete EVERY file you start. If you write:
<file path="src/components/Hero.jsx">

You MUST include the closing </file> tag and ALL the code in between.
`
                    }
                ],
                temperature: 0.7,
                // maxTokens removed to fix build error
            });

            for await (const textPart of result.textStream) {
                await sendProgress({ type: 'stream', text: textPart });
            }

            await sendProgress({ type: 'complete' });
        } catch (e: any) {
            console.error("Stream error:", e);
            await sendProgress({ type: 'error', error: e.message });
        } finally {
            await writer.close();
        }
    })();

    return new Response(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
