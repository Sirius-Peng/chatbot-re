/**
 * menstrual.js - 经期追踪系统
 * Menstrual cycle tracking with predictions, symptom logging, calendar view, and AI context
 */
'use strict';

(function() {
    /* ===================== 常量 ===================== */

    var SYMPTOM_OPTIONS = [
        { key: 'cramps', icon: 'fa-heart-crack', label: '痛经' },
        { key: 'headache', icon: 'fa-head-side-virus', label: '头痛' },
        { key: 'fatigue', icon: 'fa-bed', label: '疲劳' },
        { key: 'bloating', icon: 'fa-weight-scale', label: '腹胀' },
        { key: 'mood_swings', icon: 'fa-face-frown', label: '情绪波动' },
        { key: 'acne', icon: 'fa-face-dizzy', label: '长痘' },
        { key: 'backache', icon: 'fa-person-walking', label: '腰酸' },
        { key: 'cravings', icon: 'fa-cookie-bite', label: '食欲' },
    ];

    var FLOW_LEVELS = [
        { key: 'light', label: '少量', color: '#FFB6C1' },
        { key: 'medium', label: '中等', color: '#E8919E' },
        { key: 'heavy', label: '大量', color: '#D4677A' },
    ];

    var PHASES = {
        menstrual: { key: 'menstrual', label: '经期', color: '#E8919E', icon: 'fa-droplet' },
        follicular: { key: 'follicular', label: '卵泡期', color: '#7BC8A4', icon: 'fa-seedling' },
        ovulation: { key: 'ovulation', label: '排卵期', color: '#D4A843', icon: 'fa-star' },
        luteal: { key: 'luteal', label: '黄体期', color: '#C5A4E8', icon: 'fa-moon' },
    };

    var WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
    var currentCalendarDate = new Date();
    var selectedDate = _formatDate(new Date());

    /* ===================== 工具函数 ===================== */

    function _parseDate(str) {
        if (!str) return null;
        var parts = str.split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }

    function _formatDate(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    function _todayStr() {
        return _formatDate(new Date());
    }

    function _addDays(date, n) {
        var d = new Date(date);
        d.setDate(d.getDate() + n);
        return d;
    }

    function _daysBetween(d1, d2) {
        return Math.round((d2.getTime() - d1.getTime()) / 86400000);
    }

    function _getData() {
        if (typeof menstrualCycleData === 'undefined') {
            return { cycleHistory: [], avgCycleLength: 28, avgPeriodLength: 5, notes: {} };
        }
        return menstrualCycleData;
    }

    function _save() {
        if (typeof throttledSaveData === 'function') throttledSaveData();
    }

    /* ===================== 核心计算 ===================== */

    function _getPeriodDays() {
        var data = _getData();
        var days = {};
        for (var i = 0; i < data.cycleHistory.length; i++) {
            var entry = data.cycleHistory[i];
            var start = _parseDate(entry.startDate);
            var end = entry.endDate ? _parseDate(entry.endDate) : _addDays(start, data.avgPeriodLength - 1);
            var cur = new Date(start);
            while (cur <= end) {
                days[_formatDate(cur)] = true;
                cur = _addDays(cur, 1);
            }
        }
        return days;
    }

    function _getPredictedPeriodDays() {
        var nextStart = getNextPeriodDate();
        if (!nextStart) return {};
        var data = _getData();
        var start = _parseDate(nextStart);
        var days = {};
        for (var i = 0; i < data.avgPeriodLength; i++) {
            days[_formatDate(_addDays(start, i))] = true;
        }
        return days;
    }

    function getNextPeriodDate() {
        var data = _getData();
        if (data.cycleHistory.length === 0) return null;

        // 找到最近的 startDate
        var sorted = data.cycleHistory.slice().sort(function(a, b) {
            return a.startDate.localeCompare(b.startDate);
        });
        var lastStart = _parseDate(sorted[sorted.length - 1].startDate);
        var predicted = _addDays(lastStart, data.avgCycleLength);
        var today = new Date();

        // 如果预测日期已过，递推至未来
        while (predicted <= today) {
            predicted = _addDays(predicted, data.avgCycleLength);
        }
        return _formatDate(predicted);
    }

    function getCurrentPhase() {
        var data = _getData();
        var today = new Date();
        var todayStr = _formatDate(today);

        // 检查今天是否在经期中
        var periodDays = _getPeriodDays();
        if (periodDays[todayStr]) return PHASES.menstrual;

        // 检查是否在预测经期中
        var predictedDays = _getPredictedPeriodDays();
        if (predictedDays[todayStr]) return PHASES.menstrual;

        if (data.cycleHistory.length === 0) return null;

        // 从最近一次经期开始计算
        var sorted = data.cycleHistory.slice().sort(function(a, b) {
            return a.startDate.localeCompare(b.startDate);
        });
        var lastStart = _parseDate(sorted[sorted.length - 1].startDate);
        var daysSinceStart = _daysBetween(lastStart, today);
        if (daysSinceStart < 0) daysSinceStart = 0;

        var cycleLen = data.avgCycleLength;
        var dayInCycle = daysSinceStart % cycleLen;

        // 排卵日按黄体期回推: 排卵日 = 周期天数 - 14 (黄体期固定)
        var ovulationDay = cycleLen - 14;

        if (dayInCycle < data.avgPeriodLength) return PHASES.menstrual;
        // 经期结束到排卵日前5天 = 卵泡期（非易孕期部分）
        if (dayInCycle < ovulationDay - 5) return PHASES.follicular;
        // 排卵日前5天到排卵日 = 排卵期（含易孕窗口）
        if (dayInCycle <= ovulationDay) return PHASES.ovulation;
        return PHASES.luteal;
    }

    function _autoCalculateAverages() {
        var data = _getData();
        var entries = data.cycleHistory.filter(function(e) { return !!e.endDate; });

        // 计算平均周期长度（连续 startDate 的间隔）
        var sorted = data.cycleHistory.slice().sort(function(a, b) {
            return a.startDate.localeCompare(b.startDate);
        });
        var intervals = [];
        for (var i = 1; i < sorted.length; i++) {
            var gap = _daysBetween(_parseDate(sorted[i - 1].startDate), _parseDate(sorted[i].startDate));
            if (gap >= 20 && gap <= 45) intervals.push(gap);
        }
        if (intervals.length > 0) {
            data.avgCycleLength = Math.round(intervals.reduce(function(s, v) { return s + v; }, 0) / intervals.length);
        }

        // 计算平均经期长度
        if (entries.length > 0) {
            var durations = entries.map(function(e) {
                return _daysBetween(_parseDate(e.startDate), _parseDate(e.endDate)) + 1;
            });
            data.avgPeriodLength = Math.round(durations.reduce(function(s, v) { return s + v; }, 0) / durations.length);
        }
    }

    /* ===================== 数据操作 ===================== */

    function recordPeriodStart() {
        var data = _getData();
        var todayStr = _todayStr();

        // 检查是否已存在今天的记录
        for (var i = 0; i < data.cycleHistory.length; i++) {
            if (data.cycleHistory[i].startDate === todayStr) {
                if (typeof showNotification === 'function') {
                    showNotification('今天已记录经期开始', 'info');
                }
                return;
            }
        }

        // 如果上一个周期没有结束日期，检查是否仍在预期经期内
        if (data.cycleHistory.length > 0) {
            var last = data.cycleHistory[data.cycleHistory.length - 1];
            if (!last.endDate) {
                var daysSinceLastStart = _daysBetween(_parseDate(last.startDate), new Date());
                // 仅当超过预期经期长度时才自动关闭，否则提醒用户
                if (daysSinceLastStart > data.avgPeriodLength + 1) {
                    last.endDate = _formatDate(_addDays(new Date(), -1));
                } else if (daysSinceLastStart >= 0) {
                    if (typeof showNotification === 'function') {
                        showNotification('当前经期仍在进行中，请先记录结束日期', 'warning');
                    }
                    return;
                }
            }
        }

        data.cycleHistory.push({ startDate: todayStr, endDate: null });
        _autoCalculateAverages();
        _save();
        renderAll();
        if (typeof showNotification === 'function') {
            showNotification('已记录经期开始', 'info');
        }
    }

    function recordPeriodEnd() {
        var data = _getData();
        if (data.cycleHistory.length === 0) return;
        var last = data.cycleHistory[data.cycleHistory.length - 1];
        if (last.endDate) {
            if (typeof showNotification === 'function') {
                showNotification('当前周期已结束', 'info');
            }
            return;
        }
        var todayStr = _todayStr();
        // 结束日期不能早于开始日期
        if (_parseDate(todayStr) >= _parseDate(last.startDate)) {
            last.endDate = todayStr;
        } else {
            last.endDate = last.startDate;
        }
        _autoCalculateAverages();
        _save();
        renderAll();
        if (typeof showNotification === 'function') {
            showNotification('已记录经期结束', 'info');
        }
    }

    function toggleSymptom(dateStr, symptomKey) {
        var data = _getData();
        if (typeof dateStr !== 'string' || !dateStr) return;
        if (!data.notes) data.notes = {};
        if (!data.notes[dateStr]) data.notes[dateStr] = { symptoms: [], mood: '', flow: '', customNote: '' };
        if (!data.notes[dateStr].symptoms) data.notes[dateStr].symptoms = [];

        var idx = data.notes[dateStr].symptoms.indexOf(symptomKey);
        if (idx > -1) {
            data.notes[dateStr].symptoms.splice(idx, 1);
        } else {
            data.notes[dateStr].symptoms.push(symptomKey);
        }
        _save();
        renderSymptomButtons(dateStr);
    }

    function setFlow(dateStr, flowKey) {
        var data = _getData();
        if (typeof dateStr !== 'string' || !dateStr) return;
        if (!data.notes) data.notes = {};
        if (!data.notes[dateStr]) data.notes[dateStr] = { symptoms: [], mood: '', flow: '', customNote: '' };
        data.notes[dateStr].flow = data.notes[dateStr].flow === flowKey ? '' : flowKey;
        _save();
        renderFlowSelector(dateStr);
    }

    function saveCustomNote(dateStr, text) {
        var data = _getData();
        if (typeof dateStr !== 'string' || !dateStr) return;
        if (!data.notes) data.notes = {};
        if (!data.notes[dateStr]) data.notes[dateStr] = { symptoms: [], mood: '', flow: '', customNote: '' };
        data.notes[dateStr].customNote = text || '';
        _save();
        if (typeof showNotification === 'function') {
            showNotification('备注已保存', 'info');
        }
    }

    function adjustAvgCycleLength(delta) {
        var data = _getData();
        data.avgCycleLength = Math.max(20, Math.min(45, data.avgCycleLength + delta));
        _save();
        renderAll();
    }

    function adjustAvgPeriodLength(delta) {
        var data = _getData();
        data.avgPeriodLength = Math.max(2, Math.min(10, data.avgPeriodLength + delta));
        _save();
        renderAll();
    }

    function deleteCycleRecord(startDate) {
        var data = _getData();
        data.cycleHistory = data.cycleHistory.filter(function(entry) {
            return entry.startDate !== startDate;
        });
        _autoCalculateAverages();
        _save();
        renderAll();
        if (typeof showNotification === 'function') {
            showNotification('记录已删除', 'info');
        }
    }

    /* ===================== 渲染函数 ===================== */

    function renderAll() {
        renderPhaseIndicator();
        renderPredictions();
        renderMiniCalendar();
        renderCycleHistory();
        var todayStr = _todayStr();
        renderSymptomButtons(todayStr);
        renderFlowSelector(todayStr);
        renderNoteInput(todayStr);

        // 更新平均值显示
        var data = _getData();
        var avgCycleEl = document.getElementById('avg-cycle-length');
        var avgPeriodEl = document.getElementById('avg-period-length');
        if (avgCycleEl) avgCycleEl.textContent = data.avgCycleLength;
        if (avgPeriodEl) avgPeriodEl.textContent = data.avgPeriodLength;
    }

    function renderPhaseIndicator() {
        var bar = document.getElementById('cycle-phase-bar');
        var label = document.getElementById('cycle-phase-label');
        var icon = document.getElementById('cycle-phase-icon');

        var phase = getCurrentPhase();

        if (bar) {
            var segments = bar.querySelectorAll('.cycle-phase-segment');
            segments.forEach(function(seg) { seg.classList.remove('active'); });
            if (phase) {
                var phaseKeys = ['menstrual', 'follicular', 'ovulation', 'luteal'];
                var idx = phaseKeys.indexOf(phase.key);
                if (idx >= 0 && segments[idx]) segments[idx].classList.add('active');
            }
        }

        if (label) {
            label.textContent = phase ? phase.label : '暂无经期数据';
            label.style.color = phase ? phase.color : '';
        }
        if (icon && phase) {
            icon.innerHTML = '<i class="fas ' + phase.icon + '"></i>';
            icon.style.color = phase.color;
        }
    }

    function renderPredictions() {
        var container = document.getElementById('cycle-predictions');
        if (!container) return;

        var nextPeriod = getNextPeriodDate();
        var html = '';

        if (nextPeriod) {
            html += '<div class="cycle-prediction-card">' +
                '<div class="pred-label">预测经期</div>' +
                '<div class="pred-value">' + nextPeriod + '</div>' +
                '</div>';
        }

        if (!nextPeriod) {
            html = '<div style="text-align:center;padding:12px;color:var(--text-secondary);font-size:12px;">' +
                '记录经期后可查看预测</div>';
        }

        container.innerHTML = html;
    }

    function renderMiniCalendar() {
        var container = document.getElementById('cycle-mini-calendar');
        var label = document.getElementById('cycle-month-label');
        if (!container) return;

        var year = currentCalendarDate.getFullYear();
        var month = currentCalendarDate.getMonth();

        if (label) label.textContent = year + '年 ' + (month + 1) + '月';

        var periodDays = _getPeriodDays();
        var predictedDays = _getPredictedPeriodDays();
        var todayStr = _todayStr();

        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var firstDow = new Date(year, month, 1).getDay();

        var html = '';

        // 星期头
        for (var w = 0; w < 7; w++) {
            html += '<div class="day-header">' + WEEKDAY_LABELS[w] + '</div>';
        }

        // 空白占位
        for (var b = 0; b < firstDow; b++) {
            html += '<div class="day-cell other-month"></div>';
        }

        // 日期格
        for (var d = 1; d <= daysInMonth; d++) {
            var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            var classes = ['day-cell'];
            if (periodDays[dateStr]) classes.push('period-day');
            if (predictedDays[dateStr]) classes.push('predicted-period');
            if (dateStr === todayStr) classes.push('today');
            if (dateStr === selectedDate) classes.push('selected');

            html += '<div class="day-cell ' + classes.join(' ') + '" data-date="' + dateStr + '">' + d + '</div>';
        }

        container.innerHTML = html;
    }

    function renderSymptomButtons(dateStr) {
        var container = document.getElementById('symptom-buttons');
        var dateLabel = document.getElementById('symptom-date-label');
        if (!container) return;

        if (dateLabel) dateLabel.textContent = dateStr ? '(' + dateStr + ')' : '';

        var data = _getData();
        var note = (data.notes && data.notes[dateStr]) ? data.notes[dateStr] : { symptoms: [] };
        var activeSymptoms = note.symptoms || [];

        var html = '';
        for (var i = 0; i < SYMPTOM_OPTIONS.length; i++) {
            var sym = SYMPTOM_OPTIONS[i];
            var active = activeSymptoms.indexOf(sym.key) > -1;
            html += '<span class="symptom-pill' + (active ? ' active' : '') +
                '" data-symptom="' + sym.key + '">' +
                '<i class="fas ' + sym.icon + '"></i> ' + sym.label +
                '</span>';
        }
        container.innerHTML = html;
    }

    function renderFlowSelector(dateStr) {
        var container = document.getElementById('flow-selector');
        if (!container) return;

        var data = _getData();
        var note = (data.notes && data.notes[dateStr]) ? data.notes[dateStr] : { flow: '' };
        var activeFlow = note.flow || '';

        var html = '';
        for (var i = 0; i < FLOW_LEVELS.length; i++) {
            var fl = FLOW_LEVELS[i];
            var active = activeFlow === fl.key;
            html += '<div class="flow-pill' + (active ? ' active' : '') +
                '" data-flow="' + fl.key + '"' +
                (active ? ' style="background:' + fl.color + '"' : '') +
                '>' + fl.label + '</div>';
        }
        container.innerHTML = html;
    }

    function renderNoteInput(dateStr) {
        var input = document.getElementById('cycle-note-input');
        if (!input) return;
        var data = _getData();
        var note = (data.notes && data.notes[dateStr]) ? data.notes[dateStr] : { customNote: '' };
        input.value = note.customNote || '';
        input.setAttribute('data-note-date', dateStr);
    }

    function renderCycleHistory() {
        var container = document.getElementById('cycle-history-list');
        if (!container) return;

        var data = _getData();
        var sorted = data.cycleHistory.slice().sort(function(a, b) {
            return b.startDate.localeCompare(a.startDate);
        }).slice(0, 10);

        if (sorted.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);font-size:12px;">' +
                '暂无记录</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < sorted.length; i++) {
            var entry = sorted[i];
            var endDate = entry.endDate || '进行中';
            var duration = entry.endDate ? (_daysBetween(_parseDate(entry.startDate), _parseDate(entry.endDate)) + 1) : '-';
            html += '<div class="cycle-history-card">' +
                '<span class="cycle-date-range">' + entry.startDate + ' ~ ' + endDate + '</span>' +
                '<span class="cycle-duration">' + (duration !== '-' ? duration + ' 天' : '进行中') + '</span>' +
                '<button class="cycle-delete-btn" data-delete-start="' + entry.startDate + '" title="删除记录">' +
                '<i class="fas fa-trash-alt"></i></button>' +
                '</div>';
        }
        container.innerHTML = html;
    }

    /* ===================== 弹窗 ===================== */

    function openModal() {
        var modal = document.getElementById('menstrual-modal');
        if (!modal) return;

        currentCalendarDate = new Date();
        selectedDate = _formatDate(new Date());
        renderAll();

        if (typeof showModal === 'function') showModal(modal);
    }

    function closeModal() {
        var modal = document.getElementById('menstrual-modal');
        if (!modal) return;
        if (typeof hideModal === 'function') hideModal(modal);
    }

    /* ===================== 事件绑定 ===================== */

    function init() {
        // 记录经期开始
        var startBtn = document.getElementById('record-period-start');
        if (startBtn && !startBtn._cycleInited) {
            startBtn._cycleInited = true;
            startBtn.addEventListener('click', recordPeriodStart);
        }

        // 记录经期结束
        var endBtn = document.getElementById('record-period-end');
        if (endBtn && !endBtn._cycleInited) {
            endBtn._cycleInited = true;
            endBtn.addEventListener('click', recordPeriodEnd);
        }

        // 关闭按钮
        var closeBtn = document.getElementById('close-menstrual');
        if (closeBtn && !closeBtn._cycleInited) {
            closeBtn._cycleInited = true;
            closeBtn.addEventListener('click', closeModal);
        }

        // 月份导航
        var prevBtn = document.getElementById('cycle-prev-month');
        var nextBtn = document.getElementById('cycle-next-month');
        if (prevBtn && !prevBtn._cycleInited) {
            prevBtn._cycleInited = true;
            prevBtn.addEventListener('click', function() {
                var y = currentCalendarDate.getFullYear();
                var m = currentCalendarDate.getMonth() - 1;
                currentCalendarDate = new Date(y, m, 1);
                renderMiniCalendar();
            });
        }
        if (nextBtn && !nextBtn._cycleInited) {
            nextBtn._cycleInited = true;
            nextBtn.addEventListener('click', function() {
                var y2 = currentCalendarDate.getFullYear();
                var m2 = currentCalendarDate.getMonth() + 1;
                currentCalendarDate = new Date(y2, m2, 1);
                renderMiniCalendar();
            });
        }

        // 日历日期点击 → 选中日期并查看症状
        var calendar = document.getElementById('cycle-mini-calendar');
        if (calendar && !calendar._cycleInited) {
            calendar._cycleInited = true;
            calendar.addEventListener('click', function(e) {
                var cell = e.target.closest('.day-cell');
                if (!cell) return;
                var dateStr = cell.getAttribute('data-date');
                if (!dateStr) return;
                selectedDate = dateStr;
                renderMiniCalendar();
                renderSymptomButtons(dateStr);
                renderFlowSelector(dateStr);
                renderNoteInput(dateStr);
            });
        }

        // 症状按钮
        var symptomContainer = document.getElementById('symptom-buttons');
        if (symptomContainer && !symptomContainer._cycleInited) {
            symptomContainer._cycleInited = true;
            symptomContainer.addEventListener('click', function(e) {
                var pill = e.target.closest('.symptom-pill');
                if (!pill) return;
                var symptomKey = pill.getAttribute('data-symptom');
                var noteInput = document.getElementById('cycle-note-input');
                var dateStr = noteInput ? noteInput.getAttribute('data-note-date') : _todayStr();
                toggleSymptom(dateStr, symptomKey);
            });
        }

        // 流量选择器
        var flowContainer = document.getElementById('flow-selector');
        if (flowContainer && !flowContainer._cycleInited) {
            flowContainer._cycleInited = true;
            flowContainer.addEventListener('click', function(e) {
                var pill = e.target.closest('.flow-pill');
                if (!pill) return;
                var flowKey = pill.getAttribute('data-flow');
                var noteInput = document.getElementById('cycle-note-input');
                var dateStr = noteInput ? noteInput.getAttribute('data-note-date') : _todayStr();
                setFlow(dateStr, flowKey);
            });
        }

        // 保存备注
        var saveNoteBtn = document.getElementById('save-cycle-note');
        if (saveNoteBtn && !saveNoteBtn._cycleInited) {
            saveNoteBtn._cycleInited = true;
            saveNoteBtn.addEventListener('click', function() {
                var input = document.getElementById('cycle-note-input');
                if (!input) return;
                var dateStr = input.getAttribute('data-note-date') || _todayStr();
                saveCustomNote(dateStr, input.value);
            });
        }

        // 删除经期记录（事件委托）
        var historyContainer = document.getElementById('cycle-history-list');
        if (historyContainer && !historyContainer._cycleInited) {
            historyContainer._cycleInited = true;
            historyContainer.addEventListener('click', function(e) {
                var deleteBtn = e.target.closest('.cycle-delete-btn');
                if (!deleteBtn) return;
                e.stopPropagation();
                var startDate = deleteBtn.getAttribute('data-delete-start');
                if (startDate) deleteCycleRecord(startDate);
            });
        }
    }

    /* ===================== 暴露全局 API ===================== */

    window.CycleModule = {
        getCurrentPhase: getCurrentPhase,
        getNextPeriodDate: getNextPeriodDate,
        openModal: openModal,
        closeModal: closeModal,
        renderAll: renderAll,
        init: init,
        adjustAvgCycleLength: adjustAvgCycleLength,
        adjustAvgPeriodLength: adjustAvgPeriodLength,
        deleteCycleRecord: deleteCycleRecord,
    };

    /* ===================== 自初始化 ===================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { init(); });
    } else {
        init();
    }

})();
