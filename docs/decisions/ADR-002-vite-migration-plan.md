# ADR-002: Vite 迁移详细执行计划

- 日期：2026-06-13
- 状态：已采纳（待执行）
- 前置依赖：8 周改进计划完成 ✅
- 执行周期：6 周（1 人全职）
- 决策者：项目负责人

---

## 一、背景与动机

### 1.1 当前架构痛点

| 痛点 | 量化数据 | 影响 |
|------|----------|------|
| 无 minification | JS 50,360 行 / CSS 25,631 行全量加载 | 首屏加载慢（~800KB JS + ~300KB CSS） |
| 无 tree-shaking | 46 个 `<script>` 标签全量加载 | 未使用的功能模块也占用带宽 |
| 无 HMR | 每次修改需手动刷新 | 开发效率低 |
| 全局命名空间污染 | 227 个 ESLint globals 声明 | 命名冲突风险高，IDE 支持差 |
| 脚本加载顺序脆弱 | 46 个 `<script>` 严格有序 | 调整一个标签可能导致级联失败 |
| 无代码分割 | 所有功能同步加载 | 首屏加载时间与功能数量线性相关 |

### 1.2 为什么现在可以迁移

8 周改进计划已完成，建立了：
- 58 个自动化测试（25 单元 + 33 E2E）作为回归安全网
- ESLint 0 errors 作为代码质量基线
- XSS 修复消除安全债务
- CI/CD 流水线包含测试步骤

---

## 二、迁移策略概述

采用 **渐进式迁移**，分 4 个阶段，每个阶段独立可交付、可回滚。

```
阶段 1: Vite 遗产模式（2 周）
  ├─ Vite 仅作为 dev server + HMR
  ├─ 保留 index.html 中所有 <script> 标签
  └─ 零代码改动，纯工具链升级

阶段 2: ESM 叶子模块转换（2 周）
  ├─ 从最底层模块开始转换为 ESM export
  ├─ utils.js → config.js → state.js → ...
  ├─ 每转换一个模块，运行全量测试
  └─ 全局变量逐步替换为 import/export

阶段 3: 入口文件统一（1 周）
  ├─ 创建 main.js 作为唯一入口
  ├─ 替换 46 个 <script> 为 <script type="module">
  ├─ Vite 接管依赖图解析
  └─ 移除 .eslintrc.json 中已转换模块的全局声明

阶段 4: 构建优化（1 周）
  ├─ 启用 minification（terser）
  ├─ 启用 tree-shaking
  ├─ 启用 code splitting（按路由/功能）
  ├─ 配置 Capacitor 适配
  └─ 性能基线测试
```

---

## 三、阶段 1：Vite 遗产模式（2 周）

### 3.1 目标

在不修改任何业务代码的前提下，引入 Vite 作为开发服务器，获得 HMR 能力。

### 3.2 安装与配置

**新增依赖：**
```
vite (devDependency)
```

**`vite.config.js` 配置：**
```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'assets',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'www',
    rollupOptions: {
      input: 'index.html'
    }
  },
  // 遗产模式：不处理 <script> 标签，仅提供 dev server
  appType: 'mpa'
});
```

**`package.json` 脚本更新：**
```json
{
  "scripts": {
    "dev": "vite",
    "dev:legacy": "npx serve .",
    "build": "vite build",
    "build:legacy": "node scripts/build-static.js"
  }
}
```

### 3.3 index.html 适配

- 保留所有 46 个 `<script>` 标签不变
- Vite 的 `appType: 'mpa'` 模式会原样提供 HTML，不注入 HMR client
- 手动在 `<head>` 中添加 Vite HMR client（仅开发环境）：
  ```html
  <script type="module" src="/@vite/client"></script>
  ```

### 3.4 CSS 处理

Vite 原生支持 CSS 文件，无需额外配置。现有的 9 个 CSS 文件通过 `<link>` 标签加载，Vite 会自动处理路径解析和 HMR。

