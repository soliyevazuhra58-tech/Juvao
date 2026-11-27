# JUVAO AI

A minimal, glassmorphism-inspired AI chat app powered exclusively by Groq.

## Stack

- Next.js App Router + TypeScript
- Groq Chat Completions API (streaming)
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
```

Then start the app:

```bash
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Import this repository into Vercel.
2. Add `GROQ_API_KEY` as an Environment Variable.
3. Optionally add `GROQ_MODEL` (defaults to `openai/gpt-oss-120b`).
4. Deploy.

The Groq key is only read by the server route and is never sent to the browser. Never commit `.env.local`.

## Notes

- Chat history is stored in the current browser using localStorage.
- API usage is subject to your Groq account's model availability and rate limits.
- The server streams Groq's Server-Sent Events directly to the client.
