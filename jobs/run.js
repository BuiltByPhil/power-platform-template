#!/usr/bin/env node
/**
 * Job Search Automation — Main Orchestrator
 *
 * Usage:
 *   node run.js                         # Use built-in profile
 *   node run.js --resume ./my-cv.pdf    # Parse your own PDF/DOCX
 *
 * Required env var:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Output:
 *   ./output/YYYY-MM-DD/
 *     job-search-summary.json
 *     job-search-report.md
 *     <score>-<company>-<role>/
 *       resume.md
 *       cover-letter.md
 *       job-info.json
 *       apply.txt
 */

const fs = require('fs');
const path = require('path');
const { scrapeJobListings, getJobDetails } = require('./seek-scraper');
const { scoreJob } = require('./job-scorer');
const { tailorResume, generateCoverLetter } = require('./resume-tailor');
const { parseResume, profileToText } = require('./resume-parser');
const config = require('./config');
const profile = require('./profile.json');

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(msg + '\n');
}

function banner(title) {
  const line = '─'.repeat(60);
  log(`\n${line}\n  ${title}\n${line}`);
}

function safeName(job) {
  return `${String(job.fitScore).padStart(3, '0')}-${job.company}-${job.title}`
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 70);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--resume');
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Set it with: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  // ── Step 0: Load base resume ─────────────────────────────────────────────
  const resumeArg = parseArgs();
  let baseResume;

  if (resumeArg) {
    const absPath = path.resolve(resumeArg);
    if (!fs.existsSync(absPath)) {
      console.error(`Resume file not found: ${absPath}`);
      process.exit(1);
    }
    log(`\nParsing resume: ${absPath}`);
    baseResume = await parseResume(absPath);
  } else {
    log('\nNo --resume flag provided. Using built-in profile as base resume.');
    baseResume = profileToText(profile);
  }

  // ── Step 1: Search Seek ──────────────────────────────────────────────────
  banner('Step 1 — Searching Seek.com.au');
  log(`Roles:    ${config.targetRoles.join(', ')}`);
  log(`Location: ${config.location}`);
  log(`Period:   Last ${config.dateRange} days\n`);

  const rawJobs = await scrapeJobListings(
    config.targetRoles,
    config.locationSlug,
    config.maxJobsPerSearch,
    config.dateRange
  );

  log(`\n→ ${rawJobs.length} unique listings found across all roles.`);

  if (rawJobs.length === 0) {
    log('\nNo jobs found. Seek may have changed its layout — check seek-scraper.js selectors.');
    process.exit(0);
  }

  // ── Step 2: Fetch full job descriptions ──────────────────────────────────
  banner('Step 2 — Fetching Full Job Descriptions');

  for (let i = 0; i < rawJobs.length; i++) {
    const job = rawJobs[i];
    process.stdout.write(`  [${i + 1}/${rawJobs.length}] ${job.title} @ ${job.company} ... `);
    const details = await getJobDetails(job.url);
    job.fullDescription = details.fullDescription || '';
    // Prefer the detail page's title/company if richer
    if (details.title) job.title = details.title;
    if (details.company && details.company !== 'Unknown') job.company = details.company;
    if (details.salary) job.salary = details.salary;
    log('done');
  }

  // ── Step 3: Score each job ───────────────────────────────────────────────
  banner('Step 3 — Scoring Jobs');

  const scoredJobs = [];
  for (const job of rawJobs) {
    process.stdout.write(`  Scoring: ${job.title} @ ${job.company} ... `);
    try {
      const result = await scoreJob(job, profile);
      job.fitScore = result.score;
      job.scoreHeadline = result.headline;
      job.scoreReasons = result.reasons || [];
      job.scoreGaps = result.gaps || [];
      job.salaryFit = result.salaryFit;
      log(`${job.fitScore}/100`);
    } catch (err) {
      job.fitScore = 0;
      job.scoreHeadline = `Scoring failed: ${err.message}`;
      job.scoreReasons = [];
      job.scoreGaps = [];
      job.salaryFit = 'unknown';
      log('FAILED');
    }
    scoredJobs.push(job);
  }

  scoredJobs.sort((a, b) => b.fitScore - a.fitScore);

  // ── Step 4: Save output ──────────────────────────────────────────────────
  banner('Step 4 — Saving Results');

  const today = new Date().toISOString().split('T')[0];
  const outputDir = path.resolve(config.outputDir, today);
  fs.mkdirSync(outputDir, { recursive: true });

  // Summary JSON
  const summary = {
    searchDate: new Date().toISOString(),
    config: { roles: config.targetRoles, location: config.location, dateRange: config.dateRange },
    totalFound: scoredJobs.length,
    aboveThreshold: scoredJobs.filter(j => j.fitScore >= config.scoreThreshold).length,
    jobs: scoredJobs.map(j => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      salary: j.salary,
      fitScore: j.fitScore,
      scoreHeadline: j.scoreHeadline,
      scoreReasons: j.scoreReasons,
      scoreGaps: j.scoreGaps,
      salaryFit: j.salaryFit,
      url: j.url,
    })),
  };

  fs.writeFileSync(
    path.join(outputDir, 'job-search-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Markdown report
  const report = buildReport(scoredJobs, config);
  fs.writeFileSync(path.join(outputDir, 'job-search-report.md'), report);

  log(`  Saved summary → ${outputDir}/job-search-summary.json`);
  log(`  Saved report  → ${outputDir}/job-search-report.md`);

  // ── Step 5: Generate tailored resume + cover letter for top matches ───────
  const topJobs = scoredJobs.filter(j => j.fitScore >= config.scoreThreshold);

  banner(`Step 5 — Tailoring Documents (${topJobs.length} jobs ≥ ${config.scoreThreshold}/100)`);

  for (const job of topJobs) {
    const dir = path.join(outputDir, safeName(job));
    fs.mkdirSync(dir, { recursive: true });

    log(`\n  ▶ ${job.fitScore}/100 — ${job.title} @ ${job.company}`);

    process.stdout.write('    Tailoring resume ... ');
    const resume = await tailorResume(job, baseResume, profile);
    fs.writeFileSync(path.join(dir, 'resume.md'), resume);
    log('done');

    process.stdout.write('    Writing cover letter ... ');
    const letter = await generateCoverLetter(job, baseResume, profile);
    fs.writeFileSync(path.join(dir, 'cover-letter.md'), letter);
    log('done');

    fs.writeFileSync(path.join(dir, 'job-info.json'), JSON.stringify(job, null, 2));
    fs.writeFileSync(path.join(dir, 'apply.txt'), `Apply at: ${job.url}`);

    log(`    Saved to: ${dir}`);
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  banner('Done');
  log(`Output: ${outputDir}\n`);

  log('Top matches:\n');
  scoredJobs.slice(0, 8).forEach(j => {
    const badge = j.fitScore >= config.scoreThreshold ? '✓' : '·';
    log(`  ${badge} ${j.fitScore}/100  ${j.title.padEnd(40)} ${j.company}`);
    log(`         ${j.url}`);
  });

  log(`\n${topJobs.length} tailored document set(s) ready in ${outputDir}\n`);
}

// ─── Report Builder ─────────────────────────────────────────────────────────

function buildReport(jobs, cfg) {
  const date = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const rows = jobs.map(j => {
    const score = `**${j.fitScore}/100**`;
    const salary = j.salary || '_Not listed_';
    const fit = j.salaryFit === 'above' ? '↑' : j.salaryFit === 'below' ? '↓' : '~';
    return `| ${score} | [${j.title}](${j.url}) | ${j.company} | ${salary} ${fit} |`;
  });

  const threshold = cfg.scoreThreshold;
  const top = jobs.filter(j => j.fitScore >= threshold);

  const details = top.map(j => `
### ${j.fitScore}/100 — ${j.title} @ ${j.company}

**URL:** ${j.url}
**Salary:** ${j.salary || 'Not listed'}
**Fit:** ${j.scoreHeadline}

**Strengths:**
${j.scoreReasons.map(r => `- ${r}`).join('\n') || '- (none listed)'}

**Gaps:**
${j.scoreGaps.map(g => `- ${g}`).join('\n') || '- (none listed)'}
`).join('\n---\n');

  return `# Job Search Report — ${date}

**Roles:** ${cfg.targetRoles.join(', ')}
**Location:** ${cfg.location}
**Total found:** ${jobs.length} | **Above ${threshold}/100:** ${top.length}

---

## All Results

| Score | Role | Company | Salary |
|-------|------|---------|--------|
${rows.join('\n')}

---

## Top Matches (score ≥ ${threshold})
${details || '\n_No jobs reached the threshold._\n'}

---
_Generated by job-search-automation_
`;
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
