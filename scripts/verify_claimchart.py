#!/usr/bin/env python3
"""
Verify a generated claim chart configuration / document.

Per-row checks:
  1. Image count meets minimum threshold (default 2).
  2. Each image's source document is associated with the accused party
     (filename or also_in list contains an accused-party keyword).
  3. (OCR mode, default ON if tesseract is available) The visible text in
     each image either mentions an accused-party keyword OR the image is
     visual (architecture diagram / UI screenshot with little text). Images
     whose OCR text matches patent-claim language ("comprising", "wherein",
     "claim 1") are flagged as patent-text screenshots, not evidence.
  4. Heuristic warnings: extreme aspect ratio ⇒ likely text screenshot;
     <25 KB ⇒ likely a logo/icon.

Usage:
    python3 verify_claimchart.py --config CONFIG.json --report REPORT.json
                                 [--accused "ExampleCo"] [--min-images 2]
                                 [--keywords "ExampleCo,SampleDrive"]
                                 [--no-ocr] [--strict]

Exit code:
    0 — all rows PASS (or only WARN, if not --strict)
    1 — at least one row FAIL, or any WARN under --strict
"""

import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path

KEYWORD_HINTS = {
    "ExampleCo": ["ExampleCo", "SampleDrive", "Example Vehicle"],
    "OtherCo": ["OtherCo", "OtherDrive"],
}

# Patterns suggesting the image is a screenshot of patent claim text or a
# patent first-page (title / abstract / publication header).
CLAIM_TEXT_PATTERNS = [
    r"\bcomprising\b",
    r"\bwherein\b",
    r"\bsaid\s+\w+",
    r"\bclaim\s+\d+\b",
    r"^\s*\d+\.\s+[A-Z]",                      # "1. An autonomous vehicle..."
    r"^\s*\[\s*\d{4}\s*\]",                    # "[0001]" specification numbering
    r"United\s+States\s+Patent",               # patent title page
    r"Patent\s+Application\s+Publication",     # USPTO publication header
    r"Pub\.\s*No\.\s*:\s*US",                  # "Pub. No.: US 2024/0203247 A1"
]
CLAIM_TEXT_RE = re.compile("|".join(CLAIM_TEXT_PATTERNS),
                           re.IGNORECASE | re.MULTILINE)


def png_dims(path):
    try:
        with open(path, "rb") as f:
            data = f.read(24)
        if data[:4] == b"\x89PNG":
            return struct.unpack(">I", data[16:20])[0], struct.unpack(">I", data[20:24])[0]
    except Exception:
        pass
    return 0, 0


def resolve_keywords(accused, extra):
    base = KEYWORD_HINTS.get(accused, [accused] if accused else [])
    if extra:
        base = list(base) + [k.strip() for k in extra.split(",") if k.strip()]
    seen, out = set(), []
    for k in base:
        kl = k.lower()
        if kl and kl not in seen:
            seen.add(kl)
            out.append(k)
    return out


def matches_keywords(text, keywords):
    if not text:
        return False
    t = text.lower()
    return any(k.lower() in t for k in keywords)


def is_likely_claim_text(width, height):
    if width <= 0 or height <= 0:
        return False
    ratio = width / float(height)
    if ratio > 4.0 and height < 300:
        return True
    if ratio > 5.5:
        return True
    return False


def is_tiny(size_kb):
    return size_kb is not None and size_kb < 25


def ocr_image(path, cache):
    """OCR via tesseract. Some tesseract/leptonica builds choke on absolute paths
    that contain certain characters; running with cwd=<image dir> and a basename
    works around this."""
    if path in cache:
        return cache[path]
    try:
        d, base = os.path.split(os.path.abspath(path))
        out = subprocess.run(
            ["tesseract", base, "-", "-l", "eng"],
            capture_output=True, timeout=20, check=False, cwd=d,
        )
        text = (out.stdout or b"").decode("utf-8", errors="replace").strip()
    except Exception:
        text = ""
    cache[path] = text
    return text


def classify_ocr(text, keywords):
    """Return (mentions_accused, looks_like_claim_text, char_count)."""
    if not text:
        return False, False, 0
    n = len(text)
    has_party = matches_keywords(text, keywords)
    is_claim = bool(CLAIM_TEXT_RE.search(text)) and n > 60
    return has_party, is_claim, n


