#!/usr/bin/env node
/**
 * Seek MCP Server
 *
 * Exposes two tools to Claude:
 *   seek_search_jobs    — search Seek.com.au for job listings
 *   seek_get_job_details — fetch full description for a specific listing
 *
 * Setup:
 *   cd seek-mcp && npm install && npx playwright install chromium
 *
 * Add to ~/.claude/claude_desktop_config.json (Claude Desktop) or
 * .claude/settings.json (Claude Code CLI):
 *   {
 *     "mcpServers": {
 *       "seek": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/seek-mcp/server.js"]
 *       }
 *     }
 *   }
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { chromium } = require('playwright');
const fs = require('fs');

// ─── Chromium resolution ────────────────────────────────────────────────────

const FALLBACK_CHROMIUM_PATHS = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];

function resolveChromiumPath() {
  try {
    const managed = chromium.executablePath();
    if (fs.existsSync(managed)) return managed;
  } catch {}
  const fallback = FALLBACK_CHROMIUM_PATHS.find(p => fs.existsSync(p));
  if (fallback) return fallback;
  throw new Error('No Chromium binary found. Run: npx playwright install chromium');
}

// ─── Seek scraping helpers ───────────────────────────────────────────────────

const SEEK_BASE = 'https://www.seek.com.au';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function newBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: resolveChromiumPath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });
}

async function newContext(browser) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1280, height: 800 },
    locale: 'en-AU',
    timezoneId: 'Australia/Melbourne',
    ignoreHTTPSErrors: true,
  });
  // Block images/fonts to speed things up
  await ctx.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,ico}', r => r.abort());
  return ctx;
}

/**
 * Scrape job listings from a Seek search results page.
 */
async function seekSearch(query, location, dateRange = 30, maxResults = 15) {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const locationSlug = location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const url = `${SEEK_BASE}/${slug}-jobs/in-${locationSlug}?daterange=${dateRange}&sortmode=ListedDate`;

  const browser = await newBrowser();
  const ctx = await newContext(browser);
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(2000);

    const jobs = await page.evaluate((max, base) => {
      const results = [];
      const articles = Array.from(document.querySelectorAll('article'));

      for (let i = 0; i < Math.min(articles.length, max); i++) {
        const el = articles[i];

        const titleEl =
          el.querySelector('[data-automation="jobTitle"]') ||
          el.querySelector('a[href*="/job/"]') ||
          el.querySelector('h3 a') ||
          el.querySelector('h2 a');

        if (!titleEl?.textContent?.trim()) continue;

        const href = titleEl.getAttribute('href') || titleEl.href || '';
        const fullUrl = href.startsWith('http') ? href : `${base}${href}`;
        const idMatch = fullUrl.match(/\/job\/(\d+)/);
        const jobId = idMatch ? idMatch[1] : null;

        const companyEl =
          el.querySelector('[data-automation="jobCompany"]') ||
          el.querySelector('[data-automation="jobListingCompany"]');

        const locationEl =
          el.querySelector('[data-automation="jobLocation"]') ||
          el.querySelector('[data-automation="jobCardLocation"]');

        const salaryEl =
          el.querySelector('[data-automation="jobSalary"]') ||
          el.querySelector('[data-automation="jobCardSalary"]');

        const descEls = el.querySelectorAll('[data-automation="jobShortDescription"] li');
        const snippet = Array.from(descEls).map(d => d.textContent?.trim()).filter(Boolean).join(' • ');

        results.push({
          jobId,
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent?.trim() || '',
          location: locationEl?.textContent?.trim() || '',
          salary: salaryEl?.textContent?.trim() || null,
          snippet,
          url: fullUrl,
        });
      }

      return results;
    }, maxResults, SEEK_BASE);

    return { jobs, searchUrl: url, totalFound: jobs.length };
  } finally {
    await browser.close();
  }
}

/**
 * Scrape the full description from a Seek job detail page.
 */
