# JUVAO DuckDuckGo Search Worker

This Worker proxies DuckDuckGo requests so the JUVAO Vercel API does not contact DuckDuckGo directly.

## 1. Deploy the Worker

1. Open https://dash.cloudflare.com/ and sign in.
2. Go to **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name such as `juvao-search`.
4. Open **Edit code**, replace the starter code with the contents of `juvao-search-worker.js`, then **Deploy**.
5. Copy the deployed Worker URL, for example `https://juvao-search.<your-subdomain>.workers.dev`.

## 2. Add a shared secret in Cloudflare

1. Open the Worker → **Settings** → **Variables and Secrets**.
2. Add a secret named `JUVAO_SEARCH_SECRET`.
3. Use a long random value (at least 32 characters). Do not publish it or put it in frontend code.
4. Save and redeploy if Cloudflare asks.

## 3. Add environment variables in Vercel

In the JUVAO project, open **Settings** → **Environment Variables** and add:

- `JUVAO_SEARCH_WORKER_URL` = the deployed `workers.dev` URL
- `JUVAO_SEARCH_SECRET` = exactly the same secret configured in Cloudflare

Enable the variables for Production (and Preview if needed), save, then redeploy the latest deployment.

## 4. Check the Worker

Open the Worker URL in a browser. It should return:

```json
{"service":"JUVAO DuckDuckGo Search","status":"ok"}
```

Then test Web Search in JUVAO. If it still fails, check **Cloudflare → Worker → Logs**. If DuckDuckGo also returns HTTP 403 from Cloudflare, the block is provider-side and this proxy route cannot bypass it reliably.
