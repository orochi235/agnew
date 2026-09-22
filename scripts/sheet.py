#!/usr/bin/env python3
"""Tile screenshots into one contact sheet: sheet.py OUT.png COLS FILE..."""
import sys
from PIL import Image

out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
w, h = 384, 240
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), (34, 34, 34))
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB')
    im.thumbnail((w - 6, h - 6))
    sheet.paste(im, ((i % cols) * w + 3, (i // cols) * h + 3))
sheet.save(out)
