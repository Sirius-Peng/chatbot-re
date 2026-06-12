/**
 * music.js - 音乐播放器
 * Music player with playlist management and NetEase/QQ Music import
 */
'use strict';

(function() {
    /* ===================== 状态 ===================== */

    var _playlists = [];
    var _currentPlaylistId = null;
    var _currentSongIndex = -1;
    var _isPlaying = false;
    var _playMode = 'sequence'; // 'sequence' | 'single' | 'shuffle'

    /* ===================== 工具函数 ===================== */

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function _el(id) {
        return document.getElementById(id);
    }

    /* ===================== 数据持久化 ===================== */

    function _getStorageKey() {
        return (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + 'musicPlaylists';
    }

    function _loadPlaylists() {
        return new Promise(function(resolve) {
            try {
                if (typeof localforage !== 'undefined') {
                    localforage.getItem(_getStorageKey()).then(function(data) {
                        _playlists = (data && Array.isArray(data)) ? data : [];
                        resolve();
                    }).catch(function() {
                        _playlists = [];
                        resolve();
                    });
                } else {
                    _playlists = [];
                    resolve();
                }
            } catch(_e) {
                _playlists = [];
                resolve();
            }
        });
    }

    function _persistPlaylists() {
        try {
            if (typeof localforage !== 'undefined') {
                localforage.setItem(_getStorageKey(), _playlists);
            }
        } catch(_e) { /* ignore */ }
    }

    /* ===================== 歌单管理 ===================== */

    function getPlaylists() {
        return _playlists.slice();
    }

    function addPlaylist(name, songs, source, sourceId, coverUrl) {
        var id = (source || 'custom') + '_' + (sourceId || Date.now().toString(36));
        // 去重
        var existing = _playlists.find(function(p) { return p.id === id; });
        if (existing) {
            existing.songs = songs;
            existing.name = name;
            existing.coverUrl = coverUrl || null;
            existing.updatedAt = Date.now();
            _persistPlaylists();
            return existing;
        }
        var playlist = {
            id: id,
            name: name,
            source: source || 'custom',
            sourceId: sourceId || '',
            coverUrl: coverUrl || null,
            songs: songs || [],
            createdAt: Date.now()
        };
        _playlists.push(playlist);
        _persistPlaylists();
        return playlist;
    }

    function deletePlaylist(id, evt) {
        if (evt && evt.stopPropagation) evt.stopPropagation();

        // 收集该歌单中所有本地音频文件的 audioId
        var playlist = _playlists.find(function(p) { return p.id === id; });
        var audioIds = [];
        if (playlist && playlist.songs) {
            for (var i = 0; i < playlist.songs.length; i++) {
                if (playlist.songs[i].audioId) {
                    audioIds.push(playlist.songs[i].audioId);
                }
            }
        }

        _playlists = _playlists.filter(function(p) { return p.id !== id; });
        if (_currentPlaylistId === id) {
            _currentPlaylistId = null;
            _currentSongIndex = -1;
        }
        _persistPlaylists();
        renderPlaylists();
        renderSongs();
        _updatePlayerUI();

        // 异步清理 Dexie 中的音频数据
        if (audioIds.length > 0) {
            var db = (typeof ChuanXunDB !== 'undefined') ? ChuanXunDB : null;
            if (db && db.audioFiles) {
                db.audioFiles.bulkDelete(audioIds).catch(function(e) {
                    console.warn('清理音频文件失败:', e.message);
                });
            }
        }

        if (typeof showNotification === 'function') {
            showNotification('歌单已删除', 'info');
        }
    }

    function selectPlaylist(id) {
        _currentPlaylistId = id;
        _currentSongIndex = -1;
        renderPlaylists();
        renderSongs();
    }

    /* ===================== NCM 解码器 ===================== */

    // NCM 文件: RC4 解密元数据 + keybox 解密音频流
    // 纯 JavaScript 实现，无需外部依赖

    function _rc4Decrypt(keyBytes, data) {
        var s = new Uint8Array(256);
        for (var i = 0; i < 256; i++) s[i] = i;
        var j = 0;
        for (var i = 0; i < 256; i++) {
            j = (j + s[i] + keyBytes[i % keyBytes.length]) & 0xFF;
            var tmp = s[i]; s[i] = s[j]; s[j] = tmp;
        }
        var out = new Uint8Array(data.length);
        var x = 0, y = 0;
        for (var i = 0; i < data.length; i++) {
            x = (x + 1) & 0xFF;
            y = (y + s[x]) & 0xFF;
            var t = s[x]; s[x] = s[y]; s[y] = t;
            out[i] = data[i] ^ s[(s[x] + s[y]) & 0xFF];
        }
        return out;
    }

    function _ncmKeyboxDecrypt(keyBytes, audioData) {
        // 构建 keybox
        var box = new Uint8Array(256);
        for (var i = 0; i < 256; i++) box[i] = i;
        var j = 0;
        for (var i = 0; i < 256; i++) {
            j = (j + box[i] + keyBytes[i % keyBytes.length]) & 0xFF;
            var t = box[i]; box[i] = box[j]; box[j] = t;
        }

        // 解密音频流
        var out = new Uint8Array(audioData.length);
        var x = 0, y = 0;
        for (var i = 0; i < audioData.length; i++) {
            x = (x + 1) & 0xFF;
            y = (y + box[x]) & 0xFF;
            var t = box[x]; box[x] = box[y]; box[y] = t;
            out[i] = audioData[i] ^ box[(box[x] + box[y]) & 0xFF];
        }
        return out;
    }

    function _decodeNcm(arrayBuffer) {
        var bytes = new Uint8Array(arrayBuffer);

        // 验证文件头 "CTENFDAM"
        if (bytes.length < 14) throw new Error('文件太小，不是有效的 NCM 文件');
        var magic = '';
        for (var i = 0; i < 8; i++) magic += String.fromCharCode(bytes[i]);
        if (magic !== 'CTENFDAM') throw new Error('不是有效的 NCM 文件');

        // 读取元数据长度 (offset 10, 4 bytes LE)
        var metaLen = bytes[10] | (bytes[11] << 8) | (bytes[12] << 16) | (bytes[13] << 24);
        if (14 + metaLen > bytes.length) throw new Error('NCM 文件损坏：元数据长度异常');

        // RC4 解密元数据 JSON
        var rc4Key = [0x68, 0x7A, 0x48, 0x33, 0x6D, 0x53, 0x37, 0x58, 0x6B, 0x39, 0x56, 0x70, 0x32, 0x4C, 0x71, 0x52];
        var encryptedMeta = bytes.slice(14, 14 + metaLen);
        var decryptedMeta = _rc4Decrypt(rc4Key, encryptedMeta);

        // 解析 JSON (跳过末尾可能存在的填充)
        var metaText = new TextDecoder().decode(decryptedMeta);
        // 找到最后一个 '}' 截断可能的脏数据
        var lastBrace = metaText.lastIndexOf('}');
        if (lastBrace >= 0) metaText = metaText.substring(0, lastBrace + 1);
        var meta;
        try {
            meta = JSON.parse(metaText);
        } catch (e) {
            throw new Error('NCM 元数据解析失败');
        }

        if (!meta.key) throw new Error('NCM 文件中未找到解密密钥');

        // Hex key → bytes
        var keyHex = meta.key;
        var keyBytes = new Uint8Array(keyHex.length / 2);
        for (var i = 0; i < keyBytes.length; i++) {
            keyBytes[i] = parseInt(keyHex.substr(i * 2, 2), 16);
        }

        // 跳过 CRC32(4) + gap(5) + imageSize(4) + imageData
        var pos = 14 + metaLen + 4; // 元数据 + CRC32
        pos += 5; // gap
        if (pos + 4 > bytes.length) throw new Error('NCM 文件格式异常');
        var imageSize = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24);
        pos += 4 + imageSize;

        if (pos >= bytes.length) throw new Error('NCM 文件中未找到音频数据');

        // 提取并解密音频数据
        var audioData = bytes.slice(pos);
        var decrypted = _ncmKeyboxDecrypt(keyBytes, audioData);

        // 提取元数据中的歌曲信息
        var title = meta.musicName || '';
        var artist = '';
        if (meta.artist && Array.isArray(meta.artist) && meta.artist.length > 0) {
            // artist 格式: [["周杰伦", 12345], ...]
            var names = [];
            for (var a = 0; a < meta.artist.length; a++) {
                if (Array.isArray(meta.artist[a]) && meta.artist[a].length > 0) {
                    names.push(meta.artist[a][0]);
                }
            }
            artist = names.join(' / ');
        }

        return {
            buffer: decrypted.buffer,
            format: (meta.format === 'flac') ? 'flac' : 'mp3',
            title: title,
            artist: artist
        };
    }

    function _getAudioMimeType(format) {
        var map = {
            'mp3': 'audio/mpeg',
            'flac': 'audio/flac',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'm4a': 'audio/mp4',
            'aac': 'audio/aac',
            'opus': 'audio/opus'
        };
        return map[format] || 'audio/mpeg';
    }

    /* ===================== URL 导入 ===================== */

    function _parseSongUrl(url) {
        if (!url) return null;
        var ncmMatch = url.match(/music\.163\.com.*[?&/#]id=(\d+)/);
        if (ncmMatch) {
            return { source: 'netease', id: ncmMatch[1] };
        }
        return null;
    }

    function _fetchSongInfo(songId) {
        var url = 'https://api.imjad.cn/cloudmusic/?type=song&id=' + songId;
        return fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } })
            .then(function(resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            })
            .then(function(data) {
                var title = '';
                var artist = '';
                if (data && data.data && data.data.length > 0) {
                    var song = data.data[0];
                    title = song.name || '';
                    artist = song.ar ? song.ar.map(function(a) { return a.name; }).join(' / ') : '';
                }
                else if (data && data.songs && data.songs.length > 0) {
                    var s = data.songs[0];
                    title = s.name || '';
                    artist = s.ar ? s.ar.map(function(a) { return a.name; }).join(' / ') : '';
                }
                return { title: title, artist: artist };
            });
    }

    function _autoFillSongInfo() {
        var urlInput = _el('music-import-url');
        if (!urlInput) return;
        var url = urlInput.value.trim();
        var parsed = _parseSongUrl(url);
        if (!parsed) return;

        var titleInput = _el('music-import-title');
        var artistInput = _el('music-import-artist');
        var statusEl = _el('music-import-status-text');

        if (statusEl) {
            statusEl.textContent = '正在获取歌曲信息...';
            statusEl.style.color = 'var(--text-secondary)';
        }

        _fetchSongInfo(parsed.id).then(function(info) {
            if (info.title && titleInput && !titleInput.value) {
                titleInput.value = info.title;
            }
            if (info.artist && artistInput && !artistInput.value) {
                artistInput.value = info.artist;
            }
            if (statusEl) {
                statusEl.textContent = info.title ? '已识别歌曲信息' : '未获取到歌曲信息，请手动填写';
                statusEl.style.color = info.title ? 'var(--accent-color)' : 'var(--text-secondary)';
            }
        }).catch(function() {
            if (statusEl) {
                statusEl.textContent = '无法自动获取，请手动填写歌曲名称和歌手';
                statusEl.style.color = 'var(--text-secondary)';
            }
        });
    }

    function _addSongFromUrl() {
        var urlInput = _el('music-import-url');
        var titleInput = _el('music-import-title');
        var artistInput = _el('music-import-artist');

        var url = urlInput ? urlInput.value.trim() : '';
        if (!url) {
            _setImportStatus('请粘贴歌曲链接', true);
            return;
        }

        var parsed = _parseSongUrl(url);
        if (!parsed) {
            _setImportStatus('无法识别的链接格式', true);
            return;
        }

        var title = titleInput ? titleInput.value.trim() : '';
        var artist = artistInput ? artistInput.value.trim() : '';
        if (!title) title = '未知歌曲';

        var audioUrl = 'https://music.163.com/song/media/outer/url?id=' + parsed.id + '.mp3';

        var playlist = _getCurrentPlaylist();
        if (!playlist) {
            playlist = addPlaylist('我的歌单', [], 'custom', Date.now().toString(36), null);
        }

        playlist.songs.push({
            title: title,
            sub: artist || '---',
            url: audioUrl,
            isCustom: true
        });
        _persistPlaylists();
        selectPlaylist(playlist.id);

        if (urlInput) urlInput.value = '';
        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';

        _setImportStatus('已添加：' + title, false);
        if (typeof showNotification === 'function') {
            showNotification('歌曲已添加', 'info');
        }
    }

    function _setImportStatus(msg, isError) {
        var textEl = _el('music-import-status-text');
        if (textEl) {
            textEl.textContent = msg;
            textEl.style.color = isError ? '#ff4757' : 'var(--accent-color)';
        }
        var progressContainer = _el('music-upload-progress');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }

    function _setImportProgress(percent, statusText) {
        var progressContainer = _el('music-upload-progress');
        var progressBar = _el('music-upload-progress-bar');
        var statusEl = _el('music-import-status');
        var textEl = _el('music-import-status-text');

        if (progressContainer) {
            progressContainer.style.display = (percent > 0 && percent < 100) ? '' : 'none';
        }
        if (progressBar) {
            progressBar.style.width = Math.round(percent) + '%';
        }
        if (textEl) {
            textEl.textContent = statusText;
        }
        if (statusEl) {
            statusEl.style.color = 'var(--text-secondary)';
        }
    }

    /* ===================== 本地文件导入 ===================== */

    function _parseFileName(fileName) {
        // 移除扩展名 (包括 .ncm)
        var name = fileName.replace(/\.(ncm\.)?[^.]+$/i, '');
        var title = name;
        var artist = '';
        var dashIdx = name.indexOf(' - ');
        if (dashIdx > 0) {
            artist = name.substring(0, dashIdx).trim();
            title = name.substring(dashIdx + 3).trim();
        }
        return { title: title, artist: artist };
    }

    function _isNcmFile(file) {
        return file.name.toLowerCase().endsWith('.ncm');
    }

    function _importLocalFiles(files) {
        if (!files || files.length === 0) return;

        var playlist = _getCurrentPlaylist();
        if (!playlist) {
            playlist = addPlaylist('我的歌单', [], 'custom', Date.now().toString(36), null);
        }

        var total = files.length;
        var imported = 0;
        var failed = 0;
        var db = (typeof ChuanXunDB !== 'undefined') ? ChuanXunDB : null;

        _setImportProgress(0, '准备导入 ' + total + ' 个文件...');

        function processNext(index) {
            if (index >= total) {
                _persistPlaylists();
                selectPlaylist(playlist.id);
                var msg = '已导入 ' + imported + ' 首歌曲';
                if (failed > 0) msg += '，' + failed + ' 首失败';
                _setImportProgress(100, msg);
                if (typeof showNotification === 'function') {
                    showNotification(msg, failed > 0 ? 'warning' : 'info');
                }
                return;
            }

            var file = files[index];
            var isNcm = _isNcmFile(file);
            var parsed = _parseFileName(file.name);
            var statusText = '[' + (index + 1) + '/' + total + '] ' +
                (isNcm ? '解码 NCM: ' : '导入: ') + file.name;

            _setImportProgress(Math.round((index / total) * 100), statusText);

            // 读取文件为 ArrayBuffer (非阻塞)
            file.arrayBuffer().then(function(rawBuffer) {
                try {
                    var audioBuffer, format;

                    if (isNcm) {
                        // NCM 解码
                        var decoded = _decodeNcm(rawBuffer);
                        audioBuffer = decoded.buffer;
                        format = decoded.format;
                        // NCM 元数据优先
                        if (decoded.title) parsed.title = decoded.title;
                        if (decoded.artist) parsed.artist = decoded.artist;
                    } else {
                        audioBuffer = rawBuffer;
                        // 从扩展名推断格式
                        var ext = file.name.split('.').pop().toLowerCase();
                        format = ext;
                    }

                    var mimeType = _getAudioMimeType(format);

                    // 存储到 Dexie
                    function saveAndAdd() {
                        var audioEntry = {
                            name: file.name,
                            data: audioBuffer,
                            mimeType: mimeType,
                            size: audioBuffer.byteLength,
                            createdAt: Date.now()
                        };

                        if (db && db.audioFiles) {
                            db.audioFiles.put(audioEntry).then(function(audioId) {
                                playlist.songs.push({
                                    title: parsed.title,
                                    sub: parsed.artist || '本地音乐',
                                    audioId: audioId,
                                    isCustom: true
                                });
                                imported++;
                                // 让出主线程，保证 UI 更新
                                setTimeout(function() { processNext(index + 1); }, 0);
                            }).catch(function(e) {
                                console.error('存储失败:', file.name, e.message);
                                failed++;
                                setTimeout(function() { processNext(index + 1); }, 0);
                            });
                        } else {
                            // 无 Dexie，回退到 base64
                            var reader = new FileReader();
                            reader.onload = function(e) {
                                playlist.songs.push({
                                    title: parsed.title,
                                    sub: parsed.artist || '本地文件',
                                    url: e.target.result,
                                    isCustom: true
                                });
                                imported++;
                                setTimeout(function() { processNext(index + 1); }, 0);
                            };
                            reader.onerror = function() {
                                failed++;
                                setTimeout(function() { processNext(index + 1); }, 0);
                            };
                            reader.readAsDataURL(file);
                        }
                    }

                    saveAndAdd();

                } catch (e) {
                    console.error('导入失败:', file.name, e.message);
                    failed++;
                    setTimeout(function() { processNext(index + 1); }, 0);
                }
            }).catch(function(e) {
                console.error('读取文件失败:', file.name, e.message);
                failed++;
                setTimeout(function() { processNext(index + 1); }, 0);
            });
        }

        processNext(0);
    }

    /* ===================== 悬浮控件 ===================== */

    function _showFloatWidget() {
        var widget = _el('music-float-widget');
        if (widget) widget.style.display = '';
        _updateFloatUI();
    }

    function _updateFloatUI() {
        var widget = _el('music-float-widget');
        if (!widget || widget.style.display === 'none') return;

        var titleEl = _el('music-float-title');
        var subEl = _el('music-float-sub');
        var playBtn = _el('music-float-play');
        var albumEl = _el('music-float-album');
        var toggleBtn = _el('music-float-toggle-btn');

        var playlist = _getCurrentPlaylist();
        var hasSong = playlist && _currentSongIndex >= 0 && playlist.songs[_currentSongIndex];

        if (hasSong) {
            var song = playlist.songs[_currentSongIndex];
            if (titleEl) titleEl.textContent = song.title;
            if (subEl) subEl.textContent = song.sub || '---';
            if (playlist.coverUrl && albumEl) {
                albumEl.style.backgroundImage = 'url(' + playlist.coverUrl + ')';
                albumEl.style.backgroundSize = 'cover';
                albumEl.style.backgroundPosition = 'center';
                albumEl.innerHTML = '';
            } else {
                albumEl.style.backgroundImage = '';
                albumEl.innerHTML = '<i class="fas fa-compact-disc"></i>';
            }
            if (_isPlaying && albumEl) {
                albumEl.classList.add('spinning');
            } else if (albumEl) {
                albumEl.classList.remove('spinning');
            }
            if (toggleBtn) {
                toggleBtn.classList.toggle('playing', _isPlaying);
            }
        }

        if (playBtn) {
            playBtn.innerHTML = '<i class="fas fa-' + (_isPlaying ? 'pause' : 'play') + '"></i>';
        }
    }

    function _collapseFloatWidget() {
        var collapsed = _el('music-float-collapsed');
        var expanded = _el('music-float-expanded');
        if (collapsed) collapsed.style.display = '';
        if (expanded) expanded.style.display = 'none';
    }

    function _expandFloatWidget() {
        var collapsed = _el('music-float-collapsed');
        var expanded = _el('music-float-expanded');
        if (collapsed) collapsed.style.display = 'none';
        if (expanded) expanded.style.display = '';
        _updateFloatUI();
    }

    /* ===================== 播放控制 ===================== */

    function _getAudio() {
        return _el('audio');
    }

    function _getCurrentPlaylist() {
        if (!_currentPlaylistId) return null;
        return _playlists.find(function(p) { return p.id === _currentPlaylistId; }) || null;
    }

    var _currentBlobUrl = null; // 当前播放的本地 Blob URL，用于内存管理

    function playSong(playlistId, songIndex) {
        if (playlistId) {
            _currentPlaylistId = playlistId;
        }
        var playlist = _getCurrentPlaylist();
        if (!playlist || !playlist.songs || playlist.songs.length === 0) return;

        if (songIndex >= playlist.songs.length) songIndex = 0;
        if (songIndex < 0) songIndex = playlist.songs.length - 1;
        _currentSongIndex = songIndex;

        var song = playlist.songs[_currentSongIndex];
        var audio = _getAudio();
        if (!audio) return;

        function doPlay() {
            audio.play().then(function() {
                _isPlaying = true;
                _updatePlayerUI();
                _updateDesktopBar();
                renderSongs();
            }).catch(function(e) {
                console.error('播放失败:', e);
                _isPlaying = false;
                _updatePlayerUI();
                if (typeof showNotification === 'function') {
                    showNotification('播放失败，请尝试其他歌曲', 'warning');
                }
            });
        }

        // 本地文件: 从 Dexie 读取 ArrayBuffer → Blob URL
        if (song.audioId) {
            var db = (typeof ChuanXunDB !== 'undefined') ? ChuanXunDB : null;
            if (db && db.audioFiles) {
                db.audioFiles.get(song.audioId).then(function(record) {
                    if (record && record.data) {
                        // 释放旧的 Blob URL
                        if (_currentBlobUrl) {
                            URL.revokeObjectURL(_currentBlobUrl);
                            _currentBlobUrl = null;
                        }
                        var blob = new Blob([record.data], { type: record.mimeType || 'audio/mpeg' });
                        _currentBlobUrl = URL.createObjectURL(blob);
                        audio.src = _currentBlobUrl;
                        doPlay();
                    } else {
                        console.error('音频数据不存在: audioId=' + song.audioId);
                        if (typeof showNotification === 'function') {
                            showNotification('音频文件丢失，请重新导入', 'warning');
                        }
                    }
                }).catch(function(e) {
                    console.error('读取音频失败:', e);
                    if (typeof showNotification === 'function') {
                        showNotification('读取音频失败', 'warning');
                    }
                });
                return;
            }
        }

        // 远程 URL: 直接播放
        audio.src = song.url || '';
        doPlay();
    }

    function togglePlay() {
        var playlist = _getCurrentPlaylist();
        if (!playlist || playlist.songs.length === 0) {
            if (typeof showNotification === 'function') {
                showNotification('请先选择歌单', 'warning');
            }
            return;
        }

        var audio = _getAudio();
        if (!audio) return;

        if (_isPlaying) {
            audio.pause();
            _isPlaying = false;
        } else {
            if (_currentSongIndex < 0) {
                playSong(null, 0);
                return;
            }
            audio.play().then(function() {
                _isPlaying = true;
            }).catch(function() {
                _isPlaying = false;
            });
        }
        _updatePlayerUI();
        _updateDesktopBar();
    }

    function nextSong() {
        var playlist = _getCurrentPlaylist();
        if (!playlist || playlist.songs.length === 0) return;

        var nextIdx;
        if (_playMode === 'shuffle') {
            nextIdx = Math.floor(Math.random() * playlist.songs.length);
        } else {
            nextIdx = _currentSongIndex + 1;
            if (nextIdx >= playlist.songs.length) nextIdx = 0;
        }
        playSong(null, nextIdx);
    }

    function prevSong() {
        var playlist = _getCurrentPlaylist();
        if (!playlist || playlist.songs.length === 0) return;

        var prevIdx;
        if (_playMode === 'shuffle') {
            prevIdx = Math.floor(Math.random() * playlist.songs.length);
        } else {
            prevIdx = _currentSongIndex - 1;
            if (prevIdx < 0) prevIdx = playlist.songs.length - 1;
        }
        playSong(null, prevIdx);
    }

    function setPlayMode(mode) {
        _playMode = mode;
        _updatePlayModeUI();
    }

    function _updatePlayerUI() {
        // Modal 迷你播放器
        var titleEl = _el('music-modal-title');
        var subEl = _el('music-modal-sub');
        var playBtn = _el('music-modal-play');
        var albumEl = _el('music-modal-album');

        if (titleEl) titleEl.textContent = '未选择歌曲';
        if (subEl) subEl.textContent = '---';
        if (albumEl) {
            albumEl.innerHTML = '<i class="fas fa-compact-disc"></i>';
            albumEl.style.backgroundImage = '';
        }

        var playlist = _getCurrentPlaylist();
        if (playlist && _currentSongIndex >= 0 && playlist.songs[_currentSongIndex]) {
            var song = playlist.songs[_currentSongIndex];
            if (titleEl) titleEl.textContent = song.title;
            if (subEl) subEl.textContent = song.sub || '---';

            // 歌单封面
            if (playlist.coverUrl && albumEl) {
                albumEl.style.backgroundImage = 'url(' + playlist.coverUrl + ')';
                albumEl.style.backgroundSize = 'cover';
                albumEl.style.backgroundPosition = 'center';
                albumEl.innerHTML = '';
            }
        }

        if (playBtn) {
            playBtn.innerHTML = '<i class="fas fa-' + (_isPlaying ? 'pause' : 'play') + '"></i>';
        }
    }

    function _updateDesktopBar() {
        var desktopTitle = _el('desktop-music-title');
        var desktopArtist = _el('desktop-music-artist');
        var desktopPlay = _el('desktop-music-play');
        var desktopAlbum = _el('desktop-music-album');

        if (!desktopTitle || !desktopArtist) return;

        var playlist = _getCurrentPlaylist();
        if (playlist && _currentSongIndex >= 0 && playlist.songs[_currentSongIndex]) {
            var song = playlist.songs[_currentSongIndex];
            desktopTitle.textContent = song.title;
            desktopArtist.textContent = song.sub || '---';
            if (desktopPlay) {
                desktopPlay.innerHTML = '<i class="fas fa-' + (_isPlaying ? 'pause' : 'play') + '"></i>';
            }
            // 专辑封面
            if (desktopAlbum && playlist.coverUrl) {
                desktopAlbum.style.backgroundImage = 'url(' + playlist.coverUrl + ')';
                desktopAlbum.style.backgroundSize = 'cover';
                desktopAlbum.style.backgroundPosition = 'center';
                desktopAlbum.innerHTML = '';
            }
            // 播放动画
            if (desktopAlbum) {
                desktopAlbum.classList.toggle('playing', _isPlaying);
            }
        } else {
            desktopTitle.textContent = '未在播放';
            desktopArtist.textContent = '点击播放音乐';
            if (desktopPlay) desktopPlay.innerHTML = '<i class="fas fa-play"></i>';
            if (desktopAlbum) {
                desktopAlbum.style.backgroundImage = '';
                desktopAlbum.innerHTML = '';
                desktopAlbum.classList.remove('playing');
            }
        }
    }

    function _updatePlayModeUI() {
        var modeBtn = _el('music-play-mode');
        if (!modeBtn) return;
        // fa-repeat-1 在 FA6 Free 中不可用，用 sup 数字 1 叠加 fa-repeat 替代
        var icons = {
            sequence: '<i class="fas fa-repeat"></i>',
            single: '<span style="position:relative;display:inline-block;">' +
                    '<i class="fas fa-repeat"></i>' +
                    '<sup style="position:absolute;top:-4px;right:-6px;font-size:9px;font-weight:700;">1</sup>' +
                    '</span>',
            shuffle: '<i class="fas fa-shuffle"></i>'
        };
        var labels = { sequence: '列表循环', single: '单曲循环', shuffle: '随机播放' };
        modeBtn.innerHTML = (icons[_playMode] || icons.sequence) +
            ' <span style="font-size:10px;">' + (labels[_playMode] || '列表循环') + '</span>';
        modeBtn.title = '';
    }

    function _togglePlayMode() {
        var modes = ['sequence', 'single', 'shuffle'];
        var idx = modes.indexOf(_playMode);
        setPlayMode(modes[(idx + 1) % modes.length]);
    }

    /* ===================== 渲染 ===================== */

    function renderPlaylists() {
        var container = _el('music-playlist-selector');
        if (!container) return;

        if (_playlists.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:13px;">' +
                '<i class="fas fa-music" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3;"></i>' +
                '还没有歌单<br><span style="font-size:11px;">切换至「导入」标签导入歌单</span>' +
                '</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < _playlists.length; i++) {
            var p = _playlists[i];
            var isActive = p.id === _currentPlaylistId;
            html += '<div class="music-playlist-card' + (isActive ? ' active' : '') +
                '" data-playlist-id="' + p.id + '">' +
                '<div class="music-playlist-card-cover"' +
                (p.coverUrl ? ' style="background-image:url(' + p.coverUrl + ');background-size:cover;background-position:center;"' : '') +
                '>' +
                (!p.coverUrl ? '<i class="fas fa-' + (p.source === 'netease' ? 'music' : 'list') + '"></i>' : '') +
                '</div>' +
                '<div class="music-playlist-card-info">' +
                '<div class="music-playlist-card-name">' + escapeHtml(p.name) + '</div>' +
                '<div class="music-playlist-card-count">' + p.songs.length + ' 首 · ' +
                (p.source === 'netease' ? '网易云' : p.source === 'qqmusic' ? 'QQ音乐' : '自定义') +
                '</div>' +
                '</div>' +
                '<button class="music-playlist-card-delete" data-delete-playlist="' + p.id + '" title="删除">' +
                '<i class="fas fa-trash-alt"></i>' +
                '</button>' +
                '</div>';
        }
        container.innerHTML = html;
    }

    function renderSongs() {
        var container = _el('music-song-list');
        if (!container) return;

        var playlist = _getCurrentPlaylist();
        if (!playlist || playlist.songs.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:13px;">' +
                '选择一个歌单以查看歌曲</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < playlist.songs.length; i++) {
            var song = playlist.songs[i];
            var isActive = i === _currentSongIndex;
            html += '<div class="music-song-item' + (isActive ? ' active' : '') +
                '" data-song-index="' + i + '">' +
                '<div class="music-song-index">' +
                (isActive && _isPlaying ? '<i class="fas fa-volume-high" style="color:var(--accent-color);"></i>' : (i + 1)) +
                '</div>' +
                '<div class="music-song-info">' +
                '<div class="music-song-title' + (isActive ? ' active' : '') + '">' + escapeHtml(song.title) + '</div>' +
                '<div class="music-song-sub">' + escapeHtml(song.sub || '---') + '</div>' +
                '</div>' +
                '</div>';
        }
        container.innerHTML = html;
    }

    /* ===================== 弹窗 ===================== */

    function openModal() {
        var modal = _el('music-modal');
        if (!modal) return;

        _loadPlaylists().then(function() {
            _switchTab('playlists');
            renderPlaylists();
            renderSongs();
            _updatePlayerUI();
            if (typeof showModal === 'function') showModal(modal);
        });
    }

    function closeModal() {
        var modal = _el('music-modal');
        if (!modal) return;
        if (typeof hideModal === 'function') hideModal(modal);
    }

    function _switchTab(tabName) {
        var tabPlaylists = _el('music-tab-playlists');
        var tabImport = _el('music-tab-import');
        var btnPlaylists = _el('music-tab-btn-playlists');
        var btnImport = _el('music-tab-btn-import');

        if (tabPlaylists) tabPlaylists.style.display = tabName === 'playlists' ? '' : 'none';
        if (tabImport) tabImport.style.display = tabName === 'import' ? '' : 'none';

        if (btnPlaylists) {
            btnPlaylists.classList.toggle('active', tabName === 'playlists');
        }
        if (btnImport) {
            btnImport.classList.toggle('active', tabName === 'import');
        }

        if (tabName === 'import') {
            var input = _el('music-import-url');
            if (input) setTimeout(function() { input.focus(); }, 300);
        }
    }

    /* ===================== 事件绑定 ===================== */

    function init() {
        _loadPlaylists().then(function() {
            // 标签切换
            var btnPlaylists = _el('music-tab-btn-playlists');
            var btnImport = _el('music-tab-btn-import');
            if (btnPlaylists && !btnPlaylists._musicInited) {
                btnPlaylists._musicInited = true;
                btnPlaylists.addEventListener('click', function() { _switchTab('playlists'); });
            }
            if (btnImport && !btnImport._musicInited) {
                btnImport._musicInited = true;
                btnImport.addEventListener('click', function() { _switchTab('import'); });
            }

            // 关闭按钮
            var closeBtn = _el('close-music');
            if (closeBtn && !closeBtn._musicInited) {
                closeBtn._musicInited = true;
                closeBtn.addEventListener('click', closeModal);
            }

            // 导入按钮
            var importBtn = _el('music-import-btn');
            if (importBtn && !importBtn._musicInited) {
                importBtn._musicInited = true;
                importBtn.addEventListener('click', function() {
                    _addSongFromUrl();
                });
            }

            // 导入输入框回车
            var importInput = _el('music-import-url');
            if (importInput && !importInput._musicInited) {
                importInput._musicInited = true;
                importInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        _addSongFromUrl();
                    }
                });
                // 粘贴或失去焦点时自动获取歌曲信息
                importInput.addEventListener('paste', function() {
                    setTimeout(_autoFillSongInfo, 100);
                });
                importInput.addEventListener('blur', function() {
                    _autoFillSongInfo();
                });
            }

            // 歌单选择器 - 事件委托
            var playlistSelector = _el('music-playlist-selector');
            if (playlistSelector && !playlistSelector._musicInited) {
                playlistSelector._musicInited = true;
                playlistSelector.addEventListener('click', function(e) {
                    var deleteBtn = e.target.closest('[data-delete-playlist]');
                    if (deleteBtn) {
                        deletePlaylist(deleteBtn.getAttribute('data-delete-playlist'), e);
                        return;
                    }
                    var card = e.target.closest('.music-playlist-card');
                    if (card) {
                        selectPlaylist(card.getAttribute('data-playlist-id'));
                    }
                });
            }

            // 歌曲列表 - 事件委托
            var songList = _el('music-song-list');
            if (songList && !songList._musicInited) {
                songList._musicInited = true;
                songList.addEventListener('click', function(e) {
                    var item = e.target.closest('.music-song-item');
                    if (!item) return;
                    var idx = parseInt(item.getAttribute('data-song-index'));
                    if (!isNaN(idx)) playSong(null, idx);
                });
            }

            // 播放控制按钮
            var prevBtn = _el('music-modal-prev');
            var playBtn = _el('music-modal-play');
            var nextBtn = _el('music-modal-next');
            var modeBtn = _el('music-play-mode');

            if (prevBtn && !prevBtn._musicInited) {
                prevBtn._musicInited = true;
                prevBtn.addEventListener('click', prevSong);
            }
            if (playBtn && !playBtn._musicInited) {
                playBtn._musicInited = true;
                playBtn.addEventListener('click', togglePlay);
            }
            if (nextBtn && !nextBtn._musicInited) {
                nextBtn._musicInited = true;
                nextBtn.addEventListener('click', nextSong);
            }
            if (modeBtn && !modeBtn._musicInited) {
                modeBtn._musicInited = true;
                modeBtn.addEventListener('click', _togglePlayMode);
            }

            // Audio 事件
            var audio = _getAudio();
            if (audio && !audio._musicInited) {
                audio._musicInited = true;
                audio.addEventListener('ended', function() {
                    if (_playMode === 'single') {
                        audio.currentTime = 0;
                        audio.play().catch(function() {});
                    } else {
                        nextSong();
                    }
                });
                audio.addEventListener('play', function() {
                    _isPlaying = true;
                    _updatePlayerUI();
                    _updateDesktopBar();
                    _updateFloatUI();
                    _showFloatWidget();
                    renderSongs();
                });
                audio.addEventListener('pause', function() {
                    _isPlaying = false;
                    _updatePlayerUI();
                    _updateDesktopBar();
                    _updateFloatUI();
                    renderSongs();
                });
                audio.addEventListener('error', function() {
                    _isPlaying = false;
                    _updatePlayerUI();
                    _updateDesktopBar();
                    _updateFloatUI();
                    if (typeof showNotification === 'function') {
                        showNotification('歌曲加载失败', 'warning');
                    }
                });
            }

            // 桌面音乐栏按钮
            var desktopPrev = _el('desktop-music-prev');
            var desktopPlay = _el('desktop-music-play');
            var desktopNext = _el('desktop-music-next');

            if (desktopPrev && !desktopPrev._musicInited) {
                desktopPrev._musicInited = true;
                desktopPrev.addEventListener('click', function(e) {
                    e.stopPropagation();
                    prevSong();
                });
            }
            if (desktopPlay && !desktopPlay._musicInited) {
                desktopPlay._musicInited = true;
                desktopPlay.addEventListener('click', function(e) {
                    e.stopPropagation();
                    togglePlay();
                });
            }
            if (desktopNext && !desktopNext._musicInited) {
                desktopNext._musicInited = true;
                desktopNext.addEventListener('click', function(e) {
                    e.stopPropagation();
                    nextSong();
                });
            }

            // 本地文件导入
            var localFileBtn = _el('music-local-file-btn');
            var localFileInput = _el('music-local-file-input');
            if (localFileBtn && localFileInput && !localFileBtn._musicInited) {
                localFileBtn._musicInited = true;
                localFileBtn.addEventListener('click', function() {
                    localFileInput.click();
                });
                localFileInput.addEventListener('change', function() {
                    if (localFileInput.files && localFileInput.files.length > 0) {
                        _importLocalFiles(localFileInput.files);
                        localFileInput.value = '';
                    }
                });
            }

            // 悬浮控件
            var floatToggle = _el('music-float-toggle');
            var floatCollapse = _el('music-float-collapse');
            var floatPrev = _el('music-float-prev');
            var floatPlay = _el('music-float-play');
            var floatNext = _el('music-float-next');
            var floatInfo = _el('music-float-info');

            if (floatToggle && !floatToggle._musicInited) {
                floatToggle._musicInited = true;
                floatToggle.addEventListener('click', _expandFloatWidget);
            }
            if (floatCollapse && !floatCollapse._musicInited) {
                floatCollapse._musicInited = true;
                floatCollapse.addEventListener('click', _collapseFloatWidget);
            }
            if (floatPrev && !floatPrev._musicInited) {
                floatPrev._musicInited = true;
                floatPrev.addEventListener('click', prevSong);
            }
            if (floatPlay && !floatPlay._musicInited) {
                floatPlay._musicInited = true;
                floatPlay.addEventListener('click', togglePlay);
            }
            if (floatNext && !floatNext._musicInited) {
                floatNext._musicInited = true;
                floatNext.addEventListener('click', nextSong);
            }
            if (floatInfo && !floatInfo._musicInited) {
                floatInfo._musicInited = true;
                floatInfo.addEventListener('click', function() {
                    openModal();
                });
            }

            _updatePlayModeUI();
        });
    }

    /* ===================== 暴露全局 API ===================== */

    window.MusicModule = {
        openModal: openModal,
        closeModal: closeModal,
        importSong: _addSongFromUrl,
        addPlaylist: addPlaylist,
        deletePlaylist: deletePlaylist,
        getPlaylists: getPlaylists,
        selectPlaylist: selectPlaylist,
        playSong: playSong,
        togglePlay: togglePlay,
        nextSong: nextSong,
        prevSong: prevSong,
        setPlayMode: setPlayMode,
        isPlaying: function() { return _isPlaying; },
        getCurrentSong: function() {
            var playlist = _getCurrentPlaylist();
            if (playlist && _currentSongIndex >= 0 && playlist.songs[_currentSongIndex]) {
                return {
                    title: playlist.songs[_currentSongIndex].title,
                    artist: playlist.songs[_currentSongIndex].sub || '',
                    coverUrl: playlist.coverUrl || null
                };
            }
            return null;
        },
        syncDesktopBar: _updateDesktopBar
    };

    /* ===================== 自初始化 ===================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { init(); });
    } else {
        init();
    }

})();
