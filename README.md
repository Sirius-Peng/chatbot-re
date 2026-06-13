# 传讯 (ChuanXun)

移动优先的情侣聊天模拟单页应用。支持 PWA 安装与 Capacitor Android 打包。

## 功能概览

### 核心聊天
- 双人对话模拟，支持文字 / 语音 / 图片 / 贴纸消息
- 消息撤回、回复、@提及、收藏、批量操作
- 聊天搜索（全屏搜索页，支持关键词 + 日期范围过滤）
- 提示词模板管理
- AI 引擎接入（DeepSeek / OpenAI 兼容接口，流式 SSE）

### 情侣互动
- 心晴手帐 — 情绪记录与分享
- 信封投递 — 匿名信件
- 红包 — 模拟红包收发
- 陪伴模式 / 通话模拟 / 群聊

### 生活工具
- 朝夕心记 — 待办、习惯打卡、纪念日、经期记录
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
- 备份导出（支持日期范围过滤：最近 7 天 / 30 天 / 不限）

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vanilla JS SPA（无框架、无打包器、无模块系统） |
| 样式 | 原生 CSS，移动端优先，CSS 自定义属性管理主题和 z-index 层级 |
| 存储 | IndexedDB（Dexie.js + localforage）+ localStorage |
| AI | DeepSeek API（OpenAI 兼容，流式 SSE） |
| 上传服务 | Express + multer + 腾讯云 COS |
| PWA | Service Worker + Web App Manifest |
| Android | Capacitor |
| 测试 | Vitest 单元测试（25 项）+ Playwright E2E 测试（33 项） |
| CI/CD | GitHub Actions：lint → test:unit → test:web → build → deploy |

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

# 启动文件上传服务
npm run server
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
| `npm run server` | 启动文件上传服务（Express + COS） |

## 项目结构

```
├── index.html              # 入口页面（46 个 script 标签定义加载顺序）
├── css/                    # 样式文件（9 个，共 ~25,000 行）
│   ├── styles.css          # 主样式 + z-index 层级变量 + .glass 工具类
│   ├── home.css            # 首页样式
│   ├── companion.css       # 陪伴模式
│   ├── diary.css           # 朝夕心记
│   ├── moments.css         # 朋友圈
│   ├── pet-style.css       # 萌宠屋
│   ├── shop.css            # 商城
│   ├── map.css             # 地图
│   └── desktop.css         # 桌面模式
├── js/                     # JavaScript 源码（~50,000 行）
│   ├── config.js           # 全局常量与配置
│   ├── db.js               # Dexie 数据库定义
│   ├── state.js            # 全局状态管理
│   ├── utils.js            # 工具函数（含全局 escapeHTML）
│   ├── core.js             # 核心功能（消息渲染、增量更新、数据存取）
│   ├── home.js             # 首页导航与应用入口
│   ├── app.js              # 启动入口（DOMContentLoaded）
│   ├── listeners*.js       # 事件绑定（按职责拆分）
│   ├── features/           # 17 个功能模块
│   │   ├── companion.js    # 陪伴模式
│   │   ├── call.js         # 通话模拟
│   │   ├── chat-search.js  # 聊天搜索
│   │   ├── mood.js         # 心晴手帐
│   │   ├── music.js        # 音乐播放
│   │   ├── map.js          # 地图标注
│   │   ├── todo.js         # 待办事项
│   │   ├── menstrual.js    # 经期记录
│   │   ├── red-packet.js   # 红包
│   │   ├── theme-editor.js # 主题编辑器
│   │   ├── reply-library.js # 字卡库
│   │   ├── prompt-manager.js # 提示词管理
│   │   ├── ai-engine.js    # AI 引擎
│   │   └── ...
│   ├── __tests__/          # Vitest 单元测试
│   │   ├── escapeHTML.test.js
│   │   └── infrastructure.test.js
│   └── ...
├── tests/                  # Playwright E2E 测试
│   ├── web-smoke.spec.js           # 冒烟测试（9 项）
│   ├── feature-regression.spec.js  # 功能回归（22 项）
│   └── xss-regression.spec.js      # XSS 安全回归（2 项）
├── server/                 # 文件上传服务
│   ├── upload-server.js    # Express + COS + ncmdump
│   └── .env.example        # 环境变量模板
├── docs/                   # 设计文档与决策记录
│   ├── improvement-plan.md         # 8 周改进计划（已完成）
│   ├── engineering-review.md       # 工程性审阅报告
│   ├── refactoring-architecture.md # 重构架构设计
│   ├── fullstack-pre-design.md     # 全栈预设计
│   └── decisions/
│       ├── ADR-000-vitest.md       # 引入 Vitest
│       ├── ADR-001-vite-migration.md       # Vite 迁移评估
│       ├── ADR-002-vite-migration-plan.md  # Vite 迁移详细计划
│       └── ADR-003-fullstack-migration-plan.md # 全栈迁移详细计划
├── scripts/                # 构建与工具脚本
├── assets/                 # 静态资源（图标、音效、vendor 库）
├── capacitor.config.json   # Capacitor 配置
├── playwright.config.js    # Playwright 配置
├── vitest.config.js        # Vitest 配置
└── .eslintrc.json          # ESLint 配置（0 errors，~250 warnings）
```

## 存储架构

| 存储层 | 用途 | 说明 |
|--------|------|------|
| localforage | 消息、设置、模板、音频 | 主存储，IndexedDB 后端 |
| Dexie (ChuanXunDB) | 数据库 schema 定义 | 已定义但未完全启用 |
| localStorage | 全局配置（商城、宠物、朋友圈、AI 设置） | 裸键存储 |
| IndexedDB (原始) | 商城商品、朋友圈媒体 | 独立数据库 |

