"""Emit a vector QR SVG for the immutable first-party Web Book URL."""

import re
import sys

from reportlab.graphics import renderSVG
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing


def main():
    value = sys.stdin.read().strip()
    if not re.fullmatch(
        r"https://(?:www\.tateito-yokoito\.jp|tateyoko-book-test\.vercel\.app)/\?voice=[a-f0-9]{48}",
        value,
    ):
        raise SystemExit("Invalid Web Book URL")
    widget = QrCodeWidget(value, barLevel="H", barBorder=4)
    left, bottom, right, top = widget.getBounds()
    drawing = Drawing(right - left, top - bottom)
    drawing.add(widget)
    sys.stdout.write(renderSVG.drawToString(drawing))


if __name__ == "__main__":
    main()
