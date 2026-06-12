/**
 * todo.js - 待办事项系统
 * Todo/task tracking with persistence and AI context integration
 */
'use strict';

(function() {
    /* ===================== 工具函数 ===================== */

    // escapeHTML 已在 utils.js 中全局定义

    function formatDate(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        var now = new Date();
        var y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        if (y === now.getFullYear()) {
            return m + '/' + d;
        }
        return y + '/' + m + '/' + d;
    }

    /* ===================== 数据操作 ===================== */

    function getAll() {
        if (typeof todoItems === 'undefined') return [];
        return todoItems.slice().sort(function(a, b) {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            return b.createdAt - a.createdAt;
        });
    }

    function getPending() {
        return getAll().filter(function(t) { return !t.completed; });
    }

    function add(title, dueDate, note) {
        if (typeof todoItems === 'undefined') return;
        if (!title || !title.trim()) return;

        var item = {
            id: Date.now(),
            title: title.trim(),
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
            dueDate: dueDate || null,
            note: note || ''
        };

        todoItems.push(item);
        _save();
        renderList();
        _showEmpty(false);

        if (typeof showNotification === 'function') {
            showNotification('待办已添加', 'info');
        }
        if (typeof playSound === 'function') playSound('send');
    }

    function toggle(id) {
        if (typeof todoItems === 'undefined') return;
        for (var i = 0; i < todoItems.length; i++) {
            if (todoItems[i].id === id) {
                todoItems[i].completed = !todoItems[i].completed;
                todoItems[i].completedAt = todoItems[i].completed ? new Date().toISOString() : null;
                break;
            }
        }
        _save();
        renderList();
    }

    function remove(id, evt) {
        if (evt && evt.stopPropagation) evt.stopPropagation();
        if (typeof todoItems === 'undefined') return;
        todoItems = todoItems.filter(function(t) { return t.id !== id; });
        _save();
        renderList();
        if (typeof showNotification === 'function') {
            showNotification('已删除', 'info');
        }
    }

    function getStats() {
        var all = getAll();
        var completed = all.filter(function(t) { return t.completed; }).length;
        return { total: all.length, completed: completed, pending: all.length - completed };
    }

    function _save() {
        if (typeof throttledSaveData === 'function') throttledSaveData();
    }

    /* ===================== 渲染 ===================== */

    function renderList() {
        var container = document.getElementById('todo-list-container');
        if (!container) return;

        var items = getAll();
        _showEmpty(items.length === 0);

        if (items.length === 0) {
            container.innerHTML = '<div class="todo-empty">' +
                '<i class="fas fa-check-circle"></i>' +
                '<p>还没有待办事项</p>' +
                '<span>点击上方输入框添加第一个待办吧</span>' +
                '</div>';
        } else {
            var html = '';
            for (var i = 0; i < items.length; i++) {
                var t = items[i];
                var titleEsc = escapeHTML(t.title);
                html += '<div class="todo-card' + (t.completed ? ' completed' : '') + '" data-id="' + t.id + '">' +
                    '<div class="todo-checkbox' + (t.completed ? ' checked' : '') + '" data-toggle="' + t.id + '">' +
                        (t.completed ? '<i class="fas fa-check"></i>' : '') +
                    '</div>' +
                    '<div class="todo-body">' +
                        '<span class="todo-title' + (t.completed ? ' todo-done' : '') + '">' + titleEsc + '</span>' +
                        (t.dueDate ? '<span class="todo-due"><i class="far fa-calendar-alt"></i> ' + formatDate(t.dueDate) + '</span>' : '') +
                        (t.note ? '<span class="todo-note">' + escapeHTML(t.note) + '</span>' : '') +
                    '</div>' +
                    '<button class="todo-delete-btn" data-remove="' + t.id + '" title="删除">' +
                        '<i class="fas fa-times"></i>' +
                    '</button>' +
                '</div>';
            }
            container.innerHTML = html;
        }

        _updateStats();
    }

    function _showEmpty(isEmpty) {
        var stats = document.getElementById('todo-stats');
        if (stats) {
            stats.style.display = isEmpty ? 'none' : '';
        }
    }

    function _updateStats() {
        var stats = document.getElementById('todo-stats');
        if (!stats) return;
        var s = getStats();
        if (s.total === 0) {
            stats.textContent = '';
            return;
        }
        stats.textContent = s.completed + '/' + s.total + ' 已完成';
    }

    /* ===================== 弹窗 ===================== */

    function openModal() {
        var modal = document.getElementById('todo-modal');
        if (!modal) return;

        // 清除输入
        var titleInput = document.getElementById('todo-input-title');
        var dateInput = document.getElementById('todo-input-date');
        var noteInput = document.getElementById('todo-input-note');
        if (titleInput) titleInput.value = '';
        if (dateInput) dateInput.value = '';
        if (noteInput) noteInput.value = '';

        renderList();

        if (typeof showModal === 'function') showModal(modal);

        setTimeout(function() {
            if (titleInput) titleInput.focus();
        }, 350);
    }

    function closeModal() {
        var modal = document.getElementById('todo-modal');
        if (!modal) return;
        if (typeof hideModal === 'function') hideModal(modal);
    }

    /* ===================== 事件绑定 ===================== */

    function init() {
        // 添加按钮
        var addBtn = document.getElementById('todo-add-btn');
        if (addBtn && !addBtn._todoInited) {
            addBtn._todoInited = true;
            addBtn.addEventListener('click', function() {
                var titleInput = document.getElementById('todo-input-title');
                var dateInput = document.getElementById('todo-input-date');
                var noteInput = document.getElementById('todo-input-note');
                if (!titleInput) return;
                add(
                    titleInput.value,
                    dateInput ? dateInput.value : null,
                    noteInput ? noteInput.value : null
                );
                titleInput.value = '';
                if (dateInput) dateInput.value = '';
                if (noteInput) noteInput.value = '';
                titleInput.focus();
            });
        }

        // 输入框回车快速添加
        var titleInput = document.getElementById('todo-input-title');
        if (titleInput && !titleInput._todoInited) {
            titleInput._todoInited = true;
            titleInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var dateInput = document.getElementById('todo-input-date');
                    var noteInput = document.getElementById('todo-input-note');
                    add(
                        titleInput.value,
                        dateInput ? dateInput.value : null,
                        noteInput ? noteInput.value : null
                    );
                    titleInput.value = '';
                    if (dateInput) dateInput.value = '';
                    if (noteInput) noteInput.value = '';
                }
            });
        }

        // 关闭按钮
        var closeBtn = document.getElementById('close-todo');
        if (closeBtn && !closeBtn._todoInited) {
            closeBtn._todoInited = true;
            closeBtn.addEventListener('click', closeModal);
        }

        // 列表事件委托 (checkbox 切换 + 删除)
        var listContainer = document.getElementById('todo-list-container');
        if (listContainer && !listContainer._todoInited) {
            listContainer._todoInited = true;
            listContainer.addEventListener('click', function(e) {
                var checkbox = e.target.closest('[data-toggle]');
                if (checkbox) {
                    var id = parseInt(checkbox.getAttribute('data-toggle'));
                    if (!isNaN(id)) toggle(id);
                    return;
                }
                var removeBtn = e.target.closest('[data-remove]');
                if (removeBtn) {
                    var rid = parseInt(removeBtn.getAttribute('data-remove'));
                    if (!isNaN(rid)) remove(rid, e);
                    return;
                }
            });
        }
    }

    /* ===================== 暴露全局 API ===================== */

    window.TodoModule = {
        getAll: getAll,
        getPending: getPending,
        add: add,
        toggle: toggle,
        remove: remove,
        getStats: getStats,
        renderList: renderList,
        openModal: openModal,
        closeModal: closeModal,
        init: init
    };

    /* ===================== 自初始化 ===================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { init(); });
    } else {
        init();
    }

})();
