# Build the final question dataset.
#
# The wording — questions and all four options, in their official order —
# comes from the BAMF Gesamtfragenkatalog and nothing else. The only
# thing taken from outside is WHICH of those four options is correct,
# and even that is never accepted on trust: the reference answer has to
# match exactly one official option string, or the question is dropped
# and listed in the report.
#
# Three questions are decided here by hand because the reference was
# out of date or misspelt. Each carries its reasoning and is reported
# separately so it can be checked.

import io, json, os, re, html, unicodedata
from datetime import date

SP = r"C:/Users/sheik/AppData/Local/Temp/claude/D--Project-All-LangNation-Website/fbb451ea-c270-42d8-824d-1e896f293a47/scratchpad"
OUT = r"D:/Project_All/LangNation_Web/content/einbuergerungstest"

CATALOGUE_DATE = "2025-05-07"        # "Stand" printed on the BAMF PDF
VERIFIED = date.today().isoformat()

STATES = [
    "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen",
    "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen",
    "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen",
    "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
]

# Decided by hand, with the evidence. Everything else must match on its
# own or be dropped.
MANUAL = {
    # The reference still named Olaf Scholz, who is not even among the
    # four options in the May-2025 catalogue. Friedrich Merz has been
    # Chancellor since 6 May 2025 (bundesregierung.de, bundestag.de).
    ("general", 72): {"index": 3, "why": "Chancellor since 6 May 2025 is Friedrich Merz; the reference answer (Olaf Scholz) is not one of the four official options."},
    # The reference said "CDU/CSU und SPD", which is not offered. After
    # the February 2025 election the two largest Fraktionen are
    # CDU/CSU (208) and AfD (152); SPD is third with 120.
    ("general", 73): {"index": 0, "why": "21st Bundestag: CDU/CSU 208 and AfD 152 are the two largest Fraktionen (SPD 120, bundestag.de). The reference answer is not one of the four official options."},
    # The reference has a typo: "ungerechtigter" for "ungerechtfertigter".
    ("general", 136): {"index": 1, "why": "Reference misspells the official option ('ungerechtigter' for 'ungerechtfertigter'); it matches option 2 exactly otherwise."},
    # The catalogue was reworded from "in Leserbriefen" to "im Internet";
    # both name the same option, the one saying opinions may be voiced.
    ("general", 14): {"index": 1, "why": "Catalogue reworded this option from 'in Leserbriefen' to 'im Internet'; the reference names the same option and the other three are plainly wrong."},
    # Pronoun order differs only: "Er/Sie" against the catalogue's "Sie/Er".
    ("general", 70): {"index": 3, "why": "Identical wording apart from pronoun order ('Er/Sie' vs 'Sie/Er')."},
    # The reference is simply wrong here, and the import copied it
    # faithfully: it answers that small parties cannot afford to pay
    # their politicians, which has nothing to do with an electoral
    # threshold. The Sperrklausel exists to stop a fragmented parliament
    # in which no government can be formed.
    ("general", 127): {"index": 2, "why": "Reference answer is wrong. The 5% threshold exists because many small parties make forming a government difficult; confirmed against einbuergerungstest-online.de, 12 Sep 2026."},
    # Four zones: American, British, French, Soviet. The catalogue says
    # so itself in questions 167 and 176; the reference still said six.
    ("general", 175): {"index": 1, "why": "Reference answer is wrong. Germany had four occupation zones, as questions 167 and 176 of the same catalogue set out."},
}

# Bundesland answers the reference gets wrong.
#
# Keyed by question id, because the state sets are addressed that way.
# All eight were found by comparing every Bundesland answer against a
# second reference (einbuergerungstest-online.de) on 12 September 2026,
# and then confirming the underlying fact — not by preferring one site
# to another.
STATE_MANUAL = {
    # Five states keep 18 for local elections: Bayern, Hessen,
    # Rheinland-Pfalz, Saarland and Sachsen. The reference answered 16
    # for all sixteen states, which is right for the other eleven.
    "bayern-4":           {"index": 2, "why": "Kommunalwahlrecht in Bayern is 18, not 16 (wahlrecht.de)."},
    "hessen-4":           {"index": 2, "why": "Kommunalwahlrecht in Hessen is 18, not 16 (wahlrecht.de)."},
    "rheinland-pfalz-4":  {"index": 2, "why": "Kommunalwahlrecht in Rheinland-Pfalz is 18, not 16 (wahlrecht.de)."},
    "saarland-4":         {"index": 2, "why": "Kommunalwahlrecht im Saarland is 18, not 16 (wahlrecht.de)."},
    "sachsen-4":          {"index": 2, "why": "Kommunalwahlrecht in Sachsen is 18, not 16 (wahlrecht.de)."},
    # Bremen is the only Bundesland whose parliament still runs four
    # years; the 2017 referendum to extend it to five was rejected.
    "bremen-3":           {"index": 1, "why": "The Bremische Bürgerschaft is elected for four years (Landesverfassung; elections 2015, 2019, 2023)."},
    # Hamburg has an Erster Bürgermeister; Bremen's head of government
    # is the Präsident des Senats. The reference gave Hamburg's title
    # for both, which would make the question unanswerable.
    "bremen-9":           {"index": 2, "why": "Bremen's head of government is the Präsident/Präsidentin des Senats; Erster Bürgermeister is Hamburg's title."},
    # Niedersachsen flies the federal tricolour with the Saxon horse.
    # blau-weiss-rot is Schleswig-Holstein.
    "niedersachsen-5":    {"index": 1, "why": "The Landesflagge of Niedersachsen is schwarz-rot-gold with the state arms; blau-weiss-rot is Schleswig-Holstein."},
}

