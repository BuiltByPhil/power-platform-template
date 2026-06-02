/**
 * Seek.com.au Playwright scraper — shared by the API routes.
 */

const { chromium } = require('playwright');
const fs = require('fs');

const SEEK_BASE = 'https://www.seek.com.au';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const FALLBACK_PATHS = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function resolveChromium() {
  try {
    const p = chromium.executablePath();
    if (fs.existsSync(p)) return p;
  } catch {}
  const f = FALLBACK_PATHS.find(p => fs.existsSync(p));
  if (f) return f;
  return undefined; // let Playwright use its default
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function launchBrowser() {
  const opts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  };
  const exe = resolveChromium();
  if (exe) opts.executablePath = exe;
  return chromium.launch(opts);
}

async function newCtx(browser) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 800 },
    locale: 'en-AU',
    timezoneId: 'Australia/Melbourne',
    ignoreHTTPSErrors: true,
  });
  await ctx.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,ico}', r => r.abort());
  return ctx;
}

/**
 * Search Seek and return an array of job listings.
 */
async function searchJobs(query, location, dateRange = 30, maxResults = 15) {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const locSlug = location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const url = `${SEEK_BASE}/${slug}-jobs/in-${locSlug}?daterange=${dateRange}&sortmode=ListedDate`;

  const browser = await launchBrowser();
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(2000);

    const jobs = await page.evaluate((max, base) => {
      return Array.from(document.querySelectorAll('article'))
        .slice(0, max)
        .reduce((acc, el) => {
          const titleEl =
            el.querySelector('[data-automation="jobTitle"]') ||
            el.querySelector('a[href*="/job/"]') ||
            el.querySelector('h3 a');
          if (!titleEl?.textContent?.trim()) return acc;

          const href = titleEl.getAttribute('href') || titleEl.href || '';
          const fullUrl = href.startsWith('http') ? href : `${base}${href}`;
          const jobId = (fullUrl.match(/\/job\/(\d+)/) || [])[1] || null;

          acc.push({
            jobId,
            title: titleEl.textContent.trim(),
            company: (el.querySelector('[data-automation="jobCompany"],[data-automation="jobListingCompany"]')?.textContent?.trim()) || '',
            location: (el.querySelector('[data-automation="jobLocation"],[data-automation="jobCardLocation"]')?.textContent?.trim()) || '',
            salary: el.querySelector('[data-automation="jobSalary"],[data-automation="jobCardSalary"]')?.textContent?.trim() || null,
            snippet: Array.from(el.querySelectorAll('[data-automation="jobShortDescription"] li')).map(d => d.textContent?.trim()).filter(Boolean).join(' • '),
            url: fullUrl,
            postedDate: el.querySelector('[data-automation="jobListedDate"],[data-automation="jobCardListedDate"]')?.textContent?.trim() || null,
          });
          return acc;
        }, []);
    }, maxResults, SEEK_BASE);

    return { jobs, searchUrl: url };
  } finally {
    await browser.close();
  }
}

/**
 * Fetch full details for a specific Seek job ID.
 */
async function getJobDetails(jobId) {
  const url = `${SEEK_BASE}/job/${jobId}`;
  const browser = await launchBrowser();
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(1500);

    return await page.evaluate((jobUrl, base) => {
      const titleEl = document.querySelector('[data-automation="job-detail-title"]') || document.querySelector('h1');
      const companyEl = document.querySelector('[data-automation="advertiser-name"]');
      const locationEl = document.querySelector('[data-automation="job-detail-location"]');
      const salaryEl = document.querySelector('[data-automation="job-detail-salary"]');
      const descEl = document.querySelector('[data-automation="jobAdDetails"]') || document.querySelector('[class*="jobDescription"]');
      const postedEl = document.querySelector('time');

      return {
        jobId: jobUrl.split('/job/')[1]?.split('?')[0] || '',
        title: titleEl?.textContent?.trim() || '',
        company: companyEl?.textContent?.trim() || '',
        location: locationEl?.textContent?.trim() || '',
        salary: salaryEl?.textContent?.trim() || null,
        postedDate: postedEl?.getAttribute('datetime') || postedEl?.textContent?.trim() || null,
        fullDescription: descEl?.innerText?.trim() || '',
        url: jobUrl,
        applyUrl: jobUrl,
      };
    }, url, SEEK_BASE);
  } finally {
    await browser.close();
  }
}

module.exports = { searchJobs, getJobDetails };
