# 传讯 (ChuanXun)

移动优先的情侣聊天模拟单页应用。支持 PWA 安装与 Capacitor Android 打包。

## 功能概览

### 核心聊天
- 双人对话模拟，支持文字 / 语音 / 图片 / 贴纸消息
- 消息撤回、回复、@提及、收藏、批量操作
- 聊天搜索、提示词模板管理
- AI 引擎接入（DeepSeek / OpenAI 兼容接口，流式 SSE）

### 情侣互动
- 心晴手帐 — 情绪记录与分享
- 信封投递 — 匿名信件
- 红包 — 模拟红包收发
- 陪伴模式 / 通话模拟 / 群聊

### 生活工具
- 朝夕心记 — 待办、习惯打卡、纪念日
- 同心记账 — 收支记录与统计
- 摸鱼小记 — 轻量笔记
- Zmilk 地图 — 地图标注

### 娱乐功能
- 萌宠屋 — 像素宠物养成
- 商城 — 虚拟购物
- 朋友圈 — 模拟社交动态
- 塔罗牌 / 小游戏 / 桌面模式

### 个性化
- 自定义主题编辑器
- 字卡库（回复模板）
- 多角色 / 梦角切换
- TA 的手机（模拟对方视角）

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vanilla JS SPA（无框架、无打包器） |
| 样式 | 原生 CSS，移动端优先 |
| 存储 | IndexedDB（Dexie.js）+ localforage + localStorage |
| AI | DeepSeek API（OpenAI 兼容，流式 SSE） |
| PWA | Service Worker + Web App Manifest |
| Android | Capacitor |
| 测试 | Playwright E2E + Vitest 单元测试 |
| CI/CD | GitHub Actions → GitHub Pages |

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发（端口 3000）
npm run dev

# 运行单元测试
npm run test:unit

# 运行 E2E 测试
npm run test:web

# 构建到 www/
npm run build
```

## 脚本命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 构建静态产物到 `www/` |
| `npm run lint` | ESLint 检查 |
| `npm run lint:fix` | ESLint 自动修复 |
| `npm run test:unit` | Vitest 单元测试 |
| `npm run test:web` | Playwright E2E 测试（Pixel 5 视口，端口 4176） |
| `npm run android:sync` | 构建 + Capacitor 同步 |
| `npm run android:build` | 构建 Android Debug APK |
| `npm run server` | 启动文件上传服务 |

## 项目结构

```
├── index.html              # 入口页面（所有 script 标签在此定义加载顺序）
├── css/                    # 样式文件
│   ├── styles.css          # 主样式 + 弹窗管理
│   └── home.css            # 首页样式
├── js/                     # JavaScript 源码
│   ├── config.js           # 全局常量与配置
│   ├── db.js               # Dexie 数据库定义
│   ├── state.js            # 全局状态管理
│   ├── utils.js            # 工具函数（含 escapeHTML）
│   ├── core.js             # 核心功能（弹窗、消息渲染、数据存取）
│   ├── home.js             # 首页导航与应用入口
│   ├── app.js              # 启动入口（DOMContentLoaded）
│   ├── listeners*.js       # 事件绑定（按职责拆分）
│   ├── features/           # 功能模块
│   ├── diary.js            # 朝夕心记
│   ├── accounting.js       # 同心记账
│   ├── __tests__/          # Vitest 单元测试
│   └── ...
├── assets/                 # 静态资源（图标、音效、vendor 库）
├── tests/                  # Playwright E2E 测试
├── scripts/                # 构建与工具脚本
├── server/                 # 文件上传服务
├── docs/                   # 设计文档
├── capacitor.config.json   # Capacitor 配置
└── playwright.config.js    # Playwright 配置
```

## 存储架构

| 存储层 | 用途 | 说明 |
|--------|------|------|
| Dexie (ChuanXunDB) | 消息、设置、模板、音频 | IndexedDB ORM |
| localforage | 会话级数据（日记、记账、地图） | 按 `CHAT_APP_V3_{sessionId}_{key}` 隔离 |
| localStorage | 全局配置（商城、宠物、朋友圈） | 裸键存储 |
| IndexedDB (原始) | 商城商品、朋友圈媒体 | 独立数据库 |

## 测试

```bash
# 运行 Vitest 单元测试
npm run test:unit

# 运行全部 E2E 测试
npm run test:web

# 指定测试文件
npx playwright test tests/web-smoke.spec.js
npx playwright test tests/feature-regression.spec.js
npx playwright test tests/xss-regression.spec.js
```

测试覆盖：
- **单元测试（Vitest）** — escapeHTML 安全转义函数（7 项）
- **web-smoke** — 首页导航、聊天入口、消息发送、功能页面、底部导航、页面切换（9 项）
- **feature-regression** — 记账、日记、宠物、摸鱼、朋友圈、商城、统计、地图、信封、塔罗、心晴、消息持久化、数据导出（13 项）
- **xss-regression** — XSS 安全回归测试：脚本注入防护、通知 HTML 转义（2 项）

## 部署

推送到 `main` 分支自动触发 GitHub Actions：

```
npm ci → lint → build → 部署 www/ 到 GitHub Pages
```

## 安全

已修复 7 个 Critical/High 级别 XSS 漏洞：
- 统一全局 `escapeHTML()` 函数（覆盖 `& < > " '` 五个特殊字符）
- 消除 11 个散落的私有转义函数，统一为单一实现
- 修复 core.js 中消息渲染、系统消息、通话事件、回复指示器、图片属性等注入点
- 修复 showNotification 和 home.js 中的 XSS 风险

详见 [js/utils.js](js/utils.js) 中的 `window.escapeHTML` 实现。

## 文档

- [模块结构](js/MODULES.md) — 脚本加载顺序与依赖关系
- [全栈预设计](docs/fullstack-pre-design.md) — 本地→云端数据模型映射
- [全栈实现计划](传讯全栈WebApp实现计划.md) — 迁移路线图
