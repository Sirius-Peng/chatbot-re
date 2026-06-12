# 传讯工程性审阅报告

> 审阅日期：2026-06-13
> 审阅范围：JS 架构、CSS/HTML 结构、测试/CI、数据/安全/性能
> 代码规模：~50,360 行 JS（43 文件）、30,016 行 CSS（9 文件）、4,618 行 HTML（1 文件）

---

## 一、合理的设计

| 方面 | 评价 |
|------|------|
| Session-scoped 键命名 | `getStorageKey()` → `CHAT_APP_V3_{sessionId}_{key}` 多会话隔离设计清晰 |
| ZIP v5 备份格式 | 媒体二进制分离 + 数据去重引用，避免大 JSON 解析崩溃 |
| 懒加载历史 | IntersectionObserver + 50 条批量加载，避免长对话卡顿 |
| 离线优先策略 | localforage + 离线队列设计，断网不丢数据 |
| 音频资源管理 | `stopCurrentSound()` 正确关闭 AudioContext，无泄漏 |
| IIFE 模块提取 | `listeners-chat-actions.js` 的拆分模式可复制 |
| app-ready 确定性信号 | 替代 `setTimeout` 等待，测试可靠 |
| PWA 完整性 | meta 标签、manifest、SW 注册齐全 |
| 懒加载动态脚本 | `ta-phone.js`、`shop.js`、`map.js` 按需加载，减少首屏体积 |
| 媒体去重 | `extractMediaTree()` 用 Map 去重 data URL，备份体积显著缩小 |

---

## 二、严重问题 (CRITICAL)

### 2.1 安全

#### C-1 XSS：innerHTML 注入用户文本

**位置：** `js/core.js:1705`

```javascript
let content = msg.text ? `<div>${msg.text.replace(/\n/g, '<br>')}</div>` : '';
```

用户消息文本仅做换行转换后直接插入 innerHTML，无 HTML 实体转义、无 DOMPurify 过滤。同样的问题存在于系统消息渲染（`core.js:1564`）。

**风险：** 恶意备份文件可注入 `<script>` 或 `<img onerror>` 实现 XSS 攻击。

**建议：** 使用 `textContent` 渲染消息体，或引入 DOMPurify 白名单过滤。

#### C-2 API Key 明文存储

**位置：** `js/core.js:696`、`js/state.js:53`

`aiSettings.apiKey` 以明文存入 localforage（IndexedDB），并通过 `Authorization: Bearer` 头发送。

**风险：** 浏览器 IndexedDB 可被同源脚本或浏览器扩展读取。

**建议：** 至少添加用户可见的安全提示；长期方案应通过后端代理转发 API 请求，隐藏密钥。

### 2.2 架构

#### C-3 全局命名空间污染

- `js/state.js`：~50 个裸 `let` 变量声明在全局作用域
- `js/core.js`：~30 个裸顶层函数（`loadData`、`saveData`、`showModal` 等）
- 全项目：120 个 `window.xxx = ...` 赋值，分布在 20+ 文件
- 三种模块模式混用：IIFE + window 导出 / 裸顶层声明 / IIFE 无导出

**影响：** 命名冲突风险高，IDE 无法提供准确的引用分析，重构困难。

**建议：** 统一为 IIFE + `window.ChuanXun.xxx` 命名空间模式，优先处理 core.js 和 state.js。

#### C-4 存储层混乱

三层存储机制同时使用，无明确边界：

| 存储层 | 定义 | 实际使用 |
|--------|------|----------|
| Dexie (ChuanXunDB) | `db.js` 定义了 messages/settings/templates/audioFiles 表 | 几乎未使用，实际数据走 localforage |
| localforage | 核心存储引擎 | `loadData()` 中 30+ 类数据、shop/moments/pet 各自独立使用 |
| localStorage | 全局配置 | 233 处引用，同时作主存和备份，数据一致性风险 |

**建议：** 明确分工——Dexie 管消息（利用索引查询），localforage 管会话级数据，localStorage 仅管全局配置。删除 Dexie 冗余定义或真正用起来。

#### C-5 状态分散

应用状态同时存在于五处：`state.js` 运行时变量、`core.js` 定时器、`home.js` 模块局部状态、localStorage、localforage。`settings` 对象被 state.js 声明、core.js 初始化、listeners.js 修改、home.js 同步，四处可变。

**建议：** 引入集中式状态管理（哪怕是简单的发布-订阅模式），统一变更入口。

