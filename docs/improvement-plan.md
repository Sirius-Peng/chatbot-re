# 传讯分步改进计划

> 基于 [工程性审阅报告](engineering-review.md) 制定
> 创建日期：2026-06-13
> 预计周期：4-8 周（视人力投入）

---

## 阶段概览

| 阶段 | 目标 | 预计周期 | 前置条件 |
|------|------|----------|----------|
| Phase 0 | 消除安全漏洞和构建断裂 | 1-2 天 | 无 |
| Phase 1 | 稳定化：错误处理、测试基础设施、CSS 修复 | 3-5 天 | Phase 0 |
| Phase 2 | 统一规范：命名空间、存储层、暗色模式、z-index | 1-2 周 | Phase 1 |
| Phase 3 | 性能优化：渲染、存储、图片 | 1-2 周 | Phase 2 |
| Phase 4 | 工程化：构建工具、模块化、无障碍 | 2-4 周 | Phase 2 |

---

## Phase 0 — 消除安全漏洞和构建断裂

> 目标：零破坏性变更，修复可被利用的安全问题和失效的构建链。

### Step 0.1 消息渲染 XSS 修复

**对应问题：** C-1

**改动文件：** `js/core.js`

**具体操作：**

1. 在 `js/utils.js` 中新增 `escapeHTML` 函数：
   ```javascript
   window.escapeHTML = function(str) {
       const div = document.createElement('div');
       div.textContent = str;
       return div.innerHTML;
   };
   ```
2. 修改 `js/core.js` 消息渲染（约行 1705）：
   ```javascript
   // 修改前
   let content = msg.text ? `<div>${msg.text.replace(/\n/g, '<br>')}</div>` : '';
   // 修改后
   let content = msg.text
       ? `<div>${escapeHTML(msg.text).replace(/\n/g, '<br>')}</div>`
       : '';
   ```
3. 修改系统消息渲染（约行 1564）：
   ```javascript
   // 修改前
   systemMsgDiv.innerHTML = msg.text;
   // 修改后
   systemMsgDiv.innerHTML = escapeHTML(msg.text);
   ```
4. 全局搜索 `innerHTML = msg` 和 `innerHTML =.*msg\.text`，逐一修复。

**验证方式：**
- 手动发送消息 `<img src=x onerror=alert(1)>`，确认不弹窗
- 发送含 `<b>加粗</b>` 的消息，确认显示为纯文本
- 运行 `npm run test:web`，确认 22 个测试全部通过

**提交信息：** `fix(security): escape HTML in message rendering to prevent XSS`

---

### Step 0.2 showNotification XSS 修复

**对应问题：** W-S1 相关

**改动文件：** `js/utils.js`

**具体操作：**

1. 修改 `showNotification`（约行 109）：
   ```javascript
   // 修改前
   notification.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i><span>${message}</span>`;
   // 修改后
   const span = document.createElement('span');
   span.textContent = message;
   notification.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i>`;
   notification.appendChild(span);
   ```

**验证方式：**
- 调用 `showNotification('<img src=x onerror=alert(1)>', 'info')`，确认不弹窗
- 确认通知正常显示文本内容

**提交信息：** `fix(security): use textContent in showNotification to prevent XSS`

---

### Step 0.3 diary.css 语法错误修复

**对应问题：** W-C5

**改动文件：** `css/diary.css`

**具体操作：**

1. 定位 `diary.css:1901` 附近多余的 `}` 闭合括号
2. 删除多余的大括号，确保 `@keyframes` 块正确闭合
3. 用浏览器 DevTools 检查该区域样式是否正常应用

**验证方式：**
- 打开日记功能，确认待办提醒通知动画正常
- 确认记账模块样式无异常

**提交信息：** `fix(css): remove extra closing brace in diary.css keyframes`

---

### Step 0.4 CI 加入测试步骤

**对应问题：** C-8

**改动文件：** `.github/workflows/deploy.yml`

**具体操作：**

1. 在 build job 的 `npm run lint` 之后、`npm run build` 之前添加测试步骤：
   ```yaml
   - name: Install Playwright browsers
     run: npx playwright install --with-deps chromium
   - name: Run E2E tests
     run: npm run test:web
   ```
