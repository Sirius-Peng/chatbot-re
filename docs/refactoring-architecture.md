# 传讯重构架构设计

> 基于 [工程性审阅报告](engineering-review.md)、[改进任务书 v2](improvement-plan.md) 和当前代码分析制定
> 创建日期：2026-06-13
> 范围：8 周改进计划涉及的所有架构变更

---

## 一、设计约束

在开始设计前，明确本轮重构**不改变**的前提：

| 约束 | 理由 |
|------|------|
| 保持 Vanilla JS（无框架） | 全栈迁移前不引入 React/Vue |
| 保持 `<script>` 标签加载（无 ES Modules） | Vite 迁移是独立决策（第 7 周 ADR） |
| 保持 localforage 为主存储 | 存储层重构可能与全栈迁移冲突 |
| 保持单体 index.html | HTML 拆分依赖构建工具 |
| 不引入新的 npm 依赖（除测试工具） | 最小化变更范围 |

这些约束意味着本轮重构是**在现有架构内的治理**，不是架构迁移。

---

## 二、安全层设计

### 2.1 HTML 转义函数

**当前状态：** 全项目无统一的 HTML 转义函数。仅 `companion.js` 有一个私有 `_esc()`。

**目标设计：**

在 `js/utils.js` 中新增全局 `escapeHTML`，作为唯一的 HTML 转义入口。

```
┌─────────────────────────────────────────────────────┐
│  js/utils.js                                        │
│                                                     │
│  window.escapeHTML = function(str) {                │
│      if (!str) return '';                           │
│      const d = document.createElement('div');       │
│      d.textContent = String(str);                   │
│      return d.innerHTML;                            │
│  };                                                 │
│                                                     │
│  转义规则：                                          │
│    & → &amp;                                        │
│    < → &lt;                                         │
│    > → &gt;                                         │
│    " → &quot;                                       │
│    ' → &#039;                                       │
└─────────────────────────────────────────────────────┘
```

**调用点清单：**

| 文件 | 行号 | 当前代码 | 修改后 |
|------|------|----------|--------|
| `core.js` | ~1564 | `systemMsgDiv.innerHTML = msg.text` | `systemMsgDiv.innerHTML = escapeHTML(msg.text)` |
| `core.js` | ~1705 | `msg.text.replace(/\n/g, '<br>')` | `escapeHTML(msg.text).replace(/\n/g, '<br>')` |
| `core.js` | ~1708 | `msg.image` (data URL in onclick) | 不变（data URL 不含 HTML） |
| `utils.js` | ~109 | `innerHTML = \`...${message}...\`` | 改用 `textContent`（见 2.2） |
| `home.js` | ~2430 | `s.name` 直接拼入 HTML | `escapeHTML(s.name)` |

**设计决策：** 使用 `textContent` → `innerHTML` 而非正则替换，原因：
- 浏览器原生实现，覆盖所有特殊字符
- 不需要维护字符转义表
- 性能可接受（单次 DOM 创建，不涉及布局）

### 2.2 通知函数改造

**当前状态：** `showNotification` 用 innerHTML 拼接消息文本。

**目标设计：**

```
showNotification(message, type, duration)
    │
    ├─ 创建 <div class="notification-toast">
    │    ├─ <i class="fas fa-xxx">        ← innerHTML（图标来自内部映射，非用户输入）
    │    └─ <span>                         ← textContent（消息文本，用户可控）
    │
    ├─ message 始终走 textContent，不走 innerHTML
    └─ type 仅用于图标映射（有限枚举），不涉及注入风险
```

### 2.3 XSS 防护边界

明确哪些地方**不需要**转义：

| 场景 | 原因 |
|------|------|
| `msg.image`（data URL） | URL 协议由 `optimizeImage` 控制，不含 HTML |
| `viewImage(url)` 的 onclick | URL 来自内部存储，非用户直接输入 |
| 消息中的 `<br>` 替换 | 先转义后替换，顺序保证安全 |
| `CONSTANTS` 中的模板文本 | 硬编码常量，非用户输入 |