# ── Picture questions ────────────────────────────────────────────────
#
# These are the ones where the reference cannot be trusted at all, and
# the reason is structural rather than a mistake on their part: their
# "Bild 2" numbers THEIR layout, and the catalogue arranges the same
# four pictures differently. Taking their index gave ten wrong answers
# out of nineteen — including telling learners that a yellow emblem
# was the flag of the European Union.
#
# So the reference is ignored here and the index comes from this
# table, each entry read off the catalogue's own artwork. An image
# question missing from the table is DROPPED rather than guessed:
# that is the whole point of the table existing.
IMAGE_ANSWERS = {
    "general-21":  (1, "Bundesadler on the gold shield is Bild 2 (Bild 1 Bundeswehr cross, 3 Chi-Rho, 4 DDR)."),
    "general-209": (3, "The DDR emblem — hammer, compasses, wheat — is Bild 4."),
    "general-226": (2, "The EU flag, twelve gold stars on blue, is Bild 3 (1 USA, 2 a decoy emblem, 4 UN)."),

    # The sixteen Wappen questions. Each lists a different four, so each
    # was read off its own page.
    "baden-wuerttemberg-1":     (1, "Three black lions on gold is Bild 2."),
    "bayern-1":                 (1, "Blue and white lozenges is Bild 2."),
    "berlin-1":                 (3, "The black bear is Bild 4."),
    "brandenburg-1":            (2, "The red eagle is Bild 3."),
    "bremen-1":                 (2, "The silver key on red is Bild 3."),
    "hamburg-1":                (2, "The white castle on red is Bild 3."),
    "hessen-1":                 (0, "The red and white striped lion on blue is Bild 1."),
    "mecklenburg-vorpommern-1": (2, "Bull's head beside the griffin is Bild 3."),
    "niedersachsen-1":          (2, "The white horse on red is Bild 3."),
    "nordrhein-westfalen-1":    (1, "River, horse and rose is Bild 2."),
    "rheinland-pfalz-1":        (0, "Cross, wheel and lion is Bild 1."),
    "saarland-1":               (1, "The quartered shield is Bild 2."),
    "sachsen-1":                (3, "Black and gold bars under the green rue crown is Bild 4."),
    "sachsen-anhalt-1":         (2, "Bear on the wall with the black eagle is Bild 3."),
    "schleswig-holstein-1":     (3, "Two blue lions beside the red nettle leaf is Bild 4."),
    "thueringen-1":             (2, "The lion with eight stars on blue is Bild 3."),
}


def is_picture_question(answers):
    """Options that are nothing but 'Bild 1'…'Bild 4'."""
    return bool(answers) and all(re.fullmatch(r"Bild [0-9]+", a or "") for a in answers)


CATEGORY_RULES = [
    ("Leben in der Demokratie", range(1, 96)),
    ("Geschichte und Verantwortung", range(96, 197)),
    ("Mensch und Gesellschaft", range(197, 301)),
]


def norm(s):
    s = html.unescape(s or "")
    s = unicodedata.normalize("NFKD", s)
    s = s.lower().replace("…", "").replace("...", "")
    s = s.replace("ß", "ss")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s)


def category_of(num):
    for name, rng in CATEGORY_RULES:
        if num in rng:
            return name
    return "Leben in der Demokratie"


def pick(options, reference):
    """
    The index of the one option the reference answer names, or None.

    The reference text often continues into an explanation, so a prefix
    match counts — but only if exactly one option matches, and the
    longest candidate wins so that "4" cannot shadow "4%".
    """
    ref = norm(reference)
    if not ref:
        return None
    exact = [i for i, o in enumerate(options) if norm(o) == ref]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        return None
    starts = [i for i, o in enumerate(options) if norm(o) and ref.startswith(norm(o))]
    if not starts:
        return None
    longest = max(len(norm(options[i])) for i in starts)
    best = [i for i in starts if len(norm(options[i])) == longest]
    return best[0] if len(best) == 1 else None


