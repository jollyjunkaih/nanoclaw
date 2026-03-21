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

    // Navigate to LinkedIn analytics
    await page.goto('https://www.linkedin.com/analytics/creator/', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad * 2);

    // Attempt to get profile overview for follower count
    const report: Record<string, unknown> = {
      platform: 'linkedin',
      period,
      generatedAt: new Date().toISOString(),
      followers: { count: 0, change: 0 },
      impressions: 0,
      engagementRate: 0,
      topPosts: [] as Array<{ content: string; impressions: number; engagement: number }>,
    };

    // Extract follower count from analytics page
    const followerText = await page.locator('[data-test-id="follower-count"], .analytics-followers-count').first().textContent().catch(() => null);
    if (followerText) {
      report.followers = { count: parseInt(followerText.replace(/\D/g, '')) || 0, change: 0 };
    }

    // Extract impressions
    const impressionsText = await page.locator('[data-test-id="impressions-count"], .analytics-impressions').first().textContent().catch(() => null);
    if (impressionsText) {
      report.impressions = parseInt(impressionsText.replace(/\D/g, '')) || 0;
    }

    // Try to extract top posts from the analytics content tab
    try {
      const contentTab = page.locator('button:has-text("Content"), a:has-text("Content")').first();
      if (await contentTab.isVisible().catch(() => false)) {
        await contentTab.click();
        await page.waitForTimeout(config.timeouts.pageLoad);

        const postRows = await page.locator('.analytics-content-table tbody tr, .content-analytics-list-item').all();
        const topPosts: Array<{ content: string; impressions: number; engagement: number }> = [];
        for (const row of postRows.slice(0, 5)) {
          const text = await row.locator('td:first-child, .content-analytics-list-item__text').first().textContent().catch(() => '');
          const imp = await row.locator('td:nth-child(2), .content-analytics-list-item__impressions').first().textContent().catch(() => '0');
          topPosts.push({
            content: text?.trim().slice(0, 100) || '',
            impressions: parseInt(imp?.replace(/\D/g, '') || '0') || 0,
            engagement: 0,
          });
        }
        report.topPosts = topPosts;
      }
    } catch { /* analytics layout may vary */ }

    // Persist report (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('linkedin', 'reports', date, report, period).catch(() => {});

    return {
      success: true,
      message: `LinkedIn ${period}ly report generated`,
      data: report,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<ReportInput>(generateReport);
