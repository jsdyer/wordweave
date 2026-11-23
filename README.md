# Word Weave

A working Datamuse word-finding desk at https://coolcode.ca/wordweave/. Explore meaning, sound, rhymes, spelling patterns and word associations. Pin one search to compare its returned words with another; keep a shortlist and export the words you want.

<!-- coolcode:guide -->
Start with **ocean** and **Similar meaning**, then pin the search and try **river** to inspect shared words. **Spelling pattern** accepts * for any letters and ? for one letter, such as **t??k**. Syllable and word-class filters are local, so they make no additional API request. Comparisons describe only the returned lists, not the entire vocabulary. Your shortlist stays in this tab; download it before closing.
<!-- /coolcode:guide -->

## Sources and interpretation

[Datamuse API](https://www.datamuse.com/api/) supplies the results. Its underlying sources include WordNet, OneLook dictionaries, the CMU pronouncing dictionary and Google Books Ngrams. The app requests word classes and syllable estimates (`md=ps`), and retains provider order. Scores have meaning only as a ranking within a query; they are not displayed as confidence or cross-query similarity.

English supports meaning, sound, spelling, rhymes, near rhymes, synonyms, antonyms, adjectives, nouns, associations and homophones. Spanish supports meaning, sound and spelling; the API's `rel_*` relationships are English-only. Syllable counts and word classes are provider estimates, sometimes ambiguous or absent. An empty response is an actual no-result state, distinct from a request failure.

The current keyless API was verified on 23 November 2026 with HTTP 200, real `ocean` word results, and a CORS response allowing `https://coolcode.ca`. No key is embedded. The app uses no synthetic fallback results and does not automatically query on page load or keystrokes.

## Registration and the 2027 change

Datamuse currently documents free keyless access up to 100,000 requests/day. Its official notice says **1 February 2027** will require keys. It asks public/customer-facing applications to contact it with a description and traffic estimate. Use the [provider's request form](https://www.onelook.com/?c=about&sel=api) linked from the API documentation. A draft:

> I am building Word Weave, a free non-commercial word-finding tool at https://coolcode.ca/wordweave/. Visitors submit words or phrases to explore meaning, sound, rhymes and spelling patterns using /words. Searches are manually submitted, cached within a browser tab and spaced at least one second apart; no background harvesting occurs. I expect fewer than 1,000 requests per day initially. I credit Datamuse and explain which queries are sent to the service. Could you provide an API key for the February 2027 requirement and confirm the authentication method and applicable limits for this use?

Use your reply email in the form. The draft is not sent automatically and registration is not claimed complete.

When the provider issues a key and documents its use, keep it in a server-side secret. Set `backendEndpoint` in `web/config.json` to an HTTPS endpoint you control that accepts the same allowlisted word query parameters, attaches the key server-side and returns the unchanged Datamuse JSON array. It must allow CoolCode's origin, enforce quotas and omit private credentials from responses. **Do not put the key in config, the URL or public JavaScript.** This repo deliberately does not invent an undocumented authentication format or deploy a Cloudflare service. A server endpoint can be under the owner's `hackme.ca` domain.

## Privacy and saved work

Submitting a query sends its text, pattern and topics to Datamuse (or the configured service). Datamuse states that temporary query logs are discarded at the end of the following day. Filters, comparison and shortlist work in tab memory. No query is saved to localStorage. CSV and receipt JSON are explicit downloads; imports are processed locally and never uploaded. Save a receipt to preserve a returned list and its query/retrieval time. A fresh result can differ from an earlier one because provider data and rankings change.

## Expand or customize

Edit `web/config.json`:

```json
{
  "maxResults": 100,
  "presets": [{"label":"Coastal vocabulary","query":"ocean","mode":"ml"}],
  "apiEndpoint":"https://api.datamuse.com/words",
  "backendEndpoint": null,
  "timeoutMs": 15000,
  "minimumRequestIntervalMs": 1000,
  "maximumShortlist": 100,
  "cacheEntries": 30
}
```

Any number of presets can be added; visitors always have arbitrary query input. Modes are listed in `web/model.mjs`. The provider caps `maxResults` at 1,000. Other workload caps: 30-second requests, 1,000 shortlist entries, 100 cached requests, 2 MB receipt files. These limits are separate from initial presets. A new configuration does not invalidate a receipt with a valid old query. No data collector is needed: push code/config changes to `main`, and **Word Weave · Check and publish** tests and deploys. There is no scheduled source poll.

## Tests and build

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

Browser CI uses synthetic intercepted API fixtures for deterministic interaction/error tests, while deployment review verifies a real query separately. Tests check encoded arbitrary queries, relation/language validation, missing metadata, comparisons, hostile text, CSV safety, receipts and response failures. Static builds require no network or npm dependencies.