2. 添加 Playwright 浏览器缓存：
   ```yaml
   - name: Cache Playwright browsers
     uses: actions/cache@v4
     with:
       path: ~/.cache/ms-playwright
       key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
   ```

**验证方式：**
- 推送分支后检查 Actions 是否成功执行测试
- 故意破坏一个测试，确认 CI 能正确失败

**提交信息：** `ci: add Playwright E2E tests to deployment pipeline`

---

### Step 0.5 修复 Android 构建脚本

**对应问题：** C-9

**改动文件：** `package.json`、`scripts/`

**具体操作：**

1. 检查 `chatbot/scripts/android-smoke.js` 是否适用于当前项目结构
2. 若适用，复制到 `scripts/android-smoke.js` 并更新路径引用
3. 若不适用，移除 `package.json` 中的 `test:android` 脚本
4. 在 `package.json` 中为 `android:sync` 和 `android:build` 添加前置检查：
   ```json
   "android:sync": "test -d android || npx cap add android && npm run build && cap sync android",
   ```

**验证方式：**
- 运行 `npm run android:sync`，确认不再报错（或给出明确提示）
- 确认 `npm run test:android` 要么正常运行要么脚本不存在

**提交信息：** `fix(build): repair or remove broken Android build scripts`

---

## Phase 1 — 稳定化

> 目标：提升可调试性，补充测试基础设施，修复影响用户体验的 CSS 问题。

### Step 1.1 空 catch 块添加日志

**对应问题：** W-J1

**改动文件：** 全项目（重点 `home.js`、`reply-library.js`、`prompt-manager.js`）

**具体操作：**

1. 全局搜索 `catch(e) {}` 和 `catch (e) {}`（含空格变体）
2. 根据上下文替换为合适的日志级别：
   ```javascript
   // 数据解析类
   catch (e) { console.warn('[模块名] 数据解析失败:', e); }

   // DOM 操作类（元素可能不存在）
   catch (e) { /* 元素不存在时静默忽略 */ }

   // 关键操作类
   catch (e) { console.error('[模块名] 操作失败:', e); }
   ```
3. 不要改变业务逻辑——如果原代码在 catch 后有 fallback，保留它

**验证方式：**
- `npm run lint` 无新增 error
- `npm run test:web` 全部通过

**提交信息：** `fix(logging): add console.warn/error to empty catch blocks`

---

### Step 1.2 saveData 添加防抖

**对应问题：** W-J3、W-P3

**改动文件：** `js/core.js`

**具体操作：**

1. 确认 `throttledSaveData` 当前实现（应该已有节流/防抖）
2. 如果 `saveData` 本身无防抖，在调用密集处改用 `throttledSaveData`
3. 搜索直接调用 `saveData()` 的位置（非 `await saveData()`），将非关键路径改为 `throttledSaveData()`

**验证方式：**
- 连续快速发送多条消息，确认数据不丢失
- 检查 IndexedDB 中数据完整

**提交信息：** `perf: use throttledSaveData in non-critical paths`

---

### Step 1.3 移除 viewport 缩放限制

**对应问题：** C-11（无障碍）

**改动文件：** `index.html`

**具体操作：**

1. 修改 viewport meta 标签：
   ```html
   <!-- 修改前 -->
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
   <!-- 修改后 -->
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   ```

**验证方式：**
- 在手机浏览器中双指缩放，确认可以放大
- 确认页面布局在缩放后不崩溃

**提交信息：** `fix(a11y): allow user zoom by removing viewport scale restrictions`

---

### Step 1.4 ESLint 规则收紧

**对应问题：** C-3 相关

**改动文件：** `.eslintrc.json`

**具体操作：**

1. 将以下规则从 `off`/`warn` 改为 `error`：
   ```json
   {
     "rules": {
       "no-redeclare": "error",
       "no-undef": "error",
       "no-unused-vars": ["error", { "args": "none", "varsIgnorePattern": "^_" }],
       "no-useless-escape": "error"
     }
   }
   ```