---

## 三、CSS 架构设计

### 3.1 统一暗色模式选择器

**当前状态（三种不兼容模式）：**

```
styles.css     → html[data-theme="dark"]     (49 处)  ✓ 标准
diary.css      → html[data-theme="dark"]     (10 处)  ✓ 标准
companion.css  → html[data-theme="dark"]     (1 处)   ✓ 标准
map.css        → html[data-theme="dark"]     (22 处)  ✓ 标准
home.css       → body.dark-mode              (5 处)   ✗ 需迁移
moments.css    → .moments-container.dark-mode (170+ 处) ✗ 需迁移
shop.css       → 无暗色模式                            ✗ 需新增
pet-style.css  → 无暗色模式                            ✗ 需新增
desktop.css    → 无暗色模式                            （本轮不处理）
```

**目标状态：**

```
所有文件统一使用 html[data-theme="dark"] 作为暗色模式选择器
```

**迁移规则：**

```
home.css:
  body.dark-mode .xxx          →  html[data-theme="dark"] .xxx

moments.css:
  .moments-container.dark-mode .xxx  →  html[data-theme="dark"] .moments-container .xxx

shop.css (新增):
  html[data-theme="dark"] .shop-container {
      --primary-bg: #121212;
      --secondary-bg: #1e1e1e;
      --text-primary: #e5e5e5;
      /* 复用 styles.css 的全局暗色变量 */
  }

pet-style.css (新增):
  html[data-theme="dark"] .pet-container {
      --white: #1e1e1e;
      --cream: #2a2a2a;
      --text: #e5e5e5;
      /* 覆盖 pet-container 的局部变量 */
  }
```

**JS 侧改动：** 确认暗色模式切换代码统一设置 `html.dataset.theme = 'dark'`，不设置 `body.classList` 或容器 class。

### 3.2 z-index 层级系统

**当前状态：** 236 个 z-index 声明，值域 -1 到 99,999,999，无统一策略。

**目标设计：**

在 `css/styles.css` 的 `:root` 中定义 7 级层级系统：

```
:root {
    --z-base:     1;        /* 普通流内容 */
    --z-sticky:   100;      /* 粘性元素（吸顶栏） */
    --z-dropdown: 500;      /* 下拉菜单 */
    --z-overlay:  1000;     /* 全屏覆盖层（页面级） */
    --z-modal:    5000;     /* 弹窗对话框 */
    --z-elevated: 10000;    /* 提升弹窗（弹窗上的弹窗） */
    --z-toast:    50000;    /* 通知/提示 */
}
```

**映射表（当前值 → 目标变量）：**

| 当前用途 | 当前值 | 目标变量 | 文件 |
|----------|--------|----------|------|
| 普通内容 | 0-3 | `var(--z-base)` | styles.css, home.css |
| 粘性头部 | 10-20 | `var(--z-sticky)` | home.css, companion.css |
| 下拉菜单 | 100-300 | `var(--z-dropdown)` | styles.css, home.css |
| 页面覆盖层 | 1000-4000 | `var(--z-overlay)` | map.css, desktop.css |
| 弹窗 | 5000-9999 | `var(--z-modal)` | styles.css, diary.css |
| 提升弹窗 | 10000-100001 | `var(--z-elevated)` | diary.css, companion.css, shop.css |
| 最顶层 | 99998-99999999 | `var(--z-toast)` | pet-style.css, moments.css |

**`homeShowModal` 的 `.modal--elevated` 已使用 `z-index: 99999`，改为 `var(--z-elevated)`。**

**清理规则：**
- 删除所有 `!important` 修饰的 z-index（改用正确的层级变量）
- 删除所有超过 `--z-toast` 的值

### 3.3 CSS 工具类

**目标：** 在 `css/styles.css` 末尾新增工具类区域。

