import Sandbox from "@e2b/code-interpreter";
import { AgentResult, TextMessage } from "@inngest/agent-kit";

export async function getSandbox(sandboxId: string) {
  try {
    const sandbox = await Sandbox.connect(sandboxId);
    return sandbox;
  } catch (error) {
    console.error(`Failed to connect to sandbox ${sandboxId}:`, error);
    // If connection fails, the sandbox is likely dead.
    // We cannot easily create a new one here and pretend it's the old one because
    // the files from the old one are lost.
    // However, failing with a clear error is better than "Failed to get shell".
    throw new Error(`Sandbox connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function lastAssistantTextMessageContent(result: AgentResult) {
  const lastAssistantTextMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant",
  );

  const message = result.output[lastAssistantTextMessageIndex] as
    | TextMessage
    | undefined;

  return message?.content
    ? typeof message.content === "string"
      ? message.content
      : message.content.map((c) => c.text).join("")
    : undefined;
}