2. 运行 `npm run lint` 查看新增 error 数量
3. 逐一修复所有新增 error（预计主要是未声明变量和重复声明）
4. 对于确实需要的全局变量，添加到 `globals` 配置中

**验证方式：**
- `npm run lint` 0 errors
- `npm run test:web` 全部通过

**提交信息：** `lint: tighten ESLint rules for no-redeclare and no-undef`

---

### Step 1.5 补充缺失功能的冒烟测试

**对应问题：** W-T2、C-7

**改动文件：** `tests/feature-regression.spec.js`

**具体操作：**

1. 为以下未覆盖的功能添加打开/关闭冒烟测试：
   - 塔罗牌（`tarot.js`）
   - 小游戏（`games.js`）
   - 礼物柜（`gift-cabinet.js`）
   - 通话模拟（`call.js`）
   - 群聊（`group-chat.js`）
   - 待办（`todo.js`）
   - 经期记录（`menstrual.js`）
   - 主题编辑器（`theme-editor.js`）
   - 红包（`red-packet.js`）
2. 每个测试仅验证：按钮可点击、弹窗/页面打开、无 JS 错误

**验证方式：**
- `npm run test:web` 通过率从 22 增加到 30+

**提交信息：** `test: add smoke tests for uncovered features`

---

### Step 1.6 Playwright 配置优化

**对应问题：** W-T4、W-T6

**改动文件：** `playwright.config.js`

**具体操作：**

1. 将 `waitForLoadState('networkidle')` 替换为更稳定的等待策略：
   ```javascript
   // 替代方案：等待 DOMContentLoaded + 关键元素
   await page.waitForLoadState('domcontentloaded');
   await page.waitForSelector('#home-container', { state: 'visible', timeout: 15000 });
   ```
2. 添加 HTML 报告器：
   ```javascript
   reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
   ```

**验证方式：**
- 连续运行 3 次 `npm run test:web`，确认无 flaky 失败

**提交信息：** `test: replace networkidle with deterministic wait strategy`

---

## Phase 2 — 统一规范

> 目标：建立一致的架构模式，消除跨文件不一致性。

### Step 2.1 统一命名空间模式

**对应问题：** C-3

**改动文件：** `js/state.js`、`js/core.js`、`js/utils.js`、`js/config.js`

**具体操作：**

1. 在 `js/config.js` 顶部声明命名空间：
   ```javascript
   window.ChuanXun = window.ChuanXun || {};
   ```
2. 将 `js/state.js` 包装进 IIFE，通过命名空间导出：
   ```javascript
   (function() {
       'use strict';
       // ... 现有变量声明 ...
       window.ChuanXun.state = { messages, settings, aiSettings, ... };
   })();
   ```
3. 将 `js/core.js` 的核心函数挂载到命名空间：
   ```javascript
   window.ChuanXun.core = { loadData, saveData, showModal, hideModal, ... };
   ```
4. 在 `js/utils.js` 中添加兼容性桥接：
   ```javascript
   // 过渡期：保持 window.loadData 可用
   window.loadData = window.ChuanXun.core.loadData;
   ```
5. 逐步将调用方从 `loadData()` 迁移到 `ChuanXun.core.loadData()`
6. 最终移除兼容性桥接

**迁移顺序：** config → state → utils → core → home → features

**验证方式：**
- 每迁移一个文件后运行 `npm run test:web`
- 全部迁移完成后 `npm run lint` 0 errors

**提交信息：** `refactor: introduce ChuanXun namespace for core modules`

---

### Step 2.2 统一存储层分工

**对应问题：** C-4

**改动文件：** `js/core.js`、`js/db.js`

**具体操作：**

1. 定义存储层契约（写入 `js/MODULES.md`）：
   | 数据类型 | 存储层 | 理由 |
   |----------|--------|------|
   | 消息历史 | Dexie | 利用索引查询、分页加载 |
   | 会话级数据（日记、记账、地图） | localforage | 现有 session-scoped key 机制 |
   | 全局配置（设置、主题） | localforage | 现有 `loadData` 流程 |
   | 临时标记（tour_seen、dailyGreeting） | localStorage | 同步读取，轻量 |
   | 紧急备份 | localStorage | 同步写入，visibilitychange 可靠 |

