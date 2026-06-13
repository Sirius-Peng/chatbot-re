# ADR-003: 全栈迁移详细执行计划

- 日期：2026-06-13
- 状态：已采纳（待执行）
- 前置依赖：ADR-002 Vite 迁移完成
- 执行周期：12 周（1 人全职）
- 决策者：项目负责人

---

## 一、背景与动机

### 1.1 当前架构的根本限制

| 限制 | 量化 | 影响 |
|------|------|------|
| 无用户系统 | 0 个用户表 | 无法跨设备同步、无法保护隐私数据 |
| API Key 暴露在前端 | DeepSeek API Key 存于 IndexedDB | 任何用户可窃取 Key，产生费用 |
| 数据仅存本地 | 100% 数据在浏览器 IndexedDB | 换设备=丢失所有数据 |
| 无数据备份 | 仅手动导出 JSON | 误操作/浏览器清理=永久丢失 |
| 存储层混乱 | 3 种存储方式并存 | 数据迁移困难，一致性无法保证 |

### 1.2 迁移目标

1. **用户系统** — 注册/登录/跨设备同步
2. **API 代理** — 隐藏 API Key，服务端计费
3. **云端备份** — 自动同步消息/设置/日记
4. **存储统一** — Prisma 接管所有数据持久化
5. **可扩展性** — 为未来功能（多人协作、内容审核）奠定基础

---

## 二、技术栈选择

| 层 | 技术 | 选择理由 |
|----|------|----------|
| 运行时 | Node.js 20 LTS | 与前端同语言，生态成熟 |
| 框架 | Fastify 5.x | 高性能（比 Express 快 2-3x），TypeScript 原生支持，JSON Schema 验证 |
| ORM | Prisma 6.x | 类型安全，自动迁移，优秀的 DX |
| 数据库 | PostgreSQL 16 | JSONB 支持（存储灵活的 settings），全文搜索（消息检索） |
| 缓存 | Redis 7.x | JWT 黑名单，限流计数器，会话缓存 |
| 认证 | JWT + Refresh Token | 无状态，适合 SPA，支持离线场景 |
| 对象存储 | Tencent COS | 项目已有 COS 集成（upload-server.js） |
| 容器化 | Docker Compose | 本地开发环境一键启动 |

---

## 三、系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Vite SPA)                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ auth.js  │  │ api.js   │  │ sync.js  │  │ offline.js│       │
│  │ 登录/注册 │  │ fetch封装 │  │ 同步引擎  │  │ 离线队列  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │               │
│       └─────────────┴─────────────┴─────────────┘               │
│                           │ HTTPS                               │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                     后端 (Fastify)                               │
│                           │                                      │
│  ┌────────────────────────┼────────────────────────────────┐    │
│  │                  中间件层                                │    │
│  │  CORS → Rate Limit → JWT Auth → Request Validation     │    │
│  └────────────────────────┼────────────────────────────────┘    │
│                           │                                      │
│  ┌──────────┐  ┌──────────┼──────────┐  ┌──────────┐           │
│  │ Auth     │  │ Sync     │          │  │ AI       │           │
│  │ Routes   │  │ Routes   │          │  │ Proxy    │           │
│  └────┬─────┘  └────┬─────┘          │  └────┬─────┘           │
│       │             │                │       │                  │
│  ┌────┴─────────────┴────────────────┴───────┴─────┐           │
│  │                  Prisma ORM                      │           │
│  └────────────────────┬────────────────────────────┘           │
│                       │                                         │
└───────────────────────┼─────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
    ┌─────┴─────┐ ┌─────┴─────┐ ┌────┴────┐
    │PostgreSQL │ │  Redis    │ │  COS    │
    │  主数据库  │ │  缓存/限流 │ │ 对象存储 │
    └───────────┘ └───────────┘ └─────────┘
