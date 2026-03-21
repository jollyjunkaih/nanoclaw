#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, randomDelay, config, ScriptResult } from '../lib/browser.js';
import { persistToGitHub } from '../../content-shared/lib/github-persist.js';

interface DiscoverInput {
  topics?: string[];
  channels?: string[];
}

interface DiscoveredVideo {
  platform: string;
  title: string;
  channel: string;
  views: string;
  url: string;
  published: string;
}

async function discoverVideos(input: DiscoverInput): Promise<ScriptResult> {
  const topics = input.topics || process.env.YOUTUBE_TOPICS?.split(',').map(t => t.trim()).filter(Boolean) || [];
  const channels = input.channels || process.env.YOUTUBE_CHANNELS?.split(',').map(c => c.trim()).filter(Boolean) || [];

  if (topics.length === 0 && channels.length === 0) {
    return { success: false, message: 'No topics or channels specified. Set YOUTUBE_TOPICS/YOUTUBE_CHANNELS in .env or pass them as arguments.' };
  }

  const results: DiscoveredVideo[] = [];
  let context = null;

  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    // Search by topic
    for (const topic of topics.slice(0, config.limits.maxTopics)) {
      try {
        // sp=CAI%253D sorts by upload date
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}&sp=CAI%253D`;
        await page.goto(searchUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        // Scroll to load more results
        for (let i = 0; i < config.limits.maxScrollIterations; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(config.timeouts.scrollWait);
        }

        const videoElements = await page.locator('ytd-video-renderer').all();
        for (const video of videoElements.slice(0, config.limits.resultsPerTopic)) {
          try {
            const titleEl = video.locator('#video-title');
            const title = await titleEl.textContent() || '';
            const url = await titleEl.getAttribute('href') || '';
            const channel = await video.locator('ytd-channel-name').first().textContent() || '';
            const views = await video.locator('#metadata-line span').first().textContent() || '';
            const published = await video.locator('#metadata-line span').nth(1).textContent() || '';

            results.push({
              platform: 'youtube',
              title: title.trim(),
              channel: channel.trim(),
              views: views.trim(),
              url: url.startsWith('http') ? url : `https://www.youtube.com${url}`,
              published: published.trim(),
            });
          } catch { /* skip individual video extraction errors */ }
        }
      } catch (err) {
        console.error(`Error searching topic "${topic}": ${err instanceof Error ? err.message : String(err)}`);
      }

      await page.waitForTimeout(randomDelay());
    }

    // Monitor specific channels
    for (const channel of channels.slice(0, config.limits.maxChannels)) {
      try {
        const channelUrl = channel.startsWith('http')
          ? channel
          : `https://www.youtube.com/@${channel}/videos`;
        await page.goto(channelUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        const videoElements = await page.locator('ytd-rich-item-renderer, ytd-grid-video-renderer').all();
        for (const video of videoElements.slice(0, config.limits.resultsPerChannel)) {
          try {
            const titleEl = video.locator('#video-title').first();
            const title = await titleEl.textContent() || '';
            const url = await titleEl.getAttribute('href') || '';
            const views = await video.locator('#metadata-line span, .ytd-grid-video-renderer span').first().textContent() || '';

            results.push({
              platform: 'youtube',
              title: title.trim(),
              channel: channel,
              views: views.trim(),
              url: url.startsWith('http') ? url : `https://www.youtube.com${url}`,
              published: '',
            });
          } catch { /* skip */ }
        }
      } catch (err) {
        console.error(`Error checking channel "${channel}": ${err instanceof Error ? err.message : String(err)}`);
      }

      await page.waitForTimeout(randomDelay());
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (!r.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    // Persist to GitHub (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('youtube', 'discover', date, unique).catch(() => {});

    return {
      success: true,
      message: `Found ${unique.length} YouTube videos`,
      data: unique,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<DiscoverInput>(discoverVideos);
