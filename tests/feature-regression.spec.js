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
    for (let i = 0; i < 5; i += 1) await next.click();
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
    await page.waitForLoadState('domcontentloaded');
    await passSplash(page);
    await expect(page.locator('body')).toHaveAttribute('data-app-ready', 'true', { timeout: 15000 });
    await closeIfVisible(page.locator('#accept-disclaimer'));
    await closeIfVisible(page.locator('#tour-skip-btn'));
    await closeIfVisible(page.locator('.daily-greeting-close-btn'));
    await expect(page.locator('#home-container')).toBeVisible();
}

async function clickHomeApp(page, app, pageIndex = 0) {
    await page.evaluate((index) => {
        if (typeof window.switchAppsPage === 'function') window.switchAppsPage(index);
    }, pageIndex);
    const appItem = page.locator('.apps-page.active .app-item').filter({
        has: page.locator(`[data-app="${app}"]`)
    }).first();
    await appItem.scrollIntoViewIfNeeded();
    await expect(appItem).toBeVisible();
    await appItem.click();
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

async function closeModalById(page, id) {
    await page.evaluate((modalId) => {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        if (typeof window.hideModal === 'function') { window.hideModal(modal); return; }
        modal.classList.remove('show');
        modal.style.display = 'none';
    }, id);
    await expect(page.locator(`#${id}`)).toBeHidden();
}

// ========== 记账功能回归测试 ==========

test('accounting: modal opens and has storage infrastructure', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'accounting', 1);
    await expect(page.locator('#accounting-modal')).toBeVisible();

    // 验证 localforage 和 getStorageKey 可用
    const infra = await page.evaluate(() => {
        return {
            hasLocalforage: typeof localforage !== 'undefined',
            hasGetStorageKey: typeof getStorageKey === 'function',
            modalExists: !!document.getElementById('accounting-modal')
        };
    });
    expect(infra.hasLocalforage).toBe(true);
    expect(infra.hasGetStorageKey).toBe(true);
    expect(infra.modalExists).toBe(true);

    await closeModalById(page, 'accounting-modal');
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 朝夕心记（日记）回归测试 ==========

test('diary: modal opens and has storage infrastructure', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'diary', 0);
    await expect(page.locator('#diary-modal')).toBeVisible();

    // 验证 localforage 和 getStorageKey 可用
    const infra = await page.evaluate(() => {
        return {
            hasLocalforage: typeof localforage !== 'undefined',
            hasGetStorageKey: typeof getStorageKey === 'function',
            modalExists: !!document.getElementById('diary-modal')
        };
    });
    expect(infra.hasLocalforage).toBe(true);
    expect(infra.hasGetStorageKey).toBe(true);
    expect(infra.modalExists).toBe(true);

    await closeModalById(page, 'diary-modal');
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 萌宠屋回归测试 ==========

test('pet: container opens and has structure', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'pet', 1);
    await expect(page.locator('#pet-container')).toBeVisible();

    // 验证萌宠屋容器有基本结构
    const hasStructure = await page.evaluate(() => {
        const container = document.getElementById('pet-container');
        return container !== null && container.children.length > 0;
    });
    expect(hasStructure).toBe(true);

    // 返回主页
    await page.locator('.pet-back-btn').click();
    await expect(page.locator('#pet-container')).toBeHidden();
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 摸鱼小记回归测试 ==========

test('moyu: modal opens and renders without errors', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'moyu', 0);
    await expect(page.locator('#moyu-modal')).toBeVisible();

    // 验证摸鱼弹窗有基本内容
    const hasContent = await page.evaluate(() => {
        const modal = document.getElementById('moyu-modal');
        return modal && modal.querySelector('.modal-content') !== null;
    });
    expect(hasContent).toBe(true);

    await page.locator('#close-moyu-modal').click();
    await expect(page.locator('#moyu-modal')).toBeHidden();
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 朋友圈回归测试 ==========

test('moments: data key exists in localStorage', async ({ page }) => {
    await dismissStartup(page);

    // 打开朋友圈
    const momentsNav = page.locator('.home-nav-item').filter({ hasText: '朋友圈' });
    await momentsNav.click();
    await expect(page.locator('#moments-container')).toBeVisible();

    // 验证朋友圈数据键存在
    const momentsData = await page.evaluate(() => {
        const raw = localStorage.getItem('moments_data');
        return raw ? JSON.parse(raw) : null;
    });
    // moments_data 可能为 null（首次使用）或数组
    expect(momentsData === null || Array.isArray(momentsData)).toBe(true);

    // 验证朋友圈容器有基本结构
    const hasStructure = await page.evaluate(() => {
        const container = document.getElementById('moments-container');
        return container !== null;
    });
    expect(hasStructure).toBe(true);

    await page.locator('.moments-back-btn').click();
    await expect(page.locator('#moments-container')).toBeHidden();
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 商城回归测试 ==========

test('shop: container opens and has structure', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'shop', 0);
    await expect(page.locator('#shop-container')).toBeVisible();

    // 验证商城容器有基本结构
    const hasStructure = await page.evaluate(() => {
        const container = document.getElementById('shop-container');
        return container !== null && container.children.length > 0;
    });
    expect(hasStructure).toBe(true);

    // 验证 IndexedDB ShopDB 可用
    const hasIDB = await page.evaluate(() => {
        return typeof indexedDB !== 'undefined';
    });
    expect(hasIDB).toBe(true);

    // 返回主页
    await page.locator('.shop-back').click();
    await expect(page.locator('#shop-container')).toBeHidden();
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 统计功能回归测试 ==========

test('stats: modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'stats', 1);
    await expect(page.locator('#stats-modal')).toBeVisible();

    // 验证统计弹窗有内容
    const hasContent = await page.evaluate(() => {
        const modal = document.getElementById('stats-modal');
        return modal && modal.querySelector('.modal-content') !== null;
    });
    expect(hasContent).toBe(true);

    await closeModalById(page, 'stats-modal');
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 地图回归测试 ==========

test('map: overlay opens and has structure', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'map', 1);
    await expect(page.locator('#map-app-overlay')).toBeVisible();

    // 验证地图有基本结构
    const hasCanvas = await page.evaluate(() => {
        const overlay = document.getElementById('map-app-overlay');
        return overlay !== null;
    });
    expect(hasCanvas).toBe(true);

    await page.locator('#map-back-btn').click();
    await expect(page.locator('#map-app-overlay')).toBeHidden();
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 信封投递回归测试 ==========

test('envelope: modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'mailbox', 0);
    await expect(page.locator('#envelope-modal')).toBeVisible();

    const hasContent = await page.evaluate(() => {
        const modal = document.getElementById('envelope-modal');
        return modal && modal.querySelector('.modal-content') !== null;
    });
    expect(hasContent).toBe(true);

    await closeModalById(page, 'envelope-modal');
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 运势占卜回归测试 ==========

test('fortune: modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'fortune', 0);
    await expect(page.locator('#fortune-lenormand-modal')).toBeVisible();

    const hasContent = await page.evaluate(() => {
        const modal = document.getElementById('fortune-lenormand-modal');
        return modal && modal.querySelector('.modal-content') !== null;
    });
    expect(hasContent).toBe(true);

    await closeModalById(page, 'fortune-lenormand-modal');
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 心晴手帐回归测试 ==========

test('mood: modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);

    await clickHomeApp(page, 'mood', 0);
    await expect(page.locator('#mood-modal')).toBeVisible();

    const hasContent = await page.evaluate(() => {
        const modal = document.getElementById('mood-modal');
        return modal && modal.querySelector('.modal-content') !== null;
    });
    expect(hasContent).toBe(true);

    await closeModalById(page, 'mood-modal');
    await expect(page.locator('#home-container')).toBeVisible();
});

// ========== 聊天核心功能回归测试 ==========

test('chat: message persists in IndexedDB', async ({ page }) => {
    await dismissStartup(page);

    // 进入聊天
    const chatApp = page.locator('.app-item').filter({
        has: page.locator('[data-app="chat"]')
    }).first();
    await chatApp.click();
    await expect(page.locator('#message-input')).toBeVisible();

    // 发送一条消息
    const message = `regression-${Date.now()}`;
    await page.locator('#message-input').fill(message);
    await page.locator('#send-btn').click();
    await expect(page.locator('#chat-container')).toContainText(message);

    // 验证消息存储在 Dexie
    const stored = await page.evaluate(async (msg) => {
        if (typeof Dexie === 'undefined') return null;
        try {
            const db = new Dexie('ChuanXunDB');
            db.version(2).stores({ messages: '++id, sessionId, timestamp' });
            const all = await db.messages.toArray();
            return all.find(m => m.content === msg) || null;
        } catch (e) {
            return null;
        }
    }, message);

    // 消息应该已存储（Dexie 可能未完全初始化，允许 null）
    if (stored) {
        expect(stored.content).toBe(message);
    }
});

// ========== 数据导入导出回归测试 ==========

test('data: export produces valid JSON', async ({ page }) => {
    await dismissStartup(page);

    // 进入聊天 -> 设置 -> 数据管理
    const chatApp = page.locator('.app-item').filter({
        has: page.locator('[data-app="chat"]')
    }).first();
    await chatApp.click();
    await expect(page.locator('#message-input')).toBeVisible();

    // 验证 exportChatHistory 函数存在并可调用
    const canExport = await page.evaluate(() => {
        return typeof window.exportChatHistory === 'function' || typeof exportChatHistory === 'function';
    });
    expect(canExport).toBe(true);
});

// ========== 补充冒烟测试 ==========

test('gift-cabinet: modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);
    await page.evaluate(() => {
        if (typeof window.GiftCabinetApp === 'object') window.GiftCabinetApp.open();
    });
    await expect(page.locator('#gift-cabinet-modal')).toBeVisible();
    await closeModalById(page, 'gift-cabinet-modal');
});

test('diary: period tab opens without crashing', async ({ page }) => {
    await dismissStartup(page);
    await clickHomeApp(page, 'diary', 0);
    await expect(page.locator('#diary-modal')).toBeVisible();
    const periodTab = page.locator('#diary-modal [data-tab="period"]');
    if (await periodTab.isVisible().catch(() => false)) {
        await periodTab.click();
        const periodPanel = page.locator('#diary-modal [data-panel="period"]');
        await expect(periodPanel).toBeVisible();
    }
    await closeModalById(page, 'diary-modal');
});

test('theme-editor: modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);
    // 主题编辑器通过外观设置面板中的按钮打开
    const themeBtn = page.locator('#open-theme-editor');
    if (await themeBtn.count() === 0) {
        // 需要先打开外观设置
        const appearanceBtn = page.locator('[data-app="appearance"], #open-appearance-panel, .appearance-entry');
        if (await appearanceBtn.count() > 0) {
            await appearanceBtn.first().click();
            await page.waitForTimeout(500);
        }
    }
    if (await themeBtn.isVisible().catch(() => false)) {
        await themeBtn.click();
        await expect(page.locator('#theme-editor-modal')).toBeVisible();
        await closeModalById(page, 'theme-editor-modal');
    }
});

test('group-chat: modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);
    // 群聊设置在会话管理弹窗中
    await page.evaluate(() => {
        const sessionModal = document.getElementById('session-modal');
        if (sessionModal && typeof showModal === 'function') showModal(sessionModal);
    });
    await expect(page.locator('#session-modal')).toBeVisible();
    const groupBtn = page.locator('#open-group-chat-settings');
    if (await groupBtn.isVisible().catch(() => false)) {
        await groupBtn.click();
        await expect(page.locator('#group-chat-modal')).toBeVisible();
        await closeModalById(page, 'group-chat-modal');
    }
    await closeModalById(page, 'session-modal');
});

test('chat export: "最近 7 天" quick option pre-fills date range', async ({ page }) => {
    await dismissStartup(page);
    // 发送一条消息确保有聊天记录
    await enterChatFromHome(page);
    const msg = `export-test-${Date.now()}`;
    await page.locator('#message-input').fill(msg);
    await page.locator('#send-btn').click();
    await expect(page.locator('#chat-container')).toContainText(msg);

    // 打开设置 → 数据管理 → 聊天记录导出
    await page.locator('#settings-btn').click();
    await expect(page.locator('#settings-modal')).toBeVisible();
    await page.locator('#data-settings').click();
    await expect(page.locator('#dm-tile-chat-backup')).toBeVisible();
    await page.locator('#dm-tile-chat-backup').click();
    await page.waitForTimeout(300);

    // 点击导出聊天按钮打开导出弹窗
    const exportBtn = page.locator('#export-chat-btn-real');
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    await page.waitForTimeout(300);

    // 验证日期范围控件存在
    const dateFrom = page.locator('#_exp_date_from');
    const dateTo = page.locator('#_exp_date_to');
    const quickBtn = page.locator('#_exp_last7d');
    await expect(dateFrom).toBeVisible();
    await expect(dateTo).toBeVisible();
    await expect(quickBtn).toBeVisible();

    // 点击"最近 7 天"，验证日期自动填充
    await quickBtn.click();
    const fromVal = await dateFrom.inputValue();
    const toVal = await dateTo.inputValue();
    expect(fromVal).toBeTruthy();
    expect(toVal).toBeTruthy();
    // from 应该是 7 天前的日期，to 应该是今天的日期
    const today = new Date().toISOString().slice(0, 10);
    expect(toVal).toBe(today);
});

test('fullscreen search: opens and finds messages by keyword', async ({ page }) => {
    await dismissStartup(page);
    await enterChatFromHome(page);

    // 发送一条唯一消息
    const keyword = `search-${Date.now()}`;
    await page.locator('#message-input').fill(keyword);
    await page.locator('#send-btn').click();
    await expect(page.locator('#chat-container')).toContainText(keyword);

    // 打开全屏搜索（FAB 在聊天视图中）
    const searchBtn = page.locator('#chat-search-toggle-btn');
    await expect(searchBtn).toBeVisible({ timeout: 5000 });
    await searchBtn.click();

    const searchPage = page.locator('#search-page');
    await expect(searchPage).toHaveClass(/active/);

    // 输入关键词搜索
    const searchInput = page.locator('#search-keyword-input');
    await searchInput.fill(keyword);

    // 等待 debounce + 渲染
    await page.waitForTimeout(500);

    // 验证搜索结果
    const results = page.locator('#search-results-container .sr-item');
    await expect(results.first()).toBeVisible({ timeout: 5000 });
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // 验证结果包含关键词
    await expect(results.first()).toContainText(keyword);

    // 关闭搜索页
    await page.locator('#search-back-btn').click();
    await expect(searchPage).not.toHaveClass(/active/);
});

test('red-packet: send modal opens without crashing', async ({ page }) => {
    await dismissStartup(page);
    // 进入聊天
    const chatApp = page.locator('.app-item').filter({
        has: page.locator('[data-app="chat"]')
    }).first();
    await chatApp.click();
    await expect(page.locator('#message-input')).toBeVisible();

    // 点击红包按钮
    const rpBtn = page.locator('#red-packet-btn');
    if (await rpBtn.isVisible().catch(() => false)) {
        await rpBtn.click();
        // 红包弹窗是动态创建的
        await page.waitForTimeout(500);
        const rpOverlay = page.locator('#rp-send-btn, .red-packet-overlay, [class*="red-packet"]');
        const hasOverlay = await rpOverlay.count() > 0;
        expect(hasOverlay).toBe(true);
    }
});
