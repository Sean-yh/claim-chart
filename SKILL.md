---
name: claim-chart
description: Create patent claim charts in Word (.docx) format for legal/IP analysis. Trigger whenever the user mentions "claim chart", "侵权分析", "专利对比", "权利要求对照表", or wants to produce a Word document that maps patent claims to an accused product/system with evidence references and screenshots. Use this skill when creating infringement charts, validity charts, or any docx with two-column claim-vs-evidence layout. Also trigger when the user mentions a project directory containing patent evidence files (docx, xlsx, pptx) and a template claim chart.
---

# Claim Chart Skill

Generates professional patent claim chart documents in `.docx` format for IP litigation. Maps patent claims (left column) against accused product evidence (right column) with formatted comments, reference hyperlinks, and screenshot images.

## Quick Start

The workflow has three phases: **Extract** evidence from source documents, **Compose** the config JSON, and **Generate** the Word document. Each phase has a bundled script so the work is deterministic — your job is to read the source material, understand the patent claims, synthesize the evidence, and write the config.

**Reference files** — read these when you need more detail:
- `references/template-analysis.md` — how to extract claim text and format conventions from user-provided template/reference docx files
- `references/evidence-writing-guide.md` — how to write comment blocks and pick images (volume targets, reference diversity, common pitfalls)
- `references/example-config.json` — a full working config JSON you can copy and adapt

## Phase 1: Extract Evidence

Run the extraction script to scan the project directory for all DOCX/XLSX/PPTX files, pull out images, text, and URLs, and deduplicate everything into a staging area:

```bash
python3 SKILL_DIR/scripts/extract_evidence.py <project_dir> /tmp/claim_evidence [--patent PATENT_ID]
```

This produces:
- `/tmp/claim_evidence/staged/` — deduplicated PNG images with sequential names (`img_000.png`, `img_001.png`, ...)
- `/tmp/claim_evidence/evidence_report.json` — structured report with all text, URLs, and image metadata

Read the report JSON to understand what evidence is available. The staged images are sorted by file size (larger images are typically more informative screenshots rather than small icons/logos).

### What evidence sources look like

Evidence comes in several forms — the extraction handles all of them:

| Source type | What it contains | How images are stored |
|-------------|------------------|----------------------|
| Claim chart DOCX (3-col) | Claim text, spec support, evidence text + screenshots | `word/media/` inside the zip |
| Claim chart DOCX (2-col) | Claim text, evidence text + screenshots | `word/media/` inside the zip |
| Evidence PPTX | Presentation slides with annotated screenshots | `ppt/media/` inside the zip |
| Mapping XLSX | Claim-to-product feature mapping tables | No images, text only |

## Phase 2: Compose the Config

Create a JSON config file that drives the document generator. This is the creative step — you need to:

1. **Identify claim elements** from the template/source claim chart (left column text)
2. **Select references** — gather all relevant URLs from the evidence report, pick the strongest ones (aim for 10–15 references)
3. **Build the mapping table** — one row per claim feature, mapping to the accused product's corresponding element
4. **Write evidence for each claim group** — synthesize comment text and pick images

### Config JSON Structure

```json
{
  "patentNumber": "US 00,000,000",
  "accusedParty": "ExampleCo",
  "outputPath": "/path/to/output.docx",
  "claimElements": [
    "1. An autonomous vehicle (AV) control system comprising:",
    "a) an RSU communication module...",
    "b) a vehicle control module...",
    "wherein said vehicle-specific control instructions..."
  ],
  "references": [
    { "id": 1, "url": "https://example.com/reference-1" },
    { "id": 2, "url": "https://example.com/reference-2" }
  ],
  "mappingData": [
    ["AV Control System", "Accused product's corresponding system"],
    ["RSU Communication Module", "Accused product's comm module"]
  ],
  "claimGroups": [
    {
      "claimElementIndices": [0],
      "comment": {
        "introText": [
          "First paragraph of analysis...",
          "Second paragraph with more detail..."
        ],
        "herein": {
          "claimPhrase": "an autonomous vehicle (AV) control system",
          "productPhrase": "ExampleCo's autonomous driving system",
          "post": ", which integrates X, Y, and Z."
        }
      },
      "evidenceBlocks": [
        {
          "refId": 1,
          "url": "https://example.com/reference-1",
          "images": ["/tmp/claim_evidence/staged/img_005.png", "/tmp/claim_evidence/staged/img_012.png"]
        }
      ]
    }
  ]
}
```

### Writing Good Evidence

Each claim group needs a **comment block** and **evidence blocks**:

**Comment block** — 2-3 paragraphs of italic analysis text explaining how the accused product maps to the claim element. Follow the completed reference chart format:
- First paragraph: describe what the accused product does that relates to the claim
- Second paragraph: provide technical details and specific product names/features
- Third paragraph (optional): additional supporting context
- "Herein" mapping: explicitly state which claim phrase corresponds to which product phrase

