# Claim Chart

A Codex skill for generating patent claim chart documents in `.docx` format.
It helps map patent claim elements to product evidence, references, and
screenshots using a repeatable JSON-driven workflow.

## What It Does

- Extracts text, URLs, and images from DOCX, XLSX, and PPTX evidence bundles.
- Stages deduplicated screenshots for use in a generated claim chart.
- Generates a Word document with claim elements, references, mapping tables,
  formatted comment blocks, and evidence images.
- Verifies that each claim row has enough images and that selected evidence
  appears to match the accused-party keywords you provide.

## Repository Layout

```text
.
├── SKILL.md
├── scripts/
│   ├── create_claimchart.js
│   ├── extract_evidence.py
│   └── verify_claimchart.py
└── references/
    ├── example-config.json
    ├── evidence-writing-guide.md
    └── template-analysis.md
```

## Requirements

- Node.js
- Python 3
- Node package: `docx`
- Python packages: `python-docx`, `openpyxl`
- Optional: `tesseract` for OCR-assisted verification

Install the main dependencies:

```bash
npm install -g docx
pip install python-docx openpyxl
```

## Basic Workflow

### 1. Extract Evidence

```bash
python3 scripts/extract_evidence.py /path/to/project /tmp/claim_evidence --patent US00000000
```

This creates:

- `/tmp/claim_evidence/staged/` with deduplicated images.
- `/tmp/claim_evidence/evidence_report.json` with extracted text, URLs, image
  metadata, and source-document information.

### 2. Create a Config

Copy `references/example-config.json` and replace the placeholder values with
your claim text, references, mapping data, comments, and staged image paths.

The generator expects fields such as:

- `patentNumber`
- `accusedParty`
- `outputPath`
- `claimElements`
- `references`
- `mappingData`
- `claimGroups`

See `references/evidence-writing-guide.md` and
`references/template-analysis.md` for more detail.

### 3. Generate the DOCX

```bash
NODE_PATH=$(npm root -g) node scripts/create_claimchart.js /path/to/config.json
```

### 4. Verify the Config

```bash
python3 scripts/verify_claimchart.py \
  --config /path/to/config.json \
  --report /tmp/claim_evidence/evidence_report.json \
  --accused "ExampleCo" \
  --keywords "ExampleCo,SampleDrive" \
  --min-images 2
```

Use `--strict` to treat warnings as failures, and `--no-ocr` if OCR is not
available or not needed.

## Notes

- The included example uses neutral placeholder values only.
- Real case materials, generated evidence reports, staged images, and output
  documents should stay outside the repository unless they are intentionally
  sanitized for publication.
- This tool helps automate document generation and review checks; it does not
  provide legal advice.

## License

MIT