```css
/* ===== 工具类 ===== */

/* 毛玻璃效果 */
.glass {
    background: rgba(var(--secondary-bg-rgb, 255, 255, 255), 0.7);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(var(--border-color-rgb, 235, 235, 235), 0.2);
}

html[data-theme="dark"] .glass {
    background: rgba(30, 30, 50, 0.7);
    border-color: rgba(255, 255, 255, 0.08);
}

/* 毛玻璃变体 */
.glass--heavy {
    backdrop-filter: blur(24px) saturate(1.8);
    -webkit-backdrop-filter: blur(24px) saturate(1.8);
}

.glass--light {
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}
```

**使用策略：** 新功能必须使用 `.glass` 类，现有代码逐步替换。不强制一次性完成。

### 3.4 颜色变量扩展

**目标：** 为 moments 和 shop 模块定义语义化 CSS 变量。

```css
/* moments 模块变量 */
.moments-container {
    --moments-bg: #f7f7f7;
    --moments-card-bg: #ffffff;
    --moments-text: #333333;
    --moments-text-secondary: #888888;
    --moments-link: #576b95;
    --moments-border: #e5e5e5;
    --moments-divider: #f0f0f0;
}

html[data-theme="dark"] .moments-container {
    --moments-bg: #121212;
    --moments-card-bg: #1e1e1e;
    --moments-text: #e0e0e0;
    --moments-text-secondary: #8c8c8c;
    --moments-link: #7b9bd4;
    --moments-border: #2f2f2f;
    --moments-divider: #252525;
}

/* shop 模块变量 */
.shop-container {
    --shop-bg: var(--primary-bg, #ffffff);
    --shop-card-bg: var(--secondary-bg, #ffffff);
    --shop-text: var(--text-primary, #1a1a1a);
    --shop-text-secondary: var(--text-secondary, #7a7a7a);
    --shop-accent: var(--accent-color, #ff4757);
    --shop-border: var(--border-color, #e0e0e0);
}

html[data-theme="dark"] .shop-container {
    --shop-bg: #121212;
    --shop-card-bg: #1e1e1e;
    --shop-text: #e0e0e0;
    --shop-text-secondary: #8c8c8c;
    --shop-border: #2f2f2f;
}
```

**替换策略：** 在每个 CSS 文件中全局搜索硬编码颜色，按语义归类后替换为变量。例如：
- `#f7f7f7` → `var(--moments-bg)`
- `#333` / `#333333` → `var(--moments-text)`
- `#576b95` → `var(--moments-link)`

---

## 四、渲染管道设计

### 4.1 增量渲染架构

**当前状态：** `renderMessages()` 每次清空 `container.innerHTML = ''` 后重建全部 DOM。

**目标设计：**

```
renderMessages(preserveScroll)
    │
    ├─ 计算 visibleMessages（窗口化：最近 N 条）
    │
    ├─ 构建 currentIds = Set(visibleMessages.map(m => m.id))
    │
    ├─ Diff 阶段：
    │    ├─ 遍历 _renderedMessageIds
    │    │    └─ 如果 id 不在 currentIds 中 → 移除 DOM 节点
    │    └─ 遍历 visibleMessages
    │         └─ 如果 id 不在 _renderedMessageIds 中 → 创建并追加 DOM 节点
    │
    ├─ 更新 _renderedMessageIds = currentIds
    │
    └─ 滚动处理（同现有逻辑）
```

**数据结构：**

```javascript
// 模块级状态
let _renderedMessageIds = new Set();
let _messageIdToElement = new Map();  // id → DOM element，避免 querySelector
```

**边界情况处理：**

| 场景 | 处理方式 |
|------|----------|
| 主题/设置变更 | 调用 `forceRender()` → 清空 `_renderedMessageIds`，触发全量重建 |
| 历史加载（向上翻） | `preserveScroll = true`，新消息插入顶部，diff 自动处理 |
| 消息删除/撤回 | `addMessage` 不适用，需单独的 `removeMessage(id)` → 从 Map 移除 DOM |
| 批量消息 | `sendBatchMessages` 逐条调用 `addMessage`，增量追加正常工作 |

**`addMessage` 改造：**