### 3.5 验证标准

- [ ] `npm run dev` 启动 Vite dev server，页面正常加载
- [ ] 修改任意 JS 文件后，页面自动刷新（HMR）
- [ ] 修改任意 CSS 文件后，样式热更新（不刷新页面）
- [ ] `npm run build` 生成 `www/` 目录，内容与 `build:legacy` 一致
- [ ] `npm run test:unit` 全部通过
- [ ] `npm run test:web` 全部通过
- [ ] `npm run lint` 0 errors

### 3.6 回滚方案

- 删除 `vite.config.js`
- 恢复 `package.json` 中的 `dev` 和 `build` 脚本
- 删除 `<head>` 中的 Vite HMR client
- `npm uninstall vite`

---

## 四、阶段 2：ESM 叶子模块转换（2 周）

### 4.1 目标

将底层模块从全局变量模式转换为 ES Modules，从依赖树的叶子节点开始。

### 4.2 转换顺序（拓扑排序）

按依赖关系从叶子到根的顺序转换：

```
第 1 批（无外部依赖，纯工具函数）：
  js/utils.js          ← escapeHTML, showNotification, optimizeImage 等
  js/config.js         ← AI_CONFIG, CONSTANTS 等常量

第 2 批（依赖第 1 批）：
  js/state.js          ← settings, messages 等全局状态
  js/db.js             ← Dexie/localforage 封装

第 3 批（依赖第 2 批）：
  js/backup-engine.js  ← 备份/恢复逻辑
  js/data.js           ← 数据导入导出

第 4 批（依赖第 3 批）：
  js/core.js           ← 核心渲染和消息处理（最大文件，3199 行）
  js/home.js           ← 首页逻辑（2532 行）

第 5 批（功能模块，依赖第 4 批）：
  js/features/*.js     ← 17 个功能模块
  js/games.js
  js/moments.js
  js/pet-game.js

第 6 批（监听器和启动，最外层）：
  js/listeners.js
  js/listeners-*.js
  js/app.js            ← 应用入口
```

### 4.3 单模块转换模板

以 `js/utils.js` 为例：

**转换前（全局变量模式）：**
```javascript
// js/utils.js
window.escapeHTML = function(str) { ... };
window.showNotification = function(msg, type, dur) { ... };
```

**转换后（ESM）：**
```javascript
// js/utils.js
export function escapeHTML(str) { ... }
export function showNotification(msg, type, dur) { ... }

// 兼容层：保持全局变量访问（过渡期间）
if (typeof window !== 'undefined') {
  window.escapeHTML = escapeHTML;
  window.showNotification = showNotification;
}
```

**消费者（未转换的文件）：**
```html
<!-- 仍然通过 <script> 标签加载，使用全局变量 -->
<script src="js/utils.js"></script>
```

**消费者（已转换的文件）：**
```javascript
// js/core.js (已转换)
import { escapeHTML, showNotification } from './utils.js';
```

### 4.4 Vite 兼容层策略

在阶段 2 期间，使用 Vite 的 `define` 配置来处理全局变量暴露：

```javascript
// vite.config.js
export default defineConfig({
  // ...
  build: {
    rollupOptions: {
      output: {
        // 保持全局变量可访问
        format: 'iife',
        name: 'ChuanXun'
      }
    }
  }
});
```

### 4.5 每批转换的验证流程

```
1. 将模块转换为 ESM export
2. 添加兼容层（window.xxx = xxx）
3. 更新所有消费者的 import（逐个文件）
4. 运行 npm run test:unit → 必须全部通过
5. 运行 npm run test:web → 必须全部通过
6. 运行 npm run lint → 0 errors
7. 提交该模块的转换
8. 移除 .eslintrc.json 中该模块的全局声明
9. 再次运行 lint 确认
```

