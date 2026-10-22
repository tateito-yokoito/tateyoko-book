#!/usr/bin/env python3
"""Conservative PDF inspection for customer-book proof and printer preparation.

A passing technical check never means the vendor has accepted the file. In
particular, covers, foil dies and paper-dependent colour require separate proof.
"""
import argparse
import hashlib
import json
import re
import subprocess
import unicodedata
from xml.etree import ElementTree
from pathlib import Path
from math import hypot

try:
    from pypdf import PdfReader
    from pypdf.generic import ContentStream
except ImportError as error:
    raise SystemExit("pypdf is required (use the bundled workspace Python)") from error

PT_PER_MM = 72 / 25.4
B5 = (182, 257)
VENDORS = {"booklet-king", "speed-books"}
MIN_COLOR_IMAGE_DPI = 300


def size_mm(box):
    return (float(box.width) / PT_PER_MM, float(box.height) / PT_PER_MM)


def close_size(actual, expected, tolerance=0.35):
    return all(abs(a - b) <= tolerance for a, b in zip(actual, expected))


def page_resources(page):
    """Visit page and Form XObject resources, where print fonts/images may hide."""
    seen = set()
    stack = [page.get("/Resources")]
    while stack:
        resource = stack.pop()
        if not resource:
            continue
        resource = resource.get_object() if hasattr(resource, "get_object") else resource
        if id(resource) in seen:
            continue
        seen.add(id(resource))
        yield resource
        for ref in resource.get("/XObject", {}).values():
            obj = ref.get_object()
            if obj.get("/Subtype") == "/Form":
                stack.append(obj.get("/Resources"))


def font_report(reader):
    fonts = {}
    for page in reader.pages:
        for resources in page_resources(page):
            for resource_name, ref in resources.get("/Font", {}).items():
                font = ref.get_object()
                descriptor = font.get("/FontDescriptor")
                if not descriptor and font.get("/DescendantFonts"):
                    descriptor = font["/DescendantFonts"][0].get_object().get("/FontDescriptor")
                descriptor = descriptor.get_object() if descriptor else {}
                name = str(font.get("/BaseFont") or descriptor.get("/FontName") or resource_name)
                # Type 3 fonts carry their glyph programs in /CharProcs rather than
                # an external FontFile. Chromium uses this form for Noto CJK text.
                embedded = bool(font.get("/CharProcs")) if font.get("/Subtype") == "/Type3" else any(
                    key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3")
                )
                fonts[name] = fonts.get(name, True) and embedded
    return [{"name": name, "embedded": embedded} for name, embedded in sorted(fonts.items())]


def color_report(reader):
    spaces = set()
    for page in reader.pages:
        for resources in page_resources(page):
            for ref in resources.get("/XObject", {}).values():
                image = ref.get_object()
                if image.get("/Subtype") != "/Image":
                    continue
                color = image.get("/ColorSpace")
                if isinstance(color, list):
                    color = color[0]
                spaces.add(str(color or "unknown"))
            for ref in resources.get("/ColorSpace", {}).values():
                color = ref.get_object() if hasattr(ref, "get_object") else ref
                if isinstance(color, list) and color:
                    spaces.add(str(color[0]))
    return sorted(spaces)


def is_rgb_space(space, resources=None, seen_names=None):
    space = space.get_object() if hasattr(space, "get_object") else space
    if isinstance(space, str) and space.startswith("/") and resources:
        seen_names = seen_names or set()
        if space in seen_names:
            return False
        alias = resources.get("/ColorSpace", {}).get(space)
        if alias is not None:
            return is_rgb_space(alias, resources, seen_names | {space})
    if str(space) in ("/DeviceRGB", "/CalRGB"):
        return True
    if not isinstance(space, list) or not space:
        return False
    kind = str(space[0])
    if kind in ("/DeviceRGB", "/CalRGB"):
        return True
    if kind == "/ICCBased" and len(space) > 1:
        profile = space[1].get_object() if hasattr(space[1], "get_object") else space[1]
        return int(profile.get("/N", 0)) == 3
    if kind == "/Indexed" and len(space) > 1:
        return is_rgb_space(space[1], resources, seen_names)
    return False


