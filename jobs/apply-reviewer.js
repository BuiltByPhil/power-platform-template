/**
 * Interactive CLI review gate before submitting any applications.
 * Shows a ranked list and lets the user approve all, select individually, or skip.
 */

const readline = require('readline');

function box(lines, width = 64) {
  const top = '╔' + '═'.repeat(width) + '╗';
  const bot = '╚' + '═'.repeat(width) + '╝';
  const pad = (s) => '║  ' + s + ' '.repeat(Math.max(0, width - 2 - s.length)) + '║';
  return [top, ...lines.map(pad), bot].join('\n');
}

async function reviewAndApprove(jobs) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  const lines = [
    'APPLY REVIEW QUEUE',
    '─'.repeat(60),
    ...jobs.flatMap((j, i) => [
      `${i + 1}.  ${j.fitScore}/100  ${j.title}`,
      `    ${j.company}${j.salary ? '  ·  ' + j.salary : ''}`,
      `    ${j.url}`,
      '',
    ]),
    '─'.repeat(60),
    '[A] Apply to all above',
    '[S] Select individually',
    '[N] Skip — exit without applying',
  ];

  console.log('\n' + box(lines));

  let approved = [];
  const choice = (await ask('\n  Choice [A/S/N]: ')).trim().toUpperCase();

  if (choice === 'A') {
    approved = [...jobs];
  } else if (choice === 'S') {
    for (const job of jobs) {
      const yn = await ask(
        `\n  Apply to "${job.title}" @ ${job.company}? [y/n]: `
      );
      if (yn.trim().toLowerCase() === 'y') approved.push(job);
    }
  }

  rl.close();

  if (approved.length === 0) {
    console.log('\n  No applications submitted.\n');
  } else {
    console.log(`\n  Approved: ${approved.length} job(s). Starting submissions...\n`);
  }

  return approved;
}

module.exports = { reviewAndApprove };
