# CoolCode browser tool conventions

- Keep app source in `web/`, build code in `scripts/`, and meaningful tests in `tests/`.
  Never commit `dist/`. Do not add dependencies without a concrete application need.
- Run `scripts/init.py` as documented in README, then replace the example UI,
  behaviour, tests and privacy text. Review all fields in `tool.json`.
- Keep `access: "browser"` for the usable web tool. Selecting local files is not
  installation. The hub renders its standard access label from this field.
- Keep assets and imports relative so the app works at `/<repo>/`. Do not add a
  CNAME or claim the hub's domain. Link home to `https://coolcode.ca/`.
- Keep transformations separate from DOM code. Render untrusted input through
  textContent/value, not innerHTML. Never embed API secrets.
- State which inputs leave the browser. Do not retain pasted text or uploads by
  default. Namespace preferences as `coolcode:<tool-id>:<key>`; paths share storage.
- Run `node --test tests/*.test.mjs`, `python3 -m unittest discover -s tests -v`,
  and `python3 scripts/build.py`. Preview `dist/` using a local HTTP server.
- Update `tests/browser_smoke.py` when replacing the sample UI. CI runs it with
  Chromium; `tests/browser-requirements.txt` contains the test-only dependency.
- The default build is offline. Add data refresh only when needed, with validation
  and visible source/build dates. Failed refreshes must not replace good deployments.
- PRs check/build; successful `main` builds deploy. The template repo skips deployment.
- Once deployed, copy the reviewed `tool.json` record into `data/tools.json` in
  `jsdyer/jsdyer.github.io`. Don't register the starter itself as a finished tool.
- For changes to inputs, coverage, date meanings or results, update the tool README
  alongside the implementation. Its marked `coolcode:guide` excerpt supplies
  the extra practical detail in the hub README. Only the short source sentence
  belongs in the homepage record. Import the note with `scripts/sync_guides.py
  --tool TOOL_ID` in the hub before regenerating its README.