**Evidence blocks** — each block is a reference URL followed by 1-3 screenshot images from that source. Aim for:
- **6-8 images per claim group row** (25-35 total across all rows)
- **4-6 evidence blocks per row** (each with its own reference)
- Use different references for variety — don't pile all images under one ref

### Selecting Images

When picking from the staged images:
1. Read `evidence_report.json` to understand which source document each image came from and which claim row it was used in
2. Prefer images that show product architecture, system diagrams, UI screenshots, and technical specifications
3. Skip images that are just patent text, claim text, or decorative logos (these are usually small — under 20KB)
4. Cross-reference with the evidence text to match images to the right claim elements
5. Use images from multiple source documents for breadth

## Phase 3: Generate the Document

Run the generator with your config:

```bash
NODE_PATH=$(npm root -g) node SKILL_DIR/scripts/create_claimchart.js /path/to/config.json
```

## Phase 4: Verify the Config (mandatory)

Always run the verifier on the config you just generated, **before** declaring the
chart finished. The verifier flags two common failure modes:

1. Rows that don't have enough images (`--min-images N`, default 2 — tighten to
   3 when the user expects "at least 2-3 per row")
2. Images sourced from a document whose filename has no accused-party keyword —
   for an accused = "ExampleCo" chart, an image whose only source is
   `Template US00000000 v OtherCo.docx` (OtherCo template) or
   `US00000000 vs ExampleCo_System.docx` (yes — that one mentions ExampleCo) is suspicious if no
   ExampleCo/product keyword appears in either `source_doc` or the
   `also_in` list. Those are typically claim-text screenshots from a different
   defendant's chart that got pulled in by deduplication.

```bash
python3 SKILL_DIR/scripts/verify_claimchart.py \
    --config /path/to/config.json \
    --report /tmp/claim_evidence/evidence_report.json \
    --accused "ExampleCo" \
    --min-images 2
```

The verifier also raises **WARN**s for images whose dimensions look like
patent-claim text screenshots (extreme width-to-height ratio, e.g. 900×150) and
for tiny images (<25 KB, often logos). WARNs don't fail by default; pass
`--strict` to make WARNs non-zero exit.

### How to act on the report

- **FAIL on image count** — add more `evidenceBlocks` until each row has ≥ N
  images. Pull from images whose `source_doc` or `also_in` mention the accused
  party.
- **FAIL on source-doc keyword** — the chosen image came from a chart for a
  different party. Either find a replacement from an accused-party doc, or
  if the image legitimately depicts the accused product, expand `--keywords`
  to include the product name and rerun.
- **WARN on aspect ratio / size** — visually confirm the image is not just
  patent specification text. If it is, swap it for a product diagram or
  screenshot from the same source document.

### Re-do the matching when fails persist

If multiple FAILs appear in one row, the underlying issue is usually a weak
semantic match between the chosen claim element and the available evidence.
Re-pick the images: re-read `evidence_report.json` to find which staged image
appeared in accused-party source rows that map to the same concept as the
current claim element, and update the config rather than patching one image at
a time.

After fixing, regenerate the docx and rerun the verifier. The chart is done
only when all rows are PASS (or PASS / WARN with documented reasons).

## Document Format Reference

### Layout

| Property | Value |
|----------|-------|
| Page orientation | Landscape |
| Page size | A4 (11906 × 16838 DXA) |
| Margins | 720 DXA (0.5") all sides |
| Font | Times New Roman, 10pt |
| Table style | TableGrid with single borders |

### Table Widths

| Component | Total | Left col | Right col |
|-----------|-------|----------|-----------|
| Main tables | 15205 DXA | 4675 DXA | 10530 DXA |
| Mapping table (nested) | 9797 DXA | 4736 DXA | 5061 DXA |

### Cell Shading

- Overview cells: `#F2F2F2` (light gray)
- Mapping table header: `#D9D9D9` (gray)

### Image Sizing

All images are scaled to max 280px width, maintaining aspect ratio. The generator reads PNG dimensions from header bytes and JPEG gets a fallback size.

### Comment Block Formatting

```
[Comment: {bold+italic} {italic explanation text}

{italic} Herein, "{bold+italic claim phrase}" corresponds to {bold+italic product phrase}{italic post-text}]
```

## Dependencies

- **Node.js** with `docx` package: `npm install -g docx`
- **Python 3** with `python-docx` and `openpyxl`: `pip install python-docx openpyxl`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Image not found` warnings | Check that staged image paths in config match actual files in `/tmp/claim_evidence/staged/` |
| `.tmp` extension images | These are valid images with wrong extension; the extractor handles them automatically |
| JPEG images not rendering | The generator supports both PNG and JPEG; ensure file extension matches content |
| Missing `docx` module | Run `npm install -g docx` (needs version 9+) |
| Very small output file | Likely no images loaded — verify image paths exist |
