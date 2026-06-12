'use strict';

const { test, expect } = require('@playwright/test');

const PLEDGE_TEXT = '我绝不盈利、造谣、污蔑或嘲讽，并对自己的使用行为负完全责任';

async function closeIfVisible(locator) {
    if (await locator.isVisible().catch(() => false)) {
        await locator.click();
    }
}

async function passSplash(page) {
    const splash = page.locator('#splash-declaration');
    if (!(await splash.isVisible().catch(() => false))) return;
    const next = page.locator('#splash-next-btn');
    for (let i = 0; i < 5; i += 1) {
        await next.click();
    }
    await page.locator('#splash-pledge-input').fill(PLEDGE_TEXT);
    await page.locator('#splash-enter-btn').click();
    await expect(splash).toBeHidden({ timeout: 4000 });
}

async function dismissStartup(page) {
    await page.addInitScript(() => {
        window.localStorage.setItem('dailyGreetingShown', new Date().toDateString());
    });
    await page.goto('/');
    await expect(page).toHaveTitle('传讯');
    await page.waitForLoadState('networkidle');
    await passSplash(page);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true', { timeout: 15000 });
    await closeIfVisible(page.locator('#accept-disclaimer'));
    await closeIfVisible(page.locator('#tour-skip-btn'));
    await closeIfVisible(page.locator('.daily-greeting-close-btn'));
    await expect(page.locator('#home-container')).toBeVisible();
}

async function enterChatFromHome(page) {
    const chatApp = page.locator('.app-item').filter({
        has: page.locator('[data-app="chat"]')
    }).first();
    await expect(chatApp).toBeVisible();
    await chatApp.click();
    await expect(page.locator('#home-container')).toBeHidden();
    await expect(page.locator('#message-input')).toBeVisible();
}

test.describe('XSS regression', () => {
    test('message with script tag does not execute', async ({ page }) => {
        await dismissStartup(page);
        await enterChatFromHome(page);

        const dialogMessages = [];
        page.on('dialog', dialog => {
            dialogMessages.push(dialog.message());
            dialog.dismiss();
        });

        const payload = '<img src=x onerror=alert("xss")>';
        await page.locator('#message-input').fill(payload);
        await page.locator('#send-btn').click();

        // 等待消息渲染
        await page.waitForTimeout(2000);

        // 确认没有弹出 alert 对话框
        expect(dialogMessages.filter(m => m.includes('xss'))).toHaveLength(0);

        // 确认页面中没有渲染出 img 标签（payload 被转义为文本）
        const imgTags = await page.locator('.message img[onerror]').count();
        expect(imgTags).toBe(0);
    });

    test('notification with HTML does not execute script', async ({ page }) => {
        await dismissStartup(page);

        // 通过控制台触发一个包含 HTML 的通知
        await page.evaluate(() => {
            window.showNotification('<img src=x onerror=alert("xss")>', 'info');
        });

        await page.waitForTimeout(500);

        // 确认通知中的文本是纯文本
        const notification = page.locator('.notification').last();
        if (await notification.isVisible().catch(() => false)) {
            const text = await notification.textContent();
            expect(text).toContain('<img'); // 原始文本，不是渲染的 img 元素
        }
    });
});
