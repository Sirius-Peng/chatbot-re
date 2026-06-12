# 传讯 (ChuanXun) 全栈 WebApp 实现计划

> **目标**: 基于现有前端代码，构建完整可独立运行的全栈 Web 应用，实现用户系统、云端同步、管理后台，保留所有现有功能和设计风格。

---

## 当前进展快照 (2026-06-13)

> 本节记录当前工作区的真实状态，用于承接后续重构。下方 6 阶段全栈计划仍是目标路线，但实际进展已经先集中在前端整合、PWA/Android、测试和旧版功能迁移。

### 已完成 / 已落地

- **基础前端工程化**: 已有 `package.json`、ESLint、Playwright、静态构建脚本、PWA Service Worker、Capacitor Android 工程与 GitHub Pages workflow。
- **本地数据层增强**: 已接入 localforage + Dexie；音乐二进制文件使用 Dexie `audioFiles` 表本地存储；仍以本地优先存储为主。
- **AI 与提示词**: 已接入 DeepSeek OpenAI-compatible streaming API、AI/字卡模式切换、提示词模板管理。
- **主页化重构**: 当前入口已从直接聊天首屏调整为手机主页/功能桌面首屏；聊天通过主页「聊天」入口进入。
- **旧版功能迁移**: 根目录工作区已接入商城、萌宠屋、朝夕心记、朋友圈、地图、同心记账、摸鱼小记、TA 的手机、礼物柜、红包等旧版/扩展功能。
- **测试修复**: Web smoke 已按新导航模型更新为「主页首屏 -> 进入聊天 -> 发送消息/打开设置」；2026-06-13 本地 `npm run test:web` 结果为 4 passed。
- **弹窗层级修复**: 通用 `showModal()` 已在显示前把弹窗提升到 `document.body`，避免主页隐藏聊天容器时产生不可见弹窗拦截点击。

### 尚未开始 / 未真正落地

- **全栈后端主计划尚未实现**: 尚未发现 Fastify + TypeScript 服务、Prisma schema、PostgreSQL、Redis、JWT 认证、管理后台目录或云端同步 API。
- **现有 `server/` 不是全栈后端**: 当前只有音乐上传辅助服务 (`server/upload-server.js`)，用于 NCM 转换和 COS 上传。
- **源码权威位置已明确**: 2026-06-13 已选择根目录工作区作为当前可测试主线；`chatbot/` 保留为独立历史仓库/参考来源，除非明确执行迁回任务，否则不再作为主动开发入口。

### 当前主要风险

- **历史分叉风险**: 根目录已作为当前主线，但 `chatbot/` 仍是独立 git worktree；如需回迁或合并历史，需要单独制定迁移策略，不能在两个位置并行开发同一功能。
- **脚本顺序风险**: 项目仍依赖 `<script>` 顺序和全局变量，新增模块越多，初始化竞态越容易出现。
- **覆盖率不足**: 目前只有基础 smoke；旧版迁移功能还缺少“可打开、不报错、基础保存/恢复”的自动化覆盖。
- **大文件维护风险**: `index.html`、`core.js`、`listeners.js`、`home.js` 和多个迁移模块体积偏大，需要渐进拆分，但不能一次性大改破坏全局依赖。

### 下一步重构优先级

1. **P0: 统一主线与构建入口（已完成 2026-06-13）**
   - 已选择根目录作为唯一权威源码。
   - 已同步 `AGENTS.md` / `CLAUDE.md` 中的实际路径说明。
   - 已验证 `npm run lint`、`npm run build`、`npm run test:web` 均从根目录运行；GitHub Pages workflow 也以根目录 `npm ci -> lint -> build` 为入口。

2. **P1: 稳定主页化导航模型**
   - 固化启动流程：声明/引导、欢迎动画、主页、聊天页之间不能互相遮挡。
   - 为主页入口补充 smoke：聊天、设置、商城、日记、萌宠屋、朋友圈、地图、记账至少验证可打开并可关闭。
   - 继续清理全局弹窗层级，统一使用 body 级 modal。

