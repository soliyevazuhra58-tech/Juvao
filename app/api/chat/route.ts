import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status });

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError("JUVAO is not configured yet. Please try again later.", 503);
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("The message could not be read. Please try again.", 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError("Please send a message to continue.", 400);
  }

  const safeMessages = (body.messages as unknown[])
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== "object") return false;
      const message = item as Record<string, unknown>;
      return (
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
      );
    })
    .slice(-24)
    .map(({ role, content }) => ({ role, content: content.slice(0, 16000) }));

  if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== "user") {
    return jsonError("Please send a new message to continue.", 400);
  }

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content:
              "You are JUVAO, a helpful, thoughtful, and accurate AI assistant. Reply in the language used by the user. Format answers clearly with Markdown when useful. Be honest about uncertainty. Do not reveal hidden reasoning; give concise explanations and useful conclusions.",
          },
          ...safeMessages,
        ],
        stream: true,
        max_completion_tokens: 4096,
        reasoning_effort: "medium",
      }),
      cache: "no-store",
      signal: request.signal,
    });

    if (!upstream.ok) {
      // Keep provider details and credentials out of the user-facing interface.
      return jsonError("JUVAO couldn't respond right now. Please try again in a moment.", 502);
    }

    if (!upstream.body) {
      return jsonError("JUVAO returned an empty response. Please try again.", 502);
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return jsonError("Connection interrupted. Please try again.", 502);
  }
}
