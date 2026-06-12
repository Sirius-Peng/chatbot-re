'use strict';
(function() {
    var STORAGE_KEY_PREFIX = (typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + 'prompt_templates_v1';

    var _templates = [];

    function _getDefaults() {
        return [
            {
                id: 'default',
                name: '默认伴侣',
                content: '你是一个温柔体贴的伴侣，名叫${partnerName}。你需要以温暖、关怀的语气回复对方的消息。回复要简短自然，像真实的聊天对话。不要使用列表格式，不要过长。每次回复1-3句话。',
                isDefault: true
            },
            {
                id: 'playful',
                name: '调皮模式',
                content: '你是一个调皮可爱的伴侣，名叫${partnerName}。你喜欢开玩笑、撒娇、偶尔用颜文字。回复要活泼俏皮，带一点小调皮。',
                isDefault: true
            },
            {
                id: 'deep',
                name: '深情模式',
                content: '你是一个深情浪漫的伴侣，名叫${partnerName}。你的回复充满诗意和深情，总能触动对方的心弦。',
                isDefault: true
            },
            {
                id: 'soulmate',
                name: '知己模式',
                content: '你是一个善解人意的知己，名叫${partnerName}。你善于倾听，能读懂对方的情绪，在对方难过时给予安慰，在对方迷茫时给出温和的建议。回复要细腻走心，像一个真正懂 ta 的人。',
                isDefault: true
            },
            {
                id: 'energetic',
                name: '元气模式',
                content: '你是一个元气满满、充满正能量的伴侣，名叫${partnerName}。你总是能用阳光开朗的态度感染对方，给对方加油打气。回复要积极向上、活泼有力，偶尔用感叹号和可爱的语气词，像一颗小太阳。',
                isDefault: true
            }
        ];
    }

    window.PromptManager = {
        async init() {
            try {
                if (window.localforage) {
                    var saved = await localforage.getItem(STORAGE_KEY_PREFIX);
                    if (saved && Array.isArray(saved) && saved.length > 0) {
                        _templates = saved;
                    } else {
                        _templates = _getDefaults();
                    }
                } else {
                    _templates = _getDefaults();
                }
            } catch(e) {
                _templates = _getDefaults();
            }
            return this;
        },

        getActive() {
            var activeId = (typeof aiSettings !== 'undefined' && aiSettings.activePromptId) ? aiSettings.activePromptId : 'default';
            return _templates.find(function(t) { return t.id === activeId; }) || _templates[0] || null;
        },

        setActive(id) {
            if (typeof aiSettings !== 'undefined') aiSettings.activePromptId = id;
        },

        getAll() { return _templates; },

        add(name, content) {
            var tpl = { id: Date.now().toString(36), name: name, content: content, isDefault: false };
            _templates.push(tpl);
            return tpl;
        },

        update(id, content) {
            var tpl = _templates.find(function(t) { return t.id === id; });
            if (tpl) { tpl.content = content; return true; }
            return false;
        },

        delete(id) {
            var idx = _templates.findIndex(function(t) { return t.id === id; });
            if (idx >= 0 && !_templates[idx].isDefault) { _templates.splice(idx, 1); return true; }
            return false;
        },

        resolvePrompt() {
            var active = this.getActive();
            if (!active) return '';
            var partnerName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
            var prompt = active.content.replace(/\$\{partnerName\}/g, partnerName);

            // ---- Dynamic Context Injection ----
            var contextParts = [];

            // Todo context
            try {
                if (typeof todoItems !== 'undefined' && Array.isArray(todoItems)) {
                    var pending = todoItems.filter(function(t) { return !t.completed; });
                    if (pending.length > 0) {
                        contextParts.push('[待办事项] 当前有 ' + pending.length + ' 个未完成的待办：');
                        pending.slice(0, 5).forEach(function(t) {
                            contextParts.push('- ' + t.title + (t.dueDate ? ' (截止: ' + t.dueDate + ')' : ''));
                        });
                        if (pending.length > 5) contextParts.push('- ...还有 ' + (pending.length - 5) + ' 项');
                        contextParts.push('你可以适时关心这些待办的进展。');
                    }
                }
            } catch(e) {}

            // Menstrual cycle context
            try {
                if (typeof CycleModule !== 'undefined' && typeof menstrualCycleData !== 'undefined' && menstrualCycleData) {
                    var nextPeriod = null;
                    try { nextPeriod = CycleModule.getNextPeriodDate(); } catch(e) {}
                    var phase = null;
                    try { phase = CycleModule.getCurrentPhase(); } catch(e) {}

                    if (phase || nextPeriod) {
                        var cycleLines = ['[经期信息]'];
                        if (phase) cycleLines.push('当前阶段：' + phase.label);
                        if (nextPeriod) cycleLines.push('预测下次经期：' + nextPeriod);
                        cycleLines.push('请温柔体贴地关注对方身体状况，如果对方提到不适可以给予关心。');
                        contextParts.push(cycleLines.join('\n'));
                    }
                }
            } catch(e) {}

            if (contextParts.length > 0) {
                prompt = prompt + '\n\n---\n' + contextParts.join('\n');
            }
            return prompt;
        },

        async save() {
            try {
                if (window.localforage) await localforage.setItem(STORAGE_KEY_PREFIX, _templates);
            } catch(e) {}
        }
    };
})();