def recommended_speed_books_pdf_x(version, conformance):
    """Accept the PDF/X-1a and PDF/X-4a families recommended for InDesign.

    PDF/X-1a files commonly identify themselves with GTS_PDFXVersion
    `PDF/X-1:2001` and GTS_PDFXConformance `PDF/X-1a:2001`.
    """
    version = str(version or "")
    conformance = str(conformance or "")
    return (version.startswith("PDF/X-4")
            or version.startswith("PDF/X-1a")
            or (version.startswith("PDF/X-1:") and conformance.startswith("PDF/X-1a:")))


def pdf_x_metadata(reader):
    """Read PDF/X identifiers from Info or XMP; PDF/X-4 uses XMP by default."""
    info = reader.metadata or {}
    info_version = str(info.get("/GTS_PDFXVersion", ""))
    info_conformance = str(info.get("/GTS_PDFXConformance", ""))
    xmp_values = set()
    metadata = reader.trailer["/Root"].get("/Metadata")
    if metadata:
        try:
            root = ElementTree.fromstring(metadata.get_object().get_data())
            for element in root.iter():
                if element.tag.endswith("}GTS_PDFXVersion") and element.text:
                    xmp_values.add(element.text.strip())
                for key, value in element.attrib.items():
                    if key.endswith("}GTS_PDFXVersion") and value:
                        xmp_values.add(value.strip())
        except (ElementTree.ParseError, ValueError):
            return info_version, info_conformance, False
    consistent = len(xmp_values) <= 1 and (not info_version or not xmp_values or info_version in xmp_values)
    version = info_version or (next(iter(xmp_values)) if xmp_values else "")
    return version, info_conformance, consistent


def output_intent_report(reader):
    """Require an embedded, plausibly CMYK ICC profile for our print gate.

    This is only a structural check; it is not a PDF/X validator or a colour
    proof. An OutputConditionIdentifier alone must never count as a profile.
    """
    root = reader.trailer["/Root"]
    found = []
    for ref in root.get("/OutputIntents", []):
        intent = ref.get_object()
        profile_ref = intent.get("/DestOutputProfile")
        profile = profile_ref.get_object() if profile_ref else None
        try:
            data = profile.get_data() if profile else b""
        except Exception:
            data = b""
        channels = int(profile.get("/N", 0)) if profile else 0
        valid_cmyk_header = (len(data) >= 128 and data[36:40] == b"acsp"
                             and data[16:20] == b"CMYK" and channels == 4
                             and int.from_bytes(data[:4], "big") <= len(data))
        found.append({
            "identifier": str(intent.get("/OutputConditionIdentifier", "")),
            "subtype": str(intent.get("/S", "")),
            "profile_bytes": len(data),
            "profile_channels": channels,
            "profile_sha256": hashlib.sha256(data).hexdigest() if data else None,
            "embedded_cmyk_profile": valid_cmyk_header,
        })
    return found


def rgb_image_pages(reader):
    pages = set()
    for number, page in enumerate(reader.pages, 1):
        for resources in page_resources(page):
            for ref in resources.get("/XObject", {}).values():
                image = ref.get_object()
                if image.get("/Subtype") == "/Image" and is_rgb_space(
                    image.get("/ColorSpace"), resources):
                    pages.add(number)
    return sorted(pages)


def multiply_matrix(left, right):
    """Compose PDF affine matrices, retaining the physical placement scale."""
    a, b, c, d, e, f = left
    g, h, i, j, k, l = right
    return (a*g+c*h, b*g+d*h, a*i+c*j, b*i+d*j,
            a*k+c*l+e, b*k+d*l+f)


