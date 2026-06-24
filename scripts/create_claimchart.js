/**
 * Claim Chart Document Generator
 *
 * Creates a professional patent claim chart in .docx format from a JSON config.
 *
 * Usage:
 *   NODE_PATH=$(npm root -g) node create_claimchart.js <config.json>
 *
 * Config JSON structure: see CONFIG SCHEMA below.
 */

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation,
  BorderStyle, WidthType, ShadingType, ImageRun,
  PageNumber, PageBreak, ExternalHyperlink
} = require("docx");

/*
 * CONFIG SCHEMA (config.json):
 * {
 *   "patentNumber": "US 00,000,000",
 *   "accusedParty": "ExampleCo",
 *   "outputPath": "/path/to/output.docx",
 *   "claimElements": ["1. An autonomous...", "a) an RSU...", ...],
 *   "references": [
 *     { "id": 1, "url": "https://example.com/reference-1" },
 *     ...
 *   ],
 *   "mappingData": [
 *     ["Claim Feature", "Corresponding Element"],
 *     ...
 *   ],
 *   "claimGroups": [
 *     {
 *       "claimElementIndices": [0],
 *       "comment": {
 *         "introText": ["Paragraph 1...", "Paragraph 2..."],
 *         "herein": {
 *           "claimPhrase": "exact claim text",
 *           "productPhrase": "product feature",
 *           "post": " additional clarification."
 *         }
 *       },
 *       "evidenceBlocks": [
 *         { "refId": 1, "url": "https://example.com/reference-1", "images": ["path1.png", "path2.png"] },
 *         ...
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */

// ========== PNG dimension reader ==========
function getPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG fallback
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    return { width: 800, height: 400 };
  }
  return { width: 800, height: 400 };
}

// ========== CONSTANTS ==========
const FONT_SIZE = 20; // half-points (10pt)
const TABLE_FULL_WIDTH = 15205;
const COL_LEFT = 4675;
const COL_RIGHT = 10530;
const MAP_TBL_W = 9797;
const MAP_COL_L = 4736;
const MAP_COL_R = 5061;
const MAX_IMG_WIDTH = 280;

// ========== HELPERS ==========
function tp(text, opts = {}) {
  const rp = { text, size: FONT_SIZE, font: "Times New Roman" };
  if (opts.bold) rp.bold = true;
  if (opts.italics) rp.italics = true;
  const pp = {
    children: [new TextRun(rp)],
    spacing: { after: opts.sa !== undefined ? opts.sa : 120 }
  };
  if (opts.center) pp.alignment = AlignmentType.CENTER;
  return new Paragraph(pp);
}

function emptyP() {
  return new Paragraph({ children: [new TextRun({ text: "", size: FONT_SIZE })] });
}

function makeComment(introText, hereinParts) {
  const paras = [];

  paras.push(new Paragraph({
    children: [
      new TextRun({ text: "[Comment: ", bold: true, italics: true, size: FONT_SIZE, font: "Times New Roman" }),
      new TextRun({ text: introText[0], italics: true, size: FONT_SIZE, font: "Times New Roman" }),
    ],
    spacing: { after: 120 }
  }));

  for (let i = 1; i < introText.length; i++) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: introText[i], italics: true, size: FONT_SIZE, font: "Times New Roman" })],
      spacing: { after: 120 }
    }));
  }

  paras.push(emptyP());

  paras.push(new Paragraph({
    children: [
      new TextRun({ text: "Herein, \u201C", italics: true, size: FONT_SIZE, font: "Times New Roman" }),
      new TextRun({ text: hereinParts.claimPhrase, bold: true, italics: true, size: FONT_SIZE, font: "Times New Roman" }),
      new TextRun({ text: "\u201D corresponds to ", italics: true, size: FONT_SIZE, font: "Times New Roman" }),
      new TextRun({ text: hereinParts.productPhrase, bold: true, italics: true, size: FONT_SIZE, font: "Times New Roman" }),
      new TextRun({ text: (hereinParts.post || ".") + "]", italics: true, size: FONT_SIZE, font: "Times New Roman" }),
    ],
    spacing: { after: 120 }
  }));

  return paras;
}

function refPara(refId, url) {
  return new Paragraph({
    children: [
      new TextRun({ text: `[Ref-${refId}] `, size: FONT_SIZE, font: "Times New Roman" }),
      new ExternalHyperlink({
        children: [new TextRun({ text: url, style: "Hyperlink", size: FONT_SIZE, font: "Times New Roman" })],
        link: url,
      }),
    ],
    spacing: { after: 60 }
  });
}

function imgPara(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("Image not found:", filePath);
    return emptyP();
  }
  const dim = getPngDimensions(filePath);
  const scale = Math.min(MAX_IMG_WIDTH / dim.width, 1);
  const w = Math.round(dim.width * scale);
  const h = Math.round(dim.height * scale);

  const imgType = filePath.toLowerCase().endsWith(".jpg") || filePath.toLowerCase().endsWith(".jpeg")
    ? "jpg" : "png";

  return new Paragraph({
    children: [new ImageRun({
      type: imgType,
      data: fs.readFileSync(filePath),
      transformation: { width: w, height: h },
      altText: {
        title: path.basename(filePath),
        description: "Evidence screenshot",
        name: path.basename(filePath)
      },
    })],
    spacing: { after: 120 }
  });
}

function evidenceBlock(refId, url, imgPaths) {
  const items = [emptyP(), refPara(refId, url)];
  for (const p of imgPaths) {
    items.push(imgPara(p));
  }
  return items;
}

