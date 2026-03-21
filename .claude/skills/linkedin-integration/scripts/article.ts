#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface ArticleInput { title: string; content: string; }

async function publishArticle(input: ArticleInput): Promise<ScriptResult> {
  if (!input.title || input.title.length === 0) {
    return { success: false, message: 'Article title cannot be empty' };
  }
  if (!input.content || input.content.length === 0) {
    return { success: false, message: 'Article content cannot be empty' };
  }

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto('https://www.linkedin.com/article/new/', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad * 2);

    // Fill title
    const titleField = page.locator('[role="textbox"][data-placeholder*="Title"], .article-editor__title [role="textbox"]');
    await titleField.first().waitFor({ timeout: config.timeouts.elementWait * 2 });
    await titleField.first().click();
    await titleField.first().fill(input.title);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Fill body
    const bodyField = page.locator('.article-editor__content [role="textbox"], .ql-editor');
    await bodyField.first().waitFor({ timeout: config.timeouts.elementWait });
    await bodyField.first().click();
    await bodyField.first().fill(input.content);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Click Publish / Next
    const publishBtn = page.locator('button:has-text("Publish"), button:has-text("Next")');
    await publishBtn.first().waitFor({ timeout: config.timeouts.elementWait });
    await publishBtn.first().click();
    await page.waitForTimeout(config.timeouts.afterSubmit);

    // If there's a confirmation dialog, click Publish again
    const confirmBtn = page.locator('button:has-text("Publish")');
    const hasConfirm = await confirmBtn.isVisible().catch(() => false);
    if (hasConfirm) {
      await confirmBtn.click();
      await page.waitForTimeout(config.timeouts.afterSubmit);
    }

    return {
      success: true,
      message: `LinkedIn article published: ${input.title}`
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<ArticleInput>(publishArticle);