def verify(cfg_path, report_path, accused_override, min_images,
           extra_keywords, strict, use_ocr):
    cfg = json.loads(Path(cfg_path).read_text(encoding="utf-8"))
    rep = json.loads(Path(report_path).read_text(encoding="utf-8"))

    accused = accused_override or cfg.get("accusedParty", "")
    keywords = resolve_keywords(accused, extra_keywords)
    src_map = {s["staged_path"]: s for s in rep.get("staged_images", [])}

    if use_ocr and shutil.which("tesseract") is None:
        print("Note: tesseract not found; running without OCR checks.")
        use_ocr = False

    print(f"Accused party: {accused}")
    print(f"Match keywords: {keywords}")
    print(f"Minimum images / row: {min_images}")
    print(f"OCR mode: {'on' if use_ocr else 'off'}")
    print(f"Strict mode: {strict}")
    print()

    rows = cfg.get("claimGroups", [])
    summary = {"PASS": 0, "WARN": 0, "FAIL": 0}
    failing_rows = []
    ocr_cache = {}

    for ri, group in enumerate(rows):
        ce_idx = group.get("claimElementIndices", [])
        ce_text = " | ".join(
            (cfg["claimElements"][i][:80] if i < len(cfg["claimElements"]) else f"<missing #{i}>")
            for i in ce_idx
        ) or "(no claim element bound)"

        imgs = []
        for blk in group.get("evidenceBlocks", []):
            for path in blk.get("images", []):
                imgs.append((path, blk.get("refId"), blk.get("url", "")))

        row_issues = []

        # ---- check 1: image count ----
        if len(imgs) < min_images:
            row_issues.append(("FAIL", f"only {len(imgs)} images, need ≥ {min_images}"))

        # ---- per-image checks ----
        for path, refid, url in imgs:
            name = os.path.basename(path)
            meta = src_map.get(path)
            if meta is None:
                row_issues.append(("FAIL", f"{name} not present in evidence_report.json"))
                continue

            src_doc = meta.get("source_doc", "")
            also_in = meta.get("also_in", []) or []
            src_related = matches_keywords(src_doc, keywords) or any(
                matches_keywords(s, keywords) for s in also_in
            )

            ocr_text = ocr_image(path, ocr_cache) if use_ocr else ""
            has_party, is_claim, n_chars = classify_ocr(ocr_text, keywords)

            # Source-doc relation: only FAIL if neither the source doc nor the OCR
            # text mentions the accused party. An image whose pixels mention the
            # accused party is legitimate evidence even if the deduper happened
            # to record a different source_doc.
            if not src_related and not has_party:
                row_issues.append((
                    "FAIL",
                    f"{name} comes from {src_doc!r} (also_in {also_in}) "
                    f"and no {accused} keyword found in image text — likely wrong defendant",
                ))

            # OCR-based patent-text detection: hard fail.
            if is_claim and not has_party:
                preview = re.sub(r"\s+", " ", ocr_text[:120])
                row_issues.append((
                    "FAIL",
                    f"{name} OCR matches patent-claim language (\"{preview}…\") — "
                    "this is a claim-text screenshot, not product evidence",
                ))

            # Dimension/size warnings.
            dim = meta.get("dimensions", "0x0")
            try:
                w, h = (int(x) for x in dim.split("x"))
            except Exception:
                w, h = png_dims(path)
            size_kb = meta.get("size_kb", 0)

            if is_likely_claim_text(w, h) and not is_claim and not has_party and not src_related:
                row_issues.append((
                    "WARN",
                    f"{name} dims {w}x{h} look like a text screenshot (wide & short) — "
                    "verify it depicts the accused product",
                ))
            if is_tiny(size_kb):
                row_issues.append((
                    "WARN",
                    f"{name} only {size_kb}KB — possibly a logo/icon rather than evidence",
                ))

            # OCR-based positive note: mentions accused party in image text.
            if use_ocr and has_party:
                row_issues.append(("INFO", f"{name} OCR mentions {accused}-related keyword"))

        if any(level == "FAIL" for level, _ in row_issues):
            status = "FAIL"
        elif any(level == "WARN" for level, _ in row_issues):
            status = "WARN"
        else:
            status = "PASS"

        summary[status] += 1
        if status != "PASS":
            failing_rows.append(ri)

        print(f"[Row {ri}] {status}  ({len(imgs)} images)  {ce_text}")
        for level, msg in row_issues:
            print(f"    {level}: {msg}")

    print()
    print("=== Summary ===")
    print(f"Total rows : {len(rows)}")
    print(f"PASS       : {summary['PASS']}")
    print(f"WARN       : {summary['WARN']}")
    print(f"FAIL       : {summary['FAIL']}")
    if failing_rows:
        print(f"Rows needing attention: {failing_rows}")

    if summary["FAIL"] > 0:
        return 1
    if strict and summary["WARN"] > 0:
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser(description="Verify a claim chart config")
    ap.add_argument("--config", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--accused")
    ap.add_argument("--keywords")
    ap.add_argument("--min-images", type=int, default=2)
    ap.add_argument("--no-ocr", action="store_true", help="disable OCR-based checks")
    ap.add_argument("--strict", action="store_true",
                    help="treat WARN as failure (non-zero exit)")
    args = ap.parse_args()
    return verify(args.config, args.report, args.accused, args.min_images,
                  args.keywords, args.strict, not args.no_ocr)


if __name__ == "__main__":
    sys.exit(main())