### 4.6 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| 循环依赖 | 中 | 使用 `madge` 工具检测：`npx madge --circular js/` |
| 全局变量遗漏 | 中 | ESLint `no-undef` 规则已设为 error，会立即报错 |
| 测试覆盖不足 | 低 | 阶段 2 依赖 8 周计划建立的 58 个测试 |
| 模块初始化顺序变化 | 中 | ESM 的 `import` 会改变执行顺序，需验证 DOM 就绪时机 |

### 4.7 验证标准

- [ ] 所有叶子模块（utils, config, state, db）已转换为 ESM
- [ ] 兼容层确保未转换的模块仍能正常工作
- [ ] `.eslintrc.json` globals 声明从 227 个降至 < 50 个
- [ ] `npx madge --circular js/` 无循环依赖
- [ ] 全量测试通过

---

## 五、阶段 3：入口文件统一（1 周）

### 5.1 目标

将 46 个 `<script>` 标签替换为单一 ESM 入口，Vite 接管依赖图。

### 5.2 创建入口文件

**`js/main.js`：**
```javascript
// 按依赖顺序导入所有模块
import './config.js';
import './db.js';
import './utils.js';
import './state.js';
import './backup-engine.js';
import './data.js';
import './core.js';
import './home.js';

// 功能模块
import './features/companion.js';
import './features/map.js';
import './features/mood.js';
import './features/music.js';
import './features/call.js';
import './features/chat-search.js';
import './features/envelope.js';
import './features/group-chat.js';
import './features/prompt-manager.js';
import './features/reply-library.js';
import './features/theme-editor.js';
import './features/todo.js';
import './features/menstrual.js';
import './features/red-packet.js';
import './features/ai-engine.js';
import './features/颜文字.js';
import './games.js';
import './moments.js';
import './pet-game.js';
import './ta-phone.js';
import './tarot.js';
import './moyu.js';

// 监听器
import './listeners.js';
import './listeners-chat-actions.js';
import './listeners-voice.js';

// 应用启动（最后导入）
import './app.js';
```

### 5.3 index.html 修改

**删除所有 `<script>` 标签，替换为：**
```html
<script type="module" src="/js/main.js"></script>
```

**保留的 `<script>` 标签：**
- 第三方库 CDN（如 Font Awesome）— 保持不变
- 内联 `<script>` 标签（如 applyTheme 初始化）— 保持不变

### 5.4 移除兼容层

所有模块已通过 ESM 连接，移除阶段 2 添加的兼容层代码：
```javascript
// 删除这些代码
if (typeof window !== 'undefined') {
  window.xxx = xxx;
}
```

### 5.5 移除全局变量声明

从 `.eslintrc.json` 中移除所有已转换模块的全局声明。最终目标：
- 仅保留第三方库的全局声明（如 `localforage`, `Dexie`, `JSZip`）
- 保留浏览器 API 全局声明（如 `fetch`, `localStorage`）
- 移除所有项目内部模块的全局声明

### 5.6 验证标准

- [ ] `index.html` 中仅剩 1 个 `<script type="module">` 标签
- [ ] Vite dev server 正常启动，HMR 工作正常
- [ ] `npm run build` 生成优化后的 `www/` 目录
- [ ] `.eslintrc.json` globals 声明 < 30 个（仅第三方库和浏览器 API）
- [ ] 全量测试通过

---

## 六、阶段 4：构建优化（1 周）

### 6.1 目标

启用 Vite 的生产环境优化能力。

### 6.2 Minification

```javascript
// vite.config.js
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // 生产环境移除 console.log
        drop_debugger: true
      }
    }
  }
});
```

**预期效果：** JS 体积减少 30-40%（从 ~800KB 降至 ~500KB）。

### 6.3 Tree-shaking

Vite 默认启用 tree-shaking。需要确保：
- 所有模块使用 ESM `export`（阶段 2-3 已完成）
- 无副作用的模块在 `package.json` 中标记 `"sideEffects": false`
- 第三方库（localforage, Dexie）已支持 ESM

