#!/usr/bin/env python3
"""Set the new tool's identity and catalogue record without changing app code."""
import argparse
import json
import re
from build import ROOT, SLUG

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("slug", help="Must match the new GitHub repository name")
parser.add_argument("--title", required=True)
parser.add_argument("--description", required=True)
parser.add_argument("--owner", default="jsdyer")
args = parser.parse_args()
if not SLUG.fullmatch(args.slug) or args.slug == "coolcode-tool-template":
    parser.error("Choose a unique lowercase tool slug")
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", args.owner):
    parser.error("Invalid GitHub owner")
if not args.title.strip() or not args.description.strip():
    parser.error("Title and description must be nonempty")
path = ROOT / "tool.json"
tool = json.loads(path.read_text())
tool.update(id=args.slug, title=args.title.strip(), description=args.description.strip(),
            url=f"/{args.slug}/", source=f"https://github.com/{args.owner}/{args.slug}")
path.write_text(json.dumps(tool, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Updated tool.json. Review category, tags and icon; replace the example application. Browser access is explicit.")