```
addMessage(message)
    │
    ├─ push 到 messages[]
    │
    ├─ 创建消息 DOM（createMessageFragment）
    │
    ├─ 插入到容器（现有逻辑）
    │
    ├─ 更新 _renderedMessageIds.add(message.id)
    ├─ 更新 _messageIdToElement.set(message.id, element)
    │
    └─ throttledSaveData()
```

**`createMessageFragment` 改造：**

```
createMessageFragment(msg, prevMsg, nextMsg, lastSenderRef)
    │
    ├─ 添加 data-msg-id="${msg.id}" 属性（已有）
    │
    ├─ XSS 修复：msg.text 走 escapeHTML
    │
    └─ 返回 DocumentFragment（不变）
```

### 4.2 消息 ID 管理

当前消息 ID 由 `addMessage` 内部生成（`Date.now() + Math.random()`）。需确保：

1. ID 在 `messages[]` 数组中唯一
2. ID 在 DOM 的 `data-msg-id` 属性中一致
3. `_renderedMessageIds` 与 DOM 实际状态同步

**方案：** 不改变现有 ID 生成逻辑，仅在 `renderMessages` 和 `addMessage` 中维护 Set/Map 的一致性。

---

## 五、存储写入优化

### 5.1 saveData 批量写入

**当前状态：** `saveData()` 并行发起 29 个 `localforage.setItem()` 调用。

**目标设计：**

```
saveData()
    │
    ├─ 构建 entries = [{key, value}, ...]（29 个条目）
    │
    ├─ 分批写入（每批 5 个）：
    │    for (let i = 0; i < entries.length; i += 5) {
    │        await Promise.all(
    │            entries.slice(i, i + 5).map(e => localforage.setItem(e.key, e.value))
    │        );
    │    }
    │
    └─ _backupCriticalData()（同现有逻辑）
```

**为什么不合并为单次写入：** localforage 不支持批量操作接口。分批写入在不改变 API 的前提下减少并发压力。

### 5.2 throttledSaveData 使用规范

**当前状态：** `throttledSaveData` 已有 500ms 防抖实现，但部分调用点直接使用 `saveData()`。

**规范：**

| 调用场景 | 使用 | 理由 |
|----------|------|------|
| 消息发送后 | `throttledSaveData()` | 可接受 500ms 延迟 |
| 设置变更后 | `throttledSaveData()` | 可接受 500ms 延迟 |
| 页面关闭（visibilitychange） | `saveData()` | 必须立即写入 |
| 数据导入后 | `saveData()` | 必须立即持久化 |
| 清除数据后 | `saveData()` | 必须立即持久化 |

---

## 六、测试架构设计

### 6.1 Playwright 配置改造

**当前状态：** `waitForLoadState('networkidle')` 在启动流程中使用。

**目标设计：**

```javascript
// tests/web-smoke.spec.js 中的 dismissStartup
async function dismissStartup(page) {
    // 1. 设置 localStorage 跳过每日问候
    await page.addInitScript(() => {
        localStorage.setItem('dailyGreetingShown', new Date().toDateString());
    });

    // 2. 导航
    await page.goto('/');

    // 3. 等待 DOM 就绪（替代 networkidle）
    await page.waitForLoadState('domcontentloaded');

    // 4. 通过引导流程
    await passSplash(page);

    // 5. 等待应用就绪信号（确定性）
    await expect(page.locator('body')).toHaveAttribute(
        'data-app-ready', 'true', { timeout: 15000 }
    );

    // 6. 关闭可能的叠加弹窗
    await closeIfVisible(page.locator('#disclaimer-modal'));
    await closeIfVisible(page.locator('#tour-overlay'));
    await closeIfVisible(page.locator('#daily-greeting-modal'));

    // 7. 验证主页可见
    await expect(page.locator('#home-container')).toBeVisible();
}
```

**关键改动：**
- `networkidle` → `domcontentloaded` + 确定性信号等待
- 已有 `data-app-ready` 信号，无需新增

### 6.2 新增冒烟测试模板

为未覆盖的功能添加统一模式的冒烟测试：

