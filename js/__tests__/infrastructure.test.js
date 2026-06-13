'use strict';

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../..');

describe('z-index 层级策略', () => {
    test('styles.css :root 定义了 z-index 层级变量', () => {
        const css = readFileSync(resolve(ROOT, 'css/styles.css'), 'utf-8');
        const requiredVars = ['--z-base', '--z-sticky', '--z-overlay', '--z-modal', '--z-elevated', '--z-toast', '--z-max'];
        const missing = requiredVars.filter(v => !css.includes(v + ':'));
        expect(missing).toEqual([]);
    });
    test('没有 z-index 超过 --z-max (99999) 的值', () => {
        const cssDir = resolve(ROOT, 'css');
        const cssFiles = readdirSync(cssDir).filter(f => f.endsWith('.css'));
        const violations = [];
        for (const file of cssFiles) {
            const content = readFileSync(resolve(cssDir, file), 'utf-8');
            const matches = content.match(/z-index:\s*(\d+)/g) || [];
            for (const match of matches) {
                const val = parseInt(match.match(/(\d+)/)[1], 10);
                if (val > 99999) {
                    violations.push(`${file}: z-index: ${val}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});

describe('暗色模式选择器一致性', () => {
    test('所有 CSS 使用 html[data-theme="dark"] 作为暗色模式选择器', () => {
        const cssDir = resolve(ROOT, 'css');
        const cssFiles = readdirSync(cssDir).filter(f => f.endsWith('.css'));
        const violations = [];
        for (const file of cssFiles) {
            const content = readFileSync(resolve(cssDir, file), 'utf-8');
            // 检查 body.dark-mode 选择器
            const bodyDarkMatches = content.match(/body\.dark-mode/g);
            if (bodyDarkMatches) {
                violations.push(`${file}: ${bodyDarkMatches.length} 个 body.dark-mode 选择器`);
            }
            // 检查 .xxx.dark-mode 容器选择器（排除 html[data-theme="dark"]）
            const containerDarkMatches = content.match(/\.[a-z][a-z0-9-]*\.dark-mode/gi);
            if (containerDarkMatches) {
                violations.push(`${file}: ${containerDarkMatches.length} 个 .container.dark-mode 选择器`);
            }
        }
        expect(violations).toEqual([]);
    });
});

describe('ESLint 规则', () => {
    test('lint 无 error 级别违规', () => {
        try {
            execSync('npm run lint', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' });
            // exit code 0, no errors
        } catch (e) {
            // eslint exits non-zero when there are errors
            const output = e.stdout || e.stderr || '';
            // Count only "error" lines, not "warning"
            const errorLines = output.split('\n').filter(line => /\d+:\d+\s+error\s+/.test(line));
            expect(errorLines).toHaveLength(0);
        }
    });
});

describe('package.json 脚本完整性', () => {
    test('所有 node 脚本引用的文件都存在', () => {
        const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
        const scriptEntries = Object.entries(pkg.scripts || {});
        for (const [name, cmd] of scriptEntries) {
            // 匹配 "node <path>" 模式
            const nodeMatch = cmd.match(/^node\s+(\S+)/);
            if (nodeMatch) {
                const scriptPath = resolve(ROOT, nodeMatch[1]);
                expect(existsSync(scriptPath), `脚本 "${name}" 引用的文件不存在: ${nodeMatch[1]}`).toBe(true);
            }
        }
    });
});

describe('index.html 可访问性', () => {
    test('viewport 不限制用户缩放', () => {
        const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');
        const viewportMatch = html.match(/<meta[^>]*name="viewport"[^>]*>/i);
        expect(viewportMatch).not.toBeNull();
        expect(viewportMatch[0]).not.toContain('user-scalable=no');
        expect(viewportMatch[0]).not.toContain('maximum-scale=1.0');
    });
});

describe('CSS 工具类', () => {
    test('styles.css 定义了 .glass 毛玻璃工具类', () => {
        const css = readFileSync(resolve(ROOT, 'css/styles.css'), 'utf-8');
        // .glass 类必须存在
        expect(css).toMatch(/\.glass\s*\{/);
        // 必须包含 backdrop-filter
        expect(css).toMatch(/\.glass[\s\S]*?backdrop-filter:\s*blur/);
        // 必须包含 -webkit-backdrop-filter（Safari 兼容）
        expect(css).toMatch(/\.glass[\s\S]*?-webkit-backdrop-filter:\s*blur/);
    });
    test('.glass 工具类有暗色模式适配', () => {
        const css = readFileSync(resolve(ROOT, 'css/styles.css'), 'utf-8');
        // 暗色模式下 .glass 应有不同背景色
        expect(css).toMatch(/data-theme.*dark[\s\S]*?\.glass|\.glass[\s\S]*?data-theme.*dark/);
    });
});

describe('upload-server.js 安全加固', () => {
    const serverPath = resolve(ROOT, 'server/upload-server.js');
    const serverSrc = existsSync(serverPath) ? readFileSync(serverPath, 'utf-8') : '';

    test('CORS 不使用通配符 *', () => {
        if (!serverSrc) return; // 文件不存在时跳过
        // cors() 无参数 = Access-Control-Allow-Origin: *
        // 应该使用 cors({ origin: [...] }) 限制来源
        expect(serverSrc).not.toMatch(/cors\(\s*\)/);
    });
    test('健康端点不暴露 bucket 和 region', () => {
        if (!serverSrc) return;
        // health 端点的响应中不应包含 bucket/region 字段
        const healthMatch = serverSrc.match(/\/api\/health[\s\S]*?res\.json\(([\s\S]*?)\)/);
        if (healthMatch) {
            expect(healthMatch[1]).not.toContain('bucket');
            expect(healthMatch[1]).not.toContain('region');
        }
    });
    test('上传端点有 API Key 认证', () => {
        if (!serverSrc) return;
        // 应有某种 API Key 检查逻辑
        expect(serverSrc).toMatch(/api[_-]?key|authorization|x-api-key/i);
    });
    test('multer 有文件类型白名单', () => {
        if (!serverSrc) return;
        // multer 配置应包含 fileFilter
        expect(serverSrc).toContain('fileFilter');
    });
});

describe('diary.css 语法正确性', () => {
    test('没有多余的闭合花括号', () => {
        const css = readFileSync(resolve(ROOT, 'css/diary.css'), 'utf-8');
        // 解析大括号层级，确保不会有负数层级
        let depth = 0;
        for (let i = 0; i < css.length; i++) {
            if (css[i] === '{') depth++;
            if (css[i] === '}') depth--;
            if (depth < 0) {
                throw new Error(`在字符位置 ${i} 发现多余的闭合花括号`);
            }
        }
        expect(depth).toBe(0);
    });
});
