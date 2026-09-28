"""Restore the 29–30 September feast sources from the supplied Word document.

Usage: python scripts/restore-september-feasts.py path/to/source.docx
This edits only local JSON source files. Firestore writes are a separate phase.
"""

import html
import json
import re
import sys
from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
PARAGRAPHS = Document(SOURCE).paragraphs
PARAS = [p.text.strip() for p in PARAGRAPHS]


def line(index):
    return re.sub(r"\s+", " ", PARAS[index]).strip()


def formatted_line(index):
    parts = []
    for run in PARAGRAPHS[index].runs:
        content = re.sub(r"\s+", " ", run.text)
        if not content:
            continue
        content = html.escape(content, quote=False)
        color = run.font.color.rgb
        if color is not None and str(color).upper() in {"FF0000", "FF00FF"}:
            content = f'<span style="color: #ff0000;">{content}</span>'
        if run.italic:
            content = f"<em>{content}</em>"
        parts.append(content)
    return "".join(parts).strip()


def paragraph(index, *, centered=False):
    style = ' style="text-align: center;"' if centered else ""
    return f"<p{style}>{formatted_line(index)}</p>"


def prose(start, end):
    return "\n".join(paragraph(i) for i in range(start, end + 1) if line(i))


def verse(start, end):
    stanzas = []
    current = []
    for i in range(start, end + 1):
        if line(i):
            current.append(formatted_line(i))
        elif current:
            stanzas.append("<p>" + "<br />".join(current) + "</p>")
            current = []
    if current:
        stanzas.append("<p>" + "<br />".join(current) + "</p>")
    return "\n".join(stanzas)


def psalm(title, start, end, ant):
    return "\n".join((paragraph(title, centered=True), verse(start, end), paragraph(ant)))


def block(*segments):
    return "\n".join(s for s in segments if s)


def save(name, fields):
    path = ROOT / "patchs" / "feasts" / name
    data = json.loads(path.read_text(encoding="utf-8"))
    data.update(fields)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    assert line(0) == "29 верасня" and line(379) == "30 верасня"
    assert "Малітва з Ютрані" in line(154) and "Малітва з Ютрані" in line(238)
    assert "Агульныя тэксты пра доктараў" in line(385)

    prayer29 = paragraph(213)
    fields29 = {
        "officeOfReadingsHymn": verse(9, 37),
        "officeOfReadingsAnt1": paragraph(40),
        "officeOfReadingsPs1": psalm(42, 44, 69, 71),
        "officeOfReadingsAnt2": paragraph(73),
        "officeOfReadingsPs2": block(paragraph(75, centered=True), paragraph(77, centered=True), verse(79, 91), paragraph(94)),
        "officeOfReadingsAnt3": paragraph(96),
        "officeOfReadingsPs3": block(paragraph(98, centered=True), verse(100, 119), paragraph(121)),
        "officeOfReadingsVers": prose(122, 123),
        "officeOfReadingsR1": block(prose(125, 127), prose(128, 136)),
        "officeOfReadingsR2": block(prose(138, 141), prose(143, 152)),
        "officeOfReadingsTeDeum": True,
        "officeOfReadingsPr": prayer29,
        "laudesHymn": verse(158, 184),
        "laudesAnt1": paragraph(186),
        "laudesPs1": "from-first-week",
        "laudesAnt2": paragraph(188),
        "laudesPs2": "from-first-week",
        "laudesAnt3": paragraph(189),
        "laudesPs3": "from-first-week",
        "laudesR": block(prose(191, 192), prose(194, 195)),
        "laudesAntBen": paragraph(197),
        "laudesInter": prose(200, 209),
        "laudesPr": prayer29,
        "sext1Ant1": paragraph(220),
        "sext1Ps1": "from-day",
        "sext1Ps2": "from-day",
        "sext1Ps3": "from-day",
        "sext1R": prose(221, 224),
        "sext1Pr": prayer29,
        "sext2Ant1": paragraph(226),
        "sext2Ps1": "from-day",
        "sext2Ps2": "from-day",
        "sext2Ps3": "from-day",
        "sext2R": prose(227, 230),
        "sext2Pr": prayer29,
        "sext3Ant1": paragraph(233),
        "sext3Ps1": "from-day",
        "sext3Ps2": "from-day",
        "sext3Ps3": "from-day",
        "sext3R": prose(234, 237),
        "sext3Pr": prayer29,
        "vesperHymn": verse(243, 261),
        "vesperAnt1": paragraph(265),
        "vesperPs1": psalm(267, 268, 288, 290),
        "vesperAnt2": paragraph(291),
        "vesperPs2": psalm(293, 294, 314, 316),
        "vesperAnt3": paragraph(318),
        "vesperPs3": psalm(319, 321, 343, 346),
        "vesperR": block(prose(348, 349), prose(351, 352)),
        "vesperAntMag": paragraph(354),
        "vesperInter": prose(357, 373),
        "vesperPr": paragraph(377),
    }
    save("29-09-archangels-michael-gabriel-raphael.json", fields29)

    prayer30 = paragraph(433)
    hymn30 = verse(407, 430)
    fields30 = {
        "_omitFirstVespers": True,
        "_omitTeDeum": True,
        "officeOfReadingsR2": block(prose(389, 393), prose(395, 402)),
        "officeOfReadingsPr": prayer30,
        "laudesHymn": hymn30,
        "laudesPr": prayer30,
        "sext1Pr": prayer30,
        "sext2Pr": prayer30,
        "sext3Pr": prayer30,
        "vesperHymn": hymn30,
        "vesperPr": prayer30,
    }
    save("30-09-sv-jerome.json", fields30)
    print(f"Restored {len(fields29)} fields for 29 September and {len(fields30)} for 30 September")


if __name__ == "__main__":
    main()
