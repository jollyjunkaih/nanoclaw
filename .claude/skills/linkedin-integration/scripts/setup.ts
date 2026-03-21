#!/usr/bin/env npx tsx
import { chromium } from 'playwright';
import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import { config, cleanupLockFiles } from '../lib/browser.js';

async function setup(): Promise<void> {
  console.log('=== LinkedIn Authentication Setup ===\n');
  console.log('This will open Chrome for you to log in to LinkedIn.');
  console.log('Your login session will be saved for automated interactions.\n');
  console.log(`Chrome path: ${config.chromePath}`);
  console.log(`Profile dir: ${config.browserDataDir}\n`);

  fs.mkdirSync(path.dirname(config.authPath), { recursive: true });
  fs.mkdirSync(config.browserDataDir, { recursive: true });
  cleanupLockFiles();

  console.log('Launching browser...\n');

  const context = await chromium.launchPersistentContext(config.browserDataDir, {
    executablePath: config.chromePath,
    headless: false,
    viewport: config.viewport,
    args: config.chromeArgs.slice(0, 3),
    ignoreDefaultArgs: config.chromeIgnoreDefaultArgs,
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.linkedin.com/login');

  console.log('Please log in to LinkedIn in the browser window.');
  console.log('After you see your feed, come back here and press Enter.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => {
    rl.question('Press Enter when logged in... ', () => { rl.close(); resolve(); });
  });

  console.log('\nVerifying login status...');
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(config.timeouts.pageLoad);

  const isLoggedIn = await page.locator('.global-nav__me-photo, [data-test-icon="nav-people-icon"], .feed-identity-module').first().isVisible().catch(() => false);

  if (isLoggedIn) {
    fs.writeFileSync(config.authPath, JSON.stringify({
      authenticated: true,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log('\n✅ Authentication successful!');
    console.log(`Session saved to: ${config.browserDataDir}`);
  } else {
    console.log('\n❌ Could not verify login status.');
    console.log('Please try again and make sure you are logged in to LinkedIn.');
  }

  await context.close();
}

setup().catch(err => { console.error('Setup failed:', err.message); process.exit(1); });
