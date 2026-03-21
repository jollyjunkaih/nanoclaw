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

    // Navigate to YouTube Studio
    await page.goto(config.urls.youtubeStudio, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad * 2);

    const report: Record<string, unknown> = {
      platform: 'youtube',
      period,
      generatedAt: new Date().toISOString(),
      subscribers: { count: 0, change: 0 },
      totalViews: 0,
      watchTimeHours: 0,
      topVideos: [] as Array<{ title: string; views: number; watchTimeHours: number }>,
    };

    // Navigate to analytics section
    await page.goto(`${config.urls.youtubeStudio}/analytics/tab-overview/period-${period === 'week' ? 'default_7D' : 'default_28D'}`, {
      timeout: config.timeouts.navigation,
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(config.timeouts.pageLoad * 2);

    // Use page.evaluate() to extract data from shadow DOM elements
    const analyticsData = await page.evaluate(() => {
      const getText = (selector: string): string => {
        const el = document.querySelector(selector);
        return el ? (el.textContent || '').trim() : '';
      };

      // YouTube Studio uses shadow DOM; attempt multiple selector strategies
      const subscribers = getText('ytcp-channel-analytics-summary-card:first-of-type .ytcp-channel-analytics-summary-card__metric-value') ||
        getText('[id="subscriber-count"]') ||
        getText('ytcp-analytics-metric-card:first-of-type .title');

      const views = getText('ytcp-channel-analytics-summary-card:nth-of-type(2) .ytcp-channel-analytics-summary-card__metric-value') ||
        getText('[id="views-count"]') ||
        '';

      const watchTime = getText('ytcp-channel-analytics-summary-card:nth-of-type(3) .ytcp-channel-analytics-summary-card__metric-value') ||
        getText('[id="watch-time"]') ||
        '';

      return { subscribers, views, watchTime };
    });

    if (analyticsData.subscribers) {
      const subCount = parseInt(analyticsData.subscribers.replace(/[^0-9]/g, '')) || 0;
      report.subscribers = { count: subCount, change: 0 };
    }

    if (analyticsData.views) {
      report.totalViews = parseInt(analyticsData.views.replace(/[^0-9]/g, '')) || 0;
    }

    if (analyticsData.watchTime) {
      report.watchTimeHours = parseFloat(analyticsData.watchTime.replace(/[^0-9.]/g, '')) || 0;
    }

    // Try to extract top videos from the content tab
    try {
      const contentTabBtn = page.locator('paper-tab:has-text("Content"), ytcp-analytics-tab-bar-item:has-text("Content")').first();
      if (await contentTabBtn.isVisible().catch(() => false)) {
        await contentTabBtn.click();
        await page.waitForTimeout(config.timeouts.pageLoad);

        const topVideos = await page.evaluate(() => {
          const rows = document.querySelectorAll('ytcp-analytics-data-table tbody tr, .ytcp-analytics-entity-list-item');
          const videos: Array<{ title: string; views: number; watchTimeHours: number }> = [];
          rows.forEach((row, idx) => {
            if (idx >= 5) return;
            const titleEl = row.querySelector('td:first-child, .ytcp-analytics-entity-list-item__title');
            const viewsEl = row.querySelector('td:nth-child(2), .ytcp-analytics-entity-list-item__views');
            const watchEl = row.querySelector('td:nth-child(3), .ytcp-analytics-entity-list-item__watch-time');
            videos.push({
              title: (titleEl?.textContent || '').trim().slice(0, 100),
              views: parseInt((viewsEl?.textContent || '0').replace(/[^0-9]/g, '')) || 0,
              watchTimeHours: parseFloat((watchEl?.textContent || '0').replace(/[^0-9.]/g, '')) || 0,
            });
          });
          return videos;
        });

        report.topVideos = topVideos;
      }
    } catch { /* analytics layout may vary */ }

    // Persist report (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('youtube', 'reports', date, report, period).catch(() => {});

    return {
      success: true,
      message: `YouTube ${period}ly report generated`,
      data: report,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<ReportInput>(generateReport);
