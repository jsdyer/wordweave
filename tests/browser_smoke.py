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
                expect(page.locator("#presets button")).to_have_count(4)
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
                assert not errors, errors
                browser.close()
            print("Browser checks passed: search, local filter, overlap, shortlist, export, failure preservation, safe text and mobile layout")
        finally:
            server.shutdown()

if __name__ == "__main__":
    main()