#### C-6 脚本加载顺序脆弱

40+ `<script>` 标签严格有序加载，依赖关系完全隐式。代码中大量 `typeof xxx === 'function'` 防护表明开发者已意识到此问题。

**建议：** 短期在 MODULES.md 中维护依赖矩阵；长期迁移到 ES Modules 或打包工具。

### 2.3 测试与 CI

#### C-7 零单元测试

50,000 行 JavaScript 无任何单元测试。22 个 Playwright E2E 测试中 17 个仅检查 DOM 元素存在性。

**建议：** 至少为核心业务逻辑（消息格式化、存储序列化、设置验证、备份恢复）添加单元测试。

#### C-8 CI 不跑测试

`.github/workflows/deploy.yml` 执行 `npm ci → lint → build → deploy`，不执行 `npm run test:web`。

**建议：** 在 lint 和 build 之间加入 `npm run test:web`，并缓存 Playwright 浏览器。

#### C-9 Android 构建断裂

`npm run android:sync` 和 `npm run android:build` 依赖 `android/` 目录，但根目录无此目录。`npm run test:android` 引用的 `scripts/android-smoke.js` 也不存在。

**建议：** 运行 `npx cap add android` 初始化目录，或移除失效的 npm scripts。

### 2.4 CSS / HTML

#### C-10 单体 HTML 文件

`index.html` 4,618 行，包含所有视图、弹窗、覆盖层和 UI 状态，全部同时存在于 DOM 中。浏览器需解析和维护整棵 DOM 树，即使 95% 的 UI 处于隐藏状态。

#### C-11 零无障碍属性

- 0 个 `aria-*` 属性
- 1 个 `role` 属性
- 0 个 `<section>`、`<main>`、`<nav>`、`<header>`、`<form>` 等语义标签
- 1,461 个 `<div>` + 373 个 `<button>`
- Viewport meta 禁止用户缩放（`maximum-scale=1.0, user-scalable=no`），违反 WCAG 2.1 AA 标准

#### C-12 大量内联样式和事件处理

- 798 个 `style=""` 内联属性
- 336 个 `onclick` 内联处理器（部分含多行业务逻辑）
- 表现与结构完全耦合，主题/暗色模式无法覆盖内联样式

---

## 三、中等问题 (WARNING)

### 3.1 JavaScript

| 编号 | 问题 | 位置 |
|------|------|------|
| W-J1 | 60+ 空 `catch(e) {}` 吞掉错误 | 全项目，集中于 `home.js`、`reply-library.js`、`prompt-manager.js` |
| W-J2 | `renderMessages()` 全量 innerHTML 重建 | `core.js:1833`，40+ 调用点 |
| W-J3 | `saveData()` 一次并行写 30 个 localforage 条目 | `core.js:670`，无防抖 |
| W-J4 | 背景预设保存/渲染函数重复 | `home.js` — `savePageBgToPreset` vs `saveCardBgToPreset` |
| W-J5 | 头像同步逻辑重复三次 | `home.js` — `handleAvatarUpload`、`updateHomeAvatar`、`loadSavedSettings` |
| W-J6 | setInterval 无清理句柄 | `app.js:75,143`、`home.js:2515,2519` |
| W-J7 | 重复 JSON.parse-with-fallback 模式 | `reply-library.js` 中 5 处相同两行代码 |
| W-J8 | 动态脚本加载无重试 | `home.js:1571-1627` |

### 3.2 CSS

| 编号 | 问题 | 位置 |
|------|------|------|
| W-C1 | 333 个 `!important` | `styles.css` 244、`companion.css` 49、`pet-style.css` 27 |
| W-C2 | 三种暗色模式选择器不兼容 | `html[data-theme]` / `body.dark-mode` / `.moments-container.dark-mode` |
| W-C3 | 638 个硬编码十六进制颜色值 | `moments.css` 516、`shop.css` 122，绕过主题变量 |
| W-C4 | z-index 军备竞赛 | 最高 99,999,999（pet-style.css），无统一层级策略 |
| W-C5 | diary.css 语法错误 | 行 1901 多余 `}`，可能影响后续规则解析 |
| W-C6 | shop.css / pet-style.css 无暗色模式 | 合计 2,826 行，暗色模式下显示异常 |
| W-C7 | 全局隐藏滚动条 | `*` 选择器设置 `scrollbar-width: none` |
| W-C8 | 重复的毛玻璃样式 | `backdrop-filter: blur()` 在 6 个文件中重复数百次 |
| W-C9 | CSS 加载顺序错误 | `shop.css` 在 `styles.css` 之前加载，变量未定义 |
| W-C10 | 0 个媒体查询（moments/shop） | `moments.css` 3,926 行和 `shop.css` 845 行无响应式规则 |

