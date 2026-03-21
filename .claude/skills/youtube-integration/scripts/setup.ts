#!/usr/bin/env npx tsx
import { chromium } from 'playwright';
import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import { config, cleanupLockFiles } from '../lib/browser.js';

async function setup(): Promise<void> {
  console.log('=== YouTube / Google Authentication Setup ===\n');
  console.log('This will open Chrome for you to log in to your Google account.');
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
  await page.goto(config.urls.googleSignIn);

  console.log('Please log in to your Google account in the browser window.');
  console.log('After signing in, the page will redirect to YouTube Studio.');
  console.log('Once you see the YouTube Studio dashboard, come back here and press Enter.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => {
    rl.question('Press Enter when logged in to YouTube Studio... ', () => { rl.close(); resolve(); });
  });

  console.log('\nVerifying login status...');
  await page.goto(config.urls.youtubeStudio);
  await page.waitForTimeout(config.timeouts.pageLoad);

  const isLoggedIn = await page.locator(
    'ytcp-channel-picker, #avatar-btn, ytcp-ve.ytcp-app, [id="content"]'
  ).first().isVisible().catch(() => false);

  if (isLoggedIn) {
    fs.writeFileSync(config.authPath, JSON.stringify({
      authenticated: true,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log('\nAuthentication successful!');
    console.log(`Session saved to: ${config.browserDataDir}`);
  } else {
    console.log('\nCould not verify login status.');
    console.log('Please try again and make sure you are logged in to YouTube Studio.');
  }

  await context.close();
}

setup().catch(err => { console.error('Setup failed:', err.message); process.exit(1); });