### 6.4 Code Splitting

按功能模块分割代码：

```javascript
// vite.config.js
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-core': ['localforage', 'dexie'],
          'vendor-utils': ['jszip'],
          'feature-chat': [
            './js/core.js',
            './js/home.js',
            './js/listeners.js'
          ],
          'feature-moments': ['./js/moments.js'],
          'feature-pet': ['./js/pet-game.js'],
          'feature-shop': ['./js/games.js']
        }
      }
    }
  }
});
```

**预期效果：** 首屏仅加载核心代码（~200KB），功能模块按需加载。

### 6.5 CSS 优化

```javascript
// vite.config.js
export default defineConfig({
  css: {
    devSourcemap: true,
    // 生产环境提取 CSS 为独立文件
    modules: {
      localsConvention: 'camelCase'
    }
  }
});
```

### 6.6 Capacitor 适配

```javascript
// vite.config.js
export default defineConfig({
  build: {
    outDir: 'www',
    // Capacitor 需要相对路径
    base: './'
  }
});
```

更新 `capacitor.config.json`：
```json
{
  "webDir": "www",
  "server": {
    "androidScheme": "https"
  }
}
```

### 6.7 性能基线测试

在迁移前后分别测量：

| 指标 | 迁移前（基线） | 目标 |
|------|---------------|------|
| JS 总体积 | ~800KB | < 500KB |
| CSS 总体积 | ~300KB | < 200KB |
| 首屏加载时间（3G） | ~8s | < 5s |
| Lighthouse Performance | ~60 | > 80 |
| Lighthouse FCP | ~3s | < 1.5s |

### 6.8 验证标准

- [ ] `npm run build` 生成优化后的 `www/`
- [ ] JS 体积减少 > 30%
- [ ] Code splitting 生效，首屏仅加载核心 chunk
- [ ] Capacitor `android:build` 正常生成 APK
- [ ] Lighthouse Performance > 80
- [ ] 全量测试通过

---

## 七、时间线与里程碑

| 阶段 | 时间 | 里程碑 | 验收标准 |
|------|------|--------|----------|
| 阶段 1 | 第 1-2 周 | Vite dev server 运行 | HMR 工作，测试通过 |
| 阶段 2 | 第 3-4 周 | 叶子模块 ESM 化 | globals < 50，无循环依赖 |
| 阶段 3 | 第 5 周 | 单一入口文件 | `<script>` 标签仅 1 个 |
| 阶段 4 | 第 6 周 | 生产构建优化 | JS 体积 -30%，Lighthouse > 80 |

---

## 八、风险登记

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 隐式全局依赖导致运行时错误 | 高 | 中 | 阶段 2 逐步转换，每步运行测试 |
| CSS url() 引用路径变化 | 中 | 低 | Vite 自动处理资源路径 |
| Capacitor 构建适配 | 低 | 中 | Capacitor 官方支持 Vite |
| 第三方库 ESM 兼容 | 低 | 低 | localforage/Dexie 已支持 ESM |
| 循环依赖暴露 | 中 | 中 | 使用 madge 检测，按拓扑顺序转换 |
| 测试覆盖盲区 | 中 | 中 | 每阶段结束运行全量 E2E 测试 |

---

## 九、与全栈迁移的关系

Vite 迁移是全栈迁移的**前端基础设施准备**：

| Vite 阶段 | 对全栈迁移的价值 |
|-----------|-----------------|
| 阶段 1（遗产模式） | 提供 HMR，加速前端开发迭代 |
| 阶段 2（ESM 转换） | 消除全局变量，为 API 层提供清晰的模块边界 |
| 阶段 3（入口统一） | 为 fetch 封装和离线队列提供统一的初始化入口 |
| 阶段 4（构建优化） | 为 SSR 预渲染做准备（可选） |

**建议：** Vite 迁移完成后立即启动全栈迁移。两个迁移之间间隔不超过 2 周，避免架构处于中间状态过久。
