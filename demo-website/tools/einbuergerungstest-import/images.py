# Pull the picture material out of the BAMF catalogue.
#
# Three shapes of image question, all of them in the official paper:
#   - Wappen: four separate coat-of-arms images, one per option
#   - Bundesland map and the ballot paper: one composite image showing
#     all four choices, numbered 1-4 inside the picture
#   - single photographs and diagrams belonging to one question
#
# Images are matched to questions by POSITION, not by which pages a
# question happens to touch. A question running over a page break would
# otherwise adopt the picture belonging to the question above it — which
# it did, giving Aufgabe 56 the photograph that belongs to Aufgabe 55.
#
# Every page also carries the BAMF logo top-left: the same 634x434
# bitmap on all 191 pages, skipped by position rather than by name.

import io, json, os, re, shutil
import pdfplumber

SP = r"C:/Users/sheik/AppData/Local/Temp/claude/D--Project-All-LangNation-Website/fbb451ea-c270-42d8-824d-1e896f293a47/scratchpad"
PDF = r"D:/Project_All/Docs/gesamtfragenkatalog-lebenindeutschland.pdf"
OUTDIR = r"D:/Project_All/LangNation_Web/public/img/einbuergerungstest"

RESOLUTION = 150
LOGO_MAX_BOTTOM = 130
MAX_EDGE = 1000


def slug(s):
    s = (s or "general").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def main():
    if os.path.isdir(OUTDIR):
        shutil.rmtree(OUTDIR)
    os.makedirs(OUTDIR, exist_ok=True)

    pdf = pdfplumber.open(PDF)
    state = None
    active = None                     # (key, state, num) the image would belong to
    buckets = {}                      # key -> list of (page_index, image)

    for pno, page in enumerate(pdf.pages, start=1):
        lines = page.extract_text_lines(layout=False)

        marks = []                    # (top, kind, payload) in reading order
        for ln in lines:
            t = ln["text"].strip()
            m = re.match(r"^Fragen für das Bundesland (.+)$", t)
            if m:
                marks.append((ln["top"], "state", m.group(1).strip()))
                continue
            m = re.match(r"^Aufgabe\s+(\d+)$", t)
            if m and any("Bold" in c["fontname"] for c in ln["chars"]):
                marks.append((ln["top"], "question", int(m.group(1))))

        imgs = [im for im in page.images
                if im["bottom"] > LOGO_MAX_BOTTOM
                and (im["x1"] - im["x0"]) >= 30 and (im["bottom"] - im["top"]) >= 30]

        events = ([(t, k, v, None) for t, k, v in marks] +
                  [(im["top"], "image", None, im) for im in imgs])
        events.sort(key=lambda e: e[0])

        for top, kind, value, im in events:
            if kind == "state":
                state = value
            elif kind == "question":
                active = ("%s-%d" % (slug(state), value), state, value)
            elif kind == "image" and active:
                buckets.setdefault(active[0], {"state": active[1], "num": active[2], "items": []})
                buckets[active[0]]["items"].append((pno, im))

    written = {}
    for key, b in buckets.items():
        files = []
        many = len(b["items"]) > 1
        for idx, (pno, im) in enumerate(b["items"], start=1):
            page = pdf.pages[pno - 1]
            bbox = (max(0, im["x0"] - 2), max(0, im["top"] - 2),
                    min(page.width, im["x1"] + 2), min(page.height, im["bottom"] + 2))
            name = "%s-%d.webp" % (key, idx) if many else "%s.webp" % key
            pil = page.crop(bbox).to_image(resolution=RESOLUTION).original.convert("RGB")
            if max(pil.size) > MAX_EDGE:
                r = MAX_EDGE / max(pil.size)
                pil = pil.resize((int(pil.width * r), int(pil.height * r)))
            pil.save(os.path.join(OUTDIR, name), "WEBP", quality=82, method=6)
            files.append({"src": "/img/einbuergerungstest/" + name,
                          "w": pil.width, "h": pil.height})
        written[key] = {"state": b["state"], "num": b["num"], "files": files}

    pdf.close()
    json.dump(written, io.open(SP + "/images.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    total = sum(len(v["files"]) for v in written.values())
    byn = {}
    for v in written.values():
        byn[len(v["files"])] = byn.get(len(v["files"]), 0) + 1
    print("questions with pictures:", len(written))
    print("image files written    :", total)
    print("files per question     :", dict(sorted(byn.items())))
    print("bytes on disk          :",
          sum(os.path.getsize(os.path.join(OUTDIR, f)) for f in os.listdir(OUTDIR)) // 1024, "KB")


if __name__ == "__main__":
    main()
