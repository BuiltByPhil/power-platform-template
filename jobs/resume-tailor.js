/**
 * Claude-powered resume tailoring and cover letter generation.
 * Uses Opus for quality output — only called for jobs above the score threshold.
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

/**
 * Rewrite the candidate's resume, emphasising experience and skills
 * most relevant to the target job. Returns clean Markdown.
 */
async function tailorResume(job, baseResume, profile) {
  const jobContext = buildJobContext(job);

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: `You are an expert resume writer specialising in SaaS, logistics technology, and B2B software roles.
Your task is to tailor the candidate's resume for a specific job application.

Rules:
- Stay 100% truthful — do not invent experience, titles, or achievements
- Reorder and reweight bullet points to surface the most relevant experience first
- Naturally incorporate keywords from the job description (for ATS matching)
- Quantify achievements wherever the base resume provides data to do so
- Use clean, ATS-friendly Markdown (no tables, no columns, no special characters)
- Target 1–2 pages when converted to PDF
- Do NOT add a photo, colour, or formatting that won't survive a copy-paste`,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `BASE RESUME:\n${baseResume}\n\nCANDIDATE PROFILE (supplementary):\n${JSON.stringify(profile, null, 2)}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Tailor the resume for this role:\n\n${jobContext}\n\nReturn ONLY the tailored resume in Markdown. No commentary.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

/**
 * Write a personalised cover letter (3–4 paragraphs, ~350 words).
 * Returns clean Markdown.
 */
async function generateCoverLetter(job, baseResume, profile) {
  const jobContext = buildJobContext(job);

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: `You are an expert cover letter writer for SaaS / logistics technology roles in Australia.
Write a confident, specific, and human-sounding cover letter.

Structure:
1. Opening — reference the specific company and role; lead with the strongest hook
2. Body para 1 — connect WiseTech Global / supply-chain SaaS experience to the role's core need
3. Body para 2 — highlight 2–3 concrete achievements with impact
4. Closing — confident call to action; state AUD 110k minimum salary expectation if salary is not already above that

Tone: Professional but warm. No clichés ("I am writing to express my interest…").
Length: 3–4 paragraphs, ~300–380 words.
Format: Markdown.`,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `CANDIDATE BACKGROUND:\n${baseResume}\n\nPROFILE:\n${JSON.stringify(profile, null, 2)}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Write a cover letter for:\n\n${jobContext}\n\nReturn ONLY the cover letter in Markdown. No commentary.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

function buildJobContext(job) {
  return [
    `**Role:** ${job.title}`,
    `**Company:** ${job.company}`,
    `**Location:** ${job.location}`,
    job.salary ? `**Advertised Salary:** ${job.salary}` : null,
    `**Apply URL:** ${job.url}`,
    job.fullDescription
      ? `\n**Job Description:**\n${job.fullDescription.substring(0, 4000)}`
      : job.snippet
      ? `\n**Snippet:** ${job.snippet}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = { tailorResume, generateCoverLetter };