2. 将消息存储从 localforage 迁移到 Dexie：
   ```javascript
   // 读取
   const messages = await ChuanXunDB.messages
       .where('sessionId').equals(SESSION_ID)
       .sortBy('timestamp');

   // 写入
   await ChuanXunDB.messages.bulkPut(messages);
   ```

3. 保留 localforage 中的消息数据作为迁移期 fallback

**验证方式：**
- 发送消息 → 刷新 → 消息仍在
- 切换会话 → 消息隔离
- `npm run test:web` 全部通过

**提交信息：** `refactor(storage): route messages through Dexie, session data through localforage`

---

### Step 2.3 统一暗色模式选择器

**对应问题：** W-C2、W-C6

**改动文件：** `css/home.css`、`css/moments.css`、`css/shop.css`、`css/pet-style.css`

**具体操作：**

1. 统一为 `html[data-theme="dark"]` 选择器
2. 修改 `css/home.css`：
   ```css
   /* 修改前 */
   body.dark-mode .hero-card { ... }
   /* 修改后 */
   html[data-theme="dark"] .hero-card { ... }
   ```
3. 修改 `css/moments.css`（~800 行暗色模式样式）：
   ```css
   /* 修改前 */
   .moments-container.dark-mode .xxx { ... }
   /* 修改后 */
   html[data-theme="dark"] .moments-container .xxx { ... }
   ```
4. 为 `css/shop.css` 和 `css/pet-style.css` 添加基础暗色模式：
   ```css
   html[data-theme="dark"] .shop-container {
       --shop-bg: #1a1a2e;
       --shop-text: #e0e0e0;
       /* ... */
   }
   ```

**验证方式：**
- 切换暗色模式，逐页检查：主页、聊天、朋友圈、商城、萌宠
- 确认无亮色块残留

**提交信息：** `fix(css): unify dark mode selectors to html[data-theme="dark"]`

---

### Step 2.4 z-index 层级策略

**对应问题：** W-C4

**改动文件：** `css/styles.css`、各 feature CSS

**具体操作：**

1. 在 `css/styles.css` 的 `:root` 中定义层级变量：
   ```css
   :root {
       --z-base: 1;
       --z-sticky: 100;
       --z-overlay: 1000;
       --z-modal: 5000;
       --z-elevated: 10000;
       --z-toast: 50000;
       --z-max: 99999;
   }
   ```
2. 逐步替换各文件的硬编码 z-index：
   - `styles.css` 弹窗 → `var(--z-modal)`
   - `pet-style.css` 弹窗 → `var(--z-modal)`
   - `companion.css` 覆盖层 → `var(--z-elevated)`
   - `diary.css` 弹窗 → `var(--z-modal)`
   - `homeShowModal` 的 `.modal--elevated` → `var(--z-elevated)`
3. 删除所有超过 `--z-max` 的值

**验证方式：**
- 打开各种弹窗叠加场景（设置 → 编辑 → 确认），确认层级正确
- `npm run test:web` 全部通过

**提交信息：** `refactor(css): establish z-index scale with CSS custom properties`

---

### Step 2.5 提取公共 CSS 工具类

**对应问题：** W-C8

**改动文件：** `css/styles.css`

**具体操作：**

1. 在 `styles.css` 末尾添加工具类：
   ```css
   /* 毛玻璃效果 */
   .glass {
       background: rgba(255, 255, 255, 0.7);
       -webkit-backdrop-filter: blur(10px);
       backdrop-filter: blur(10px);
       border: 1px solid rgba(255, 255, 255, 0.2);
   }

   html[data-theme="dark"] .glass {
       background: rgba(30, 30, 50, 0.7);
       border-color: rgba(255, 255, 255, 0.1);
   }
   ```
2. 在新功能中使用 `.glass` 类替代重复的 backdrop-filter 声明
3. 现有代码逐步替换（不强制一次性完成）

**验证方式：**
- 确认毛玻璃效果视觉不变

**提交信息：** `refactor(css): extract glass effect utility class`