def artwork_report(reader):
    """Inspect placed raster resolution and explicit RGB painting, including forms.

    Missing or unparsable placement information is reported as unverified rather
    than silently assuming the image is suitable for print.
    """
    placements = []
    low_resolution_pages = set()
    rgb_paint_pages = set()
    unverified_pages = set()
    identity = (1, 0, 0, 1, 0, 0)

    def walk(stream, resources, matrix, page_number, user_unit, active_forms, depth=0):
        if depth > 12:
            unverified_pages.add(page_number)
            return
        resources = resources.get_object() if hasattr(resources, "get_object") else resources
        resources = resources or {}
        state = (matrix, "/DeviceGray", "/DeviceGray")
        saved = []
        try:
            operations = ContentStream(stream, reader).operations
        except Exception:
            unverified_pages.add(page_number)
            return
        for operands, operator in operations:
            if operator == b"q":
                saved.append(state)
            elif operator == b"Q":
                if saved:
                    state = saved.pop()
                else:
                    unverified_pages.add(page_number)
            elif operator == b"cm":
                try:
                    state = (multiply_matrix(state[0], tuple(float(x) for x in operands)),
                             state[1], state[2])
                except (TypeError, ValueError):
                    unverified_pages.add(page_number)
            elif operator in (b"cs", b"CS"):
                color = str(operands[0]) if operands else ""
                state = (state[0], color if operator == b"cs" else state[1],
                         color if operator == b"CS" else state[2])
            elif operator in (b"rg", b"RG"):
                rgb_paint_pages.add(page_number)
                state = (state[0], "/DeviceRGB" if operator == b"rg" else state[1],
                         "/DeviceRGB" if operator == b"RG" else state[2])
            elif operator in (b"g", b"G", b"k", b"K"):
                selected = "/DeviceGray" if operator in (b"g", b"G") else "/DeviceCMYK"
                state = (state[0], selected if operator in (b"g", b"k") else state[1],
                         selected if operator in (b"G", b"K") else state[2])
            elif operator in (b"sc", b"scn", b"SC", b"SCN"):
                selected = state[1] if operator in (b"sc", b"scn") else state[2]
                if is_rgb_space(selected, resources):
                    rgb_paint_pages.add(page_number)
            elif operator == b"INLINE IMAGE":
                unverified_pages.add(page_number)
            elif operator == b"Do":
                name = operands[0] if operands else None
                ref = resources.get("/XObject", {}).get(name)
                if not ref:
                    unverified_pages.add(page_number)
                    continue
                obj = ref.get_object()
                if obj.get("/Subtype") == "/Image":
                    pixels = (int(obj.get("/Width", 0)), int(obj.get("/Height", 0)))
                    width_pt = hypot(state[0][0], state[0][1]) * user_unit
                    height_pt = hypot(state[0][2], state[0][3]) * user_unit
                    dpi = (pixels[0] * 72 / width_pt if width_pt > 0 else 0,
                           pixels[1] * 72 / height_pt if height_pt > 0 else 0)
                    if not all(pixels) or min(dpi) <= 0:
                        unverified_pages.add(page_number)
                    elif min(dpi) < MIN_COLOR_IMAGE_DPI:
                        # Decide with full precision. A displayed 300.0dpi may
                        # otherwise conceal an actual value just below 300.
                        low_resolution_pages.add(page_number)
                    placements.append({"page": page_number, "name": str(name),
                                       "pixels": list(pixels),
                                       "effective_dpi": [round(value, 1) for value in dpi]})
                elif obj.get("/Subtype") == "/Form":
                    key = getattr(ref, "idnum", id(obj))
                    if key in active_forms:
                        unverified_pages.add(page_number)
                        continue
                    form_matrix = tuple(float(x) for x in obj.get("/Matrix", identity))
                    walk(obj, obj.get("/Resources") or resources,
                         multiply_matrix(state[0], form_matrix), page_number,
                         user_unit, active_forms | {key}, depth + 1)

    for number, page in enumerate(reader.pages, 1):
        stream = page.get_contents()
        if stream is not None:
            walk(stream, page.get("/Resources"), identity, number,
                 float(page.get("/UserUnit", 1)), set())
    return {"image_placements": placements,
            "low_resolution_pages": sorted(low_resolution_pages),
            "rgb_paint_pages": sorted(rgb_paint_pages),
            "unverified_pages": sorted(unverified_pages)}


