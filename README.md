# JUVAO AI

A minimal, glassmorphism-inspired AI chat app powered exclusively by Groq.

## Stack

- Next.js App Router + TypeScript
- Groq Chat Completions API (streaming)
- Tavily Web Search API (source-grounded answers with links)
- GPT-OSS 120B by default
- Local browser storage for chat history
- React Markdown + GFM

## Run locally

```bash
npm install
cp .env.example .env.local
```

Add your Groq key to `.env.local`:

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
TAVILY_API_KEY=your_tavily_api_key_here
```

Then start the app:

```bash
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Import this repository into Vercel.
2. Add `GROQ_API_KEY` as an Environment Variable.
3. Add `TAVILY_API_KEY` to enable Web Search and source links.
4. Optionally add `GROQ_MODEL` (defaults to `openai/gpt-oss-120b`).
5. Deploy.

The Groq key is only read by the server route and is never sent to the browser. Never commit `.env.local`.

## Notes

- Chat history is stored in the current browser using localStorage.
- API usage is subject to your Groq account's model availability and rate limits.
- The server streams Groq's Server-Sent Events to the client.
- Web Search can be enabled from the composer; current/freshness-related queries are also searched automatically. Search sources are shown below the answer.
- Tavily API key is stored server-side only and must never be exposed to the browser.