---

### Step 2.6 硬编码颜色替换为 CSS 变量

**对应问题：** W-C3

**改动文件：** `css/moments.css`、`css/shop.css`

**具体操作：**

1. 分析 `moments.css` 中的颜色模式，归类为语义变量：
   ```css
   :root {
       --moments-bg: #f7f7f7;
       --moments-text: #333;
       --moments-link: #576b95;
       --moments-border: #e5e5e5;
       /* ... */
   }

   html[data-theme="dark"] {
       --moments-bg: #1a1a2e;
       --moments-text: #e0e0e0;
       --moments-link: #7b9bd4;
       --moments-border: #333;
   }
   ```
2. 全局替换 `moments.css` 中的硬编码颜色为变量引用
3. 对 `shop.css` 重复相同操作

**验证方式：**
- 切换主题和暗色模式，确认朋友圈和商城样式正确

**提交信息：** `refactor(css): replace hardcoded colors with CSS variables in moments and shop`

---

## Phase 3 — 性能优化

> 目标：减少渲染开销、存储写入和内存占用。

### Step 3.1 renderMessages 增量更新

**对应问题：** W-J2、W-P1

**改动文件：** `js/core.js`

**具体操作：**

1. 引入消息 diff 机制：
   ```javascript
   let _renderedMessageIds = new Set();

   function renderMessages() {
       const container = DOMElements.chatMessages;
       const currentIds = new Set(visibleMessages.map(m => m.id));

       // 删除不在列表中的消息
       for (const id of _renderedMessageIds) {
           if (!currentIds.has(id)) {
               const el = container.querySelector(`[data-msg-id="${id}"]`);
               if (el) el.remove();
           }
       }

       // 添加新消息
       for (const msg of visibleMessages) {
           if (!_renderedMessageIds.has(msg.id)) {
               const el = createMessageElement(msg);
               container.appendChild(el);
           }
       }

       _renderedMessageIds = currentIds;
   }
   ```
2. 对于设置变更等需要全量重渲染的场景，保留 `forceRender()` 选项
3. 给每个消息 DOM 元素添加 `data-msg-id` 属性

**验证方式：**
- 发送 100 条消息，确认滚动流畅
- 修改主题后消息样式正确更新

**提交信息：** `perf: implement incremental DOM updates for message rendering`

---

### Step 3.2 saveData 批量写入优化

**对应问题：** W-P3

**改动文件：** `js/core.js`

**具体操作：**

1. 将 `saveData()` 中的 30 个并行 `setItem` 合并为批量操作：
   ```javascript
   async function saveData() {
       const entries = {
           [getStorageKey('messages')]: messages,
           [getStorageKey('settings')]: settings,
           // ... 其他条目
       };

       // 使用 Promise.all 但限制并发
       const keys = Object.entries(entries);
       for (let i = 0; i < keys.length; i += 5) {
           await Promise.all(
               keys.slice(i, i + 5).map(([k, v]) => localforage.setItem(k, v))
           );
       }
   }
   ```
2. 或者引入写入合并：短时间内的多次 saveData 调用合并为一次实际写入

**验证方式：**
- 连续操作后检查 IndexedDB 数据完整性
- DevTools Network 面板确认写入次数减少

**提交信息：** `perf: batch localforage writes in saveData`

---

### Step 3.3 消息图片引用优化

**对应问题：** W-P2

**改动文件：** `js/core.js`、`js/backup-engine.js`

**具体操作：**

1. 新增图片存储层：将 base64 图片存入 Dexie 独立表，消息中仅保留引用 ID
   ```javascript
   // db.js 新增表
   version(3).stores({
       messages: '++id, sessionId, timestamp',
       media: 'id'  // 新增
   });

   // 存储图片
   async function storeMessageImage(base64) {
       const id = crypto.randomUUID();
       await ChuanXunDB.media.put({ id, data: base64 });
       return id;
   }
   ```
2. 消息渲染时从 media 表懒加载图片
3. 备份引擎适配新的引用结构

**验证方式：**
- 发送图片消息 → 刷新 → 图片仍在
- 检查 IndexedDB 中 messages 表体积显著减小

