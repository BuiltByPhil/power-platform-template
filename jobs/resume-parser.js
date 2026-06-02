/**
 * Parse a resume file (PDF, DOCX, TXT, MD) into plain text.
 */

const fs = require('fs');
const path = require('path');

async function parseResume(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf': {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    }

    case '.docx': {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }

    case '.txt':
    case '.md':
      return fs.readFileSync(filePath, 'utf-8');

    default:
      throw new Error(
        `Unsupported resume format: "${ext}". Supported: .pdf, .docx, .txt, .md`
      );
  }
}

/**
 * Build a plain-text resume from the Indeed profile JSON when no file is provided.
 */
function profileToText(profile) {
  const exp = profile.experience
    .map(e => `  • ${e.title} — ${e.company} (${e.period})`)
    .join('\n');

  const edu = profile.education
    .map(e => `  • ${e.qualification} — ${e.institution}`)
    .join('\n');

  const skills = profile.skills.join(', ');

  return `# ${profile.name || 'Candidate'} — Resume

## Professional Summary
Results-driven SaaS professional with 10+ years across logistics technology, account management, and product implementation. Deep experience with enterprise software onboarding, cross-functional stakeholder engagement, and technical consulting in supply-chain platforms.

## Work Experience
${exp}

## Education
${edu}

## Core Skills
${skills}

## Additional
- Minimum salary: AUD ${profile.minSalary?.toLocaleString() || '110,000'}/year
- Location: ${profile.location}
- Willing to relocate: ${profile.willingToRelocate ? 'Yes' : 'No'}
`;
}

module.exports = { parseResume, profileToText };