def main():
    qs = json.load(io.open(SP + "/parsed.json", encoding="utf-8"))
    gen_ans = json.load(io.open(SP + "/general_answers.json", encoding="utf-8"))
    st_ans = json.load(io.open(SP + "/state_answers.json", encoding="utf-8"))
    images = json.load(io.open(SP + "/images.json", encoding="utf-8"))

    def slug(s):
        s = (s or "general").lower()
        for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
            s = s.replace(a, b)
        return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

    out, dropped, manual_used = [], [], []

    for q in qs:
        is_state = q["type"] == "state"
        if is_state:
            order = STATES.index(q["state"])
            ref_no = 300 + order * 10 + q["num"]
            # Aligned on the reference's own question text, not on its
            # position: for Bremen and Sachsen-Anhalt the reference
            # numbers questions 1 and 8 the other way round, so going
            # by index handed the map question the Wappen's answer.
            want = norm(re.sub(r"(\s*Bild\s*\d+)+\s*$", "", q["question"]))
            hit = None
            for cand in range(300 + order * 10 + 1, 300 + order * 10 + 11):
                row = st_ans.get(str(cand))
                if row and norm(row.get("q", "")) == want:
                    hit = (cand, row)
                    break
            if hit:
                ref_no, ref = hit[0], hit[1].get("a", "")
            else:
                ref = st_ans.get(str(ref_no), {}).get("a", "")
            qid = "%s-%d" % (slug(q["state"]), q["num"])
        else:
            ref_no = q["num"]
            ref = gen_ans.get(str(ref_no), {}).get("a", "")
            qid = "general-%d" % q["num"]

        manual = (STATE_MANUAL.get(qid) if is_state
                  else MANUAL.get(("general", q["num"])))

        # The question text of a picture question repeats the captions
        # ("… Bild 1 Bild 2 …"); strip that tail.
        text = re.sub(r"(\s*Bild\s*\d+)+\s*$", "", q["question"]).strip()

        # A photo credit typeset under the picture lands at the end of
        # the question. It belongs under the picture, not in the
        # sentence the learner is being asked.
        credit = None
        m = re.search(r"©\s*(.+)$", text)
        if m:
            credit = "© " + m.group(1).strip()
            text = text[:m.start()].strip()

        if is_picture_question(q["answers"]):
            # Never the reference: see IMAGE_ANSWERS.
            verified = IMAGE_ANSWERS.get(qid)
            if not verified:
                dropped.append({"id": qid, "number": ref_no, "question": text[:110],
                                "reference": "picture question with no verified answer",
                                "options": q["answers"]})
                continue
            idx = verified[0]
            manual_used.append({"id": qid, "index": idx, "why": verified[1],
                                "option": q["answers"][idx]})
        elif manual:
            idx = manual["index"]
            manual_used.append({"id": qid, "index": idx, "why": manual["why"],
                                "option": q["answers"][idx]})
        else:
            idx = pick(q["answers"], ref)

        if idx is None:
            dropped.append({"id": qid, "number": ref_no, "question": text[:110],
                            "reference": (ref or "")[:110], "options": q["answers"]})
            continue

        img = images.get(qid)
        record = {
            "id": qid,
            "number": ref_no,
            "type": "state" if is_state else "general",
            "category": q["state"] if is_state else category_of(q["number"] if "number" in q else q["num"]),
            "question": text,
            "answers": q["answers"],
            "correctAnswer": idx,
            "image": None,
            "source": "BAMF Gesamtfragenkatalog, Stand " + CATALOGUE_DATE,
            "lastVerified": VERIFIED,
        }
        if is_state:
            record["state"] = q["state"]
        if img:
            files = img["files"]
            record["image"] = ({"kind": "options", "files": files}
                               if len(files) == 4 else
                               {"kind": "single", "files": files[:1]})
            if credit:
                record["image"]["credit"] = credit
        elif credit:
            # A credit with no picture would be a dangling attribution.
            record["question"] = (text + " " + credit).strip()
        out.append(record)

    os.makedirs(OUT, exist_ok=True)
    general = [q for q in out if q["type"] == "general"]
    json.dump(general, io.open(OUT + "/general.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    for st in STATES:
        rows = [q for q in out if q.get("state") == st]
        json.dump(rows, io.open(OUT + "/" + slug(st) + ".json", "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)

    meta = {
        "catalogue": "BAMF Gesamtfragenkatalog zum Test „Leben in Deutschland“ und zum „Einbürgerungstest“",
        "catalogueDate": CATALOGUE_DATE,
        "builtOn": VERIFIED,
        "states": STATES,
        "counts": {"general": len(general),
                   "state": len(out) - len(general),
                   "total": len(out),
                   "withImages": sum(1 for q in out if q["image"])},
        "dropped": dropped,
        "manuallyDecided": manual_used,
    }
    json.dump(meta, io.open(OUT + "/meta.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print("general imported :", len(general), "of 300")
    print("state imported   :", len(out) - len(general), "of 160")
    print("with images      :", meta["counts"]["withImages"])
    print("decided by hand  :", len(manual_used))
    print("DROPPED          :", len(dropped))
    for d in dropped:
        print("   %-26s %s" % (d["id"], d["question"][:70]))
        print("       reference: %s" % d["reference"][:80])


if __name__ == "__main__":
    main()
