# Job Search Automation

Searches for Melbourne jobs matching your profile, scores each with Claude AI, and generates a tailored resume + cover letter for every top match.

## Two Modes

| Mode | When to use | Job source |
|------|-------------|------------|
| **Local** (`node run.js`) | Running on your own machine | Seek.com.au (Playwright scraper) |
| **Cloud** (run by Claude in Claude Code) | Running in the Claude Code web session | Indeed via built-in MCP tool |

> The network sandbox in Claude Code's cloud environment blocks direct web scraping.  
> When you ask Claude to run the search, it uses the connected Indeed MCP tool instead — same output, different source.

---

## Local Setup

```bash
cd jobs
npm install
npx playwright install chromium
export ANTHROPIC_API_KEY=sk-ant-...
```

**Without a resume file** (uses the built-in profile):
```bash
node run.js
```

**With your own PDF or DOCX:**
```bash
node run.js --resume /path/to/your-resume.pdf
node run.js --resume /path/to/your-resume.docx
```

---

## Output

Results land in `output/YYYY-MM-DD/`:

```
output/2026-06-02/
├── job-search-report.md                        ← Summary of all jobs found
├── job-search-summary.json                     ← Full data (scores, URLs, etc.)
├── 087-Atlassian-Customer_Success_Manager/
│   ├── resume.md                               ← Tailored resume
│   ├── cover-letter.md                         ← Personalised cover letter
│   ├── job-info.json                           ← Job data + score breakdown
│   └── apply.txt                               ← Direct apply URL
└── ...
```

---

## Customise

**`config.js`** — change roles, location, score threshold, date range.  
**`profile.json`** — update your skills, experience, or salary floor.  

Score threshold (default **65/100**): only jobs at or above this get tailored documents generated.

---

## Architecture

```
run.js           — Orchestrator (search → score → tailor → save)
seek-scraper.js  — Playwright browser automation for Seek.com.au
job-scorer.js    — Claude Haiku: rates 0–100 job-candidate fit (cached prompts)
resume-tailor.js — Claude Opus: rewrites resume + cover letter per role
resume-parser.js — Parses PDF / DOCX / TXT / MD resume files
config.js        — Search settings
profile.json     — Your pre-loaded candidate profile
output/          — Generated documents (gitignored)
```

## Notes

- Seek occasionally updates its page structure; if scraping returns 0 results, inspect `seek-scraper.js` selectors
- The tool adds random delays between page loads to stay polite to Seek's servers
- Auto-applying is intentionally excluded — reviewing before you submit avoids costly mistakes