```

---

## 四、后端项目结构

```
server/
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma          # 数据模型定义
│   └── migrations/            # 数据库迁移文件
├── src/
│   ├── app.ts                 # Fastify 应用入口
│   ├── config.ts              # 环境变量配置
│   ├── lib/
│   │   ├── prisma.ts          # Prisma 客户端单例
│   │   ├── redis.ts           # Redis 客户端
│   │   └── jwt.ts             # JWT 工具函数
│   ├── middleware/
│   │   ├── auth.ts            # JWT 认证中间件
│   │   ├── rate-limit.ts      # 限流中间件
│   │   └── validate.ts        # 请求验证中间件
│   ├── routes/
│   │   ├── auth.ts            # 认证路由（注册/登录/刷新/登出）
│   │   ├── sync.ts            # 同步路由（pull/push/full）
│   │   ├── ai.ts              # AI 代理路由（chat/models）
│   │   ├── upload.ts          # 文件上传路由
│   │   └── health.ts          # 健康检查
│   ├── services/
│   │   ├── auth.service.ts    # 认证业务逻辑
│   │   ├── sync.service.ts    # 同步业务逻辑（冲突解决）
│   │   ├── ai.service.ts      # AI 代理业务逻辑
│   │   └── upload.service.ts  # 文件上传业务逻辑
│   └── types/
│       └── index.ts           # TypeScript 类型定义
├── tests/
│   ├── auth.test.ts
│   ├── sync.test.ts
│   └── ai.test.ts
├── docker-compose.yml         # PostgreSQL + Redis
├── Dockerfile                 # 生产环境容器
└── .env.example
```

---

## 五、执行计划（12 周）

### 阶段 1：后端基础（第 1-3 周）

> 目标：搭建可独立运行的后端服务，不修改前端代码。

#### 第 1 周：项目初始化与数据库

**Step 1.1 — 后端项目脚手架**
- 初始化 TypeScript + Fastify 项目
- 配置 ESLint + Prettier
- 配置 Docker Compose（PostgreSQL 16 + Redis 7）
- 实现健康检查端点 `GET /api/health`
- 验证：`docker compose up` 启动成功，健康检查返回 200

**Step 1.2 — Prisma Schema 与迁移**
- 创建 `prisma/schema.prisma`（基于 fullstack-pre-design.md 中的 Schema 设计）
- 运行 `npx prisma migrate dev` 创建数据库表
- 实现 Prisma 客户端单例
- 验证：`npx prisma studio` 可查看空表

**Step 1.3 — 认证 API**
- 实现 `POST /api/auth/register`（username, email, password → bcrypt 哈希 → 创建用户 → 返回 JWT）
- 实现 `POST /api/auth/login`（username/email + password → 验证 → 返回 accessToken + refreshToken）
- 实现 `POST /api/auth/refresh`（refreshToken → 新 accessToken）
- 实现 `POST /api/auth/logout`（refreshToken 加入 Redis 黑名单）
- JWT 配置：accessToken 15 分钟过期，refreshToken 7 天过期
- 验证：用 curl 测试完整注册→登录→刷新→登出流程

#### 第 2 周：同步 API

**Step 2.1 — 同步数据模型**
- 实现消息 CRUD（创建/读取/更新/删除）
- 实现设置 CRUD（JSONB 存储）
- 实现模板 CRUD
- 验证：Prisma Client 可正常操作所有表

**Step 2.2 — 增量同步 API**
- 实现 `GET /api/sync/pull?since={timestamp}`（拉取指定时间后的变更）
- 实现 `POST /api/sync/push`（推送本地变更，body 为操作队列）
- 实现冲突解决逻辑：
  - 消息：Last-Write-Wins（按 `updatedAt` 字段）
  - 设置：全量覆盖（取最新 `updatedAt`）
  - 日记/记账：字段级合并（新增追加，修改取最新）
- 验证：用 curl 模拟双端同步，验证冲突解决正确

**Step 2.3 — 全量同步 API**
- 实现 `GET /api/sync/full`（首次登录时下载所有数据）
- 实现分页（大消息集分批返回）
- 验证：模拟新设备首次登录，完整下载所有数据

#### 第 3 周：AI 代理与文件上传

**Step 3.1 — AI 代理路由**
- 实现 `POST /api/ai/chat`（接收前端请求 → 注入 API Key → 转发到 DeepSeek → 流式 SSE 返回）
- 实现 `GET /api/ai/models`（返回可用模型列表）
- API Key 从环境变量读取，永不暴露给前端
- 验证：通过后端代理发送 AI 请求，流式响应正常

**Step 3.2 — 文件上传路由**
- 实现 `POST /api/upload/avatar`（头像上传到 COS）
- 实现 `POST /api/upload/voice`（语音上传到 COS）
- 实现 `POST /api/upload/resource`（通用资源上传）
- 复用现有 upload-server.js 的 COS 上传逻辑
- 验证：上传文件，返回可访问的 URL

**Step 3.3 — 后端测试**
- 使用 Vitest + supertest 编写 API 测试
- 覆盖认证流程、同步冲突解决、AI 代理、文件上传
- 目标：30+ 后端测试
- 验证：`npm run test` 全部通过

---

### 阶段 2：前端适配层（第 4-6 周）

> 目标：在前端引入 API 通信层，保持现有功能不变。

#### 第 4 周：API 客户端

**Step 4.1 — fetch 封装（`js/api.js`）**

```javascript
// js/api.js — API 客户端
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

