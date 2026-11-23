# A working Cloudflare Pages sample: Word Weave at words.hackme.ca

This sample gives you a practical writing and research workbench: find related words with Datamuse, compare returned vocabularies, inspect Unicode and clean text locally. It uses the same Word Weave source as CoolCode. Cloudflare Pages serves the browser files; a Pages Function supplies the Datamuse key for live searches. `hackme.ca` can continue hosting its existing site while this sample uses only the `words` subdomain.

The sample code is ready, but creating a Pages project, adding its secret and assigning the domain are still owner setup steps. Nothing in this guide changes DNS or creates a deployment by itself.

## 1. Connect the repository to Cloudflare Pages

In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** (the entry may say **Import an existing Git repository**). Choose GitHub, authorize access to **`jsdyer/wordweave`**, then select it.

Use these settings:

| Setting | Value |
| --- | --- |
| Project name | `wordweave` (or another available name) |
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | `cloudflare` |
| Build command | `python3 ../scripts/build_pages.py` |
| Build output directory | `public` |

The root directory matters: Pages discovers `cloudflare/functions/api/words.js` as `/api/words`. The builder copies only browser assets into `cloudflare/public`, selects the local `/api/words` connection and invokes Functions only for `/api/*`. No key is needed by the build. There are no install dependencies.

Save and deploy. The static page can load before the secret is present; searches will explain that the owner must finish the connection. This is a setup state, not sample word data.

## 2. Add the runtime secret

Open your **Pages project → Settings → Variables and Secrets → Add**. Select **Production** and add:

| Name | Type | Value |
| --- | --- | --- |
| `DATAMUSE_API_KEY` | Secret / Encrypt | Your issued Datamuse key |
| `ALLOWED_ORIGIN` | Plain text | `https://coolcode.ca` |

Save and **redeploy** the project. Add the secret separately to **Preview** only if you want preview deployments to make real Datamuse queries too; preview traffic shares the same key's quota.

The provider's email documents `k` as the authentication parameter. The Function adds it to the upstream request. Do not put `k` into `web/config.json`: that config describes your public connection, not runtime credentials. A same-named GitHub repository secret will not populate this Pages binding automatically.

The provider allows public-facing use and public/open-source keys under its aggregate limits. This setup keeps the value private because a server connection also gives you shared caching and request validation. It does not require a new Datamuse registration.

## 3. Test the Pages address first

Open the `https://<your-project>.pages.dev` address shown by Cloudflare. Submit **ocean** in the word finder. Results should appear. In Developer Tools → Network, the browser should request:

```text
https://<your-project>.pages.dev/api/words?...
```

It should receive HTTP 200 and a JSON array containing words. The browser request has no `k` parameter. A repeat query from a fresh tab can show `X-WordWeave-Cache: HIT` after the response has been cached in that data centre. The local Text utilities tab works without Datamuse.

For a direct check, visit this URL with your real Pages project hostname:

```text
https://<your-project>.pages.dev/api/words?ml=ocean&md=ps&max=10
```

Do not paste your key into a test URL or screenshot. The error responses intentionally do not echo provider request URLs or raw provider bodies.

## 4. Attach words.hackme.ca

In the Pages project, choose **Custom domains → Set up a domain**. Enter **`words.hackme.ca`** and continue. Because `hackme.ca` is already on Cloudflare, confirm the proposed DNS record. It should be a CNAME for **`words`** pointing to your project's **`<project>.pages.dev`** address.

Use the Pages custom-domain flow first. A manually created CNAME without associating the hostname with this Pages project is insufficient. Do not replace the apex `hackme.ca` record or `platesolve-api.hackme.ca` record. If `words` already has a record, inspect it before replacing it.

Wait for the domain status to become active, then open **https://words.hackme.ca/** and repeat the ocean search. Cloudflare provides HTTPS for the attached custom domain.

## 5. Connect CoolCode to the same service

Only after the custom-domain test works, change this one setting in `web/config.json`:

```json
"backendEndpoint": "https://words.hackme.ca/api/words"
```

Commit and push that configuration change. The existing **Word Weave · Check and publish** workflow updates the GitHub Pages app at **https://coolcode.ca/wordweave/**. The connected Cloudflare project also rebuilds from the push; its build always uses its own `/api/words` route.

Visit CoolCode and submit another word. Network should show a request to `words.hackme.ca/api/words`, and the response should include `Access-Control-Allow-Origin: https://coolcode.ca`. The frontend can stay on GitHub Pages; only its authenticated word requests run in Cloudflare. There is no need to move `coolcode.ca` DNS to Cloudflare.

## Limits, privacy and troubleshooting

The Function accepts a fixed allowlist of word-search parameters and calls only `https://api.datamuse.com/words`. It rejects duplicate parameters, caller-provided keys, arbitrary URLs, unsupported vocabularies and unsupported metadata requests. Each call allows up to 1,000 results, a 1 MiB response and a 12-second timeout. Successful word results are cached for one hour at Cloudflare; errors are not cached. The public app also spaces searches and reuses results in tab memory.

A best-effort guard allows 30 requests per client IP per minute **within each running isolate** and stores at most 5,000 short-lived counters. It is not a global daily quota: separate data centres or isolates can count separately, and CORS is not authentication. The endpoint is intended to be publicly usable. For a larger audience or abuse, add an appropriate Cloudflare rate-limiting rule for `words.hackme.ca/api/words` and monitor provider usage; limits and rule availability depend on your Cloudflare plan. Do not assume the cache or burst guard guarantees staying below the provider's aggregate daily allowance.

There is no application database, query log or persistent IP store. Word queries pass through Cloudflare to Datamuse and may be in their operational logs/cache. The local Text utilities tab sends neither its pasted text nor transformations to this Function.

| Symptom | Check |
| --- | --- |
| HTTP 503 asking for a secret | Add `DATAMUSE_API_KEY` in the correct Pages environment, then redeploy. |
| HTTP 503 saying Datamuse did not accept the connection | Confirm the saved value against the provider email; avoid leading/trailing copied whitespace. |
| HTTP 404 or HTML at `/api/words` | Root must be `cloudflare`, output must be `public`, and deployment must include the Functions directory. |
| CORS error only on CoolCode | Confirm `ALLOWED_ORIGIN` is exactly `https://coolcode.ca`, with no trailing slash, and redeploy. |
| HTTP 429 | Stop retrying briefly. It can be the short burst guard or Datamuse's shared-key limit. |
| A domain error after adding a CNAME | Finish **Pages → Custom domains**, then confirm its activation and DNS target. |
| Text utilities work but no words load | Those functions are local; test `/api/words` independently to isolate the API connection. |

## Relevant official documentation

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)
- [Pages variables and secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets)
- [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Datamuse API, attribution and usage notice](https://www.datamuse.com/api/)

Setup instructions checked against Cloudflare documentation on 23 November 2026. The `k` authentication method comes from the owner's provider-issued setup instructions; no private key value is included here.
