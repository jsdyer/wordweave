#!/usr/bin/env python3
"""Build the optional Cloudflare Pages copy; never read or embed runtime secrets."""
import json
from pathlib import Path
import shutil
import tempfile
from build import ROOT, build


def build_pages(root=ROOT):
    build(root)
    output = root / 'cloudflare' / 'public'
    if output.is_symlink():
        raise ValueError('cloudflare/public must not be a symlink')
    with tempfile.TemporaryDirectory(prefix='wordweave-pages-') as temporary:
        stage = Path(temporary) / 'site'
        shutil.copytree(root / 'dist', stage)
        config_path = stage / 'config.json'
        config = json.loads(config_path.read_text())
        config['backendEndpoint'] = '/api/words'
        config_path.write_text(json.dumps(config, indent=2) + '\n')
        page = (stage / 'index.html').read_text()
        page = page.replace('<script defer src="/assets/tool-metrics.js" referrerpolicy="no-referrer"></script>', '')
        (stage / 'index.html').write_text(page)
        (stage / '_routes.json').write_text(json.dumps({'version':1,'include':['/api/*'],'exclude':[]}) + '\n')
        (stage / '_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n')
        output.parent.mkdir(parents=True, exist_ok=True)
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(stage, output)
    print('Built cloudflare/public/; the Pages Function reads DATAMUSE_API_KEY at runtime')


if __name__ == '__main__':
    build_pages()
