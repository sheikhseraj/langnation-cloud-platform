# Rebuilding the Einbürgerungstest catalogue

These four scripts turn the official BAMF PDF into
`content/einbuergerungstest/*.json`. They are run **by hand, rarely** —
only when the BAMF publishes a new *Gesamtfragenkatalog* — which is why
they are Python in an otherwise Node project: parsing a PDF with font
and position information needs `pdfplumber`, and there is no reasonable
Node equivalent without adding a build step to a project that
deliberately has none.

The generated JSON **is committed**, so nothing here runs at deploy time
and the site has no Python dependency.

## The one thing to understand first

The official catalogue is a *blank exam paper*. It contains all 460
questions and all four options for each, and **every checkbox is
empty** — there is no answer key anywhere in the file. That is why
there are four scripts rather than one:

| script | what it does | source of truth |
|---|---|---|
| `parse.py` | 460 questions and their four options, in official order | the BAMF PDF |
| `images.py` | the picture material, matched to questions by position | the BAMF PDF |
| `fetch_state.py` | which option is correct, for the 160 state questions | a public reference |
| `build.py` | joins them, verifies, writes the dataset | — |

`build.py` never trusts the reference. A correct-answer text is
accepted only if it matches **exactly one** of the four official option
strings; anything else is dropped and listed in the report. Five
questions are decided by hand, each with its reasoning recorded in
`MANUAL` and repeated in `meta.json` so they can be re-checked.

## Running it

```bash
pip install pdfplumber
python tools/einbuergerungstest-import/parse.py
python tools/einbuergerungstest-import/images.py
python tools/einbuergerungstest-import/fetch_state.py   # ~3 minutes, one request at a time
python tools/einbuergerungstest-import/build.py
node tools/check-einbuergerungstest.js
```

The paths at the top of each script point at a scratch directory and at
`D:/Project_All/Docs/…`; change those first if the PDF or the checkout
has moved.

The general answers come from a page saved as `alle.html` in the same
scratch directory — see `build.py`. Re-save it before a rebuild.

## What to re-check after a rebuild

`check-einbuergerungstest.js` prints a "decided by hand" section. Those
five are the questions where the reference disagreed with the official
options, and two of them are time-sensitive:

- **general-72** — the current Bundeskanzler
- **general-73** — the two largest Fraktionen in the Bundestag

Both change with an election. Verify them against the BAMF catalogue of
the day before trusting a rebuild.
