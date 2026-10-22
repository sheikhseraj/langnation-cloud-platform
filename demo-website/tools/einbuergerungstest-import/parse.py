# Parse the official BAMF Gesamtfragenkatalog into structured questions.
#
# The catalogue is a blank exam paper: 460 questions, four options each,
# every checkbox empty. So this extracts the WORDING only — the question,
# its four options in their official order, and whether it carries an
# image. The correct answer is not in this file and is never guessed here.
#
# Anchors, all verified against the document:
#   - "Aufgabe N" in BundesSans-Bold starts a question
#   - a Wingdings2 glyph (U+F0A3) or U+25A1 starts an option
#   - a line with neither, after an option, continues that option
#   - "Teil II" + "Fragen für das Bundesland X" starts a state section

import io, json, re, sys
import pdfplumber

PDF = r"D:/Project_All/Docs/gesamtfragenkatalog-lebenindeutschland.pdf"
OUT = r"C:/Users/sheik/AppData/Local/Temp/claude/D--Project-All-LangNation-Website/fbb451ea-c270-42d8-824d-1e896f293a47/scratchpad"

BOX = ("\uf0a3", "\u25a1")

SKIP = re.compile(
    r"^(Seite \d+ von \d+|Teil [IV]+|Allgemeine Fragen|"
    r"Fragen für das Bundesland .*|Gesamtfragenkatalog zum Test|"
    r"und zum .Einbürgerungstest.|Stand: .*|Hinweis: .*|"
    r"Originalfragen abweichen\..*|,,Leben in Deutschland\"|„Leben in Deutschland“)$"
)


def lines_of(page):
    """
    Visual lines, in reading order.

    pdfplumber's own clustering, not a hand-rolled bin on `top`: the
    checkbox glyph and the text beside it sit on slightly different
    baselines, and rounding them into buckets split one option into two
    lines — which cost eighteen questions an option apiece.
    """
    out = []
    for ln in page.extract_text_lines(layout=False):
        cs = ln["chars"]
        out.append({
            "text": ln["text"].strip(),
            "raw": ln["text"],
            "x0": ln["x0"],
            "top": ln["top"],
            "bold": any("Bold" in c["fontname"] for c in cs),
            "box": any(c["text"] in BOX for c in cs),
        })
    return out


def clean(s):
    s = s.replace("\uf0a3", " ").replace("\u25a1", " ")
    s = s.replace("\u00ad", "")                 # soft hyphen
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def main():
    pdf = pdfplumber.open(PDF)
    questions = []
    section = {"type": "general", "state": None}
    cur = None
    mode = None                                  # "question" | "answers"
    pending_state = False

    for pno, page in enumerate(pdf.pages, start=1):
        has_image = bool(page.images)
        for ln in lines_of(page):
            t = ln["text"]
            if not t:
                continue

            if t == "Teil II":
                pending_state = True
                continue
            m = re.match(r"^Fragen für das Bundesland (.+)$", t)
            if m:
                section = {"type": "state", "state": m.group(1).strip()}
                pending_state = False
                continue
            if SKIP.match(t):
                continue

            m = re.match(r"^Aufgabe\s+(\d+)$", t)
            if m and ln["bold"]:
                if cur:
                    questions.append(cur)
                cur = {
                    "num": int(m.group(1)),
                    "type": section["type"],
                    "state": section["state"],
                    "question": "",
                    "answers": [],
                    "pages": [pno],
                    "pageHasImage": has_image,
                }
                mode = "question"
                continue

            if cur is None:
                continue
            if pno not in cur["pages"]:
                cur["pages"].append(pno)
                cur["pageHasImage"] = cur["pageHasImage"] or has_image

            body = clean(ln["raw"])

            # The box opens an option even when the option's words are on
            # the next line: two questions in the catalogue are typeset
            # with a bare U+25A1 on its own line, and skipping empty
            # lines first swallowed all four of their options.
            if ln["box"]:
                cur["answers"].append(body)
                mode = "answers"
                continue

            if not body:
                continue

            if mode == "answers" and cur["answers"]:
                cur["answers"][-1] = (cur["answers"][-1] + " " + body).strip()
            else:
                cur["question"] = (cur["question"] + " " + body).strip()

    if cur:
        questions.append(cur)
    pdf.close()

    io.open(OUT + "/parsed.json", "w", encoding="utf-8").write(
        json.dumps(questions, ensure_ascii=False, indent=1))

    gen = [q for q in questions if q["type"] == "general"]
    st = [q for q in questions if q["type"] == "state"]
    states = sorted({q["state"] for q in st})
    bad4 = [q for q in questions if len(q["answers"]) != 4]
    empty = [q for q in questions if not q["question"]]

    print("parsed questions :", len(questions))
    print("  general        :", len(gen))
    print("  state          :", len(st), "across", len(states), "Bundesländer")
    print("  not exactly 4 options:", len(bad4))
    print("  empty question text  :", len(empty))
    if bad4[:5]:
        for q in bad4[:5]:
            print("    -> %s %s Aufgabe %d: %d options | %s"
                  % (q["type"], q["state"], q["num"], len(q["answers"]), q["question"][:60]))
    print("\nstates:", ", ".join(states))


if __name__ == "__main__":
    main()
