#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, randomDelay, config, ScriptResult } from '../lib/browser.js';
import { persistToGitHub } from '../../content-shared/lib/github-persist.js';

interface DiscoverInput {
  topics?: string[];
  people?: string[];
}

interface DiscoveredPost {
  platform: string;
  author: string;
  content: string;
  url: string;
  engagement: { likes: number; comments: number; reposts: number };
  published: string;
}

async function discoverPosts(input: DiscoverInput): Promise<ScriptResult> {
  const topics = input.topics || process.env.LINKEDIN_TOPICS?.split(',').map(t => t.trim()).filter(Boolean) || [];
  const people = input.people || process.env.LINKEDIN_PEOPLE?.split(',').map(p => p.trim()).filter(Boolean) || [];

  if (topics.length === 0 && people.length === 0) {
    return { success: false, message: 'No topics or people specified. Set LINKEDIN_TOPICS/LINKEDIN_PEOPLE in .env or pass them as arguments.' };
  }

  const results: DiscoveredPost[] = [];
  let context = null;

  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    // Search by topic
    for (const topic of topics.slice(0, config.limits.maxTopics)) {
      try {
        const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(topic)}&sortBy=%22date_posted%22`;
        await page.goto(searchUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        // Scroll to load more results
        for (let i = 0; i < config.limits.maxScrollIterations; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(config.timeouts.scrollWait);
        }

        // Extract posts from search results
        const posts = await page.locator('.feed-shared-update-v2').all();
        for (const post of posts.slice(0, config.limits.resultsPerTopic)) {
          try {
            const author = await post.locator('.update-components-actor__name span[aria-hidden="true"]').first().textContent() || 'Unknown';
            const contentEl = post.locator('.feed-shared-update-v2__description, .update-components-text');
            const content = await contentEl.first().textContent() || '';
            const linkEl = post.locator('a[href*="/feed/update/"]').first();
            const url = await linkEl.getAttribute('href') || '';
            const timeEl = post.locator('.update-components-actor__sub-description span[aria-hidden="true"]').first();
            const published = await timeEl.textContent() || '';

            // Try to extract engagement numbers
            const socialCounts = post.locator('.social-details-social-counts');
            const likesText = await socialCounts.locator('button[aria-label*="like"], button[aria-label*="reaction"]').first().textContent().catch(() => '0');
            const commentsText = await socialCounts.locator('button[aria-label*="comment"]').first().textContent().catch(() => '0');

            results.push({
              platform: 'linkedin',
              author: author.trim(),
              content: content.trim().slice(0, 200),
              url: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
              engagement: {
                likes: parseInt(likesText?.replace(/\D/g, '') || '0') || 0,
                comments: parseInt(commentsText?.replace(/\D/g, '') || '0') || 0,
                reposts: 0,
              },
              published: published.trim(),
            });
          } catch { /* skip individual post extraction errors */ }
        }
      } catch (err) {
        // Log but continue with next topic
        console.error(`Error searching topic "${topic}": ${err instanceof Error ? err.message : String(err)}`);
      }

      await page.waitForTimeout(randomDelay());
    }

    // Monitor specific people
    for (const person of people.slice(0, config.limits.maxPeople)) {
      try {
        const profileUrl = person.startsWith('http')
          ? `${person}/recent-activity/all/`
          : `https://www.linkedin.com/in/${person}/recent-activity/all/`;
        await page.goto(profileUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        const posts = await page.locator('.feed-shared-update-v2').all();
        for (const post of posts.slice(0, config.limits.resultsPerPerson)) {
          try {
            const contentEl = post.locator('.feed-shared-update-v2__description, .update-components-text');
            const content = await contentEl.first().textContent() || '';
            const linkEl = post.locator('a[href*="/feed/update/"]').first();
            const url = await linkEl.getAttribute('href') || '';
            const timeEl = post.locator('.update-components-actor__sub-description span[aria-hidden="true"]').first();
            const published = await timeEl.textContent() || '';

            results.push({
              platform: 'linkedin',
              author: person,
              content: content.trim().slice(0, 200),
              url: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
              engagement: { likes: 0, comments: 0, reposts: 0 },
              published: published.trim(),
            });
          } catch { /* skip */ }
        }
      } catch (err) {
        console.error(`Error checking person "${person}": ${err instanceof Error ? err.message : String(err)}`);
      }

      await page.waitForTimeout(randomDelay());
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    // Sort by engagement (likes + comments)
    unique.sort((a, b) => (b.engagement.likes + b.engagement.comments) - (a.engagement.likes + a.engagement.comments));

    // Persist to GitHub (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('linkedin', 'discover', date, unique).catch(() => {});

    return {
      success: true,
      message: `Found ${unique.length} interesting LinkedIn posts`,
      data: unique,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<DiscoverInput>(discoverPosts);
