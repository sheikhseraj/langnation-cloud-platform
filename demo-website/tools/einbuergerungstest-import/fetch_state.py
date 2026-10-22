# Fetch which option is correct for the 160 Bundesland questions.
#
# The official BAMF catalogue supplies the questions and their four
# options; it does not say which option is right. This reads that one
# fact per question from a public reference and nothing else — not the
# question wording, not the option wording, and deliberately not the
# reference site's written explanations, which are its own editorial
# work and not ours to take.
#
# Polite: one request at a time, with a pause between them.

import io, json, re, html, time, urllib.request, sys

SP = r"C:/Users/sheik/AppData/Local/Temp/claude/D--Project-All-LangNation-Website/fbb451ea-c270-42d8-824d-1e896f293a47/scratchpad"
UA = "Mozilla/5.0 (compatible; LangNation-study-import/1.0)"
FIRST_STATE, LAST = 301, 460


def accepted_answer(page_html):
    for block in re.findall(r'application/ld\+json[^>]*>(.*?)</script>', page_html, re.S):
        try:
            data = json.loads(block)
        except Exception:
            continue
        ents = data.get("mainEntity") if isinstance(data, dict) else None
        if not isinstance(ents, list):
            continue
        for e in ents:
            if e.get("@type") == "Question":
                a = (e.get("acceptedAnswer") or {}).get("text", "")
                q = e.get("name", "")
                if a:
                    return html.unescape(q).strip(), html.unescape(a).strip()
    return None, None


def main():
    out = {}
    failed = []
    for n in range(FIRST_STATE, LAST + 1):
        url = "https://www.leben-test.de/fragen/%d" % n
        for attempt in (1, 2, 3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    body = r.read().decode("utf-8", "replace")
                q, a = accepted_answer(body)
                if a:
                    out[n] = {"q": q, "a": a}
                else:
                    failed.append(n)
                break
            except Exception as exc:
                if attempt == 3:
                    failed.append(n)
                    print("  !! %d %s" % (n, exc), flush=True)
                time.sleep(1.5 * attempt)
        if n % 20 == 0:
            print("  ... %d fetched" % len(out), flush=True)
        time.sleep(0.4)

    json.dump(out, io.open(SP + "/state_answers.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("fetched:", len(out), "of", LAST - FIRST_STATE + 1)
    print("failed :", failed)


if __name__ == "__main__":
    main()