```javascript
// tests/feature-regression.spec.js 中的通用测试模板
const FEATURES = [
    { name: 'tarot',      app: 'tarot',      container: '#tarot-modal' },
    { name: 'games',      app: 'games',      container: '#games-container' },
    { name: 'gift-cabinet', app: 'gift-cabinet', container: '#gift-cabinet-modal' },
    { name: 'call',       app: 'call',       container: '#call-modal' },
    { name: 'group-chat', app: 'group-chat', container: '#group-chat-modal' },
    { name: 'todo',       app: 'todo',       container: '#todo-container' },
    { name: 'menstrual',  app: 'menstrual',  container: '#menstrual-modal' },
    { name: 'theme-editor', app: 'theme-editor', container: '#theme-editor-modal' },
    { name: 'red-packet', app: 'red-packet', container: '#red-packet-modal' },
];

for (const feature of FEATURES) {
    test(`${feature.name}: opens without crashing`, async ({ page }) => {
        await dismissStartup(page);
        const errors = [];
        page.on('pageerror', err => errors.push(err));

        await clickHomeApp(page, feature.app);
        const container = page.locator(feature.container);
        await expect(container).toBeVisible({ timeout: 10000 });

        // 关闭
        await closeModalById(page, feature.container.replace('#', ''));
        expect(errors).toHaveLength(0);
    });
}
```

### 6.3 CI 流水线改造

```yaml
# .github/workflows/deploy.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: E2E tests
        run: npm run test:web

      - name: Build
        run: npm run build

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: www
```

---

## 七、上传服务安全架构

### 7.1 当前架构

```
Client ──POST /api/upload──→ Express Server
                                │
                                ├─ multer（接收文件，100MB 限制）
                                │
                                ├─ [可选] ncmdump（NCM 转换）
                                │
                                └─ COS SDK ──→ 腾讯云 COS Bucket
                                                │
                                                └─ 返回 URL
```

**问题：** 无认证、无文件类型校验、通配 CORS、健康端点泄露信息。

### 7.2 目标架构

```
Client ──POST /api/upload──→ Express Server
                                │
                                ├─ CORS 中间件（白名单 origin）
                                │
                                ├─ API Key 认证中间件
                                │
                                ├─ multer（接收文件）
                                │    ├─ 大小限制：50MB
                                │    └─ 文件类型白名单：
                                │         image/jpeg, image/png,
                                │         image/gif, image/webp,
                                │         audio/mpeg, audio/wav
                                │
                                ├─ [可选] ncmdump（NCM 转换）
                                │
                                └─ COS SDK ──→ 腾讯云 COS Bucket
                                                │
                                                └─ 返回 URL
```

**改动清单：**

| 改动 | 当前 | 目标 |
|------|------|------|
| CORS | `cors()`（通配） | `cors({ origin: ['http://localhost:3000', 'https://your-domain.com'] })` |
| 认证 | 无 | `x-api-key` 请求头校验 |
| 文件类型 | 任意 | multer `fileFilter` 白名单 |
| 文件大小 | 100MB | 50MB |
| 健康端点 | 返回 bucket/region | 仅返回 `{ ok: true }` |
| API Key 存储 | 无 | `server/.env` 中的 `UPLOAD_API_KEY` |

---

## 八、ESLint 规则目标状态

```json
{
    "env": { "browser": true, "es2021": true },
    "parserOptions": { "ecmaVersion": "latest" },
    "globals": {
        "localforage": "readonly",
        "Dexie": "readonly",
        "JSZip": "readonly",
        "APP_PREFIX": "readonly",
        "CONSTANTS": "readonly"
    },
    "rules": {
        "no-redeclare": "error",
        "no-undef": "error",
        "no-unused-vars": ["error", {
            "args": "none",
            "varsIgnorePattern": "^_|^[A-Z]"
        }],
        "no-useless-escape": "error",
        "no-prototype-builtins": "error",
        "no-inner-declarations": "error"
    }
}
```

