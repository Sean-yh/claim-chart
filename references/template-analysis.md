# Analyzing Input Templates and References

When the user provides a template docx and/or a reference completed docx, analyze them before writing the config. This guide shows how to extract the information you need.

## Template docx (what to fill in)

The template is typically a partially-completed chart — left column has claim text, right column is empty or has headers. Extract:

1. **Patent number** — top of left column of overview table
2. **Claim elements** — each paragraph in the left column of the overview table
3. **Mapping table features** — if the nested table exists, extract the "Claim Feature" column values (left column values)
4. **Detailed chart row structure** — how claim elements are grouped into rows in Table 1

### Extraction snippet

```python
from docx import Document
doc = Document("template.docx")

# Overview table - usually tables[0]
overview = doc.tables[0]
# Left cell: patent + claim text
left_cell = overview.rows[0].cells[0]
for para in left_cell.paragraphs:
    print(para.text.strip())

# Nested mapping table
right_cell = overview.rows[0].cells[1]
if right_cell.tables:
    mapping = right_cell.tables[0]
    features = [row.cells[0].text.strip() for row in mapping.rows]
    print("Mapping features:", features)

# Detailed chart - usually tables[1]
detailed = doc.tables[1]
for ri, row in enumerate(detailed.rows):
    print(f"Row {ri} claim text:", row.cells[0].text.strip()[:100])
```

## Reference docx (what the format looks like)

The reference is a completed chart for a different accused party. Extract:

1. **Comment block structure** — how many paragraphs, what order
2. **Evidence block pattern** — refs per row, images per ref
3. **Overall image count** — total images in the document, distribution per row
4. **Reference URLs** — to understand what kinds of sources are cited
5. **"Herein" phrasing** — exact language used in the mapping statement

### Format analysis snippet

```python
from docx import Document
doc = Document("reference.docx")
table = doc.tables[1]  # detailed chart

for ri, row in enumerate(table.rows):
    cell = row.cells[1]
    para_count = 0
    img_count = 0
    ref_count = 0
    for para in cell.paragraphs:
        if para.text.strip():
            para_count += 1
        if para.text.strip().startswith("[Ref-"):
            ref_count += 1
        for run in para.runs:
            blips = run._element.findall(
                './/{http://schemas.openxmlformats.org/drawingml/2006/main}blip')
            img_count += len(blips)
    print(f"Row {ri}: {para_count} paras, {ref_count} refs, {img_count} images")
```

## Using the reference to calibrate your output

Count the reference's images per row and match that volume. If the reference has 12-16 images per row, aim for similar. If it has only 3-5, match that lighter cadence.

Don't copy the reference's comment text — write fresh content tuned to the accused party's actual products and evidence. But match the *structure*: same number of paragraphs, same rough length, same "Herein" phrasing pattern.
