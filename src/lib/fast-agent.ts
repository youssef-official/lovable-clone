import { streamText } from 'ai';
import { SYSTEM_PROMPT, createAIClient } from './fast-agent-config';

export async function generateCodeFast(input: {
    prompt: string;
    files: Record<string, string>;
    isEdit: boolean;
    conversationHistory?: { role: 'user' | 'assistant', content: string }[];
}) {
    const minimax = createAIClient();

    // Build context prompt
    const contextParts: string[] = [];

    // Add file context
    if (Object.keys(input.files).length > 0) {
        contextParts.push('\n### Current File List:');
        for (const path of Object.keys(input.files)) {
            contextParts.push(`- ${path}`);
        }

        contextParts.push('\n### Current File Contents:');
        for (const [path, content] of Object.entries(input.files)) {
            // Truncate huge files if needed, but for now we trust the context size of M2
            contextParts.push(`\n<file path="${path}">\n${content}\n</file>`);
        }
    }

    // Add conversation history
    if (input.conversationHistory && input.conversationHistory.length > 0) {
        contextParts.push('\n### Conversation History:');
        for (const msg of input.conversationHistory) {
             contextParts.push(`\n${msg.role.toUpperCase()}: ${msg.content}`);
        }
    }

    if (input.isEdit) {
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

    const fullPrompt = `CONTEXT:\n${contextParts.join('\n')}\n\nUSER REQUEST:\n${input.prompt}`;

    console.log("Generating code with MiniMax M2...");

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

    let generatedCode = '';
    for await (const textPart of result.textStream) {
        generatedCode += textPart;
    }

    // Parse files from XML
    const files: Record<string, string> = {};
    const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
    let match;
    while ((match = fileRegex.exec(generatedCode)) !== null) {
        const filePath = match[1];
        const content = match[2].trim();
        files[filePath] = content;
    }

    return {
        files,
        summary: "Generated files successfully.",
        generatedCode
    };
}