3. **P2: 迁移功能回归测试**
   - 给商城、萌宠屋、朝夕心记、朋友圈、地图、记账分别增加最小可用流程测试。
   - 重点验证 localStorage/localforage 键名、跨模块头像/背景同步、会话绑定开关和移动端滚动。

4. **P3: 渐进式模块拆分**
   - 不引入 bundler 的前提下，先按现有 IIFE + `window.ModuleName` 模式整理。
   - 优先拆分 `listeners.js` 中与主页、聊天设置、附件、音乐无关的事件绑定。
   - 每次拆分后保持脚本加载顺序文档化并跑 smoke。

5. **P4: 全栈计划落地前置设计**
   - 在动 Fastify/Prisma 前，先定义本地数据模型到云端数据模型的映射表。
   - 明确哪些数据继续本地优先，哪些需要云同步，哪些只做文件备份。
   - 设计 API 时保留离线队列和本地缓存，不直接替换 IndexedDB。

---

## 项目架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户客户端                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  现有前端 (index.html + CSS + JS)                          ││
│  │  - 登录/注册页面（新增）                                    ││
│  │  - 所有现有功能保留                                         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      后端服务器 (Node.js + Fastify)              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  API 层                                                     ││
│  │  - 用户认证 (JWT + Refresh Token)                          ││
│  │  - 聊天记录 CRUD                                           ││
│  │  - 角色/卡牌数据管理                                        ││
│  │  - AI 代理转发 (隐藏 API Key)                               ││
│  │  - 文件上传 (头像/语音/资源)                                ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  管理后台 API                                               ││
│  │  - 用户管理 / 内容审核 / 系统配置 / 数据统计                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据层                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │    Redis     │  │ 对象存储     │          │
│  │  (主数据)     │  │  (缓存/会话) │  │ (文件/资源)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| **后端框架** | Fastify (高性能 Node.js 框架) |
| **语言** | TypeScript |
| **ORM** | Prisma |
| **认证** | jsonwebtoken + bcrypt |
| **验证** | Zod |
| **日志** | Pino |
| **主数据库** | PostgreSQL 14+ |
| **缓存** | Redis 7+ |
| **对象存储** | MinIO (自托管) / 阿里云 OSS / 腾讯云 COS |
| **前端** | 现有 HTML5 + CSS3 + Vanilla JS (保留) |
| **容器化** | Docker + Docker Compose |
| **Web 服务器** | Nginx |
| **CI/CD** | GitHub Actions |

---

## 项目目录结构

