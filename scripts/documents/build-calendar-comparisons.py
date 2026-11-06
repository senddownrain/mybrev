#!/usr/bin/env python3
"""Assemble review figures from the original PDF and browser screenshots.
No application data is changed. Requires PyMuPDF and Pillow.
"""
from pathlib import Path
import os
import fitz
from PIL import Image, ImageDraw, ImageFont
root = Path(__file__).resolve().parents[2]
out = root / os.environ.get('SOURCE_EVIDENCE_DIR', 'reports/source-review/documents')
pdf = fitz.open(root / 'public/documents/proper-calendar.pdf')
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 19)
for number in [1, 5, 8, 12, 13]:
    rendered = pdf[number - 1].get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
    left = Image.frombytes('RGB', [rendered.width, rendered.height], rendered.samples)
    right = Image.open(out / f'html-sheet-{number:02}.png').convert('RGB')
    width = 600
    def fit(image):
        return image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
    left, right = fit(left), fit(right)
    result = Image.new('RGB', (width * 2 + 40, max(left.height, right.height) + 55), 'white')
    result.paste(left, (0, 50)); result.paste(right, (width + 40, 50))
    draw = ImageDraw.Draw(result)
    draw.text((12, 12), f'PDF — ліст {number}', fill='black', font=font)
    draw.text((width + 48, 12), 'HTML — той жа дыяпазон', fill='black', font=font)
    draw.line((width + 20, 0, width + 20, result.height), fill='#bbbbbb', width=1)
    result.save(out / f'compare-sheet-{number:02}.png', optimize=True)
print('Five PDF → HTML comparison figures generated')
