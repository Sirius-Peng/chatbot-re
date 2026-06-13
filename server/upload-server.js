/**
 * upload-server.js — 音乐上传服务
 * 接收音频文件 → NCM 自动转换 → 上传到腾讯云 COS → 返回 URL
 *
 * 启动: node server/upload-server.js
 * 端口: UPLOAD_SERVER_PORT (默认 3001)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');

// ---- COS 初始化 ----

let cos = null;

function getCOS() {
    if (cos) return cos;

    const secretId = process.env.COS_SECRET_ID;
    const secretKey = process.env.COS_SECRET_KEY;

    if (!secretId || !secretKey) {
        console.warn('[upload-server] COS 凭证未配置，上传功能不可用。请在 server/.env 中设置 COS_SECRET_ID 和 COS_SECRET_KEY');
        return null;
    }

    try {
        const COS = require('cos-nodejs-sdk-v5');
        cos = new COS({
            SecretId: secretId,
            SecretKey: secretKey
        });
        console.log('[upload-server] COS SDK 已初始化');
        return cos;
    } catch (e) {
        console.error('[upload-server] COS SDK 加载失败:', e.message);
        return null;
    }
}

// ---- NCM 转换 ----

function convertNcm(inputPath, outputDir) {
    return new Promise(function(resolve, reject) {
        const child = spawn('ncmdump', [inputPath, '-o', outputDir], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', function(d) { stdout += d.toString(); });
        child.stderr.on('data', function(d) { stderr += d.toString(); });

        child.on('close', function(code) {
            if (code !== 0) {
                reject(new Error('ncmdump exited with code ' + code + ': ' + (stderr || stdout)));
                return;
            }

            // ncmdump outputs to the same directory with .mp3 or .flac extension
            const baseName = path.basename(inputPath, '.ncm');
            const candidates = [
                path.join(outputDir, baseName + '.mp3'),
                path.join(outputDir, baseName + '.flac')
            ];

            // Also check for files that ncmdump actually created (it may append format)
            let found = null;
            try {
                const files = fs.readdirSync(outputDir);
                for (const f of files) {
                    const full = path.join(outputDir, f);
                    const stat = fs.statSync(full);
                    // Find a recently created file that isn't the original .ncm
                    if (f.endsWith('.mp3') || f.endsWith('.flac')) {
                        if (!found || stat.mtimeMs > fs.statSync(found).mtimeMs) {
                            found = full;
                        }
                    }
                }
            } catch (_) {}

            if (found) {
                resolve(found);
            } else {
                // Fallback: try candidates
                for (const c of candidates) {
                    if (fs.existsSync(c)) { resolve(c); return; }
                }
                reject(new Error('ncmdump 转换后找不到输出文件'));
            }
        });

        child.on('error', function(err) {
            reject(new Error('无法启动 ncmdump: ' + err.message + '。请确认已安装: brew install ncmdump'));
        });

        // Timeout after 60 seconds
        setTimeout(function() {
            child.kill();
            reject(new Error('NCM 转换超时 (60s)'));
        }, 60000);
    });
}

function isNcmFile(filename) {
    return filename && filename.toLowerCase().endsWith('.ncm');
}

function extname(filename) {
    return path.extname(filename || '').toLowerCase();
}

function isNcmdumpInstalled() {
    try {
        var result = spawnSync('ncmdump', ['--version'], { timeout: 5000 });
        return result.status === 0;
    } catch (_) {
        return false;
    }
}

// ---- COS 上传 ----

function uploadToCOS(localPath, remoteKey, bucket, region) {
    return new Promise(function(resolve, reject) {
        const cosClient = getCOS();
        if (!cosClient) {
            reject(new Error('COS 未配置'));
            return;
        }

        const fileSize = fs.statSync(localPath).size;
        const useMultipart = fileSize > 5 * 1024 * 1024; // 5MB 阈值

        if (useMultipart) {
            cosClient.uploadFile({
                Bucket: bucket,
                Region: region,
                Key: remoteKey,
                FilePath: localPath,
                SliceSize: 1024 * 1024 * 5
            }, function(err, data) {
                if (err) reject(err);
                else resolve(data);
            });
        } else {
            cosClient.putObject({
                Bucket: bucket,
                Region: region,
                Key: remoteKey,
                Body: fs.createReadStream(localPath),
                ContentLength: fileSize
            }, function(err, data) {
                if (err) reject(err);
                else resolve(data);
            });
        }
    });
}

// ---- Express 应用 ----

const app = express();
const PORT = parseInt(process.env.UPLOAD_SERVER_PORT || '3001', 10);

// CORS 白名单
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:4176')
    .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// API Key 认证中间件
const API_KEY = process.env.UPLOAD_API_KEY || '';
function timingSafeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function requireApiKey(req, res, next) {
    if (!API_KEY) return next(); // 未配置则跳过（开发环境）
    const provided = req.headers['x-api-key'] || req.query.api_key;
    if (provided && timingSafeCompare(provided, API_KEY)) return next();
    res.status(401).json({ success: false, error: '未授权：缺少或无效的 API Key' });
}

// 健康检查
app.get('/api/health', function(_req, res) {
    res.json({ ok: true });
});

// 文件类型白名单
const ALLOWED_MIMES = [
    'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/x-m4a', 'audio/mp4',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp'
];
const ALLOWED_EXTS = ['.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a', '.ncm', '.jpg', '.jpeg', '.png', '.gif', '.webp'];

// 文件上传
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: function(_req, file, cb) {
        const ext = extname(file.originalname);
        const mimeOk = ALLOWED_MIMES.some(m => file.mimetype.startsWith(m));
        const extOk = ALLOWED_EXTS.includes(ext);
        if (mimeOk || extOk) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件类型: ' + ext + ' (' + file.mimetype + ')'));
        }
    }
});

app.post('/api/upload', requireApiKey, upload.single('file'), async function(req, res) {
    let inputPath = null;
    let convertedPath = null;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '未收到文件' });
        }

        const bucket = process.env.COS_BUCKET;
        const region = process.env.COS_REGION || 'ap-guangzhou';

        if (!bucket) {
            return res.status(500).json({ success: false, error: 'COS Bucket 未配置' });
        }

        const originalName = req.file.originalname;
        let fileToUploadPath = req.file.path;
        let finalExt = extname(originalName);
        let isNcm = isNcmFile(originalName);

        // NCM 转换
        if (isNcm) {
            console.log('[upload-server] 检测到 NCM 文件，开始转换:', originalName);

            // ncmdump 需要 .ncm 扩展名来识别文件，重命名临时文件
            const ncmPath = req.file.path + '.ncm';
            fs.renameSync(req.file.path, ncmPath);
            inputPath = ncmPath;

            const outputDir = path.dirname(ncmPath);
            convertedPath = await convertNcm(ncmPath, outputDir);
            fileToUploadPath = convertedPath;
            finalExt = extname(convertedPath);

            console.log('[upload-server] NCM 转换完成:', convertedPath);
        } else {
            inputPath = req.file.path;
        }

        // 生成 COS Key: music/{timestamp}_{hash}.{ext}
        const ts = Date.now();
        const hash = crypto.createHash('md5').update(originalName + ts).digest('hex').slice(0, 8);
        const cosKey = 'music/' + ts + '_' + hash + finalExt;

        // 上传到 COS
        console.log('[upload-server] 上传到 COS:', cosKey);
        const uploadResult = await uploadToCOS(fileToUploadPath, cosKey, bucket, region);

        const baseUrl = process.env.COS_BASE_URL || ('https://' + bucket + '.cos.' + region + '.myqcloud.com');
        const url = baseUrl.replace(/\/+$/, '') + '/' + cosKey;

        console.log('[upload-server] 上传成功:', url);

        // 从文件名解析 "Artist - Title" 格式
        var displayName = originalName.replace(/\.[^.]+$/, ''); // 去扩展名
        if (isNcm) displayName = displayName.replace(/\.ncm$/i, '');
        var songTitle = displayName;
        var songArtist = '上传音乐';
        var dashIdx = displayName.indexOf(' - ');
        if (dashIdx > 0) {
            songArtist = displayName.substring(0, dashIdx).trim();
            songTitle = displayName.substring(dashIdx + 3).trim();
        }

        res.json({
            success: true,
            url: url,
            cosKey: cosKey,
            title: songTitle,
            artist: songArtist,
            converted: isNcm
        });

    } catch (err) {
        console.error('[upload-server] 上传失败:', err.message);
        res.status(500).json({
            success: false,
            error: err.message
        });
    } finally {
        // 清理临时文件
        try { if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (_) {}
        try { if (convertedPath && convertedPath !== inputPath && fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath); } catch (_) {}
    }
});

// 启动
app.listen(PORT, function() {
    console.log('[upload-server] 音乐上传服务已启动: http://localhost:' + PORT);
    console.log('[upload-server] 端点: POST /api/upload');
    console.log('[upload-server] 健康检查: GET /api/health');
    if (!getCOS()) {
        console.warn('[upload-server] ⚠️  COS 凭证未配置，请复制 server/.env.example 为 server/.env 并填写');
    }
});
