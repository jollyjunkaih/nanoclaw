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
  const topics = input.topics || process.env.TWITTER_TOPICS?.split(',').map(t => t.trim()).filter(Boolean) || [];
  const people = input.people || process.env.TWITTER_PEOPLE?.split(',').map(p => p.trim()).filter(Boolean) || [];

  if (topics.length === 0 && people.length === 0) {
    return { success: false, message: 'No topics or people specified. Set TWITTER_TOPICS/TWITTER_PEOPLE in .env or pass them as arguments.' };
  }

  const results: DiscoveredPost[] = [];
  let context = null;

  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    // Search by topic
    for (const topic of topics.slice(0, config.limits.maxTopics)) {
      try {
        const searchUrl = `https://x.com/search?q=${encodeURIComponent(topic)}&f=top`;
        await page.goto(searchUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        // Scroll to load more results
        for (let i = 0; i < config.limits.maxScrollIterations; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(config.timeouts.scrollWait);
        }

        // Extract tweets from search results
        const posts = await page.locator('article[data-testid="tweet"]').all();
        for (const post of posts.slice(0, config.limits.resultsPerTopic)) {
          try {
            const authorEl = post.locator('[data-testid="User-Name"] span').first();
            const author = await authorEl.textContent() || 'Unknown';
            const contentEl = post.locator('[data-testid="tweetText"]');
            const content = await contentEl.first().textContent() || '';
            const linkEl = post.locator('a[href*="/status/"]').first();
            const href = await linkEl.getAttribute('href') || '';
            const url = href.startsWith('http') ? href : `https://x.com${href}`;
            const timeEl = post.locator('time').first();
            const published = await timeEl.getAttribute('datetime') || '';

            // Try to extract engagement numbers
            const likesEl = post.locator('[data-testid="like"] span').first();
            const likesText = await likesEl.textContent().catch(() => '0');
            const repliesEl = post.locator('[data-testid="reply"] span').first();
            const repliesText = await repliesEl.textContent().catch(() => '0');
            const retweetsEl = post.locator('[data-testid="retweet"] span').first();
            const retweetsText = await retweetsEl.textContent().catch(() => '0');

            results.push({
              platform: 'twitter',
              author: author.trim(),
              content: content.trim().slice(0, 200),
              url,
              engagement: {
                likes: parseInt(likesText?.replace(/\D/g, '') || '0') || 0,
                comments: parseInt(repliesText?.replace(/\D/g, '') || '0') || 0,
                reposts: parseInt(retweetsText?.replace(/\D/g, '') || '0') || 0,
              },
              published,
            });
          } catch { /* skip individual post extraction errors */ }
        }
      } catch (err) {
        console.error(`Error searching topic "${topic}": ${err instanceof Error ? err.message : String(err)}`);
      }

      await page.waitForTimeout(randomDelay());
    }

    // Monitor specific people
    for (const person of people.slice(0, config.limits.maxPeople)) {
      try {
        const handle = person.startsWith('@') ? person.slice(1) : person;
        const profileUrl = `https://x.com/${handle}`;
        await page.goto(profileUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        const posts = await page.locator('article[data-testid="tweet"]').all();
        for (const post of posts.slice(0, config.limits.resultsPerPerson)) {
          try {
            const contentEl = post.locator('[data-testid="tweetText"]');
            const content = await contentEl.first().textContent() || '';
            const linkEl = post.locator('a[href*="/status/"]').first();
            const href = await linkEl.getAttribute('href') || '';
            const url = href.startsWith('http') ? href : `https://x.com${href}`;
            const timeEl = post.locator('time').first();
            const published = await timeEl.getAttribute('datetime') || '';

            results.push({
              platform: 'twitter',
              author: handle,
              content: content.trim().slice(0, 200),
              url,
              engagement: { likes: 0, comments: 0, reposts: 0 },
              published,
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

    // Sort by engagement (likes + comments + reposts)
    unique.sort((a, b) =>
      (b.engagement.likes + b.engagement.comments + b.engagement.reposts) -
      (a.engagement.likes + a.engagement.comments + a.engagement.reposts)
    );

    // Persist to GitHub (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('twitter', 'discover', date, unique).catch(() => {});

    return {
      success: true,
      message: `Found ${unique.length} interesting Twitter posts`,
      data: unique,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<DiscoverInput>(discoverPosts);
