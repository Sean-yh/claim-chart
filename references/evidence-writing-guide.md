# Evidence Writing Guide

This guide details how to write effective claim chart evidence text. Read this when composing the `comment.introText` and `herein` parts of each claim group.

## The Standard Format

Each evidence cell follows this pattern:

```
[Comment: {Paragraph 1: what the accused does}

{Paragraph 2: technical detail — specific products, architectures, features}

{Paragraph 3 (optional): additional supporting context}

Herein, "{exact claim phrase}" corresponds to {product feature name}{clarifying post-text}]

[empty line]

[Ref-N] https://example.com/reference-n
[Image 1]
[Image 2]

[Ref-M] https://example.com/reference-m
[Image 3]
...
```

## Comment Block Principles

### Paragraph 1 — The Mapping Statement

Open with a direct statement of what the accused product does that maps to this claim element. Use neutral, factual language; avoid legal conclusions.

**Good example (sample row 0):**
> ExampleCo's autonomous driving platform is an automated driving system deployed in ExampleCo-equipped vehicles. The platform integrates onboard computing, perception, planning, and control so that the vehicle can operate according to system-generated driving instructions.

### Paragraph 2 — Technical Substance

Name specific products, modules, platforms, APIs, or architectures. Cite materials ("ExampleCo materials describe..." / "the product architecture overview includes..."). This is where you bind vague claim terms to concrete product features.

**Good example (sample row 0):**
> ExampleCo materials describe the system as an automated driving system with a computational platform used to run the software and with planning and motion-control functionality that determines how the vehicle should drive.

### Paragraph 3 — Additional Context (Optional)

Use when the first two paragraphs don't cover everything. Examples:
- Cross-references to related product lines or platform variants
- Third-party collaborations, supplier modules, or integration partners
- Product hierarchy (L2 vs L4 differences)

### The "Herein" Mapping

Ends the comment block and links the exact claim phrase to the product feature name:

```
Herein, "{EXACT CLAIM PHRASE}" corresponds to {PRODUCT PHRASE}, {POST-TEXT}.
```

- **Claim phrase**: copy verbatim from the patent claim (or a meaningful sub-phrase). Bold+italic.
- **Product phrase**: the accused product's corresponding name/module. Bold+italic.
- **Post**: a short clarifying tail, usually describing what that product does. Italic.

## Evidence Block Principles

### Reference Count per Row

| Evidence quality | Refs per row | Images per row |
|-----------------|--------------|----------------|
| Light (single-point) | 2-3 | 3-5 |
| Standard (target) | 4-6 | 6-8 |
| Heavy (contested elements) | 6-8 | 8-12 |

**Target**: 4-6 references and 6-8 images per claim group row. For a typical 4-element claim, that's 25-35 total images in the document.

### Reference Diversity

Don't stack all images under one reference. Split evidence across multiple URLs so the chart shows corroboration from different sources:
- Official product pages (e.g., `example.com/product-overview`)
- Investor/corporate materials (`example.com/investor-materials`)
- Technical whitepapers (`example.com/technical-whitepaper.pdf`)
- Press releases, regulatory filings, or product documentation
- Safety/regulatory filings

### Image Ordering within a Block

Within each `evidenceBlock`, images appear in the order listed. Order them so the first image establishes context and later images provide detail:

```json
{
  "refId": 3,
  "url": "https://example.com/reference-1",
  "images": [
    "img_overview.png",     // top-level diagram
    "img_detail1.png",       // specific feature zoom
    "img_detail2.png"        // supporting detail
  ]
}
```

## Writing Style

- **Italic throughout the comment block** — this is the house style; the generator handles formatting automatically
- **Neutral factual voice** — describe, don't argue
- **Present tense** — "ExampleCo's system does X" not "ExampleCo's system did X"
- **Name things specifically** — "SampleDrive driver assistance module" beats "ExampleCo's driver assistance"
- **Unicode quotes** — use `\u201C` and `\u201D` for curly quotes in JSON (the generator uses these in "Herein")

## Common Pitfalls

1. **Vague comments** — "ExampleCo has autonomous driving" is too generic. Say which system, what it does, what module corresponds.
2. **Too few references** — relying on one URL makes the chart weak. Diversify.
3. **Image-to-comment mismatch** — if your comment talks about "sensor fusion" but the image shows corporate branding, that's a disconnect.
4. **Copy-paste from other rows** — each row's comment should be tuned to its specific claim element.
5. **Missing "Herein" phrase match** — the claim phrase in "Herein" must actually appear in that row's claim element text.
