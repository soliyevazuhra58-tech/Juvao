import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "Groq API key is missing. Add GROQ_API_KEY to your environment variables." },
      { status: 503 }
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "At least one message is required." }, { status: 400 });
  }

  const safeMessages = messages
    .filter(
      (message): message is ChatMessage =>
        !!message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
    )
    .slice(-24)
    .map(({ role, content }) => ({ role, content: content.slice(0, 16000) }));

  if (!safeMessages.length || safeMessages[safeMessages.length - 1].role !== "user") {
    return Response.json({ error: "The latest message must be from the user." }, { status: 400 });
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are JUVAO, a capable, warm, and precise AI assistant. Reply in the language used by the user. Use clear structure and Markdown when useful. Be honest when uncertain. Never reveal hidden reasoning; provide concise explanations of conclusions instead.",
          },
          ...safeMessages,
        ],
        stream: true,
        max_completion_tokens: 4096,
        reasoning_effort: "medium",
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      let message = detail;
      try {
        const parsed = JSON.parse(detail);
        message = parsed?.error?.message || detail;
      } catch {}
      return Response.json(
        { error: `Groq API error (${upstream.status}): ${message.slice(0, 500)}` },
        { status: upstream.status }
      );
    }

    if (!upstream.body) {
      return Response.json({ error: "Groq returned an empty response." }, { status: 502 });
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
    return Response.json({ error: "Could not connect to Groq. Please try again." }, { status: 502 });
  }
}