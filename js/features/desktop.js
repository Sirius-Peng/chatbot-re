/**
 * desktop.js - 手机桌面页面
 * Phone Desktop Page: status bar, love counter, photo, music bar, customizable cards
 */
'use strict';

(function() {
    var STORAGE_KEY = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + 'desktopData';

    var desktopData = {
        photoUrl: '',
        cards: {
            1: { title: '纪念日', subtitle: '记录重要时刻', icon: 'fas fa-calendar-heart' },
            2: { title: '心晴手账', subtitle: '记录每日心情', icon: 'fas fa-book-open' },
            3: { title: '信箱', subtitle: '查看往来信件', icon: 'fas fa-envelope' }
        }
    };

    var editingCardId = null;

    /* ========== 初始化 ========== */
    async function initDesktopData() {
        try {
            if (window.localforage) {
                var saved = await localforage.getItem(STORAGE_KEY);
                if (saved && typeof saved === 'object') {
                    if (saved.photoUrl) desktopData.photoUrl = saved.photoUrl;
                    if (saved.cards) {
                        for (var k in saved.cards) {
                            if (desktopData.cards[k]) {
                                desktopData.cards[k] = saved.cards[k];
                            }
                        }
                    }
                }
            }
        } catch(e) {
            console.warn('[desktop] 加载桌面数据失败:', e);
        }
    }

    async function saveDesktopData() {
        try {
            if (window.localforage) {
                await localforage.setItem(STORAGE_KEY, desktopData);
            }
        } catch(e) {
            console.warn('[desktop] 保存桌面数据失败:', e);
        }
    }

    /* ========== 状态栏时钟 ========== */
    function updateStatusBar() {
        var now = new Date();
        var hours = String(now.getHours()).padStart(2, '0');
        var minutes = String(now.getMinutes()).padStart(2, '0');
        var timeEl = document.getElementById('desktop-time');
        if (timeEl) timeEl.textContent = hours + ':' + minutes;

        // 模拟电量 (随机在 85-100 之间)
        var batteryEl = document.getElementById('desktop-battery-text');
        if (batteryEl && !batteryEl.dataset.set) {
            batteryEl.textContent = String(Math.floor(Math.random() * 16 + 85)) + '%';
            batteryEl.dataset.set = '1';
        }
    }

    /* ========== 相恋时间计算 ========== */
    function updateLoveCounter() {
        var daysEl = document.getElementById('desktop-love-days');
        var sinceEl = document.getElementById('desktop-love-since');
        if (!daysEl) return;

        var earliestDate = null;

        // 从全局 anniversaries 数组中取最早的日期
        if (typeof anniversaries !== 'undefined' && Array.isArray(anniversaries) && anniversaries.length > 0) {
            for (var i = 0; i < anniversaries.length; i++) {
                var d = anniversaries[i].date;
                if (d) {
                    var parsed = new Date(d);
                    if (!isNaN(parsed.getTime())) {
                        if (!earliestDate || parsed < earliestDate) {
                            earliestDate = parsed;
                        }
                    }
                }
            }
        }

        if (earliestDate) {
            var now = new Date();
            var diffMs = now.getTime() - earliestDate.getTime();
            var days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            daysEl.textContent = days >= 0 ? String(days) : '--';
            if (sinceEl && days >= 0) {
                var dateStr = earliestDate.getFullYear() + '/' +
                    String(earliestDate.getMonth() + 1).padStart(2, '0') + '/' +
                    String(earliestDate.getDate()).padStart(2, '0');
                sinceEl.textContent = '从 ' + dateStr + ' 起';
            }
        } else {
            daysEl.textContent = '--';
            if (sinceEl) sinceEl.textContent = '从遇见你的那天起';
        }
    }

    /* ========== 照片窗口 ========== */
    function updatePhotoFrame() {
        var placeholder = document.getElementById('desktop-photo-placeholder');
        var img = document.getElementById('desktop-photo-img');
        if (!placeholder || !img) return;

        if (desktopData.photoUrl) {
            img.src = desktopData.photoUrl;
            img.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            img.style.display = 'none';
            img.src = '';
            placeholder.style.display = 'flex';
        }
    }

    function handlePhotoClick() {
        var input = document.getElementById('desktop-photo-input');
        if (input) input.click();
    }

    function handlePhotoUpload(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;

        if (file.size > 4 * 1024 * 1024) {
            if (typeof showNotification === 'function') {
                showNotification('图片不能超过 4MB', 'warning');
            }
            e.target.value = '';
            return;
        }

        var reader = new FileReader();
        reader.onload = function(ev) {
            desktopData.photoUrl = ev.target.result;
            updatePhotoFrame();
            saveDesktopData();
        };
        reader.onerror = function() {
            if (typeof showNotification === 'function') {
                showNotification('图片读取失败', 'warning');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    /* ========== 音乐播放条 ========== */

    /** 从全局 MusicModule 同步歌曲信息到桌面音乐栏 */
    function syncMusicBar() {
        if (typeof window.MusicModule === 'undefined') return;

        var titleEl = document.getElementById('desktop-music-title');
        var artistEl = document.getElementById('desktop-music-artist');
        var playBtnEl = document.getElementById('desktop-music-play');
        var albumEl = document.getElementById('desktop-music-album');

        if (!titleEl || !artistEl || !playBtnEl) return;

        var playing = window.MusicModule.isPlaying && window.MusicModule.isPlaying();
        var song = window.MusicModule.getCurrentSong && window.MusicModule.getCurrentSong();

        if (song) {
            titleEl.textContent = song.title;
            artistEl.textContent = song.artist || '---';
            playBtnEl.innerHTML = '<i class="fas fa-' + (playing ? 'pause' : 'play') + '"></i>';
            if (albumEl && song.coverUrl) {
                albumEl.style.backgroundImage = 'url(' + song.coverUrl + ')';
                albumEl.style.backgroundSize = 'cover';
                albumEl.style.backgroundPosition = 'center';
                albumEl.innerHTML = '';
            }
            if (albumEl) {
                albumEl.classList.toggle('playing', playing);
            }
        } else {
            titleEl.textContent = '未在播放';
            artistEl.textContent = '点击播放音乐';
            playBtnEl.innerHTML = '<i class="fas fa-play"></i>';
            if (albumEl) {
                albumEl.style.backgroundImage = '';
                albumEl.innerHTML = '';
                albumEl.classList.remove('playing');
            }
        }
    }

    /* ========== 自定义卡片 ========== */
    function renderCards() {
        for (var i = 1; i <= 3; i++) {
            var card = desktopData.cards[i];
            if (!card) continue;

            var iconEl = document.getElementById('desktop-card-icon-' + i);
            var titleEl = document.getElementById('desktop-card-title-' + i);
            var subtitleEl = document.getElementById('desktop-card-subtitle-' + i);

            if (iconEl) {
                iconEl.innerHTML = '<i class="' + (card.icon || 'fas fa-star') + '"></i>';
            }
            if (titleEl) titleEl.textContent = card.title || '';
            if (subtitleEl) subtitleEl.textContent = card.subtitle || '';
        }
    }

    function openCardEditor(cardId) {
        editingCardId = cardId;
        var card = desktopData.cards[cardId];
        if (!card) return;

        var editor = document.getElementById('desktop-card-editor');
        var titleInput = document.getElementById('desktop-card-editor-title-input');
        var subtitleInput = document.getElementById('desktop-card-editor-subtitle-input');
        var iconInput = document.getElementById('desktop-card-editor-icon-input');

        if (!editor || !titleInput || !subtitleInput || !iconInput) return;

        titleInput.value = card.title || '';
        subtitleInput.value = card.subtitle || '';
        iconInput.value = card.icon || '';
        editor.style.display = 'flex';
    }

    function closeCardEditor() {
        var editor = document.getElementById('desktop-card-editor');
        if (editor) editor.style.display = 'none';
        editingCardId = null;
    }

    function saveCard() {
        if (!editingCardId) return;

        var titleInput = document.getElementById('desktop-card-editor-title-input');
        var subtitleInput = document.getElementById('desktop-card-editor-subtitle-input');
        var iconInput = document.getElementById('desktop-card-editor-icon-input');

        var card = desktopData.cards[editingCardId];
        if (card && titleInput && subtitleInput && iconInput) {
            card.title = titleInput.value.trim() || card.title;
            card.subtitle = subtitleInput.value.trim() || card.subtitle;
            card.icon = iconInput.value.trim() || card.icon;
        }

        closeCardEditor();
        renderCards();
        saveDesktopData();
    }

    function handleCardClick(cardId) {
        // 先关闭桌面页面(z-index:4000)，否则模态框(z-index:2000)会显示在桌面页面后面
        closeDesktopPage();

        // 等待桌面页面退出动画完成(400ms)，再打开对应模态框
        setTimeout(function() {
            switch(cardId) {
                case 1:
                    // 纪念日 → 打开纪念日弹窗
                    var annModal = document.getElementById('anniversary-modal');
                    if (annModal && typeof showModal === 'function') {
                        showModal(annModal);
                    }
                    break;
                case 2:
                    // 心晴手账 → 渲染日历并打开情绪日记弹窗
                    if (typeof renderMoodCalendar === 'function') {
                        renderMoodCalendar();
                    }
                    var moodModal = document.getElementById('mood-modal');
                    if (moodModal && typeof showModal === 'function') {
                        showModal(moodModal);
                    }
                    break;
                case 3:
                    // 信箱 → 触发信封头按钮(已绑定完整的 openEnvelopeModal 逻辑)
                    var envBtn = document.getElementById('envelope-header-btn');
                    if (envBtn) envBtn.click();
                    break;
                default:
                    break;
            }
        }, 420);
    }

    function handleCardLongPress(cardId) {
        // 长按: 打开编辑器
        openCardEditor(cardId);
    }

    /* ========== 页面切换 ========== */
    function openDesktopPage() {
        var page = document.getElementById('desktop-page');
        if (!page) return;

        updateStatusBar();
        updateLoveCounter();
        updatePhotoFrame();
        renderCards();
        syncMusicBar();

        page.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 启动状态栏时钟更新
        if (!window._desktopClockInterval) {
            window._desktopClockInterval = setInterval(updateStatusBar, 30000);
        }
    }

    function closeDesktopPage() {
        var page = document.getElementById('desktop-page');
        if (!page) return;

        page.classList.remove('active');
        document.body.style.overflow = '';

        // 停止轮询
        if (window._desktopClockInterval) {
            clearInterval(window._desktopClockInterval);
            window._desktopClockInterval = null;
        }
    }

    /* ========== 事件绑定 ========== */
    function bindEvents() {
        // 退出按钮
        var exitBtn = document.getElementById('desktop-exit-btn');
        if (exitBtn && !exitBtn._bound) {
            exitBtn._bound = true;
            exitBtn.addEventListener('click', closeDesktopPage);
        }

        // 照片点击
        var photoFrame = document.getElementById('desktop-photo-frame');
        if (photoFrame && !photoFrame._bound) {
            photoFrame._bound = true;
            photoFrame.addEventListener('click', handlePhotoClick);
        }

        // 照片上传
        var photoInput = document.getElementById('desktop-photo-input');
        if (photoInput && !photoInput._bound) {
            photoInput._bound = true;
            photoInput.addEventListener('change', handlePhotoUpload);
        }

        // 音乐控制按钮由 music.js 统一绑定，此处仅做初始同步
        // music.js 的 _updateDesktopBar 会在每次播放状态变化时更新桌面栏

        // 卡片点击与长按
        var longPressTimers = {};
        for (var i = 1; i <= 3; i++) {
            (function(cardId) {
                var cardEl = document.getElementById('desktop-card-' + cardId);
                if (!cardEl || cardEl._bound) return;
                cardEl._bound = true;

                cardEl.addEventListener('click', function() {
                    // 如果刚从长按回来，跳过单击
                    if (cardEl._skipClick) {
                        cardEl._skipClick = false;
                        return;
                    }
                    handleCardClick(cardId);
                });

                cardEl.addEventListener('mousedown', function() {
                    longPressTimers[cardId] = setTimeout(function() {
                        cardEl._skipClick = true;
                        handleCardLongPress(cardId);
                    }, 600);
                });

                cardEl.addEventListener('mouseup', function() {
                    clearTimeout(longPressTimers[cardId]);
                });
                cardEl.addEventListener('mouseleave', function() {
                    clearTimeout(longPressTimers[cardId]);
                });
                cardEl.addEventListener('touchstart', function() {
                    longPressTimers[cardId] = setTimeout(function() {
                        cardEl._skipClick = true;
                        handleCardLongPress(cardId);
                    }, 600);
                }, { passive: true });
                cardEl.addEventListener('touchend', function() {
                    clearTimeout(longPressTimers[cardId]);
                });
                cardEl.addEventListener('touchmove', function() {
                    clearTimeout(longPressTimers[cardId]);
                });
            })(i);
        }

        // 卡片编辑器按钮
        var editorCancel = document.getElementById('desktop-card-editor-cancel');
        if (editorCancel && !editorCancel._bound) {
            editorCancel._bound = true;
            editorCancel.addEventListener('click', closeCardEditor);
        }
        var editorSave = document.getElementById('desktop-card-editor-save');
        if (editorSave && !editorSave._bound) {
            editorSave._bound = true;
            editorSave.addEventListener('click', saveCard);
        }

        // 关闭编辑器 - 点击遮罩
        var editorOverlay = document.querySelector('.desktop-card-editor-overlay');
        if (editorOverlay && !editorOverlay._bound) {
            editorOverlay._bound = true;
            editorOverlay.addEventListener('click', closeCardEditor);
        }
    }

    /* ========== 暴露全局 API ========== */
    window.openDesktopPage = openDesktopPage;
    window.closeDesktopPage = closeDesktopPage;
    window.getDesktopData = function() { return desktopData; };

    /* ========== 初始化 ========== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initDesktopData().then(function() {
                bindEvents();
                updateStatusBar();
                updateLoveCounter();
                updatePhotoFrame();
                renderCards();
            });
        });
    } else {
        initDesktopData().then(function() {
            bindEvents();
            updateStatusBar();
            updateLoveCounter();
            updatePhotoFrame();
            renderCards();
        });
    }
})();
