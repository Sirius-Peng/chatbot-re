'use strict';

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../..');

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