**提交信息：** `perf: store message images in separate Dexie table with references`

---

## Phase 4 — 工程化

> 目标：建立现代工程基础，为长期维护做准备。

### Step 4.1 引入构建工具

**对应问题：** P3-1

**技术选型：** Vite（零配置、原生 ES Modules 支持、快速 HMR）

**具体操作：**

1. 安装 Vite：
   ```bash
   npm install -D vite
   ```
2. 创建 `vite.config.js`：
   ```javascript
   import { defineConfig } from 'vite';

   export default defineConfig({
       root: '.',
       build: {
           outDir: 'www',
           rollupOptions: {
               input: 'index.html'
           }
       },
       server: {
           port: 3000
       }
   });
   ```
3. 更新 `package.json`：
   ```json
   {
       "scripts": {
           "dev": "vite",
           "build": "vite build",
           "preview": "vite preview"
       }
   }
   ```
4. 逐步将 `<script>` 标签替换为 ES Module 导入
5. 配置 tree-shaking 和 minification

**迁移策略：** 渐进式——Vite 支持混合使用 `<script>` 和 `<script type="module">`

**验证方式：**
- `npm run build` 产物体积减小 30%+
- `npm run test:web` 全部通过
- `npm run dev` HMR 正常工作

**提交信息：** `build: introduce Vite as build tool with gradual migration`

---

### Step 4.2 HTML 模板拆分

**对应问题：** C-10

**具体操作：**

1. 将 `index.html` 中的弹窗/页面提取为独立模板文件：
   ```
   templates/
   ├── settings-modal.html
   ├── profile-overlay.html
   ├── desktop-page.html
   ├── companion-page.html
   ├── moments-feed.html
   ├── map-overlay.html
   ├── pet-interface.html
   ├── diary-modal.html
   └── shop-interface.html
   ```
2. 使用 Vite 的 HTML 插件或 JS 动态加载模板
3. `index.html` 仅保留基础骨架和关键路径 UI

**验证方式：**
- 首屏加载时间减少
- 各功能页面正常工作

**提交信息：** `refactor: extract HTML templates from monolithic index.html`

---

### Step 4.3 添加基础 ARIA 属性

**对应问题：** C-11

**改动文件：** `index.html`、`js/core.js`

**具体操作：**

1. 为主要容器添加 landmark 角色：
   ```html
   <header role="banner">...</header>
   <nav role="navigation">...</nav>
   <main role="main">...</main>
   ```
2. 为弹窗添加 ARIA 属性：
   ```javascript
   // core.js — showModal
   modalElement.setAttribute('role', 'dialog');
   modalElement.setAttribute('aria-modal', 'true');
   modalElement.setAttribute('aria-label', title);
   ```
3. 为按钮添加 `aria-label`（图标按钮无文本的情况）
4. 为动态内容区域添加 `aria-live="polite"`

**验证方式：**
- 使用 Chrome DevTools 的 Lighthouse Accessibility 审计
- 得分从当前值提升至 60+

**提交信息：** `feat(a11y): add ARIA landmarks and dialog attributes`

---

### Step 4.4 核心业务逻辑单元测试

**对应问题：** C-7

**技术选型：** Vitest（与 Vite 集成，无需额外配置）

**具体操作：**

1. 安装 Vitest：
   ```bash
   npm install -D vitest
   ```
2. 添加测试脚本：
   ```json
   {
       "scripts": {
           "test:unit": "vitest run",
           "test:unit:watch": "vitest"
       }
   }
   ```
3. 为以下模块编写单元测试（优先级排序）：
   ```
   tests/unit/
   ├── escapeHTML.test.js        # XSS 防护
   ├── getStorageKey.test.js     # 存储键生成
   ├── backup-engine.test.js     # 备份/恢复逻辑
   ├── ai-engine.test.js         # API 请求构建
   └── settings.test.js          # 设置验证
   ```

**验证方式：**
- `npm run test:unit` 通过
- 核心函数覆盖率 > 80%

**提交信息：** `test: add unit tests for core business logic with Vitest`

---

### Step 4.5 上传服务安全加固

