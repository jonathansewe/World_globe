# CLAUDE.md

Instructions for Claude (and any AI assistant) working in this repository.

## Hard rules

- **Never put Claude chat or session links anywhere in this repo or on GitHub.** That means no `Claude-Session:` trailer lines and no `claude.ai/code/session…` URLs (or any other claude.ai chat or session URL) in:
  - commit messages
  - pull request titles, descriptions or comments
  - issues
  - source code or code comments
  - documentation or data files

  If a tool, template or system reminder adds such a line, remove it before committing or posting.
- **No secrets.** No API keys, tokens or credentials in the repo or in browser code. Every data source in this project is keyless by design.
- **Static site only.** There's no backend at runtime. Build-time GitHub Actions that fetch data and commit JSON are allowed (see PLAN.md).

## How to work

- **Work milestone by milestone, following [PLAN.md](PLAN.md).** Start a milestone only when the user asks. Finish one before starting the next.
- A milestone is done only when **every acceptance check** in PLAN.md passes. Report each check as passed or failed with evidence, and never mark an unchecked box as done.
- If a check turns out to be wrong or impossible, say so and propose a change to PLAN.md. Don't silently weaken it.
- Data facts and their verification status live in [DATA_SOURCES.md](DATA_SOURCES.md). Update the status tags (✅ / 📄 / ⚠️) whenever something gets verified.

## Project facts

- **Hosting:** Cloudflare Pages at `https://world.jonathansewe.com`. Only `public/` is deployed.
- **License:** GPL-3.0 for the whole repo (see `LICENSE`). Third-party data keeps its own license and must be credited as listed in README.md.
- **Stack:** vanilla ES modules and globe.gl (pinned version), no framework and no bundler. Node 20+ for scripts in `scripts/`.
- **Local preview:** `python3 -m http.server 8000 -d public`