async function seekJobDetails(jobId) {
  const url = `${SEEK_BASE}/job/${jobId}`;
  const browser = await newBrowser();
  const ctx = await newContext(browser);
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(1500);

    return await page.evaluate((jobUrl) => {
      const titleEl =
        document.querySelector('[data-automation="job-detail-title"]') ||
        document.querySelector('h1');

      const companyEl =
        document.querySelector('[data-automation="advertiser-name"]') ||
        document.querySelector('[data-automation="job-detail-company"]');

      const locationEl =
        document.querySelector('[data-automation="job-detail-location"]') ||
        document.querySelector('[data-automation="job-detail-header"] [data-automation*="location"]');

      const salaryEl =
        document.querySelector('[data-automation="job-detail-salary"]');

      const descEl =
        document.querySelector('[data-automation="jobAdDetails"]') ||
        document.querySelector('[class*="jobDescription"]') ||
        document.querySelector('section[aria-label*="Description"]');

      const postedEl =
        document.querySelector('[data-automation="job-detail-date"]') ||
        document.querySelector('time');

      return {
        jobId: jobUrl.split('/job/')[1]?.split('?')[0] || '',
        title: titleEl?.textContent?.trim() || '',
        company: companyEl?.textContent?.trim() || '',
        location: locationEl?.textContent?.trim() || '',
        salary: salaryEl?.textContent?.trim() || null,
        postedDate: postedEl?.textContent?.trim() || postedEl?.getAttribute('datetime') || null,
        fullDescription: descEl?.innerText?.trim() || '',
        url: jobUrl,
      };
    }, url);
  } finally {
    await browser.close();
  }
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatJobList(jobs, searchUrl) {
  if (jobs.length === 0) {
    return 'No jobs found. Try broadening the search query or date range.';
  }

  const lines = jobs.map((j, i) => {
    const parts = [
      `### ${i + 1}. ${j.title}`,
      `**Company:** ${j.company || '_Unknown_'}`,
      `**Location:** ${j.location || '_Not specified_'}`,
      j.salary ? `**Salary:** ${j.salary}` : null,
      j.snippet ? `**Summary:** ${j.snippet}` : null,
      `**Job ID:** \`${j.jobId || 'N/A'}\``,
      `**Apply:** [View on Seek](${j.url})`,
    ].filter(Boolean);
    return parts.join('\n');
  });

  return `Found **${jobs.length}** listings\n_Search URL: ${searchUrl}_\n\n---\n\n${lines.join('\n\n---\n\n')}`;
}

function formatJobDetail(d) {
  return [
    `# ${d.title}`,
    `**Company:** ${d.company || '_Unknown_'}`,
    `**Location:** ${d.location || '_Not specified_'}`,
    d.salary ? `**Salary:** ${d.salary}` : null,
    d.postedDate ? `**Posted:** ${d.postedDate}` : null,
    `**Apply:** [View on Seek](${d.url})`,
    '',
    '---',
    '',
    d.fullDescription || '_No description available._',
  ].filter(s => s !== null).join('\n');
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'seek',
  version: '1.0.0',
});

server.tool(
  'seek_search_jobs',
  'Search Seek.com.au for job listings. Returns job titles, companies, locations, salaries, and apply links.',
  {
    query: z.string().describe('Job title or keywords to search for, e.g. "Customer Success Manager"'),
    location: z.string().describe('Location slug for Seek URL, e.g. "All-Melbourne-VIC" or "All-Sydney-NSW"'),
    date_range: z.number().optional().default(30).describe('How many days back to include (7, 14, 30, 90). Default 30.'),
    max_results: z.number().optional().default(15).describe('Maximum number of listings to return. Default 15.'),
  },
  async ({ query, location, date_range, max_results }) => {
    try {
      const { jobs, searchUrl } = await seekSearch(query, location, date_range, max_results);
      return {
        content: [{ type: 'text', text: formatJobList(jobs, searchUrl) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Search failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'seek_get_job_details',
  'Get the full job description and details for a specific Seek listing by its Job ID.',
  {
    job_id: z.string().describe('The Seek job ID (numeric string from the listing URL or seek_search_jobs results)'),
  },
  async ({ job_id }) => {
    try {
      const details = await seekJobDetails(job_id);
      return {
        content: [{ type: 'text', text: formatJobDetail(details) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Failed to fetch job details: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).catch(err => {
  process.stderr.write(`Seek MCP server error: ${err.message}\n`);
  process.exit(1);
});