```
chuanxun-fullstack/
├── client/                          # 前端客户端
│   ├── index.html                   # 主页面（现有）
│   ├── login.html                   # 登录/注册页面（新增）
│   ├── css/
│   │   ├── styles.css               # 现有样式
│   │   └── auth.css                 # 认证页面样式（新增）
│   ├── js/
│   │   ├── config.js                # 现有配置
│   │   ├── db.js                    # 修改为 API 调用 + 本地缓存
│   │   ├── state.js                 # 现有状态（扩展用户状态）
│   │   ├── utils.js                 # 现有工具
│   │   ├── auth.js                  # 认证模块（新增）
│   │   ├── api.js                   # API 客户端（新增）
│   │   ├── core.js                  # 核心逻辑（修改）
│   │   ├── features.js              # 现有功能
│   │   ├── games.js                 # 现有游戏
│   │   ├── data.js                  # 数据管理（修改）
│   │   ├── onboarding.js            # 现有引导
│   │   ├── listeners.js             # 现有监听器
│   │   └── features/                # 现有功能模块（全部保留）
│   ├── assets/                      # 现有资源
│   └── manifest.json                # PWA 配置
│
├── server/                          # 后端服务
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma            # 数据库模型定义
│   │   └── migrations/              # 数据库迁移
│   ├── src/
│   │   ├── app.ts                   # Fastify 主入口
│   │   ├── config/
│   │   │   ├── database.ts          # 数据库配置
│   │   │   ├── redis.ts             # Redis 配置
│   │   │   ├── storage.ts           # 对象存储配置
│   │   │   └── ai.ts                # AI 服务配置
│   │   ├── middleware/
│   │   │   ├── auth.ts              # JWT 认证中间件
│   │   │   ├── admin.ts             # 管理员权限中间件
│   │   │   ├── rateLimit.ts         # 请求限流
│   │   │   └── upload.ts            # 文件上传处理
│   │   ├── routes/
│   │   │   ├── auth.ts              # 认证路由
│   │   │   ├── user.ts              # 用户路由
│   │   │   ├── chat.ts              # 聊天记录路由
│   │   │   ├── character.ts         # 角色/梦角路由
│   │   │   ├── settings.ts          # 用户设置路由
│   │   │   ├── ai.ts                # AI 代理路由
│   │   │   ├── upload.ts            # 文件上传路由
│   │   │   └── admin/               # 管理后台路由
│   │   │       ├── index.ts
│   │   │       ├── users.ts
│   │   │       ├── content.ts
│   │   │       └── stats.ts
│   │   ├── services/                # 业务逻辑
│   │   │   ├── authService.ts
│   │   │   ├── chatService.ts
│   │   │   ├── aiService.ts
│   │   │   └── storageService.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       ├── validator.ts
│   │       └── helpers.ts
│   ├── seeds/                       # 初始数据
│   └── tests/                       # 测试文件
│
├── admin/                           # 管理后台前端
│   ├── index.html
│   ├── css/
│   └── js/
│
├── docker-compose.yml               # Docker 编排
├── nginx.conf                       # Nginx 配置
└── deploy/                          # 部署脚本
    ├── deploy.sh
    └── backup.sh
```

---

## 数据库设计 (ER 图)

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  role VARCHAR(20) DEFAULT 'user', -- 'user' | 'admin' | 'superadmin'
  status VARCHAR(20) DEFAULT 'active', -- 'active' | 'disabled'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 角色/梦角表
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  avatar VARCHAR(500),
  greeting TEXT,
  voice_type VARCHAR(50),
  is_template BOOLEAN DEFAULT FALSE, -- 是否为官方模板
  category VARCHAR(50),
  tags JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 聊天会话表
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 消息表
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text', -- 'text' | 'voice' | 'sticker'
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 用户设置表
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI 使用量记录表
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  model VARCHAR(50),
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 资源表
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20), -- 'avatar' | 'voice' | 'sticker' | 'audio'
  url VARCHAR(500) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