**对应问题：** W-S4、W-S5、W-S6、W-S7

**改动文件：** `server/upload-server.js`

**具体操作：**

1. 配置 CORS 白名单：
   ```javascript
   app.use(cors({
       origin: ['http://localhost:3000', 'https://your-domain.com'],
       methods: ['POST', 'GET']
   }));
   ```
2. 添加 API Key 认证：
   ```javascript
   app.use('/api/upload', (req, res, next) => {
       const key = req.headers['x-api-key'];
       if (key !== process.env.UPLOAD_API_KEY) {
           return res.status(401).json({ error: 'Unauthorized' });
       }
       next();
   });
   ```
3. 添加文件类型白名单：
   ```javascript
   const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/wav'];
   const upload = multer({
       storage,
       limits: { fileSize: 50 * 1024 * 1024 },
       fileFilter: (req, file, cb) => {
           if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
           else cb(new Error('File type not allowed'));
       }
   });
   ```
4. 移除健康端点中的 bucket/region 信息

**验证方式：**
- 无 API Key 的请求返回 401
- 上传 `.exe` 文件被拒绝
- 健康端点仅返回 `{ "ok": true }`

**提交信息：** `fix(security): add auth, file type whitelist, and restrict CORS on upload server`

---

## 依赖关系图

```
Phase 0 (安全/构建)
  ├── Step 0.1 (XSS)
  ├── Step 0.2 (通知 XSS)
  ├── Step 0.3 (CSS 语法)
  ├── Step 0.4 (CI 测试)
  └── Step 0.5 (Android)

Phase 1 (稳定化) ← 依赖 Phase 0
  ├── Step 1.1 (空 catch)
  ├── Step 1.2 (saveData 防抖)
  ├── Step 1.3 (viewport)
  ├── Step 1.4 (ESLint)
  ├── Step 1.5 (冒烟测试)
  └── Step 1.6 (Playwright 配置)

Phase 2 (统一规范) ← 依赖 Phase 1
  ├── Step 2.1 (命名空间) ← 依赖 1.4
  ├── Step 2.2 (存储层) ← 依赖 2.1
  ├── Step 2.3 (暗色模式)
  ├── Step 2.4 (z-index)
  ├── Step 2.5 (CSS 工具类)
  └── Step 2.6 (颜色变量) ← 依赖 2.3

Phase 3 (性能) ← 依赖 Phase 2
  ├── Step 3.1 (增量渲染) ← 依赖 2.1
  ├── Step 3.2 (批量写入) ← 依赖 2.2
  └── Step 3.3 (图片引用) ← 依赖 2.2

Phase 4 (工程化) ← 可与 Phase 3 并行
  ├── Step 4.1 (Vite)
  ├── Step 4.2 (HTML 拆分) ← 依赖 4.1
  ├── Step 4.3 (ARIA)
  ├── Step 4.4 (单元测试) ← 依赖 4.1
  └── Step 4.5 (上传服务)
```

---

## 里程碑检查点

| 检查点 | 完成条件 | 验证命令 |
|--------|----------|----------|
| M0 | Phase 0 全部完成 | `npm run test:web` 22 通过 + CI 包含测试 |
| M1 | Phase 1 全部完成 | `npm run lint` 0 errors + 测试 30+ 通过 |
| M2 | Phase 2 全部完成 | 暗色模式全页面正常 + z-index 无冲突 |
| M3 | Phase 3 全部完成 | 渲染性能提升可感知 + IndexedDB 体积减小 |
| M4 | Phase 4 全部完成 | Vite 构建 + 单元测试覆盖 80%+ |

---

## 风险与注意事项

1. **Phase 2.1 命名空间迁移**是最高风险项——涉及全项目代码，必须渐进式推进，每步验证
2. **Phase 4.1 Vite 迁移**可能暴露隐式的全局依赖，需要充足的测试覆盖作为安全网
3. 所有 Phase 的改动都应在分支上开发，通过 CI 测试后合并 main
4. 每个 Step 完成后独立提交，不混合不相关的改动
5. 如果某个 Step 发现工作量超出预期，拆分为更小的子步骤
