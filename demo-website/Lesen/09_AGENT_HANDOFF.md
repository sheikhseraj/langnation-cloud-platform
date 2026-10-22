# What to give Claude Code / Codex

## Give the implementation agent these three things

1. **The complete `langnation.com` repository** — main website + Student Portal.
2. **The complete `langnation.de` repository** — Dictionary application/API/database integration code.
3. **This entire implementation pack folder** (or the ZIP extracted beside the repositories).

Do not send only screenshots or only the PDF. The agent needs the real codebases to discover the existing auth, enrollment, database, Homework/quiz engine and Dictionary search logic.

The pack already contains:
- the A1 `Die Farben` source PDF;
- the Dictionary UI reference screenshot;
- the real `Die Farben` pilot JSON;
- the reusable lesson template;
- answer-validation rules;
- implementation/API/UI specs;
- acceptance checklist;
- Claude implementation prompt;
- Codex review prompt.

## Recommended local layout

```text
LangNation_Workspace/
  langnation-main/                  # repository for langnation.com
  langnation-dictionary/            # repository for langnation.de
  LangNation_Lesen_Dictionary_Implementation_Pack/
```

Open `LangNation_Workspace/` in Claude Code so it can inspect both repositories and the specification at the same time.

## First prompt to Claude Code

Use `05_CLAUDE_CODE_PROMPT.md` as the main instruction. The first stage is inspection and planning only. Do not let the agent immediately invent a new system before inspecting what already exists.

The critical implementation requirement is:

> Build ONE reusable Lesen lesson renderer/template for all future A1–C2 reading lessons. `04_PILOT_DIE_FARBEN.json` must be loaded through that same template. Do not create a custom page specifically for Die Farben. Every exercise must have a complete deterministic answer definition according to `04A_EXERCISE_ANSWER_RULES.md`.

After Claude Code implements the feature and tests it, use `06_CODEX_REVIEW_PROMPT.md` in Codex for independent review/fixes.

## What not to give separately

If you give the whole implementation pack, you do **not** need to separately re-upload the `Die Farben` PDF or Dictionary screenshot because both are included under `references/` in the ZIP. If your coding environment does not extract ZIP files automatically, extract the pack first.