```
┌─────────────────────────────────────────────────────────────────┐
│                           数据库设计                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐         ┌──────────────┐                    │
│  │    users     │         │  characters  │                    │
│  ├──────────────┤         ├──────────────┤                    │
│  │ id (PK)      │────┐    │ id (PK)      │                    │
│  │ username     │    │    │ user_id (FK) │←───┐               │
│  │ email        │    │    │ name         │    │               │
│  │ password_hash│    │    │ avatar       │    │               │
│  │ avatar_url   │    │    │ greeting     │    │               │
│  │ role         │    │    │ voice_type   │    │               │
│  │ status       │    │    │ is_template  │    │               │
│  │ created_at   │    │    │ category     │    │               │
│  │ updated_at   │    │    │ tags         │    │               │
│  └──────────────┘    │    │ created_at   │    │               │
│                      │    └──────────────┘    │               │
│                      │                        │               │
│                      │    ┌──────────────┐    │               │
│                      │    │chat_sessions │    │               │
│                      │    ├──────────────┤    │               │
│                      ├───→│ id (PK)      │    │               │
│                      │    │ user_id (FK) │←───┤               │
│                      │    │ character_id │←───┘               │
│                      │    │   (FK)       │                    │
│                      │    │ title        │                    │
│                      │    │ created_at   │                    │
│                      │    │ updated_at   │                    │
│                      │    └──────────────┘                    │
│                      │            │                            │
│                      │            │    ┌──────────────┐       │
│                      │            │    │   messages   │       │
│                      │            │    ├──────────────┤       │
│                      │            └───→│ id (PK)      │       │
│                      │                 │ session_id   │       │
│                      │                 │   (FK)       │       │
│                      │                 │ role         │       │
│                      │                 │ content      │       │
│                      │                 │ message_type │       │
│                      │                 │ metadata     │       │
│                      │                 │ created_at   │       │
│                      │                 └──────────────┘       │
│                      │                                        │
│                      │    ┌──────────────┐  ┌──────────────┐ │
│                      │    │user_settings │  │   ai_usage   │ │
│                      │    ├──────────────┤  ├──────────────┤ │
│                      └───→│ user_id (PK) │  │ id (PK)      │ │
│                           │   (FK)       │  │ user_id (FK) │ │
│                           │ settings     │  │ model        │ │
│                           │ updated_at   │  │ tokens_used  │ │
│                           └──────────────┘  │ created_at   │ │
│                                             └──────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## API 接口文档

### 认证相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | /api/auth/register | 用户注册 | 否 |
| POST | /api/auth/login | 用户登录 | 否 |
| POST | /api/auth/refresh | 刷新令牌 | Refresh Token |
| POST | /api/auth/logout | 用户登出 | 是 |
| POST | /api/auth/forgot-password | 忘记密码 | 否 |
| POST | /api/auth/reset-password | 重置密码 | 否 |

### 用户相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/user/profile | 获取用户信息 | 是 |
| PUT | /api/user/profile | 更新用户信息 | 是 |
| POST | /api/user/avatar | 上传头像 | 是 |

### 聊天相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/chat/sessions | 获取会话列表 | 是 |
| POST | /api/chat/sessions | 创建会话 | 是 |
| PUT | /api/chat/sessions/:id | 更新会话 | 是 |
| DELETE | /api/chat/sessions/:id | 删除会话 | 是 |
| GET | /api/chat/sessions/:id/messages | 获取消息 | 是 |
| POST | /api/chat/sessions/:id/messages | 发送消息 | 是 |
| DELETE | /api/messages/:id | 删除消息 | 是 |

### 角色相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/characters | 获取角色列表 | 是 |
| POST | /api/characters | 创建角色 | 是 |
| PUT | /api/characters/:id | 更新角色 | 是 |
| DELETE | /api/characters/:id | 删除角色 | 是 |

### 设置相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/settings | 获取设置 | 是 |
| PUT | /api/settings | 更新设置 | 是 |
| GET | /api/settings/export | 导出设置 | 是 |
| POST | /api/settings/import | 导入设置 | 是 |

### AI 相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | /api/ai/chat | AI 聊天代理 | 是 |
| GET | /api/ai/models | 获取模型列表 | 是 |
| POST | /api/ai/test | 测试 API 连接 | 是 |
| PUT | /api/ai/api-key | 保存 API Key | 是 |
| DELETE | /api/ai/api-key | 删除 API Key | 是 |
| GET | /api/ai/usage | 获取使用量 | 是 |

### 同步相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/sync/full | 全量同步 | 是 |
| POST | /api/sync/push | 推送更改 | 是 |
| GET | /api/sync/pull | 拉取更改 | 是 |

### 管理后台

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/admin/users | 用户列表 | 管理员 |
| PUT | /api/admin/users/:id/status | 用户状态 | 管理员 |
| GET | /api/admin/stats | 系统统计 | 管理员 |
| GET | /api/admin/characters | 角色管理 | 管理员 |
| POST | /api/admin/characters | 创建角色模板 | 管理员 |
| PUT | /api/admin/characters/:id | 更新角色模板 | 管理员 |
| DELETE | /api/admin/characters/:id | 删除角色模板 | 管理员 |

---

## 实现阶段 (分 6 个阶段，按依赖顺序排列)

---

### 阶段一：基础架构搭建 [预计 1-2 周]

**目标**: 搭建后端开发环境，建立数据库，配置基础服务。

**依赖**: 无 (起始阶段)

#### 1.1 后端项目初始化

**任务清单**:
- [ ] 初始化 Node.js 项目 (Fastify + TypeScript)
- [ ] 配置 TypeScript (tsconfig.json)
- [ ] 设置 ESLint + Prettier
- [ ] 配置环境变量管理 (dotenv)
- [ ] 创建 Fastify 主入口 (src/app.ts)
- [ ] 创建基础中间件:
  - CORS 中间件
  - 错误处理中间件
  - 请求日志中间件 (Pino)
  - 请求限流中间件

**产出文件**:
```
server/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── .env.example
└── src/
    └── app.ts
