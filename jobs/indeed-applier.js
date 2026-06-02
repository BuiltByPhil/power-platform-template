/**
 * Playwright-based Indeed Easy Apply automation.
 *
 * Flow per job:
 *  1. Follow the to.indeed.com redirect to the real job page
 *  2. Click "Apply now" (Easy Apply) or flag as external ATS
 *  3. Login to Indeed if needed (session cookies cached locally)
 *  4. Walk through the multi-step application wizard:
 *       - Contact info (pre-filled from profile)
 *       - Resume upload (PDF if provided, else keep existing)
 *       - Application questions (answered by Claude)
 *       - Review & submit
 *  5. Record result (submitted / external / failed)
 *
 * Usage:
 *   INDEED_EMAIL=you@example.com INDEED_PASSWORD=secret node run.js --apply
 */

const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(
  process.env.HOME || process.cwd(),
  '.job-search-session.json'
);

const SYSTEM_CHROMIUM_PATHS = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

const client = new Anthropic();

function resolveChromiumPath() {
  const managed = chromium.executablePath();
  if (fs.existsSync(managed)) return managed;
  const fallback = SYSTEM_CHROMIUM_PATHS.find((p) => fs.existsSync(p));
  if (fallback) return fallback;
  throw new Error('No Chromium binary found.');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveSession(cookies) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
}

/**
 * Use Claude to answer a free-text or select application question
 * based on the candidate profile and the job description.
 */
