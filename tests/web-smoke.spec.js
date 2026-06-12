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
    await page.waitForTimeout(4200);
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

test('first run gates resolve to the home UI', async ({ page }) => {
    await dismissStartup(page);

    await expect(page.locator('#home-container')).toBeVisible();
    await expect(page.locator('.hero-card')).toBeVisible();
    await expect(page.locator('[data-app="chat"]')).toBeVisible();
});

test('home chat entry opens the chat UI', async ({ page }) => {
    await dismissStartup(page);
    await enterChatFromHome(page);

    await expect(page.locator('#message-input')).toBeVisible();
    await expect(page.locator('#send-btn')).toBeVisible();
    await expect(page.locator('#send-btn')).toBeEnabled();
    await expect(page.locator('#chat-container')).toBeVisible();
});

test('mobile chat can send a text message', async ({ page }) => {
    await dismissStartup(page);
    await enterChatFromHome(page);

    const message = `web-smoke-${Date.now()}`;
    await page.locator('#message-input').fill(message);
    await expect(page.locator('#send-btn')).toBeVisible();
    await page.locator('#send-btn').click();

    await expect(page.locator('#chat-container')).toContainText(message);
});

test('primary mobile feature entries open without crashing', async ({ page }) => {
    await dismissStartup(page);
    await enterChatFromHome(page);

    const flows = [
        ['#settings-btn', '#settings-modal', '#cancel-settings'],
    ];

    for (const [button, panel, close] of flows) {
        await page.locator(button).click();
        await expect(page.locator(panel)).toBeVisible();
        await page.locator(close).click();
        await expect(page.locator(panel)).toBeHidden();
    }
});