def inspect(path, *, vendor=None, expected_body_pages=None, ordered_total_pages=None,
            cover=None, cover_role=None, spine_mm=None, template_id=None):
    if vendor and vendor not in VENDORS:
        raise ValueError(f"Unknown vendor: {vendor}")
    reader = PdfReader(str(path), strict=False)
    pages = len(reader.pages)
    fonts = font_report(reader)
    colors = color_report(reader)
    rgb_images = rgb_image_pages(reader)
    artwork = artwork_report(reader)
    intents = output_intent_report(reader)
    valid_intents = bool(intents) and all(
        intent["identifier"] and intent["subtype"] == "/GTS_PDFX"
        and intent["embedded_cmyk_profile"] for intent in intents)
    intent_names = [intent["identifier"] for intent in intents]
    pdfx, pdfx_conformance, pdfx_metadata_consistent = pdf_x_metadata(reader)
    trim_sizes = [size_mm(page.trimbox) for page in reader.pages]
    media_sizes = [size_mm(page.mediabox) for page in reader.pages]
    bleed_sizes = [size_mm(page.bleedbox) for page in reader.pages]
    bleed_sides = []
    for page in reader.pages:
        trim, bleed = page.trimbox, page.bleedbox
        bleed_sides.append([(float(trim.left)-float(bleed.left))/PT_PER_MM,
                            (float(trim.bottom)-float(bleed.bottom))/PT_PER_MM,
                            (float(bleed.right)-float(trim.right))/PT_PER_MM,
                            (float(bleed.top)-float(trim.top))/PT_PER_MM])
    text = unicodedata.normalize("NFKC", "\n".join(page.extract_text() or "" for page in reader.pages))
    draft_mark = bool(re.search(r"校正用|入稿不可|QR未確定", text))
    checks = {
        "readable_pdf": pages > 0,
        "unencrypted": not reader.is_encrypted,
        "b5_trim_size_all_pages": pages > 0 and all(close_size(size, B5) for size in trim_sizes),
        "same_media_size_all_pages": pages > 0 and all(close_size(size, media_sizes[0]) for size in media_sizes),
        "fonts_embedded": all(font["embedded"] for font in fonts),
        "pdf_x_metadata_consistent": pdfx_metadata_consistent,
        "no_draft_marks": not draft_mark,
    }
    if expected_body_pages is not None:
        checks["ordered_body_page_count"] = pages == expected_body_pages
    if vendor == "booklet-king":
        checks["even_body_page_count"] = pages % 2 == 0
        if ordered_total_pages is not None:
            checks["order_total_includes_four_cover_pages"] = pages + 4 == ordered_total_pages
        checks["pdf_x4"] = pdfx == "PDF/X-4"
        checks["output_intent_present"] = valid_intents
        checks["three_mm_bleed_all_sides"] = all(min(sides) >= 2.9 for sides in bleed_sides)
        checks["no_rgb_image_resources"] = not rgb_images
        checks["no_rgb_paint_operators"] = not artwork["rgb_paint_pages"]
        checks["image_resolution_verified"] = not artwork["unverified_pages"]
        checks["raster_images_at_least_300_dpi"] = not artwork["low_resolution_pages"]
    elif vendor == "speed-books":
        # Unlike the four-cover-page count for Booklet King, this order form
        # specifies the premium book's body pages separately from its cover.
        checks["order_body_page_count_matches"] = (
            ordered_total_pages is not None and pages == ordered_total_pages)
        checks["recommended_pdf_x_standard"] = recommended_speed_books_pdf_x(
            pdfx, pdfx_conformance)
        checks["output_intent_present"] = valid_intents
        # These are conservative automated-production gates, not claims that
        # the printer refuses every other submitted file.
        checks["no_rgb_image_resources"] = not rgb_images
        checks["no_rgb_paint_operators"] = not artwork["rgb_paint_pages"]
        checks["image_resolution_verified"] = not artwork["unverified_pages"]
        checks["raster_images_at_least_300_dpi"] = not artwork["low_resolution_pages"]
        if spine_mm is not None:
            checks["spine_sufficient_for_lettering"] = 3 <= spine_mm <= 50
    cover_details = None
    if cover:
        cover_reader = PdfReader(str(cover), strict=False)
        checks["cover_pdf_readable"] = len(cover_reader.pages) > 0 and not cover_reader.is_encrypted
        if vendor == "booklet-king":
            cover_pages = list(cover_reader.pages)
            cover_intents = output_intent_report(cover_reader)
            cover_artwork = artwork_report(cover_reader)
            cover_rgb_images = rgb_image_pages(cover_reader)
            cover_fonts = font_report(cover_reader)
            cover_details = {
                "pages": len(cover_pages), "fonts": cover_fonts,
                "output_intent_profiles": cover_intents,
                "rgb_image_pages": cover_rgb_images, **cover_artwork,
            }
            checks["cover_four_faces"] = len(cover_pages) == 4
            checks["cover_b5_trim_size_all_faces"] = bool(cover_pages) and all(
                close_size(size_mm(page.trimbox), B5) for page in cover_pages)
            checks["cover_three_mm_bleed_all_sides"] = bool(cover_pages) and all(
                min((float(page.trimbox.left) - float(page.bleedbox.left)) / PT_PER_MM,
                    (float(page.trimbox.bottom) - float(page.bleedbox.bottom)) / PT_PER_MM,
                    (float(page.bleedbox.right) - float(page.trimbox.right)) / PT_PER_MM,
                    (float(page.bleedbox.top) - float(page.trimbox.top)) / PT_PER_MM) >= 2.9
                for page in cover_pages)
            checks["cover_fonts_embedded"] = all(
                font["embedded"] for font in cover_fonts)
            checks["cover_no_rgb_image_resources"] = not cover_rgb_images
            checks["cover_no_rgb_paint_operators"] = not cover_artwork["rgb_paint_pages"]
            checks["cover_image_resolution_verified"] = not cover_artwork["unverified_pages"]
            checks["cover_raster_images_at_least_300_dpi"] = not cover_artwork["low_resolution_pages"]
            checks["cover_output_profile_matches_body"] = (
                valid_intents and len(cover_intents) == len(intents)
                and all(cover_intent["embedded_cmyk_profile"]
                        and cover_intent["profile_sha256"] == body_intent["profile_sha256"]
                        for cover_intent, body_intent in zip(cover_intents, intents)))
    if vendor:
        checks["cover_supplied"] = bool(cover)
        checks["cover_declared_as_print_artwork"] = bool(cover) and cover_role == "print-artwork"
        checks["vendor_template_identified"] = bool(template_id)
        if vendor == "speed-books":
            checks["spine_confirmed"] = spine_mm is not None
    failures = [key for key, passed in checks.items() if not passed]
    return {
        "file": str(path), "vendor": vendor or "generic-proof", "body_pages": pages,
        "cover": str(cover) if cover else None, "cover_role": cover_role,
        "cover_details": cover_details,
        "template_id": template_id, "spine_mm": spine_mm,
        "expected_body_pages": expected_body_pages,
        "ordered_total_pages": ordered_total_pages,
        "trim_size_mm_first": [round(x, 3) for x in trim_sizes[0]] if trim_sizes else None,
        "media_size_mm_first": [round(x, 3) for x in media_sizes[0]] if media_sizes else None,
        "minimum_bleed_mm": round(min(map(min, bleed_sides)), 3) if bleed_sides else None,
        "pdf_x_version": pdfx or None, "pdf_x_conformance": pdfx_conformance or None,
        "output_intents": intent_names, "output_intent_profiles": intents,
        "fonts": fonts, "image_color_spaces": colors, "rgb_image_pages": rgb_images, **artwork,
        "checks": checks, "blocking_checks": failures,
        "technical_pass": not failures,
        "submission_approved": False,
        "manual_review": [
            "PDF/X metadata and OutputIntent are screened here; validate full PDF/X conformance separately",
            "Printer template, cover, spine and binding specification match the actual order",
            "Image detail and colour separation must be reviewed at final size",
            "QR printed at actual size and read with a phone",
            "Vendor acceptance and physical proof approval",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("body", type=Path)
    parser.add_argument("--vendor", choices=sorted(VENDORS))
    parser.add_argument("--expected-body-pages", type=int)
    parser.add_argument("--ordered-total-pages", type=int)
    parser.add_argument("--cover", type=Path)
    parser.add_argument("--cover-role", choices=("print-artwork", "visual-reference"))
    parser.add_argument("--spine-mm", type=float)
    parser.add_argument("--template-id")
    args = parser.parse_args()
    report = inspect(args.body, vendor=args.vendor, expected_body_pages=args.expected_body_pages,
                     ordered_total_pages=args.ordered_total_pages, cover=args.cover,
                     cover_role=args.cover_role,
                     spine_mm=args.spine_mm, template_id=args.template_id)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
