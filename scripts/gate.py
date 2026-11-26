#!/usr/bin/env python3
"""The 7 gate checks from the token-radar RULES.txt, run locally on an
output directory produced by main.ts:

    MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot>
    python3 scripts/gate.py out

Checks: dashboard_files, board_file, sorted_by_value, coverage, farm_steps,
screenshots, dossier_matches (rebuilds the dossier with the kit's
buildDossier and compares bytes).
"""
import json
import os
import re
import subprocess
import sys

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp/out-test"
SNAP = "/home/hatch/workspace/makefun/kits/token-radar-01-kit/token-radar-01-kit/input/snapshot.json"
VENDOR = "/home/hatch/workspace/makefun/entries/token-radar-01-rebuild6-fresh/vendor/makefun-board.ts"
snap = json.load(open(SNAP))
watch = set(snap["watchlist"])
slugs = {p["slug"] for p in snap["protocols"]}

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS {name} {detail}")
    else:
        failed += 1
        print(f"  FAIL {name} {detail}")


print("== 1. dashboard_files ==")
dash = os.path.join(OUTDIR, "dashboard")
files = []
for root, _, names in os.walk(dash):
    for n in names:
        files.append(os.path.join(root, n))
total = sum(os.path.getsize(f) for f in files)
names_ok = all(re.fullmatch(r"[A-Za-z0-9._-]+", os.path.basename(f)) and
               not os.path.basename(f).startswith((".", "-")) for f in files)
no_dotdir = all("/." not in os.path.relpath(f, dash) for f in files)
has_html = os.path.isfile(os.path.join(dash, "index.html"))
has_css = any(f.endswith(".css") for f in files)
has_js = any(f.endswith(".js") for f in files)
# No http(s) in HTML attributes, <style> bodies, CSS files, or JS
# import/export/require/dynamic-import specifiers. URLs in visible text or
# string data are allowed by the rules.
bad_url = []
for f in files:
    txt = open(f, "rb").read().decode("utf-8", "replace")
    if f.endswith(".css"):
        if "http://" in txt or "https://" in txt:
            bad_url.append(f)
    elif f.endswith(".html"):
        for m in re.finditer(r"<[^>]+(?:href|src|action|poster)\s*=\s*[\"']([^\"']+)[\"']", txt):
            if m.group(1).startswith(("http://", "https://")):
                bad_url.append(f)
        for m in re.finditer(r"<style[^>]*>(.*?)</style>", txt, re.S):
            if "http://" in m.group(1) or "https://" in m.group(1):
                bad_url.append(f)
    elif f.endswith(".js"):
        for pat in (r"""import\s+[^'"]*?["'](https?://[^"']+)["']""",
                    r"""import\s*\(\s*["'](https?://[^"']+)["']""",
                    r"""require\s*\(\s*["'](https?://[^"']+)["']""",
                    r"""export\s+[^'"]*?from\s*["'](https?://[^"']+)["']"""):
            if re.search(pat, txt):
                bad_url.append(f)
check("dashboard_files", has_html and has_css and has_js and len(files) <= 400 and
      total <= 4 * 1024 * 1024 and names_ok and no_dotdir and not bad_url,
      f"{len(files)} files, {total} bytes, bad-url: {bad_url}")

print("== 2. board_file ==")
board = json.load(open(os.path.join(OUTDIR, "board.json")))
rows = board["rows"] if isinstance(board, dict) else board
ok_rows = (isinstance(rows, list) and 100 <= len(rows) <= 4000
           and os.path.getsize(os.path.join(OUTDIR, "board.json")) <= 8 * 1024 * 1024)
row_ok = True
for r in rows:
    if (r["slug"] not in slugs or not r["name"] or not isinstance(r["rank"], int) or r["rank"] <= 0
            or not isinstance(r["implied_value_usd"], int) or r["implied_value_usd"] <= 0
            or r["implied_value_usd"] > 100_000_000_000_000
            or not isinstance(r["farm_steps"], list)):
        row_ok = False
        break
check("board_file", ok_rows and row_ok, f"{len(rows)} rows")

print("== 3. sorted_by_value ==")
ranks = [r["rank"] for r in rows]
impl = [r["implied_value_usd"] for r in rows]
check("sorted_by_value", sorted(ranks) == list(range(1, len(rows) + 1)) and
      all(impl[i] >= impl[i + 1] for i in range(len(impl) - 1)) and
      len(set(impl)) > 1, f"ranks 1..{len(rows)}, top {impl[0]}")

print("== 4. coverage ==")
have = {r["slug"] for r in rows}
check("coverage", watch <= have, f"{len(watch & have)}/{len(watch)} watchlist covered")

print("== 5. farm_steps ==")
ok_steps = all(3 <= len(r["farm_steps"]) <= 12 and
               all(20 <= len(s.strip()) <= 600 for s in r["farm_steps"]) for r in rows)
check("farm_steps", ok_steps, f"{len(rows)} rows")

print("== 6. screenshots ==")
shots_dir = os.path.join(OUTDIR, "screenshots")
shots = sorted(f for f in os.listdir(shots_dir) if not f.startswith("."))
ok_shots = 3 <= len(shots) <= 4
from PIL import Image
for f in shots:
    p = os.path.join(shots_dir, f)
    size = os.path.getsize(p)
    try:
        im = Image.open(p)
        im.verify()
        im = Image.open(p)
        w, h = im.size
        fmt = im.format
    except Exception as e:
        ok_shots = False
        print(f"    unreadable {f}: {e}")
        continue
    if not (size <= 512 * 1024 and fmt in ("JPEG", "PNG") and max(w, h) <= 1440 and min(w, h) >= 800):
        ok_shots = False
        print(f"    bad {f}: {size}B {fmt} {w}x{h}")
    else:
        print(f"    {f}: {size}B {fmt} {w}x{h}")
check("screenshots", ok_shots, f"{len(shots)} images")

print("== 7. dossier_matches ==")
probe = """
import { buildDossier } from "%s";
import { writeFileSync, readFileSync } from "node:fs";
const bytes = await buildDossier(process.argv[2], { text_max_bytes: 65536 });
writeFileSync(process.argv[3], bytes);
""" % VENDOR
open("/tmp/gate-probe.ts", "w").write(probe)
subprocess.run(["node", "/tmp/gate-probe.ts", OUTDIR, "/tmp/gate-dossier.json"],
               check=True, capture_output=True)
a = open(os.path.join(OUTDIR, "dossier.json"), "rb").read()
b = open("/tmp/gate-dossier.json", "rb").read()
check("dossier_matches", a == b, f"dossier {len(a)} bytes" + ("" if a == b else f" vs rebuilt {len(b)}"))
d = json.loads(a)
check("dossier <= 1.5 MiB", len(a) <= 1_572_864, f"{len(a)} bytes")
check("dossier text fits whole (no cut)", "not shown" not in d["text"] and "left out" not in d["text"],
      f"text {len(d['text'])} chars")

print(f"\nGATE: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
