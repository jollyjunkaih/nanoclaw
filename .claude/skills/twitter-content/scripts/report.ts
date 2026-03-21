#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';
import { persistToGitHub } from '../../content-shared/lib/github-persist.js';

interface ReportInput { period: 'week' | 'month'; }

async function generateReport(input: ReportInput): Promise<ScriptResult> {
  const period = input.period || 'week';
  let context = null;

  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    // Navigate to X analytics
    await page.goto('https://analytics.twitter.com/about', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad * 2);

    const report: Record<string, unknown> = {
      platform: 'twitter',
      period,
      generatedAt: new Date().toISOString(),
      followers: { count: 0, change: 0 },
      impressions: 0,
      engagementRate: 0,
      topTweets: [] as Array<{ content: string; impressions: number; engagement: number }>,
    };

    // Try to extract follower count from profile page
    try {
      await page.goto('https://x.com/home', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(config.timeouts.pageLoad);

      // Navigate to own profile via account switcher
      const accountBtn = page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').first();
      if (await accountBtn.isVisible().catch(() => false)) {
        const handle = await page.locator('[data-testid="UserName"]').first().textContent().catch(() => null);
        if (handle) {
          const cleanHandle = handle.trim().replace('@', '');
          await page.goto(`https://x.com/${cleanHandle}`, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(config.timeouts.pageLoad);

          const followerEl = page.locator('a[href$="/verified_followers"], a[href$="/followers"]').first();
          const followerText = await followerEl.textContent().catch(() => null);
          if (followerText) {
            report.followers = { count: parseInt(followerText.replace(/\D/g, '')) || 0, change: 0 };
          }
        }
      }
    } catch { /* profile scrape may fail */ }

    // Try analytics.twitter.com for tweet impressions
    try {
      await page.goto('https://analytics.twitter.com/user/home', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(config.timeouts.pageLoad * 2);

      const impressionsEl = page.locator('[data-element-term="tweet_impressions"], .tweet-impressions').first();
      const impressionsText = await impressionsEl.textContent().catch(() => null);
      if (impressionsText) {
        report.impressions = parseInt(impressionsText.replace(/\D/g, '')) || 0;
      }

      // Top tweets
      const tweetRows = await page.locator('.tweet-table tbody tr, .tweet-activity-tweet').all();
      const topTweets: Array<{ content: string; impressions: number; engagement: number }> = [];
      for (const row of tweetRows.slice(0, 5)) {
        const text = await row.locator('td:first-child .tweet-text, .tweet-text').first().textContent().catch(() => '');
        const imp = await row.locator('td:nth-child(2), .impressions-count').first().textContent().catch(() => '0');
        const eng = await row.locator('td:nth-child(3), .engagements-count').first().textContent().catch(() => '0');
        topTweets.push({
          content: text?.trim().slice(0, 100) || '',
          impressions: parseInt(imp?.replace(/\D/g, '') || '0') || 0,
          engagement: parseInt(eng?.replace(/\D/g, '') || '0') || 0,
        });
      }
      report.topTweets = topTweets;
    } catch { /* analytics layout may vary */ }

    // Persist report (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('twitter', 'reports', date, report, period).catch(() => {});

    return {
      success: true,
      message: `Twitter ${period}ly report generated`,
      data: report,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<ReportInput>(generateReport);