// ========== BUILD FROM CONFIG ==========
function buildDocument(config) {
  const { patentNumber, accusedParty, claimElements, references, mappingData, claimGroups } = config;
  const footerText = config.footerText || "Confidential";

  // --- Nested mapping table ---
  function createMappingTable() {
    const hdrRow = new TableRow({
      children: [
        new TableCell({
          width: { size: MAP_COL_L, type: WidthType.DXA },
          shading: { fill: "D9D9D9", type: ShadingType.CLEAR },
          children: [tp("Claim Feature", { bold: true, center: true, sa: 0 })]
        }),
        new TableCell({
          width: { size: MAP_COL_R, type: WidthType.DXA },
          shading: { fill: "D9D9D9", type: ShadingType.CLEAR },
          children: [tp(`Corresponding Element in ${accusedParty}`, { bold: true, center: true, sa: 0 })]
        }),
      ]
    });
    const dataRows = mappingData.map(([feat, elem]) =>
      new TableRow({
        children: [
          new TableCell({ width: { size: MAP_COL_L, type: WidthType.DXA }, children: [tp(feat, { center: true, sa: 0 })] }),
          new TableCell({ width: { size: MAP_COL_R, type: WidthType.DXA }, children: [tp(elem, { center: true, sa: 0 })] }),
        ]
      })
    );
    return new Table({
      width: { size: MAP_TBL_W, type: WidthType.DXA },
      columnWidths: [MAP_COL_L, MAP_COL_R],
      style: "TableGrid",
      rows: [hdrRow, ...dataRows]
    });
  }

  // --- Overview table ---
  function createOverviewTable() {
    const rightChildren = [
      tp(accusedParty, { bold: true, center: true }),
      emptyP(),
      tp("References:", { bold: true }),
    ];
    for (const ref of references) {
      rightChildren.push(new Paragraph({
        children: [
          new TextRun({ text: `[Ref-${ref.id}] `, size: FONT_SIZE, font: "Times New Roman" }),
          new ExternalHyperlink({
            children: [new TextRun({ text: ref.url, style: "Hyperlink", size: FONT_SIZE, font: "Times New Roman" })],
            link: ref.url,
          }),
        ],
        spacing: { after: 40 }
      }));
    }
    rightChildren.push(emptyP());
    rightChildren.push(createMappingTable());
    rightChildren.push(emptyP());

    return new Table({
      width: { size: TABLE_FULL_WIDTH, type: WidthType.DXA },
      columnWidths: [COL_LEFT, COL_RIGHT],
      style: "TableGrid",
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: COL_LEFT, type: WidthType.DXA },
            shading: { fill: "F2F2F2", type: ShadingType.CLEAR },
            children: [
              tp(patentNumber, { bold: true, center: true, sa: 120 }),
              ...claimElements.map((el, i) => tp(el, { sa: i === claimElements.length - 1 ? 0 : 120 })),
              emptyP()
            ]
          }),
          new TableCell({
            width: { size: COL_RIGHT, type: WidthType.DXA },
            shading: { fill: "F2F2F2", type: ShadingType.CLEAR },
            children: rightChildren
          }),
        ]
      })]
    });
  }

  // --- Detailed chart ---
  function createDetailedChart() {
    const rows = claimGroups.map(group => {
      const leftTexts = group.claimElementIndices.map(idx => claimElements[idx]);
      const leftChildren = leftTexts.map(t => tp(t, { sa: 120 }));
      leftChildren.push(emptyP());

      // Build evidence content
      const rightChildren = [];

      // Comment block
      if (group.comment) {
        rightChildren.push(...makeComment(group.comment.introText, group.comment.herein));
      }

      // Evidence blocks
      for (const eb of (group.evidenceBlocks || [])) {
        rightChildren.push(...evidenceBlock(eb.refId, eb.url, eb.images || []));
      }

      return new TableRow({
        children: [
          new TableCell({ width: { size: COL_LEFT, type: WidthType.DXA }, children: leftChildren }),
          new TableCell({ width: { size: COL_RIGHT, type: WidthType.DXA }, children: rightChildren }),
        ]
      });
    });

    return new Table({
      width: { size: TABLE_FULL_WIDTH, type: WidthType.DXA },
      columnWidths: [COL_LEFT, COL_RIGHT],
      style: "TableGrid",
      rows
    });
  }

  // --- Assemble document ---
  return new Document({
    styles: {
      default: { document: { run: { font: "Times New Roman", size: FONT_SIZE } } },
      paragraphStyles: [{
        id: "TableGrid", name: "Table Grid", basedOn: "TableNormal",
        run: { font: "Times New Roman" },
        table: {
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
          }
        }
      }],
      characterStyles: [{
        id: "Hyperlink", name: "Hyperlink", basedOn: "DefaultParagraphFont",
        run: { color: "0563C1", underline: { type: "single" } }
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      headers: { default: new Header({ children: [emptyP()] }) },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: footerText, bold: true, size: 20 })]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", size: 20, font: "Arial" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 20, font: "Arial" }),
                new TextRun({ text: " (", size: 20, font: "Arial" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20, font: "Arial" }),
                new TextRun({ text: ")", size: 20, font: "Arial" }),
              ]
            }),
          ]
        })
      },
      children: [
        createOverviewTable(),
        new Paragraph({ children: [new PageBreak()] }),
        createDetailedChart(),
      ]
    }]
  });
}

// ========== MAIN ==========
const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: node create_claimchart.js <config.json>");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const doc = buildDocument(config);

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(config.outputPath, buffer);
  console.log("Document created: " + config.outputPath);
  console.log("File size: " + (buffer.length / 1024 / 1024).toFixed(2) + " MB");
}).catch(err => {
  console.error("Error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