## 测试

### 测试矩阵

| 类型 | 框架 | 数量 | 覆盖范围 |
|------|------|------|----------|
| 单元测试 | Vitest + jsdom | 25 | escapeHTML 安全性、CSS 层级策略、暗色模式一致性、ESLint 规则、package.json 完整性、viewport 可访问性、CSS 工具类、diary.css 语法、upload-server 安全加固、XSS 防御完整性、空 catch 块、z-index 变量 |
| E2E 测试 | Playwright | 33 | 首页导航、聊天入口、消息发送与持久化、功能模块弹窗（记账、日记、宠物、摸鱼、朋友圈、商城、地图、信封、塔罗、心晴、礼物柜、经期、主题编辑器、群聊、红包）、数据导出、聊天搜索、增量渲染、XSS 安全回归 |

### 运行测试

```bash
# 全部单元测试
npm run test:unit

# 全部 E2E 测试
npm run test:web

# 指定测试文件
npx playwright test tests/web-smoke.spec.js
npx playwright test tests/feature-regression.spec.js
npx playwright test tests/xss-regression.spec.js

# 单元测试详细输出
npx vitest run --reporter=verbose
```

## 部署

推送到 `main` 分支自动触发 GitHub Actions：

```
npm ci → lint → test:unit → test:web → build → 部署 www/ 到 GitHub Pages
```

CI 流水线确保每次部署前所有测试通过。

## 安全

### 已修复的安全问题

- **XSS 防御**：统一全局 `escapeHTML()` 函数，修复 7 个 Critical/High 级别 XSS 漏洞，消除 11 个散落的私有转义函数
- **XSS 回归防护**：基础设施测试强制检查 innerHTML 中的转义完整性
- **上传服务安全**：CORS 白名单、API Key 认证（时序安全比较）、文件类型白名单、健康端点信息脱敏
- **z-index 层级策略**：CSS 自定义属性（`--z-base` 到 `--z-max`）管理层级，封顶 99999
- **暗色模式统一**：全项目统一为 `html[data-theme="dark"]` 选择器

### 安全测试

- `tests/xss-regression.spec.js` — E2E 级别 XSS 回归测试
- `js/__tests__/infrastructure.test.js` — 静态分析级别的安全检查（escapeHTML 覆盖、z-index 上限、upload-server 安全属性）

## 工程改进记录

项目已完成 8 周结构化改进计划（详见 [improvement-plan.md](docs/improvement-plan.md)）：

| 周次 | 内容 | 关键产出 |
|------|------|----------|
| 第 1 周 | 安全基线 | XSS 修复、CI 加入测试、viewport 修复 |
| 第 2 周 | 测试安全网 | ESLint 收紧、冒烟测试补充、Playwright 优化 |
| 第 3 周 | CSS 修复 | 暗色模式统一、z-index 层级策略、.glass 工具类 |
| 第 4 周 | 产品功能 | 备份快捷导出、全屏聊天搜索 |
| 第 5-6 周 | 性能优化 | 增量 DOM 渲染、saveData 批量写入 |
| 第 7 周 | 安全加固 | 上传服务安全加固、Vite 迁移 ADR |
| 第 8 周 | 收尾 | 空 catch 块修复、saveData 防抖 |

### 成功指标

| 指标 | 目标 | 达成 |
|------|------|------|
| CI 测试覆盖 | 部署前必须通过 | lint + test:unit + test:web |
| E2E 测试数量 | 35+ | 33（差 2） |
| 单元测试数量 | 20+ | 25 |
| ESLint errors | 0 | 0（253 warnings） |
| XSS 可利用点 | 0 | 0 |
| 暗色模式异常 | 0 | 0 |

## 路线图

### 已完成

- [x] 8 周改进计划（安全、测试、CSS、性能、安全加固）
- [x] Vite 迁移评估 ADR（ADR-001）
- [x] Vite 迁移详细计划（ADR-002）
- [x] 全栈迁移详细计划（ADR-003）

### 近期计划

- [ ] Vite 迁移（6 周）— 渐进式引入构建工具
- [ ] 全栈迁移（12 周）— Fastify + Prisma + PostgreSQL

### 远期愿景

- [ ] 用户系统与跨设备同步
- [ ] AI 代理（API Key 隐藏，服务端计费）
- [ ] 云端备份与恢复
- [ ] 管理后台

详见 [ADR-002 Vite 迁移计划](docs/decisions/ADR-002-vite-migration-plan.md) 和 [ADR-003 全栈迁移计划](docs/decisions/ADR-003-fullstack-migration-plan.md)。

## 文档

- [模块结构](js/MODULES.md) — 脚本加载顺序与依赖关系
- [改进计划](docs/improvement-plan.md) — 8 周改进任务书（已完成）
- [工程审阅报告](docs/engineering-review.md) — 代码质量审阅
- [重构架构设计](docs/refactoring-architecture.md) — 架构变更设计
- [全栈预设计](docs/fullstack-pre-design.md) — 数据模型映射与 API 设计
- [ADR-001 Vite 迁移评估](docs/decisions/ADR-001-vite-migration.md) — Vite vs 其他工具评估
- [ADR-002 Vite 迁移计划](docs/decisions/ADR-002-vite-migration-plan.md) — 4 阶段迁移执行计划
- [ADR-003 全栈迁移计划](docs/decisions/ADR-003-fullstack-migration-plan.md) — 4 阶段全栈迁移执行计划