async function answerQuestion(question, inputType, options, job, profile) {
  const optionText = options?.length
    ? `\nOptions: ${options.join(', ')}`
    : '';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `You are filling in a job application for ${profile.name || 'the candidate'}.

Job: ${job.title} at ${job.company}
Question: "${question}"
Input type: ${inputType}${optionText}

Candidate profile summary:
- Current role: Product Specialist at WiseTech Global (logistics SaaS)
- Skills: implementation, customer onboarding, technical consulting, Salesforce, JIRA
- Salary expectation: AUD ${profile.minSalary?.toLocaleString() || '110,000'} minimum
- Location: Melbourne VIC, not willing to relocate
- Work rights: Australian (assume full work rights)

Reply with ONLY the answer text (or the exact option text to select). No commentary.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

/**
 * Apply to a single job via Indeed Easy Apply.
 * Returns: { status: 'submitted' | 'external' | 'already_applied' | 'failed', url, notes }
 */
async function applyToJob(job, profile, resumePdfPath, tailoredDocDir) {
  const result = { url: job.url, title: job.title, company: job.company, status: 'failed', notes: '' };

  const browser = await chromium.launch({
    headless: false, // visible so user can intervene if CAPTCHA appears
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
    slowMo: 150,
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    locale: 'en-AU',
    timezoneId: 'Australia/Melbourne',
  });

  // Restore saved session if available
  const savedCookies = loadSession();
  if (savedCookies) {
    await context.addCookies(savedCookies);
  }

  const page = await context.newPage();

  try {
    // ── 1. Navigate to job page ────────────────────────────────────────────
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Follow any redirects (to.indeed.com shortlinks)
    const currentUrl = page.url();
    console.log(`    Page: ${currentUrl}`);

    // ── 2. Find and click Apply button ────────────────────────────────────
    const applyBtn = page.locator(
      '[id="indeedApplyButton"], [data-testid="indeedApplyButton"], button:has-text("Apply now"), a:has-text("Apply now")'
    ).first();

    const easyApplyBtn = page.locator(
      'button:has-text("Easy Apply"), [aria-label*="Easy Apply"]'
    ).first();

    const isEasyApply = await easyApplyBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const isApply = await applyBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isEasyApply && !isApply) {
      result.status = 'external';
      result.notes = 'No Easy Apply button found — external ATS. Open manually: ' + currentUrl;
      return result;
    }

    await (isEasyApply ? easyApplyBtn : applyBtn).click();
    await sleep(2000);

    // ── 3. Login if redirected to sign-in ─────────────────────────────────
    const needsLogin = await page.locator('input[name="email"], #login-email-input, [data-testid="login-email-input"]')
      .isVisible({ timeout: 4000 })
      .catch(() => false);

    if (needsLogin) {
      const email = process.env.INDEED_EMAIL;
      const password = process.env.INDEED_PASSWORD;

      if (!email || !password) {
        result.status = 'failed';
        result.notes = 'Login required. Set INDEED_EMAIL and INDEED_PASSWORD env vars.';
        return result;
      }

      await page.fill('input[name="email"], #login-email-input', email);
      await page.click('button[type="submit"], #login-submit-button');
      await sleep(1500);

      const pwField = page.locator('input[name="password"], #login-password-input');
      if (await pwField.isVisible({ timeout: 4000 }).catch(() => false)) {
        await pwField.fill(password);
        await page.click('button[type="submit"], #login-submit-button');
        await sleep(2000);
      }

      // Save cookies for next run
      saveSession(await context.cookies());

      // Navigate back to the job apply page
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(1500);
      await (isEasyApply ? easyApplyBtn : applyBtn).click();
      await sleep(2000);
    }

    // ── 4. Check for "already applied" state ──────────────────────────────
    const alreadyApplied = await page.locator('text=/already applied/i, text=/application submitted/i')
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (alreadyApplied) {
      result.status = 'already_applied';
      result.notes = 'Previously applied to this role.';
      return result;
    }

    // ── 5. Walk through application wizard steps ──────────────────────────
    let stepCount = 0;
    const maxSteps = 10;

    while (stepCount < maxSteps) {
      stepCount++;
      await sleep(1500);

      // Check if we're done
      const submitted = await page.locator(
        'text=/application submitted/i, text=/your application has been/i, [data-testid="application-confirmation"]'
      ).isVisible({ timeout: 2000 }).catch(() => false);

      if (submitted) {
        result.status = 'submitted';
        result.notes = 'Application submitted successfully.';
        saveSession(await context.cookies());
        return result;
      }

      // Resume upload step
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        if (resumePdfPath && fs.existsSync(resumePdfPath)) {
          await fileInput.setInputFiles(resumePdfPath);
          await sleep(1500);
        }
      }

      // Answer text questions
      const textAreas = page.locator('textarea:visible');
      const textAreaCount = await textAreas.count().catch(() => 0);
      for (let i = 0; i < textAreaCount; i++) {
        const ta = textAreas.nth(i);
        const label = await ta.evaluate((el) => {
          const lbl = el.closest('div')?.querySelector('label, [data-testid*="label"]');
          return lbl?.textContent?.trim() || el.placeholder || 'Question';
        }).catch(() => 'Question');

        const existing = await ta.inputValue().catch(() => '');
        if (existing) continue; // already filled

        // Check if it looks like a cover letter field
        const isCoverLetter = /cover letter/i.test(label);
        if (isCoverLetter && tailoredDocDir) {
          const clPath = path.join(tailoredDocDir, 'cover-letter.md');
          if (fs.existsSync(clPath)) {
            const cl = fs.readFileSync(clPath, 'utf-8')
              .replace(/^#+\s*/gm, '')  // strip markdown headers
              .replace(/\*\*/g, '')     // strip bold
              .trim();
            await ta.fill(cl.substring(0, 4000));
            continue;
          }
        }

        const answer = await answerQuestion(label, 'textarea', null, job, profile);
        await ta.fill(answer);
        await sleep(300);
      }

      // Answer select/dropdown questions
      const selects = page.locator('select:visible');
      const selectCount = await selects.count().catch(() => 0);
      for (let i = 0; i < selectCount; i++) {
        const sel = selects.nth(i);
        const existing = await sel.inputValue().catch(() => '');
        if (existing && existing !== '') continue;

        const options = await sel.locator('option').allTextContents().catch(() => []);
        const label = await sel.evaluate((el) => {
          const lbl = el.closest('div')?.querySelector('label');
          return lbl?.textContent?.trim() || el.name || 'Question';
        }).catch(() => 'Question');

        const answer = await answerQuestion(label, 'select', options, job, profile);
        // Try to select by label text
        await sel.selectOption({ label: answer }).catch(async () => {
          // Fallback: select by value or first matching partial
          const opts = await sel.locator('option').all();
          for (const opt of opts) {
            const text = await opt.textContent();
            if (text?.toLowerCase().includes(answer.toLowerCase())) {
              await sel.selectOption({ label: text.trim() });
              break;
            }
          }
        });
        await sleep(300);
      }

      // Answer radio/checkbox questions
      const radioGroups = await page.locator('fieldset:visible').all().catch(() => []);
      for (const group of radioGroups) {
        const legend = await group.locator('legend').textContent().catch(() => '');
        if (!legend) continue;
        const radios = group.locator('input[type="radio"]');
        const radioCount = await radios.count().catch(() => 0);
        if (radioCount === 0) continue;

        // Check if any is already selected
        const anyChecked = await group.locator('input[type="radio"]:checked').count().catch(() => 0);
        if (anyChecked > 0) continue;

        const options = await group.locator('label').allTextContents().catch(() => []);
        const answer = await answerQuestion(legend, 'radio', options, job, profile);

        for (const opt of options) {
          if (opt.toLowerCase().includes(answer.toLowerCase())) {
            const radio = group.locator(`label:has-text("${opt}") input[type="radio"], input[type="radio"][value="${opt}"]`).first();
            await radio.click().catch(() => {});
            break;
          }
        }
        await sleep(300);
      }

      // Find and click Continue / Next / Submit button
      const continueBtn = page.locator(
        'button:has-text("Continue"), button:has-text("Next"), button[data-testid="continue-button"]'
      ).first();
      const submitBtn = page.locator(
        'button:has-text("Submit"), button:has-text("Submit application"), button[data-testid="submit-button"]'
      ).first();

      const hasSubmit = await submitBtn.isVisible({ timeout: 1000 }).catch(() => false);
      const hasContinue = await continueBtn.isVisible({ timeout: 1000 }).catch(() => false);

      if (!hasSubmit && !hasContinue) {
        result.notes = `Stopped at step ${stepCount} — no Continue/Submit button found.`;
        break;
      }

      await (hasSubmit ? submitBtn : continueBtn).click();
      await sleep(1500);
    }

    // Final check after loop
    const finalSubmitted = await page.locator(
      'text=/application submitted/i, text=/your application has been/i'
    ).isVisible({ timeout: 3000 }).catch(() => false);

    if (finalSubmitted) {
      result.status = 'submitted';
      result.notes = 'Application submitted successfully.';
    } else if (result.status === 'failed' && !result.notes) {
      result.notes = `Reached step ${stepCount} but could not confirm submission. Check the browser.`;
    }

  } catch (err) {
    result.status = 'failed';
    result.notes = err.message;
  } finally {
    await sleep(2000);
    await browser.close();
  }

  return result;
}

/**
 * Apply to a list of approved jobs sequentially.
 * Returns an array of result objects.
 */
async function applyToJobs(jobs, profile, resumePdfPath, outputBaseDir) {
  const results = [];

  for (const job of jobs) {
    const safeName = `${String(job.fitScore).padStart(3, '0')}-${job.company}-${job.title}`
      .replace(/[^a-zA-Z0-9-]/g, '_')
      .substring(0, 70);

    const tailoredDocDir = outputBaseDir
      ? require('fs').readdirSync(outputBaseDir)
          .map((d) => require('path').join(outputBaseDir, d))
          .find((d) => d.includes(job.company.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15)))
      : null;

    console.log(`\n  Applying: ${job.title} @ ${job.company}`);

    const result = await applyToJob(job, profile, resumePdfPath, tailoredDocDir);
    results.push(result);

    const icon = result.status === 'submitted' ? '✓'
      : result.status === 'external' ? '⇒'
      : result.status === 'already_applied' ? '↺'
      : '✗';

    console.log(`    ${icon} ${result.status.toUpperCase()}${result.notes ? ': ' + result.notes : ''}`);

    // Brief pause between applications
    if (jobs.indexOf(job) < jobs.length - 1) await sleep(3000);
  }

  return results;
}

module.exports = { applyToJobs };
