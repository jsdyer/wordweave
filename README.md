# Word Weave

A working Datamuse word-finding desk at https://coolcode.ca/wordweave/. Explore meaning, sound, rhymes, spelling patterns and word associations. Pin one search to compare its returned words with another; keep a shortlist and export the words you want. The separate **Text utilities** tab analyzes and transforms pasted text entirely in your browser.

<!-- coolcode:guide -->
Start with **ocean** and **Similar meaning**, then pin the search and try **river** to inspect shared words. **Spelling pattern** accepts * for any letters and ? for one letter, such as **t??k**. Syllable and word-class filters are local, so they make no additional API request. Comparisons describe only the returned lists, not the entire vocabulary. Your shortlist stays in this tab; download it before closing. Switch to **Text utilities** for word counts and frequency, spacing cleanup, case/slug conversion and Unicode inspection. Transformations preview beside the original; choose **Use output as original** only when you want to replace it.
<!-- /coolcode:guide -->

## Sources and interpretation

[Datamuse API](https://www.datamuse.com/api/) supplies the results. Its underlying sources include WordNet, OneLook dictionaries, the CMU pronouncing dictionary and Google Books Ngrams. The app requests word classes and syllable estimates (`md=ps`), and retains provider order. Scores have meaning only as a ranking within a query; they are not displayed as confidence or cross-query similarity.

English supports meaning, sound, spelling, rhymes, near rhymes, synonyms, antonyms, adjectives, nouns, associations and homophones. Spanish supports meaning, sound and spelling; the API's `rel_*` relationships are English-only. Syllable counts and word classes are provider estimates, sometimes ambiguous or absent. An empty response is an actual no-result state, distinct from a request failure.

The current keyless API was verified on 23 November 2026 with HTTP 200, real `ocean` word results, and a CORS response allowing `https://coolcode.ca`. No key is embedded. The app uses no synthetic fallback results and does not automatically query on page load or keystrokes.

## Add the Datamuse key

The provider's registration reply confirms authentication with the **`k` query parameter**. It permits public-facing applications and public/open-source keys under aggregate usage limits. Keeping the key server-side is this project's implementation choice, not a claim that Datamuse prohibits public keys. The provider's reply also permits commercial use with attribution; keep the existing Datamuse credit. Check your issued-key terms if the provider changes them.

Use **`DATAMUSE_API_KEY`** as an encrypted secret in the **Cloudflare Pages project**, not a GitHub Actions secret. The included Pages Function adds `k` when it calls `https://api.datamuse.com/words`. The browser receives only word results. GitHub Actions builds static files; a GitHub repository secret by itself cannot supply a secret to visitor searches after deployment.

Follow [the complete Cloudflare Pages walkthrough](docs/cloudflare-pages.md) to publish a sample at **`words.hackme.ca`** and connect the existing CoolCode app to it. It includes the exact build settings, secret name, custom-domain steps and verification. The sample is prepared in this repository; it is not automatically deployed by the GitHub Pages workflow.

The current CoolCode configuration continues to use keyless access until the Pages service is deployed and tested. Datamuse's [official API notice](https://www.datamuse.com/api/) announces keys will be required on **1 February 2027** and specifies 100,000 requests/day per key. An issued key does not reserve that entire quota for each visitor. Your provider email is the source for the `k` authentication contract; its private value is not saved in this repository.

## Local text utilities

The **Text utilities** tab makes no API calls. It provides word and unique-word counts, frequency CSV, line/paragraph counts, an adjustable reading-time estimate, UTF-8 bytes, UTF-16 units, Unicode code points and grapheme counts. Word segmentation uses the browser's `Intl.Segmenter` and the entered language tag, with a Unicode pattern fallback. Frequency groups NFC-normalized, locale-lowercased words; it is not linguistic stemming or full Unicode case folding.

Preview spacing cleanup, lower/upper/title/sentence case, camel/Pascal/snake/kebab case, Unicode or ASCII slugs, and NFC/NFD/NFKC/NFKD normalization. These are mechanical transformations: title case does not apply editorial rules; compatibility normalization can change the meaning of symbols; cleanup can remove indentation. The original remains available until explicitly replaced. The Unicode inspector labels invisible/control characters and shows the first configurable number of code points; it is not a complete Unicode-name database.

## Privacy and saved work

Submitting a query sends its text, pattern and topics to Datamuse (or the configured service). Datamuse states that temporary query logs are discarded at the end of the following day. Filters, comparison and shortlist work in tab memory. No query is saved to localStorage. CSV and receipt JSON are explicit downloads; imports are processed locally and never uploaded. Text utilities stay local, including the language tag and transformation previews. The optional Pages adapter caches word-query responses at Cloudflare for one hour; it does not write application query logs or a database. Cloudflare and Datamuse may maintain their own operational logs. Save a receipt to preserve a returned list and its query/retrieval time. A fresh result can differ from an earlier one because provider data and rankings change.

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
  "cacheEntries": 30,
  "localText": {
    "maximumCharacters": 100000,
    "frequencyLimit": 100,
    "readingWordsPerMinute": 200,
    "unicodePreviewLimit": 200
  }
}
```

Any number of presets can be added; visitors always have arbitrary query input. Modes are listed in `web/model.mjs`. The provider caps `maxResults` at 1,000. Local-text limits are editable (maximum 500,000 UTF-16 units, 1,000 frequency rows and 1,000 Unicode preview entries). Relative backend paths are allowed only on the current HTTPS origin; the Pages build uses `/api/words`. Other workload caps: 30-second requests, 1,000 shortlist entries, 100 cached requests, 2 MB receipt files. These limits are separate from initial presets. A new configuration does not invalidate a receipt with a valid old query. No data collector is needed: push code/config changes to `main`, and **Word Weave · Check and publish** tests and deploys. There is no scheduled source poll.

## Tests and build

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 scripts/build_pages.py  # optional Cloudflare Pages copy
```

Browser CI uses synthetic intercepted API fixtures for deterministic interaction/error tests, while deployment review verifies a real query separately. Tests check encoded arbitrary queries, relation/language validation, missing metadata, comparisons, hostile text, CSV safety, receipts and response failures. Additional tests cover Unicode counts, transformations, server-side authentication, origin checks, fixed upstream, response limits, cache isolation and the adapter burst guard. Static builds require no network or npm dependencies. Browser smoke checks cover both tabs and prove that local text utilities make no word-service request.
