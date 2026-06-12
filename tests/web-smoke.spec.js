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

async function clickHomeApp(page, app, pageIndex = 0) {
    await page.evaluate((index) => {
        if (typeof window.switchAppsPage === 'function') {
            window.switchAppsPage(index);
        }
    }, pageIndex);

    const appItem = page.locator('.apps-page.active .app-item').filter({
        has: page.locator(`[data-app="${app}"]`)
    }).first();
    await expect(appItem).toBeVisible();
    await appItem.click();
}

async function closeModalById(page, id) {
    await page.evaluate((modalId) => {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        if (typeof window.hideModal === 'function') {
            window.hideModal(modal);
            return;
        }
        modal.classList.remove('show');
        modal.style.display = 'none';
    }, id);
    await expect(page.locator(`#${id}`)).toBeHidden();
}

test('first run gates resolve to the home UI', async ({ page }) => {
    await dismissStartup(page);

    await expect(page.locator('#home-container')).toBeVisible();
    await expect(page.locator('.hero-card')).toBeVisible();
    await expect(page.locator('[data-app="chat"]')).toBeVisible();
    await expect(page.locator('#apps-dots .apps-dot')).toHaveCount(2);
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

test('home app entries open their primary surfaces', async ({ page }) => {
    await dismissStartup(page);

    const appFlows = [
        { app: 'shop', pageIndex: 0, target: '#shop-container', close: '.shop-back' },
        { app: 'moyu', pageIndex: 0, target: '#moyu-modal', close: '#close-moyu-modal' },
        { app: 'diary', pageIndex: 0, target: '#diary-modal', closeModalId: 'diary-modal' },
        { app: 'accounting', pageIndex: 1, target: '#accounting-modal', closeModalId: 'accounting-modal' },
        { app: 'pet', pageIndex: 1, target: '#pet-container', close: '.pet-back-btn' },
        { app: 'map', pageIndex: 1, target: '#map-app-overlay', close: '#map-back-btn' },
    ];

    for (const flow of appFlows) {
        await clickHomeApp(page, flow.app, flow.pageIndex);
        await expect(page.locator(flow.target)).toBeVisible();

        if (flow.closeModalId) {
            await closeModalById(page, flow.closeModalId);
        } else {
            await page.locator(flow.close).click();
            await expect(page.locator(flow.target)).toBeHidden();
        }

        await expect(page.locator('#home-container')).toBeVisible();
    }
});

test('home moments nav opens and returns to the home UI', async ({ page }) => {
    await dismissStartup(page);

    const momentsNav = page.locator('.home-nav-item').filter({ hasText: '朋友圈' });
    await expect(momentsNav).toBeVisible();
    await momentsNav.click();

    await expect(page.locator('#moments-container')).toBeVisible();
    await page.locator('.moments-back-btn').click();
    await expect(page.locator('#moments-container')).toBeHidden();
    await expect(page.locator('#home-container')).toBeVisible();
});
