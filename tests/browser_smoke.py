"""Deterministic contract UI checks; live provider checks happen separately."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import json
import re
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "wordweave")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors, calls = [], []
                page.on("pageerror", lambda error: errors.append(str(error)))
                def api(route):
                    query = parse_qs(urlparse(route.request.url).query).get("ml", [""])[0]
                    calls.append(query)
                    if query == "failure":
                        route.fulfill(status=429, content_type="application/json", body='{"error":"rate limit"}')
                        return
                    data = [{"word":"sea","numSyllables":1,"tags":["n"]}, {"word":"tide","numSyllables":1,"tags":["n"]}, {"word":"<img src=x onerror=alert(1)>"}]
                    if query == "river":
                        data = [{"word":"sea","numSyllables":1,"tags":["n"]}, {"word":"stream","numSyllables":1,"tags":["n"]}]
                    route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
                page.route("https://api.datamuse.com/words?**", api)
                page.goto(f"http://127.0.0.1:{server.server_port}/wordweave/")
                preset_count = len(json.loads((ROOT / 'web/config.json').read_text())['presets'])
                expect(page.locator("#presets button")).to_have_count(preset_count)
                assert calls == [], "No automatic provider request on load"
                page.locator("#search").click()
                expect(page.locator(".word-card")).to_have_count(3)
                assert page.locator("#words img").count() == 0
                page.get_by_role("button", name="Keep sea", exact=True).click()
                expect(page.locator("#saved-count")).to_have_text("1")
                page.locator("#filter").fill("sea")
                expect(page.locator(".word-card")).to_have_count(1)
                assert calls == ["ocean"], "Filtering must stay local"
                page.locator("#pin").click()
                page.wait_for_timeout(1100)
                page.locator("#query").fill("river")
                page.locator("#search").click()
                expect(page.locator("#comparison-note")).to_contain_text("1 shared words")
                expect(page.locator("#both")).to_contain_text("sea")
                with page.expect_download() as download:
                    page.locator("#receipt").click()
                assert download.value.suggested_filename.endswith(".json")
                page.wait_for_timeout(1100)
                page.locator("#query").fill("failure")
                page.locator("#search").click()
                expect(page.locator("#status")).to_contain_text("Previous results are unchanged")
                expect(page.locator("#result-title")).to_contain_text("river")
                expect(page.locator(".word-card")).to_have_count(2)
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width":390,"height":844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                calls_before_text = list(calls)
                page.locator('#text-tab').click()
                expect(page.locator('#desk')).to_be_hidden()
                expect(page.locator('#text-desk')).to_be_visible()
                original = '  Café café\n\nRiver river sea  '
                page.locator('#text-source').fill(original)
                expect(page.locator('#stat-words')).to_have_text('5')
                expect(page.locator('#stat-unique')).to_have_text('3')
                expect(page.locator('#stat-paragraphs')).to_have_text('2')
                page.locator('#text-operation').select_option('slug')
                page.locator('#ascii-slug').check()
                page.locator('#text-transform').click()
                expect(page.locator('#text-output')).to_have_value('cafe-cafe-river-river-sea')
                expect(page.locator('#text-source')).to_have_value(original)
                with page.expect_download() as frequency:
                    page.locator('#frequency-save').click()
                saved = Path(temporary) / 'frequency.csv'
                frequency.value.save_as(str(saved))
                assert '"café","2"' in saved.read_text(encoding='utf-8-sig')
                assert calls == calls_before_text, 'Local text analysis and transformation must make no API request'
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(screenshots / 'text-mobile.png'), full_page=True)
                page.set_viewport_size({'width':1280,'height':1000})
                page.screenshot(path=str(screenshots / 'text-desktop.png'), full_page=True)
                page.locator('#text-tab').focus()
                page.keyboard.press('ArrowLeft')
                expect(page.locator('#find-tab')).to_be_focused()
                expect(page.locator('#desk')).to_be_visible()
                expect(page.locator('#result-title')).to_contain_text('river')
                assert not errors, errors
                browser.close()
            print("Browser checks passed: search, local filter, overlap, shortlist, export, failure preservation, safe text and mobile layout")
        finally:
            server.shutdown()

if __name__ == "__main__":
    main()