class ApiClient {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  async request(method, path, body) {
    const url = `${API_BASE}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });

    if (response.status === 401) {
      // 尝试刷新 token
      const refreshed = await this.refreshAccessToken();
      if (refreshed) return this.request(method, path, body);
      // 刷新失败，跳转登录
      this.clearTokens();
      window.showLoginModal?.();
      throw new Error('认证失败');
    }

    return response;
  }

  async refreshAccessToken() {
    // ... 刷新逻辑
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

export const api = new ApiClient();
```

**Step 4.2 — 认证 UI（`js/auth.js`）**
- 实现登录/注册弹窗 UI
- 实现令牌存储和自动刷新
- 实现登出功能
- 验证：用户可注册、登录、登出

#### 第 5 周：离线队列与同步引擎

**Step 5.1 — 离线操作队列（`js/offline.js`）**

```javascript
// js/offline.js — 离线操作队列
class OfflineQueue {
  constructor() {
    this.db = new Dexie('OfflineQueue');
    this.db.version(1).stores({ queue: '++id,entity,type,timestamp,status' });
  }

  async enqueue(operation) {
    await this.db.queue.add({
      ...operation,
      timestamp: Date.now(),
      status: 'pending',
      retries: 0
    });
  }

  async flush() {
    const pending = await this.db.queue.where('status').equals('pending').sortBy('timestamp');
    for (const op of pending) {
      try {
        await api.request('POST', '/sync/push', { operations: [op] });
        await this.db.queue.update(op.id, { status: 'synced' });
      } catch (e) {
        await this.db.queue.update(op.id, { status: 'failed', retries: op.retries + 1 });
      }
    }
  }
}

export const offlineQueue = new OfflineQueue();
```

**Step 5.2 — 同步引擎（`js/sync.js`）**

```javascript
// js/sync.js — 同步引擎
class SyncEngine {
  constructor() {
    this.lastSyncTimestamp = localStorage.getItem('lastSyncTimestamp') || 0;
  }

  async pull() {
    const response = await api.request('GET', `/sync/pull?since=${this.lastSyncTimestamp}`);
    const data = await response.json();
    // 合并远程数据到本地
    await this.mergeRemoteData(data);
    this.lastSyncTimestamp = data.timestamp;
    localStorage.setItem('lastSyncTimestamp', this.lastSyncTimestamp);
  }

  async push() {
    await offlineQueue.flush();
  }

  async fullSync() {
    const response = await api.request('GET', '/sync/full');
    const data = await response.json();
    await this.replaceLocalData(data);
  }

  async mergeRemoteData(data) {
    // 消息：按 ID 去重，取 updatedAt 更新的
    // 设置：全量覆盖
    // 模板：增量追加
  }
}

export const syncEngine = new SyncEngine();
```

**Step 5.3 — 网络状态监听**
- 监听 `online`/`offline` 事件
- 网络恢复时自动触发 `syncEngine.push()` + `syncEngine.pull()`
- 在 UI 中显示同步状态指示器

#### 第 6 周：前端数据层重构

**Step 6.1 — 存储适配器（`js/storage-adapter.js`）**

创建统一的存储接口，封装本地存储和云端同步：

```javascript
// js/storage-adapter.js
class StorageAdapter {
  // 消息操作
  async addMessage(sessionId, message) {
    // 1. 写入本地 IndexedDB
    await localforage.setItem(`msg_${sessionId}_${message.id}`, message);
    // 2. 入队离线操作
    await offlineQueue.enqueue({ entity: 'message', type: 'CREATE', entityId: message.id, payload: message });
    // 3. 如果在线，立即同步
    if (navigator.onLine) await syncEngine.push();
  }

  async getMessages(sessionId) {
    // 始终从本地读取（保证离线可用）
    return await this.getLocalMessages(sessionId);
  }

  // 设置操作
  async saveSettings(settings) {
    await localforage.setItem('settings', settings);
    await offlineQueue.enqueue({ entity: 'settings', type: 'UPDATE', entityId: 'global', payload: settings });
    if (navigator.onLine) await syncEngine.push();
  }
}

export const storage = new StorageAdapter();
```

**Step 6.2 — 替换现有存储调用**
- 将 `js/core.js` 中的 `localforage.setItem` 调用替换为 `storage.addMessage`
- 将 `js/core.js` 中的 `localforage.getItem` 调用替换为 `storage.getMessages`
- 将 `saveData()` 中的设置保存替换为 `storage.saveSettings`
- **关键原则：** 本地操作仍然立即写入 IndexedDB，同步是异步的后台任务

**Step 6.3 — 前端测试更新**
- 更新 E2E 测试以覆盖登录流程
- 更新 E2E 测试以覆盖离线场景
- 目标：40+ E2E 测试

---

### 阶段 3：渐进式同步（第 7-9 周）

> 目标：按数据类型逐步启用云端同步，降低风险。

#### 第 7 周：设置同步

**Step 7.1 — 设置同步启用**
- 用户登录后，自动拉取云端设置
- 设置变更时，自动推送到云端
- 首次登录的设备执行全量同步
- 验证：登录后设置自动同步，修改设置后另一设备自动更新

**Step 7.2 — 主题/外观同步**
- 自定义主题数据随设置同步
- 验证：自定义主题在多设备间同步

#### 第 8 周：消息同步

**Step 8.1 — 消息增量同步**
- 新消息发送后，自动入队并推送
- 打开会话时，自动拉取该会话的最新消息
- 消息撤回/删除同步
- 验证：消息在多设备间实时同步

**Step 8.2 — 消息搜索（云端增强）**
- 可选：利用 PostgreSQL 全文搜索能力
- `GET /api/messages/search?q={keyword}` — 服务端搜索
- 验证：搜索结果包含云端消息

#### 第 9 周：媒体文件与日记同步

**Step 9.1 — 媒体文件上传**
- 头像、语音、贴纸自动上传到 COS
- 消息中的图片自动上传
- 本地 base64 替换为 COS URL
- 验证：媒体文件在多设备间可访问

**Step 9.2 — 日记/记账同步**
- 朝夕心记数据增量同步
- 同心记账数据增量同步
- 验证：日记和记账在多设备间同步

---

### 阶段 4：生产化与管理（第 10-12 周）

> 目标：生产环境部署、监控、管理后台。

#### 第 10 周：安全加固与性能

**Step 10.1 — 安全加固**
- HTTPS 强制（HSTS 头）
- CSRF 防护（SameSite cookie + CSRF token）
- 输入验证（Fastify JSON Schema 验证所有请求）
- SQL 注入防护（Prisma 参数化查询，自动防护）
- 限流：认证端点 5 次/分钟，API 端点 60 次/分钟

**Step 10.2 — 性能优化**
- 数据库索引优化（Prisma schema 中已定义 `@@index`）
- Redis 缓存热门查询（用户设置、最近消息）
- 连接池配置（Prisma 默认连接池）
- API 响应压缩（Fastify compress 插件）

**Step 10.3 — 监控与日志**
- 结构化日志（Fastify 原生 Pino 日志）
- 错误追踪（集成 Sentry 或自建）
- 健康检查端点增强（数据库连接、Redis 连接、磁盘空间）

#### 第 11 周：部署

**Step 11.1 — Docker 化**
- 编写 Dockerfile（多阶段构建：构建 → 运行）
- 编写 docker-compose.yml（生产版本：app + PostgreSQL + Redis + Nginx）
- 验证：`docker compose -f docker-compose.prod.yml up` 启动成功

**Step 11.2 — CI/CD 更新**
- 更新 `.github/workflows/deploy.yml`：
  - 后端：lint → test → build → deploy
  - 前端：lint → test:unit → test:web → build → deploy
- 后端部署到云服务器（腾讯云 CVM / AWS EC2）
- 前端继续部署到 GitHub Pages

**Step 11.3 — 域名与 SSL**
- 配置域名（如 `api.chuanxun.app`）
- 配置 SSL 证书（Let's Encrypt）
- 配置 Nginx 反向代理

#### 第 12 周：管理后台与收尾

**Step 12.1 — 管理后台（最小版本）**
- 用户列表（查看/禁用/删除）
- 使用统计（活跃用户、消息量、AI 用量）
- 错误日志查看
- 验证：管理员可登录后台，查看基本数据

**Step 12.2 — 数据迁移工具**
- 编写从本地 IndexedDB 导入到云端的迁移脚本
- 用户首次登录时自动触发迁移
- 验证：现有用户可无缝迁移数据

**Step 12.3 — 文档与收尾**
- 更新 README（新架构说明）
- 编写 API 文档（Fastify Swagger 自动生成）
- 编写部署文档
- 全量回归测试

---

## 六、Won't Do 清单（本轮不处理）

| 功能 | 推迟理由 |
|------|----------|
| 实时通信（WebSocket） | 当前场景（模拟聊天）不需要真正的实时推送，轮询足够 |
| 多人协作 | 当前产品定位是单用户模拟聊天 |
| 内容审核 | 用户量小，人工审核足够 |
| 管理后台（完整版） | 最小版本足够，完整版随用户量增长迭代 |
| SSR 预渲染 | SPA 已有 PWA 支持，SSR 优先级低 |
| GraphQL API | REST API 足够，GraphQL 增加复杂度无明显收益 |

---

## 七、数据迁移策略

### 7.1 现有数据迁移路径

```
用户首次登录（已有本地数据）
  │
  ├─ 检测 IndexedDB 中是否有数据
  │   ├─ 有 → 触发迁移流程
  │   └─ 无 → 正常登录
  │
  ├─ 迁移流程：
  │   ├─ 1. 读取所有本地消息
  │   ├─ 2. 读取所有本地设置
  │   ├─ 3. 读取所有本地日记/记账
  │   ├─ 4. 调用 POST /api/sync/push 批量上传
  │   ├─ 5. 上传媒体文件到 COS
  │   ├─ 6. 更新本地引用（base64 → URL）
  │   └─ 7. 标记迁移完成
  │
  └─ 迁移完成后：
      └─ 正常使用云端同步
```

### 7.2 迁移冲突处理

| 场景 | 处理方式 |
|------|----------|
| 本地有数据，云端无数据 | 直接上传 |
| 本地有数据，云端有数据（相同 ID） | 取 updatedAt 更新的 |
| 本地有数据，云端有数据（不同 ID） | 两者都保留（不同设备创建的消息） |

---

## 八、环境变量配置

### 后端 `.env`

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/chuanxun

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# AI 代理
DEEPSEEK_API_KEY=sk-xxxx
DEEPSEEK_API_BASE=https://api.deepseek.com

# 对象存储
COS_SECRET_ID=xxxx
COS_SECRET_KEY=xxxx
COS_BUCKET=chuanxun
COS_REGION=ap-guangzhou

# 服务
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:4176
```

### 前端 `.env`

```env
VITE_API_BASE=http://localhost:3001/api
```

---

## 九、时间线与里程碑

| 阶段 | 时间 | 里程碑 | 验收标准 |
|------|------|--------|----------|
| 阶段 1 | 第 1-3 周 | 后端 API 可独立运行 | 认证+同步+AI 代理 API 通过测试 |
| 阶段 2 | 第 4-6 周 | 前端适配层就绪 | 登录流程、离线队列、同步引擎工作 |
| 阶段 3 | 第 7-9 周 | 渐进式同步上线 | 设置/消息/日记多设备同步 |
| 阶段 4 | 第 10-12 周 | 生产化部署 | Docker 部署、监控、管理后台 |

---

## 十、风险登记

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 数据迁移丢失 | 低 | 高 | 迁移前自动备份，迁移过程可回滚 |
| 同步冲突导致数据不一致 | 中 | 中 | LWW 策略简单可靠，日志记录所有冲突 |
| 离线队列积压 | 中 | 低 | 队列有上限（1000 条），超出时丢弃最旧的 |
| API Key 泄露（迁移过渡期） | 低 | 高 | 迁移完成后立即轮换 Key |
| 后端性能瓶颈 | 低 | 中 | PostgreSQL 索引 + Redis 缓存 + 连接池 |
| 用户不迁移（无动力注册） | 中 | 中 | 提供数据导出功能，降低迁移门槛 |

---

## 十一、与 Vite 迁移的关系

全栈迁移依赖 Vite 迁移完成：

| Vite 迁移产出 | 全栈迁移使用方式 |
|---------------|-----------------|
| ESM 模块系统 | `import { api } from './api.js'` 统一引入 API 客户端 |
| 单一入口 `main.js` | 在 `main.js` 中初始化同步引擎和离线队列 |
| Code splitting | 按需加载认证模块（未登录时不加载聊天功能） |
| 环境变量 | `import.meta.env.VITE_API_BASE` 配置 API 地址 |
| 构建优化 | 生产环境自动 minify API 客户端代码 |

**时间线建议：** Vite 迁移（6 周）完成后，间隔不超过 2 周启动全栈迁移（12 周）。总周期约 20 周（5 个月）。
