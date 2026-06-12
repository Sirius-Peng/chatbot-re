/**
 * chat-search.js - 聊天记录搜索页面 (全屏)
 * Fullscreen chat history search page, like WeChat's search
 */
'use strict';

(function() {
    var searchTimer = null;
    var SEARCH_DEBOUNCE = 250;

    /* ===================== 工具函数 ===================== */

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /** 高亮关键词 */
    function highlightKeyword(text, keyword) {
        if (!keyword || !text) return escapeHtml(text);
        var escaped = escapeRegex(keyword.trim());
        return escapeHtml(text).replace(
            new RegExp('(' + escaped + ')', 'gi'),
            '<mark>$1</mark>'
        );
    }

    /** 格式化时间 */
    function formatTime(ts) {
        if (!(ts instanceof Date)) ts = new Date(ts);
        var now = new Date();
        var month = ts.getMonth() + 1;
        var day = ts.getDate();
        var dateStr = month + '/' + day;

        // 同年才显示年份
        if (ts.getFullYear() !== now.getFullYear()) {
            dateStr = ts.getFullYear() + '/' + dateStr;
        }

        var hours = String(ts.getHours()).padStart(2, '0');
        var minutes = String(ts.getMinutes()).padStart(2, '0');
        return dateStr + ' ' + hours + ':' + minutes;
    }

    /** 获取发送者显示名 */
    function getSenderName(sender) {
        if (sender === 'user') {
            return (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
        }
        return (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : (sender || '对方');
    }

    /** 获取发送者头像字母 */
    function getSenderInitial(sender) {
        return getSenderName(sender).charAt(0);
    }

    /** 确保消息在当前 DOM 中，并保留上下文（不隐藏其他记录） */
    function ensureMessageLoaded(msgId) {
        if (document.querySelector('[data-msg-id="' + msgId + '"]')) return true;
        if (typeof messages === 'undefined') return false;

        for (var i = 0; i < messages.length; i++) {
            if (String(messages[i].id) === String(msgId)) {
                var needed = messages.length - i;
                var currentCount = (typeof displayedMessageCount !== 'undefined' ? displayedMessageCount : 20);
                // 多加载 20 条历史，保证目标消息上下都有上下文，不隐藏其他记录
                var newCount = Math.min(needed + 20, messages.length);
                if (newCount > currentCount) {
                    if (typeof displayedMessageCount !== 'undefined') displayedMessageCount = newCount;
                    if (typeof renderMessages === 'function') renderMessages(msgId);
                }
                return true;
            }
        }
        return false;
    }

    /** 滚动到消息（不隐藏其他记录） */
    function scrollToMessageAndHighlight(msgId) {
        var wasInDom = !!document.querySelector('[data-msg-id="' + msgId + '"]');
        ensureMessageLoaded(msgId);
        var delay = wasInDom ? 0 : 350;
        setTimeout(function() {
            var wrapper = document.querySelector('[data-msg-id="' + msgId + '"]');
            if (!wrapper) return;
            // 消息原本就在 DOM 中，需手动滚动；否则 renderMessages 已处理滚动
            if (wasInDom) {
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, delay);
    }

    /* ===================== 搜索与渲染 ===================== */

    function getFilteredMessages() {
        if (typeof messages === 'undefined') return [];

        var keywordInput = document.getElementById('search-keyword-input');
        var keyword = keywordInput ? keywordInput.value.trim() : '';
        var dateFrom = document.getElementById('search-date-from');
        var dateTo = document.getElementById('search-date-to');
        var fd = dateFrom && dateFrom.value ? new Date(dateFrom.value + 'T00:00:00') : null;
        var td = dateTo && dateTo.value ? new Date(dateTo.value + 'T23:59:59') : null;
        var hasDate = !!(fd || td);
        var hasKeyword = keyword.length > 0;

        if (!hasKeyword && !hasDate) return [];

        var lowerKeyword = keyword.toLowerCase();
        var results = [];

        for (var i = messages.length - 1; i >= 0; i--) {
            var msg = messages[i];
            if (msg.type === 'system') continue;

            // 关键词过滤
            if (hasKeyword) {
                if (!msg.text || msg.text.toLowerCase().indexOf(lowerKeyword) === -1) continue;
            }

            // 日期过滤
            if (hasDate) {
                var ts = msg.timestamp;
                if (!(ts instanceof Date)) ts = new Date(ts);
                if (fd && ts < fd) continue;
                if (td && ts > td) continue;
            }

            results.push(msg);
            if (results.length >= 300) break;
        }

        return results;
    }

    function renderSearchResults() {
        var container = document.getElementById('search-results-container');
        var placeholder = document.getElementById('search-results-placeholder');
        if (!container) return;

        var results = getFilteredMessages();
        var keywordInput = document.getElementById('search-keyword-input');
        var keyword = keywordInput ? keywordInput.value.trim() : '';

        // 更新清除按钮
        var clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) {
            clearBtn.style.display = keyword ? 'flex' : 'none';
        }

        // 如果没有搜索条件，显示占位
        var dateFrom = document.getElementById('search-date-from');
        var dateTo = document.getElementById('search-date-to');
        if (!keyword && !(dateFrom && dateFrom.value) && !(dateTo && dateTo.value)) {
            if (placeholder) placeholder.style.display = 'flex';
            container.innerHTML = '';
            container.appendChild(placeholder);
            return;
        }

        if (placeholder) placeholder.style.display = 'none';
        container.innerHTML = '';

        if (results.length === 0) {
            container.innerHTML = '<div class="search-results-empty-state">' +
                '<i class="fas fa-inbox"></i>' +
                '<p>没有找到匹配的聊天记录</p>' +
                '</div>';
            return;
        }

        // 渲染结果
        var html = '';
        for (var i = 0; i < results.length; i++) {
            var msg = results[i];
            var textPreview = highlightKeyword(
                (msg.text || '').substring(0, 120),
                keyword
            );
            if (msg.text && msg.text.length > 120) textPreview += '...';
            if (msg.image) textPreview = '[图片] ' + textPreview;

            html += '<div class="sr-item" data-msg-id="' + msg.id + '">' +
                '<div class="sr-avatar' + (msg.sender === 'user' ? ' user' : '') + '">' +
                    getSenderInitial(msg.sender) +
                '</div>' +
                '<div class="sr-body">' +
                    '<div class="sr-header">' +
                        '<span class="sr-name">' + escapeHtml(getSenderName(msg.sender)) + '</span>' +
                        '<span class="sr-time">' + formatTime(msg.timestamp) + '</span>' +
                    '</div>' +
                    '<div class="sr-text">' + textPreview + '</div>' +
                '</div>' +
            '</div>';
        }

        container.innerHTML = html;

        // 底部信息
        var footer = document.createElement('div');
        footer.className = 'search-results-footer';
        footer.textContent = '共 ' + results.length + ' 条结果';
        if (results.length >= 300) footer.textContent += '（仅显示最近 300 条）';
        container.appendChild(footer);
    }

    function triggerSearch() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderSearchResults, SEARCH_DEBOUNCE);
    }

    /* ===================== 页面切换 ===================== */

    function openSearchPage() {
        var page = document.getElementById('search-page');
        if (!page) return;

        page.classList.add('active');
        document.body.style.overflow = 'hidden';

        var input = document.getElementById('search-keyword-input');
        if (input) {
            input.value = '';
            setTimeout(function() { input.focus(); }, 300);
        }

        // 清除日期
        var dateFrom = document.getElementById('search-date-from');
        var dateTo = document.getElementById('search-date-to');
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';

        renderSearchResults();
    }

    function closeSearchPage() {
        var page = document.getElementById('search-page');
        if (!page) return;

        page.classList.remove('active');
        document.body.style.overflow = '';

        var input = document.getElementById('search-keyword-input');
        if (input) input.value = '';

        var dateFrom = document.getElementById('search-date-from');
        var dateTo = document.getElementById('search-date-to');
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';

        var clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) clearBtn.style.display = 'none';

        // 恢复占位符
        var container = document.getElementById('search-results-container');
        if (container) container.innerHTML = '';
        var placeholder = document.getElementById('search-results-placeholder');
        if (placeholder) {
            placeholder.style.display = 'flex';
            container.appendChild(placeholder);
        }
    }

    /* ===================== 事件绑定 ===================== */

    function bindEvents() {
        // 浮动按钮 → 打开搜索页
        var toggleBtn = document.getElementById('chat-search-toggle-btn');
        if (toggleBtn && !toggleBtn._searchBound) {
            toggleBtn._searchBound = true;
            toggleBtn.addEventListener('click', openSearchPage);
        }

        // 返回按钮 → 关闭搜索页
        var backBtn = document.getElementById('search-back-btn');
        if (backBtn && !backBtn._searchBound) {
            backBtn._searchBound = true;
            backBtn.addEventListener('click', closeSearchPage);
        }

        // 搜索输入
        var input = document.getElementById('search-keyword-input');
        if (input && !input._searchBound) {
            input._searchBound = true;
            input.addEventListener('input', triggerSearch);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeSearchPage();
                }
            });
        }

        // 清除按钮
        var clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn && !clearBtn._searchBound) {
            clearBtn._searchBound = true;
            clearBtn.addEventListener('click', function() {
                var inp = document.getElementById('search-keyword-input');
                if (inp) {
                    inp.value = '';
                    inp.focus();
                }
                triggerSearch();
            });
        }

        // 日期输入
        var dateFrom = document.getElementById('search-date-from');
        var dateTo = document.getElementById('search-date-to');
        if (dateFrom && !dateFrom._searchBound) {
            dateFrom._searchBound = true;
            dateFrom.addEventListener('change', triggerSearch);
        }
        if (dateTo && !dateTo._searchBound) {
            dateTo._searchBound = true;
            dateTo.addEventListener('change', triggerSearch);
        }

        // 清除日期筛选
        var resetBtn = document.getElementById('search-filter-reset');
        if (resetBtn && !resetBtn._searchBound) {
            resetBtn._searchBound = true;
            resetBtn.addEventListener('click', function() {
                if (dateFrom) dateFrom.value = '';
                if (dateTo) dateTo.value = '';
                triggerSearch();
            });
        }

        // 搜索结果点击 → 跳转到聊天中的消息
        var resultsContainer = document.getElementById('search-results-container');
        if (resultsContainer && !resultsContainer._searchBound) {
            resultsContainer._searchBound = true;
            resultsContainer.addEventListener('click', function(e) {
                var item = e.target.closest('.sr-item');
                if (!item) return;
                var msgId = item.getAttribute('data-msg-id');
                if (!msgId) return;

                closeSearchPage();
                scrollToMessageAndHighlight(msgId);
            });
        }

        // 键盘 Esc 关闭（全局，仅当搜索页打开时）
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var page = document.getElementById('search-page');
                if (page && page.classList.contains('active')) {
                    // 如果搜索框有内容，先清除内容
                    var inp = document.getElementById('search-keyword-input');
                    if (inp && inp.value) {
                        inp.value = '';
                        triggerSearch();
                        return;
                    }
                    closeSearchPage();
                }
            }
        });
    }

    /* ===================== 修复 _scrollToMsg ===================== */
    // 覆盖原有的 _scrollToMsg（从 stats 弹窗搜索结果点击），支持扩展历史后跳转
    window._scrollToMsg = function(id) {
        var el = document.querySelector('[data-id="' + id + '"]') ||
                  document.querySelector('[data-message-id="' + id + '"]') ||
                  document.querySelector('[data-msg-id="' + id + '"]');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var m = document.getElementById('stats-modal');
            if (m && typeof hideModal === 'function') setTimeout(function() { hideModal(m); }, 350);
            return;
        }

        // 尝试扩展历史并跳转
        scrollToMessageAndHighlight(id);
        var m2 = document.getElementById('stats-modal');
        if (m2 && typeof hideModal === 'function') setTimeout(function() { hideModal(m2); }, 350);
    };

    /* ===================== 暴露全局 API ===================== */
    window.openSearchPage = openSearchPage;
    window.closeSearchPage = closeSearchPage;

    /* ===================== 初始化 ===================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }
})();