### 3.3 安全

| 编号 | 问题 | 位置 |
|------|------|------|
| W-S1 | 无 Content-Security-Policy | `index.html` |
| W-S2 | 全项目无输入清理函数 | 仅 `companion.js` 有私有 `_esc()` |
| W-S3 | `new Function()` 使用 | `companion.js:3298`，等效 eval |
| W-S4 | 上传服务通配 CORS | `server/upload-server.js:178` |
| W-S5 | 上传服务无认证 | `server/upload-server.js:199` |
| W-S6 | 上传服务无文件类型校验 | multer 接受任意文件，最大 100MB |
| W-S7 | 健康端点泄露基础设施 | 返回 bucket 名称和区域 |
| W-S8 | 备份恢复不验证数据结构 | `backup-engine.js:491` 直接信任输入 |
| W-S9 | API 无重试/超时机制 | `ai-engine.js` 单次 fetch，无 AbortController |

### 3.4 测试

| 编号 | 问题 | 位置 |
|------|------|------|
| W-T1 | 测试/源码比 1.2% | 594 行测试 vs 50,360 行源码 |
| W-T2 | 22 个测试中 17 个仅检查 DOM 存在性 | `feature-regression.spec.js` |
| W-T3 | 启动流程脆弱（~15 秒） | `dismissStartup()` 依赖 5 层叠加弹窗 |
| W-T4 | `networkidle` 等待策略 | 已知不稳定模式 |
| W-T5 | 单一浏览器/设备项目 | 仅 Pixel 5，无桌面/平板/跨浏览器 |
| W-T6 | 无 HTML/JUnit 报告器 | CI 集成不友好 |

### 3.5 性能

| 编号 | 问题 | 说明 |
|------|------|------|
| W-P1 | 全量 DOM 重建 | `renderMessages()` 每次清空容器重建 |
| W-P2 | base64 图片存入消息对象 | 内存占用增加 33%，序列化开销大 |
| W-P3 | 30 个并行写操作 | `saveData()` 无批量合并 |

### 3.6 PWA

| 编号 | 问题 | 说明 |
|------|------|------|
| W-W1 | SW 缓存版本静态硬编码 | `chuanxun-v1`，无构建时注入 |
| W-W2 | 资源列表手动维护 | `sw.js` 中 60+ 文件需手动添加 |
| W-W3 | favicon 依赖外部 CDN | `file.youtochat.com`，SW 未缓存 |
| W-W4 | manifest 仅 SVG 图标 | 缺少 192x192 / 512x512 PNG 降级 |

---

## 四、改进建议

### P0 — 立即修复

| 编号 | 建议 | 工作量 | 影响 |
|------|------|--------|------|
| P0-1 | 消息渲染添加 HTML 转义（`textContent` 或 DOMPurify） | 小 | 消除 XSS 风险 |
| P0-2 | CI 加入 `npm run test:web` 步骤 | 小 | 防止破坏性变更上线 |
| P0-3 | 修复 `diary.css:1901` 语法错误 | 小 | 修复潜在样式丢失 |
| P0-4 | `showNotification` 消息参数转义 | 小 | 消除通知 XSS |
| P0-5 | 上传服务添加文件类型白名单 | 小 | 防止任意文件上传 |

### P1 — 短期改进

| 编号 | 建议 | 工作量 | 影响 |
|------|------|--------|------|
| P1-1 | 统一暗色模式选择器为 `html[data-theme="dark"]` | 中 | 消除暗色模式不一致 |
| P1-2 | ESLint 开启 `no-redeclare: error`、`no-undef: error` | 小 | 捕获命名冲突和拼写错误 |
| P1-3 | 上传服务添加认证和速率限制 | 中 | 安全加固 |
| P1-4 | 移除 viewport 的 `user-scalable=no` | 小 | 无障碍合规 |
| P1-5 | 空 catch 块至少添加 `console.warn` | 中 | 可调试性 |
| P1-6 | `saveData()` 添加防抖 | 小 | 减少无效写入 |

### P2 — 架构治理