```

#### 1.2 数据库设计与搭建

**任务清单**:
- [ ] 安装配置 PostgreSQL
- [ ] 初始化 Prisma
- [ ] 创建 Prisma Schema (prisma/schema.prisma)
- [ ] 生成并执行数据库迁移
- [ ] 编写种子数据脚本 (seeds/)

**产出文件**:
```
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── seeds/
    └── index.ts
```

#### 1.3 Redis 配置

**任务清单**:
- [ ] 安装配置 Redis
- [ ] 创建 Redis 连接配置 (src/config/redis.ts)
- [ ] 实现 Redis 工具类 (缓存、会话存储)

#### 1.4 对象存储配置

**任务清单**:
- [ ] 配置 MinIO 或兼容 S3 的存储
- [ ] 创建存储服务 (src/services/storageService.ts)
- [ ] 实现文件上传/下载功能

**阶段验收标准**:
- 后端服务可以启动
- 数据库连接正常
- Redis 连接正常
- 对象存储连接正常

---

### 阶段二：用户认证系统 [预计 1 周]

**依赖**: 阶段一完成

**目标**: 实现完整的用户注册、登录、认证流程。

#### 2.1 后端认证 API

**任务清单**:
- [ ] 创建认证路由 (src/routes/auth.ts)
- [ ] 实现用户注册接口 `POST /api/auth/register`
  - 输入验证 (Zod)
  - 密码加密 (bcrypt)
  - 用户名/邮箱唯一性检查
- [ ] 实现用户登录接口 `POST /api/auth/login`
  - 密码验证
  - JWT 令牌生成 (Access Token + Refresh Token)
- [ ] 实现令牌刷新接口 `POST /api/auth/refresh`
  - Refresh Token 验证
  - 生成新的 Access Token
- [ ] 实现用户登出接口 `POST /api/auth/logout`
  - 令牌黑名单 (Redis)
- [ ] 实现密码重置接口
  - `POST /api/auth/forgot-password` - 发送重置邮件
  - `POST /api/auth/reset-password` - 重置密码
- [ ] 创建认证中间件 (src/middleware/auth.ts)
  - JWT 验证
  - 令牌黑名单检查
  - 用户信息注入

**产出文件**:
```
server/src/
├── routes/
│   └── auth.ts
├── middleware/
│   └── auth.ts
├── services/
│   └── authService.ts
└── utils/
    └── validator.ts
```

#### 2.2 前端认证页面

**任务清单**:
- [ ] 创建登录页面 (client/login.html)
  - 手机号/邮箱登录
  - 密码登录
  - 记住我选项
  - 匹配现有 UI 风格
- [ ] 创建注册页面
  - 用户名、邮箱、密码
  - 服务条款同意
  - 表单验证
- [ ] 创建认证页面样式 (client/css/auth.css)

**产出文件**:
```
client/
├── login.html
└── css/
    └── auth.css
