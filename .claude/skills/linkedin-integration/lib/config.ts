// .claude/skills/linkedin-integration/lib/config.ts
import path from 'path';

const PROJECT_ROOT = process.env.NANOCLAW_ROOT || process.cwd();

export const config = {
  chromePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  browserDataDir: path.join(PROJECT_ROOT, 'data', 'linkedin-browser-profile'),
  authPath: path.join(PROJECT_ROOT, 'data', 'linkedin-auth.json'),

  viewport: { width: 1280, height: 800 },

  timeouts: {
    navigation: 30000,
    elementWait: 5000,
    afterClick: 1000,
    afterFill: 1000,
    afterSubmit: 3000,
    pageLoad: 3000,
    scrollWait: 3000,
    betweenSearches: { min: 2000, max: 5000 },
  },

  limits: {
    postMaxLength: 3000,
    maxTopics: 5,
    maxPeople: 5,
    maxScrollIterations: 3,
    resultsPerTopic: 5,
    resultsPerPerson: 3,
  },

  chromeArgs: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
  ],

  chromeIgnoreDefaultArgs: ['--enable-automation'],
};
