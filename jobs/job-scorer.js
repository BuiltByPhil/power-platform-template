/**
 * Claude-powered job–candidate fit scorer.
 * Uses prompt caching to avoid re-sending the static profile on every call.
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a senior recruiter scoring job-candidate fit.
Analyse the candidate's background against the job requirements and respond ONLY with valid JSON — no markdown, no commentary.

JSON schema:
{
  "score": <integer 0-100>,
  "headline": "<one sentence summary of fit>",
  "reasons": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>"],
  "salaryFit": "above" | "likely" | "below" | "unknown"
}`;

/**
 * Score a single job against the candidate profile.
 * The profile is sent as a cached system block to save tokens.
 *
 * @param {object} job
 * @param {object} profile
 * @returns {Promise<{score, headline, reasons, gaps, salaryFit}>}
 */
async function scoreJob(job, profile) {
  const jobText = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location}`,
    job.salary ? `Salary: ${job.salary}` : null,
    job.fullDescription
      ? `\nFull Description:\n${job.fullDescription.substring(0, 3000)}`
      : job.snippet
      ? `\nSnippet: ${job.snippet}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const profileText = JSON.stringify(profile, null, 2);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',  // Fast + cheap for scoring many jobs
    max_tokens: 400,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `CANDIDATE PROFILE:\n${profileText}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Score the candidate's fit for this job:\n\n${jobText}`,
      },
    ],
  });

  const raw = response.content[0].text.trim();

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback if model response is malformed
    return {
      score: 50,
      headline: 'Could not parse score response.',
      reasons: [],
      gaps: [],
      salaryFit: 'unknown',
    };
  }
}

module.exports = { scoreJob };
