# ADR-001: Vite 迁移评估

- 日期：2026-06-13
- 状态：已采纳（延迟执行）
- 决策者：项目负责人

## 背景

传讯（ChuanXun）是一个 vanilla JS SPA，无框架、无构建工具、无模块系统。所有 JS 文件通过 `<script>` 标签按顺序加载，依赖全局变量和隐式窗口属性进行跨文件通信。

当前痛点：
- 无 minification — 生产环境 JS/CSS 未压缩，首屏加载慢
- 无 tree-shaking — 全量加载所有脚本（含未使用的功能模块）
- 无 HMR — 每次修改需手动刷新页面
- 全局命名空间污染 — 100+ 全局变量/函数
- 脚本加载顺序脆弱 — 调整一个 `<script>` 顺序可能导致级联失败

## 决策

**短期（6 个月内）：不迁移 Vite。中期（6-12 个月）：在全栈迁移时一并引入 Vite。**

### 为什么不立即迁移

1. **隐式全局依赖太深** — 代码通过 `window.xxx` 和隐式全局变量通信（`.eslintrc.json` 中有 100+ globals）。Vite 的 ESM 模块系统会隔离作用域，导致大量 `xxx is not defined` 错误。修复工作量估计 2-3 周。

2. **脚本加载顺序依赖** — `index.html` 中 40+ `<script>` 标签有严格的先后依赖（如 `state.js` → `config.js` → `utils.js` → `core.js`）。Vite 需要将这些转换为 ESM import 图，需要逐一梳理依赖关系。

3. **收益有限** — 当前项目规模（~11,000 行 CSS、~15,000 行 JS）下，minification 节省约 30-40% 体积，但对用户体验的改善不如全栈迁移（引入 SSR、API 层）带来的改善大。

4. **与全栈迁移冲突** — 如果同时做 Vite 迁移 + Fastify/Prisma 后端，前端和后端会同时处于不稳定状态，风险叠加。

### 为什么中期迁移

1. **全栈迁移是自然切入点** — 引入 Fastify 后端时，前端需要模块化来对接 API 层。此时引入 Vite 是顺理成章的工程化升级。

2. **Vite 支持渐进式迁移** — Vite 可以混合 `<script>` 和 `<script type="module">`，允许逐步将全局变量替换为 ESM export。

3. **收益在规模化后更明显** — 当功能模块增加到 20+ 时，tree-shaking 和 code splitting 的价值才会显现。

### 备选方案评估

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| Vite | HMR、ESM、tree-shaking、生态好 | 需要解决全局依赖、加载顺序 | 中期采纳 |
| esbuild（裸） | 极快打包、简单配置 | 无 HMR、无 dev server、无 plugin 生态 | 不采纳 |
| Rollup | 成熟、tree-shaking 好 | 配置复杂、无内置 dev server | 不采纳 |
| Webpack | 生态最大、功能最全 | 配置复杂、构建慢、对 vanilla JS 支持一般 | 不采纳 |
| 不迁移 | 零风险、零工作量 | 无 minification/HMR/tree-shaking | 短期采纳 |

### 迁移策略（未来执行时）

1. **Phase 1** — 安装 Vite，配置为"遗产模式"：保留 `index.html` 中的 `<script>` 标签，Vite 仅做 dev server + HMR
2. **Phase 2** — 将全局变量逐步转换为 ESM export（从叶子模块开始，如 `utils.js`、`config.js`）
3. **Phase 3** — 将 `<script>` 标签替换为 `<script type="module" src="main.js">`，由 Vite 处理依赖图
4. **Phase 4** — 启用 minification、tree-shaking、code splitting

### 预期风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 隐式全局依赖导致运行时错误 | 高 | 中 | Phase 2 逐步转换，每步运行测试 |
| CSS 中的 `url()` 引用路径变化 | 中 | 低 | Vite 自动处理资源路径 |
| Capacitor Android 构建适配 | 低 | 中 | Capacitor 官方支持 Vite |
| 第三方库（Dexie、localforage）ESM 兼容 | 低 | 低 | 这些库已支持 ESM |

## 后续行动

- [x] ADR 文档完成
- [x] 详细执行计划已编写 → [ADR-002 Vite 迁移详细执行计划](ADR-002-vite-migration-plan.md)
- [x] 全栈迁移计划已编写 → [ADR-003 全栈迁移详细执行计划](ADR-003-fullstack-migration-plan.md)
- [ ] Phase 1 前需要：所有 E2E 测试通过 ✅、ESLint 0 errors ✅（均已达成）