| 编号 | 建议 | 工作量 | 影响 |
|------|------|--------|------|
| P2-1 | state.js / core.js 包装进 IIFE，统一命名空间 | 大 | 消除全局污染 |
| P2-2 | 明确存储层分工：Dexie 管消息、localforage 管会话、localStorage 管配置 | 大 | 数据一致性 |
| P2-3 | `renderMessages()` 改为增量更新 | 大 | 渲染性能 |
| P2-4 | 消息图片改为引用 URL 而非内嵌 base64 | 大 | 内存和存储优化 |
| P2-5 | z-index 统一层级策略（如 CSS 变量 `--z-modal`、`--z-overlay`） | 中 | 消除 z-index 军备竞赛 |
| P2-6 | 提取毛玻璃/通知等公共样式为工具类 | 中 | 减少 CSS 重复 |
| P2-7 | 补充 Android 构建目录或移除失效 scripts | 小 | 构建链完整性 |

### P3 — 长期演进

| 编号 | 建议 | 工作量 | 影响 |
|------|------|--------|------|
| P3-1 | 引入构建工具（Vite/esbuild）实现模块化、minification、tree-shaking | 很大 | 工程化基础 |
| P3-2 | 拆分 index.html 为组件模板，动态加载 | 很大 | 首屏性能、可维护性 |
| P3-3 | 添加 ARIA 属性和语义 HTML 标签 | 大 | 无障碍合规 |
| P3-4 | 核心业务逻辑单元测试覆盖 | 大 | 回归保障 |
| P3-5 | 迁移到 ES Modules | 很大 | 彻底解决全局依赖问题 |
| P3-6 | 引入 API 代理层，前端不持有密钥 | 大 | 安全架构 |
| P3-7 | 补充 E2E 行为测试（非仅 DOM 检查） | 中 | 测试有效性 |
| P3-8 | Playwright 添加桌面端和跨浏览器项目 | 中 | 兼容性保障 |

---

## 五、严重度统计

| 严重度 | 数量 | 关键项 |
|--------|------|--------|
| CRITICAL | 12 | XSS、API Key 明文、全局污染、存储混乱、零单元测试、CI 无测试、Android 断裂、单体 HTML、零无障碍、大量内联 |
| WARNING | 40 | 空 catch、全量渲染、暗色模式不一致、!important 滥用、z-index 军备、上传无认证、测试覆盖不足 |
| INFO | 15 | Session 命名空间、ZIP 备份、懒加载、音频管理、PWA 元标签、CSS 自定义属性等设计合理 |

---

## 六、审阅文件清单

| 文件 | 行数 | 审阅内容 |
|------|------|----------|
| `js/state.js` | 76 | 全局状态声明 |
| `js/core.js` | 3,109 | 核心逻辑、存储、渲染 |
| `js/app.js` | 303 | 启动入口 |
| `js/home.js` | 2,532 | 首页导航 |
| `js/utils.js` | ~400 | 工具函数 |
| `js/db.js` | 27 | Dexie 定义 |
| `js/config.js` | ~30 | 全局常量 |
| `js/listeners.js` | 2,093 | 事件绑定 |
| `js/listeners-chat-actions.js` | 172 | 聊天操作事件 |
| `js/features/ai-engine.js` | ~200 | AI 引擎 |
| `js/features/companion.js` | 3,606 | 陪伴模式 |
| `js/backup-engine.js` | ~600 | 备份恢复 |
| `sw.js` | ~100 | Service Worker |
| `server/upload-server.js` | ~280 | 文件上传服务 |
| `index.html` | 4,618 | HTML 结构 |
| `css/styles.css` | 11,085 | 主样式 |
| `css/home.css` | ~2,600 | 首页样式 |
| `css/companion.css` | 1,513 | 陪伴样式 |
| `css/moments.css` | 3,926 | 朋友圈样式 |
| `css/shop.css` | 845 | 商城样式 |
| `css/pet-style.css` | 1,981 | 萌宠样式 |
| `css/diary.css` | ~1,900 | 日记样式 |
| `css/desktop.css` | ~800 | 桌面样式 |
| `css/map.css` | ~400 | 地图样式 |
| `.eslintrc.json` | ~120 | ESLint 配置 |
| `playwright.config.js` | ~40 | Playwright 配置 |
| `.github/workflows/deploy.yml` | ~60 | CI/CD 流水线 |
| `scripts/build-static.js` | 41 | 构建脚本 |
| `capacitor.config.ts` | ~20 | Capacitor 配置 |