**`varsIgnorePattern` 说明：**
- `^_` — 私有变量（如 `_backupCriticalData`）
- `^[A-Z]` — 全局常量/构造函数（如 `CONSTANTS`、`ChuanXunDB`）

**globals 策略：** 仅保留第三方库和构建时常量。应用自身的全局函数通过 `window.xxx` 访问，ESLint 能识别 `window` 属性。

---

## 九、文件变更清单

按改进计划的周度节奏，列出每个 Step 涉及的文件变更：

### 第 1 周

| Step | 文件 | 变更类型 |
|------|------|----------|
| 1.1 | `js/utils.js` | 新增 `escapeHTML` 函数 |
| 1.1 | `js/core.js` | 修改消息渲染调用点（2 处） |
| 1.1 | `js/home.js` | 修改会话名渲染（1 处） |
| 1.2 | `js/utils.js` | 修改 `showNotification` 使用 textContent |
| 1.3 | `css/diary.css` | 删除多余 `}` |
| 1.4 | `.github/workflows/deploy.yml` | 新增测试步骤 |
| 1.5 | `package.json` | 移除/修复 android 脚本 |
| 1.6 | `index.html` | 修改 viewport meta |

### 第 2 周

| Step | 文件 | 变更类型 |
|------|------|----------|
| 2.1 | `.eslintrc.json` | 收紧规则 |
| 2.1 | 全项目 JS | 修复新增 error |
| 2.2 | `tests/feature-regression.spec.js` | 新增 9 个冒烟测试 |
| 2.3 | `playwright.config.js` | reporter 配置 |
| 2.3 | `tests/*.spec.js` | 替换 networkidle |

### 第 3 周

| Step | 文件 | 变更类型 |
|------|------|----------|
| 3.1 | `css/home.css` | `body.dark-mode` → `html[data-theme="dark"]` |
| 3.1 | `css/moments.css` | `.moments-container.dark-mode` → `html[data-theme="dark"] .moments-container` |
| 3.1 | `css/shop.css` | 新增暗色模式变量 |
| 3.1 | `css/pet-style.css` | 新增暗色模式变量覆盖 |
| 3.2 | `css/styles.css` | 新增 `:root` z-index 变量 |
| 3.2 | 各 feature CSS | 替换硬编码 z-index |
| 3.3 | `css/styles.css` | 新增 `.glass` 工具类 |

### 第 5-6 周

| Step | 文件 | 变更类型 |
|------|------|----------|
| 5.1 | `js/core.js` | 重写 `renderMessages` 为增量 diff |
| 5.1 | `js/core.js` | 改造 `addMessage` 维护 ID 映射 |
| 5.2 | `js/core.js` | 改造 `saveData` 为分批写入 |
| 5.2 | `js/core.js` | 审计 `saveData` 调用点 |

### 第 7 周

| Step | 文件 | 变更类型 |
|------|------|----------|
| 7.1 | `server/upload-server.js` | CORS、认证、文件类型、健康端点 |
| 7.2 | `docs/decisions/ADR-001-vite.md` | 新增决策文档 |

### 第 8 周

| Step | 文件 | 变更类型 |
|------|------|----------|
| 8.1 | 全项目 JS | 空 catch 块添加日志 |
| 8.2 | `js/core.js` | 非关键路径改用 throttledSaveData |

---

## 十、不变更的部分

明确以下内容在本轮重构中**保持不变**：

| 项目 | 保持现状的理由 |
|------|---------------|
| `state.js` 的裸全局变量 | 命名空间迁移推迟（Won't Do） |
| `core.js` 的 3,110 行单体 | 拆分需要测试覆盖先到位 |
| `index.html` 的 4,618 行 | 依赖构建工具引入 |
| 336 个 onclick 内联处理 | 依赖 HTML 拆分 |
| Dexie 数据库定义 | 存储层重构与全栈迁移冲突 |
| localforage 为主要存储 | 同上 |
| `sw.js` 的手动资源列表 | 依赖构建工具自动生成 |
| Google Fonts 同步加载 | 非关键路径优化 |
