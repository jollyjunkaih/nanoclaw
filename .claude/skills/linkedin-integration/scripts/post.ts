#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, validateContent, config, ScriptResult } from '../lib/browser.js';

interface PostInput { content: string; }

async function createPost(input: PostInput): Promise<ScriptResult> {
  const validationError = validateContent(input.content, 'Post');
  if (validationError) return validationError;

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto('https://www.linkedin.com/feed/', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad);

    // Click "Start a post" button
    const startPostBtn = page.locator('.share-box-feed-entry__trigger, button.artdeco-button[aria-label*="Start a post"]');
    await startPostBtn.first().waitFor({ timeout: config.timeouts.elementWait });
    await startPostBtn.first().click();
    await page.waitForTimeout(config.timeouts.afterClick);

    // Fill the post editor
    const editor = page.locator('.ql-editor[data-placeholder], [role="textbox"][aria-label*="Text editor"]');
    await editor.first().waitFor({ timeout: config.timeouts.elementWait });
    await editor.first().click();
    await page.waitForTimeout(config.timeouts.afterClick / 2);
    await editor.first().fill(input.content);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Click Post button
    const postBtn = page.locator('button.share-actions__primary-action');
    await postBtn.waitFor({ timeout: config.timeouts.elementWait });
    await postBtn.click();
    await page.waitForTimeout(config.timeouts.afterSubmit);

    return {
      success: true,
      message: `LinkedIn post created: ${input.content.slice(0, 50)}${input.content.length > 50 ? '...' : ''}`
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<PostInput>(createPost);
