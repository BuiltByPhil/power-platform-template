/**
 * Seek Connector REST API
 *
 * Endpoints consumed by the Power Platform Custom Connector:
 *
 *   GET /jobs/search?q=...&location=...&dateRange=30&maxResults=15
 *   GET /jobs/{jobId}
 *   GET /health
 *
 * Optional API key auth: set API_KEY env var to require
 * x-api-key header on every request.
 */

const express = require('express');
const { searchJobs, getJobDetails } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;

// ─── Auth middleware ─────────────────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.path === '/health') return next(); // health check skips auth
  if (!API_KEY) return next();               // no key configured = open
  const provided = req.headers['x-api-key'];
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing x-api-key header.' });
  }
  next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/** Health check — used by Azure Container Apps liveness probe */
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * Search Seek for job listings.
 *
 * Query params:
 *   q           {string}  Job title / keywords (required)
 *   location    {string}  Seek location slug, e.g. All-Melbourne-VIC (required)
 *   dateRange   {number}  Days back: 7, 14, 30, 90  (default 30)
 *   maxResults  {number}  Max listings to return     (default 15, max 50)
 */
app.get('/jobs/search', async (req, res) => {
  const { q, location, dateRange = '30', maxResults = '15' } = req.query;

  if (!q || !location) {
    return res.status(400).json({
      error: 'Missing required query parameters: q (search query) and location.',
      example: '/jobs/search?q=Customer+Success+Manager&location=All-Melbourne-VIC',
    });
  }

  const range = Math.min(parseInt(dateRange, 10) || 30, 90);
  const max   = Math.min(parseInt(maxResults, 10) || 15, 50);

  try {
    const { jobs, searchUrl } = await searchJobs(q, location, range, max);
    res.json({
      query: q,
      location,
      dateRange: range,
      totalResults: jobs.length,
      searchUrl,
      jobs,
    });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed.', detail: err.message });
  }
});

/**
 * Get full details for a specific Seek job.
 *
 * Path param:
 *   jobId  {string}  Numeric Seek job ID from search results
 */
app.get('/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;

  if (!/^\d+$/.test(jobId)) {
    return res.status(400).json({ error: 'jobId must be a numeric string.' });
  }

  try {
    const details = await getJobDetails(jobId);
    res.json(details);
  } catch (err) {
    console.error('Details error:', err.message);
    res.status(500).json({ error: 'Failed to fetch job details.', detail: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Seek Connector API listening on port ${PORT}`);
  if (API_KEY) console.log('API key authentication enabled.');
});
