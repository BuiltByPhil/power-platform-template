/**
 * Playwright-based scraper for Seek.com.au
 *
 * Seek uses server-side rendered HTML + some hydration. We use a realistic
 * browser context and polite delays to avoid triggering bot detection.
 */

const { chromium } = require('playwright');
const fs = require('fs');

const SEEK_BASE = 'https://www.seek.com.au';

// Use the system-installed Chromium when the Playwright-managed one isn't present
const SYSTEM_CHROMIUM_PATHS = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];

function resolveChromiumPath() {
  const managed = chromium.executablePath();
  if (fs.existsSync(managed)) return managed;
  const fallback = SYSTEM_CHROMIUM_PATHS.find(p => fs.existsSync(p));
  if (fallback) return fallback;
  throw new Error('No Chromium binary found. Run: npx playwright install chromium');
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function randomAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function buildSearchUrl(role, locationSlug, dateRange) {
  const slug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${SEEK_BASE}/${slug}-jobs/${locationSlug}?daterange=${dateRange}&sortmode=ListedDate`;
}

/**
 * Scrape job listings from Seek for the given roles.
 * Returns an array of job objects (without full description — call getJobDetails for that).
 */
async function scrapeJobListings(roles, locationSlug, maxPerSearch = 10, dateRange = 30) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    userAgent: randomAgent(),
    viewport: { width: 1280, height: 800 },
    locale: 'en-AU',
    timezoneId: 'Australia/Melbourne',
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  // Block images/fonts to speed up scraping
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', route => route.abort());

  const allJobs = [];

  for (const role of roles) {
    const url = buildSearchUrl(role, locationSlug, dateRange);
    console.log(`  Searching: ${role}`);
    console.log(`  URL: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(2000 + Math.random() * 1000);

      const jobs = await page.evaluate((maxCount, searchRole, seekBase) => {
        const results = [];

        // Seek renders job cards as <article> elements
        const articles = Array.from(document.querySelectorAll('article'));

        for (let i = 0; i < Math.min(articles.length, maxCount); i++) {
          const el = articles[i];

          // Title — multiple selector fallbacks
          const titleEl =
            el.querySelector('[data-automation="jobTitle"]') ||
            el.querySelector('a[href*="/job/"]') ||
            el.querySelector('h3 a') ||
            el.querySelector('h2 a');

          if (!titleEl || !titleEl.textContent?.trim()) continue;

          // Job URL
          const href = titleEl.getAttribute('href') || titleEl.href || '';
          const fullUrl = href.startsWith('http') ? href : `${seekBase}${href}`;

          // Extract job ID from URL /job/<id>
          const idMatch = fullUrl.match(/\/job\/(\d+)/);
          const jobId = idMatch ? idMatch[1] : `${Date.now()}-${i}`;

          // Company
          const companyEl =
            el.querySelector('[data-automation="jobCompany"]') ||
            el.querySelector('[data-automation="jobListingCompany"]') ||
            el.querySelector('span[data-automation*="Company"]');

          // Location
          const locationEl =
            el.querySelector('[data-automation="jobLocation"]') ||
            el.querySelector('[data-automation="jobCardLocation"]') ||
            el.querySelector('span[data-automation*="Location"]');

          // Salary (often absent)
          const salaryEl =
            el.querySelector('[data-automation="jobSalary"]') ||
            el.querySelector('[data-automation="jobCardSalary"]');

          // Short description / bullet tags
          const descEls = el.querySelectorAll(
            '[data-automation="jobShortDescription"] li, [data-automation="jobShortDescription"]'
          );
          const descText = Array.from(descEls)
            .map(d => d.textContent?.trim())
            .filter(Boolean)
            .join(' • ');

          results.push({
            id: jobId,
            title: titleEl.textContent.trim(),
            company: companyEl?.textContent?.trim() || 'Unknown',
            location: locationEl?.textContent?.trim() || 'Melbourne VIC',
            salary: salaryEl?.textContent?.trim() || null,
            snippet: descText,
            url: fullUrl,
            searchRole,
          });
        }

        return results;
      }, maxPerSearch, role, SEEK_BASE);

      allJobs.push(...jobs);
      console.log(`    → ${jobs.length} listings found`);

    } catch (err) {
      console.error(`    Error scraping "${role}": ${err.message}`);
    }

    await sleep(1500 + Math.random() * 1000);
  }

  await browser.close();

  // Deduplicate by job ID
  const seen = new Set();
  return allJobs.filter(job => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

/**
 * Fetch the full job description from a Seek job detail page.
 */
async function getJobDetails(jobUrl) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    userAgent: randomAgent(),
    locale: 'en-AU',
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', route => route.abort());

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1500);

    return await page.evaluate(() => {
      // Seek job detail page selectors
      const descEl =
        document.querySelector('[data-automation="jobAdDetails"]') ||
        document.querySelector('[class*="jobDescription"]') ||
        document.querySelector('section[aria-label*="Description"]') ||
        document.querySelector('[data-testid="job-detail-page"] section');

      const titleEl =
        document.querySelector('[data-automation="job-detail-title"]') ||
        document.querySelector('h1');

      const companyEl =
        document.querySelector('[data-automation="advertiser-name"]') ||
        document.querySelector('[data-automation="job-detail-company"]');

      const salaryEl =
        document.querySelector('[data-automation="job-detail-salary"]');

      return {
        fullDescription: descEl?.innerText?.trim() || '',
        title: titleEl?.textContent?.trim() || '',
        company: companyEl?.textContent?.trim() || '',
        salary: salaryEl?.textContent?.trim() || null,
      };
    });
  } catch (err) {
    return { fullDescription: '', title: '', company: '', salary: null };
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeJobListings, getJobDetails };
