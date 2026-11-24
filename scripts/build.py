#!/usr/bin/env python3
"""Build the .xpi (and update.json) for Zolight.

Local build:   python3 scripts/build.py
CI / release:  python3 scripts/build.py --repo OWNER/REPO
"""
import argparse, hashlib, json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")

ap = argparse.ArgumentParser()
ap.add_argument("--repo", help="GitHub OWNER/REPO; also writes dist/update.json")
args = ap.parse_args()

manifest = json.load(open(os.path.join(SRC, "manifest.json"), encoding="utf-8"))
version = manifest["version"]
zotero = manifest["applications"]["zotero"]

if args.repo and "YOUR_USERNAME" in json.dumps(manifest) + "YOUR NAME" * ("YOUR NAME" in json.dumps(manifest)):
    sys.exit("Replace the YOUR_USERNAME / YOUR NAME placeholders in src/manifest.json before releasing.")

os.makedirs(DIST, exist_ok=True)
xpi_name = f"abstract-highlighter-{version}.xpi"
xpi_path = os.path.join(DIST, xpi_name)

# Deterministic zip: sorted entries, fixed timestamps, manifest.json at the zip root
files = []
for base, _, names in os.walk(SRC):
    for n in names:
        full = os.path.join(base, n)
        files.append((os.path.relpath(full, SRC).replace(os.sep, "/"), full))
files.sort()

with zipfile.ZipFile(xpi_path, "w", zipfile.ZIP_DEFLATED) as z:
    for arc, full in files:
        info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, open(full, "rb").read())

sha = hashlib.sha256(open(xpi_path, "rb").read()).hexdigest()
print(f"Built {xpi_path}")
print(f"sha256:{sha}")

if args.repo:
    update = {
        "addons": {
            zotero["id"]: {
                "updates": [{
                    "version": version,
                    "update_link": f"https://github.com/{args.repo}/releases/download/v{version}/{xpi_name}",
                    "update_hash": f"sha256:{sha}",
                    "applications": {"zotero": {"strict_min_version": zotero["strict_min_version"]}},
                }]
            }
        }
    }
    out = os.path.join(DIST, "update.json")
    json.dump(update, open(out, "w", encoding="utf-8"), indent=2)
    print(f"Wrote {out}")
