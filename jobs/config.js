module.exports = {
  location: 'Melbourne VIC',
  locationSlug: 'in-All-Melbourne-VIC',
  country: 'AU',

  targetRoles: [
    'Implementation Consultant',
    'Customer Success Manager',
    'Technical Account Manager',
  ],

  // Only generate tailored docs for jobs at or above this score
  scoreThreshold: 65,

  // Max listings to collect per role search on Seek
  maxJobsPerSearch: 10,

  // Days back to include (Seek daterange param)
  dateRange: 30,

  outputDir: './output',
};