```

#### 2.3 前端认证逻辑

**任务清单**:
- [ ] 创建认证模块 (client/js/auth.js)
  - 登录/注册函数
  - 令牌存储和管理 (localStorage)
  - 自动令牌刷新
  - 登录状态检查
  - 登出函数
- [ ] 创建 API 客户端模块 (client/js/api.js)
  - 封装 fetch 请求
  - 自动附加 Authorization 头
  - 请求拦截器
  - 响应拦截器 (处理 401、刷新令牌)
  - 错误处理和重试逻辑

**产出文件**:
```
client/js/
├── auth.js
└── api.js
```

#### 2.4 用户信息管理

**任务清单**:
- [ ] 创建用户路由 (src/routes/user.ts)
- [ ] 实现获取用户信息接口 `GET /api/user/profile`
- [ ] 实现更新用户信息接口 `PUT /api/user/profile`
- [ ] 实现头像上传接口 `POST /api/user/avatar`

**阶段验收标准**:
- 用户可以注册新账号
- 用户可以登录
- 令牌自动刷新正常
- 用户信息可以查看和修改
- 头像可以上传

---

### 阶段三：核心 API 迁移 [预计 2 周]

**依赖**: 阶段二完成

**目标**: 将现有前端的本地数据操作迁移到云端 API。

#### 3.1 聊天记录 API

**任务清单**:
- [ ] 创建聊天路由 (src/routes/chat.ts)
- [ ] 创建聊天服务 (src/services/chatService.ts)
- [ ] 实现聊天会话 CRUD:
  - `GET /api/chat/sessions` - 获取会话列表 (分页)
  - `POST /api/chat/sessions` - 创建会话
  - `PUT /api/chat/sessions/:id` - 更新会话
  - `DELETE /api/chat/sessions/:id` - 删除会话
- [ ] 实现消息 CRUD:
  - `GET /api/chat/sessions/:id/messages` - 获取消息列表 (分页)
  - `POST /api/chat/sessions/:id/messages` - 发送消息
  - `DELETE /api/messages/:id` - 删除消息
- [ ] 实现消息搜索:
  - `GET /api/chat/messages/search?q=keyword` - 全文搜索

#### 3.2 角色/梦角 API

**任务清单**:
- [ ] 创建角色路由 (src/routes/character.ts)
- [ ] 实现角色 CRUD:
  - `GET /api/characters` - 获取角色列表
  - `POST /api/characters` - 创建角色
  - `PUT /api/characters/:id` - 更新角色
  - `DELETE /api/characters/:id` - 删除角色
- [ ] 实现角色头像上传

#### 3.3 用户设置 API

**任务清单**:
- [ ] 创建设置路由 (src/routes/settings.ts)
- [ ] 实现设置同步接口:
  - `GET /api/settings` - 获取设置
  - `PUT /api/settings` - 更新设置
- [ ] 实现设置导入/导出:
  - `GET /api/settings/export` - 导出设置 (JSON)
  - `POST /api/settings/import` - 导入设置

#### 3.4 AI 代理接口

**任务清单**:
- [ ] 创建 AI 路由 (src/routes/ai.ts)
- [ ] 创建 AI 服务 (src/services/aiService.ts)
- [ ] 实现 AI API 代理:
  - `POST /api/ai/chat` - 转发 AI 请求 (流式响应)
  - `GET /api/ai/models` - 获取可用模型
  - `POST /api/ai/test` - 测试 API 连接
- [ ] 实现用户 API Key 管理:
  - `PUT /api/ai/api-key` - 保存 API Key (加密存储)
  - `DELETE /api/ai/api-key` - 删除 API Key
- [ ] 实现使用量统计:
  - `GET /api/ai/usage` - 获取使用量

#### 3.5 数据同步 API

**任务清单**:
- [ ] 创建同步路由 (src/routes/sync.ts)
- [ ] 实现全量数据同步:
  - `GET /api/sync/full` - 获取所有数据
  - `POST /api/sync/push` - 推送本地更改
  - `GET /api/sync/pull?since=timestamp` - 拉取远程更改
- [ ] 实现冲突解决策略:
  - 最后写入胜出 (Last Write Wins)
  - 字段级别合并

**阶段验收标准**:
- 聊天记录可以云端存储和读取
- 角色数据可以云端同步
- 用户设置可以云端同步
- AI 请求可以通过后端代理
- 数据同步功能正常

---

### 阶段四：管理后台开发 [预计 2 周]

**依赖**: 阶段三完成

**目标**: 开发完整的后台管理面板。

#### 4.1 管理后台前端

**任务清单**:
- [ ] 创建管理后台界面 (admin/index.html)
  - 简洁的后台管理 UI
  - 响应式设计
  - 侧边栏导航
- [ ] 创建管理后台样式 (admin/css/)
- [ ] 实现管理员登录
  - 独立的管理员认证流程
  - 角色权限控制 (超级管理员/普通管理员)

#### 4.2 用户管理模块

**任务清单**:
- [ ] 创建管理员路由 (src/routes/admin/users.ts)
- [ ] 创建管理员中间件 (src/middleware/admin.ts)
- [ ] 实现用户列表查看:
  - 分页、搜索、筛选
  - 用户详情查看
- [ ] 实现用户状态管理:
  - 启用/禁用用户
  - 重置用户密码
- [ ] 实现用户数据查看:
  - 查看用户聊天记录
  - 查看用户设置

#### 4.3 内容管理模块

**任务清单**:
- [ ] 创建内容管理路由 (src/routes/admin/content.ts)
- [ ] 实现角色模板管理:
  - 创建/编辑/删除官方角色模板
  - 设置角色分类和标签
- [ ] 实现字卡库管理:
  - 管理字卡回复库
  - 分类和审核
- [ ] 实现资源管理:
  - 管理音效、贴纸等资源
  - 上传和分类

#### 4.4 系统配置模块

**任务清单**:
- [ ] 实现系统参数配置:
  - AI 模型配置
  - 上传限制配置
  - 功能开关
- [ ] 实现公告管理:
  - 创建/编辑/删除公告
  - 公告展示配置

#### 4.5 数据统计模块

**任务清单**:
- [ ] 创建统计路由 (src/routes/admin/stats.ts)
- [ ] 实现用户统计:
  - 注册用户数
  - 活跃用户数
  - 用户增长趋势
- [ ] 实现使用统计:
  - 聊天消息量
  - AI 使用量
  - 功能使用频率
- [ ] 实现系统监控:
  - 服务器状态
  - API 响应时间
  - 错误率

**阶段验收标准**:
- 管理后台可以登录
- 用户管理功能正常
- 内容管理功能正常
- 系统配置功能正常
- 数据统计功能正常

---

### 阶段五：前端改造与集成 [预计 1-2 周]

**依赖**: 阶段三完成

**目标**: 修改现有前端代码，集成后端 API，实现云端同步。

#### 5.1 前端代码改造

**任务清单**:
- [ ] 修改 `db.js` 模块:
  - 将 IndexedDB 操作改为 API 调用
  - 保留本地缓存层 (IndexedDB 作为离线缓存)
  - 实现离线队列 (离线时的操作在上线后同步)
- [ ] 修改 `data.js` 模块:
  - 备份功能改为云端同步
  - 导入/导出功能保留 (支持本地文件)
- [ ] 修改 `state.js` 模块:
  - 添加用户状态管理
  - 添加同步状态管理
- [ ] 修改 `app.js` 模块:
  - 修改应用启动流程
  - 检查登录状态
  - 未登录跳转登录页
  - 已登录加载用户数据

#### 5.2 认证流程集成

**任务清单**:
- [ ] 修改应用启动流程:
  - 检查登录状态
  - 未登录跳转登录页
  - 已登录加载用户数据
- [ ] 实现自动登录:
  - 记住登录状态
  - 令牌自动刷新
- [ ] 实现登出功能:
  - 清除本地数据
  - 跳转登录页

#### 5.3 数据同步实现

**任务清单**:
- [ ] 实现自动同步:
  - 应用启动时同步
  - 定期同步 (每 5 分钟)
  - 数据变更时同步
- [ ] 实现手动同步:
  - 同步按钮
  - 同步状态显示
- [ ] 实现冲突处理:
  - 冲突检测
  - 冲突解决 UI (可选)

#### 5.4 离线支持增强

**任务清单**:
- [ ] 增强 Service Worker:
  - 缓存策略优化
  - 离线页面提示
- [ ] 实现离线队列:
  - 离线操作记录
  - 上线后自动同步
- [ ] 离线状态提示:
  - 网络状态监听
  - 离线模式提示

**阶段验收标准**:
- 前端可以正常登录
- 数据可以云端同步
- 离线模式可以正常使用
- 离线数据可以自动同步

---

### 阶段六：测试、优化与部署 [预计 1-2 周]

**依赖**: 阶段四、阶段五完成

**目标**: 完成测试、性能优化、安全部署。

#### 6.1 测试

**任务清单**:
- [ ] 后端单元测试:
  - API 接口测试
  - 业务逻辑测试
- [ ] 集成测试:
  - 前后端联调测试
  - 数据同步测试
- [ ] E2E 测试:
  - 用户流程测试
  - 关键功能测试

#### 6.2 性能优化

**任务清单**:
- [ ] 前端优化:
  - 代码分割 (可选)
  - 图片懒加载
  - 资源压缩
- [ ] 后端优化:
  - 数据库查询优化
  - 索引优化
  - 缓存策略
- [ ] API 优化:
  - 分页加载
  - 数据压缩
  - 请求合并

#### 6.3 安全加固

**任务清单**:
- [ ] 输入验证:
  - XSS 防护
  - SQL 注入防护
  - CSRF 防护
- [ ] 认证安全:
  - 密码强度要求
  - 登录失败限制
  - 会话安全
- [ ] 数据安全:
  - 敏感数据加密
  - API Key 加密存储
  - 传输加密 (HTTPS)

#### 6.4 部署

**任务清单**:
- [ ] Docker 容器化:
  - 前端容器 (Nginx)
  - 后端容器 (Node.js)
  - 数据库容器 (PostgreSQL)
  - Redis 容器
- [ ] Nginx 配置:
  - 反向代理
  - 静态文件服务
  - SSL 配置
- [ ] 部署脚本:
  - 自动化部署脚本 (deploy.sh)
  - 数据库迁移脚本
  - 备份脚本 (backup.sh)
- [ ] 监控配置:
  - 日志收集
  - 性能监控
  - 错误报警

**阶段验收标准**:
- 所有测试通过
- 性能达标
- 安全检查通过
- 成功部署到生产环境

---

## 关键里程碑

| 里程碑 | 时间点 | 验收标准 |
|--------|--------|----------|
| **MVP** | 第 3 周末 | 用户可以注册、登录，聊天记录云端同步 |
| **Beta** | 第 6 周末 | 管理后台基本可用，所有功能迁移完成 |
| **Release** | 第 8-11 周 | 完整测试、优化、部署上线 |

---

## 注意事项

1. **渐进式迁移**: 保持前端现有功能可用，逐步替换为 API 调用
2. **向后兼容**: 保留本地存储作为离线缓存，确保离线可用
3. **数据安全**: 敏感数据 (API Key、密码) 必须加密存储
4. **性能考虑**: 使用分页、缓存、索引优化数据库查询
5. **扩展性**: 设计时考虑未来功能扩展 (如多人聊天、语音通话等)
