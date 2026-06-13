'use strict';
(function() {
    var DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

    function _buildMessages(userMessage, context, systemPrompt) {
        var messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        if (context && Array.isArray(context)) {
            context.forEach(function(msg) {
                if (msg && msg.content) {
                    messages.push({ role: msg.role || 'user', content: msg.content });
                }
            });
        }
        messages.push({ role: 'user', content: userMessage });
        return messages;
    }

    function _trimContext(messages, maxMessages) {
        if (messages.length <= maxMessages) return messages;
        return messages.slice(messages.length - maxMessages);
    }

    function _buildContextFromChat(maxMessages) {
        if (typeof messages === 'undefined' || !Array.isArray(messages)) return [];
        var recent = messages.slice(-maxMessages);
        return recent
            .filter(function(m) { return m && m.text && m.sender; })
            .map(function(m) {
                var role = (m.sender === 'me' || m.sender === 'user') ? 'user' : 'assistant';
                return { role: role, content: m.text };
            });
    }

    window.AIEngine = {
        async sendMessage(userMessage, aiSettingsParam) {
            var cfg = aiSettingsParam || (typeof aiSettings !== 'undefined' ? aiSettings : null);
            if (!cfg || !cfg.apiKey) throw new Error('API key not configured');

            var context = _buildContextFromChat(cfg.contextWindowSize || 20);
            var systemPrompt = typeof window.PromptManager !== 'undefined'
                ? window.PromptManager.resolvePrompt()
                : (cfg.systemPrompt || '');

            var messages = _buildMessages(userMessage, context, systemPrompt);
            var body = JSON.stringify({
                model: cfg.model || 'deepseek-chat',
                messages: messages,
                temperature: cfg.temperature || 0.7,
                max_tokens: cfg.maxTokens || 2048,
                stream: false
            });

            var resp = await fetch(DEEPSEEK_BASE_URL + '/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + cfg.apiKey
                },
                body: body
            });

            if (!resp.ok) {
                var errData = await resp.json().catch(function() { return {}; });
                throw new Error(errData.error?.message || 'API error ' + resp.status);
            }

            var data = await resp.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            }
            throw new Error('Unexpected API response');
        },

        async sendMessageStream(userMessage, aiSettingsParam, onChunk) {
            var cfg = aiSettingsParam || (typeof aiSettings !== 'undefined' ? aiSettings : null);
            if (!cfg || !cfg.apiKey) throw new Error('API key not configured');

            var context = _buildContextFromChat(cfg.contextWindowSize || 20);
            var systemPrompt = typeof window.PromptManager !== 'undefined'
                ? window.PromptManager.resolvePrompt()
                : (cfg.systemPrompt || '');

            var messages = _buildMessages(userMessage, context, systemPrompt);
            var body = JSON.stringify({
                model: cfg.model || 'deepseek-chat',
                messages: messages,
                temperature: cfg.temperature || 0.7,
                max_tokens: cfg.maxTokens || 2048,
                stream: true
            });

            var resp = await fetch(DEEPSEEK_BASE_URL + '/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + cfg.apiKey
                },
                body: body
            });

            if (!resp.ok) {
                var errData = await resp.json().catch(function() { return {}; });
                throw new Error(errData.error?.message || 'API error ' + resp.status);
            }

            var reader = resp.body.getReader();
            var decoder = new TextDecoder();
            var fullText = '';
            var buffer = '';

            while (true) {
                var result = await reader.read();
                if (result.done) break;
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.startsWith('data: ')) {
                        var data = line.slice(6);
                        if (data === '[DONE]') continue;
                        try {
                            var parsed = JSON.parse(data);
                            var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
                            if (delta && delta.content) {
                                fullText += delta.content;
                                if (onChunk) onChunk(fullText, delta.content);
                            }
                        } catch(e) { console.warn("[js/features/ai-engine.js] silent catch:", e); }
                    }
                }
            }
            return fullText;
        },

        async validateApiKey(apiKey) {
            try {
                var resp = await fetch(DEEPSEEK_BASE_URL + '/models', {
                    headers: { 'Authorization': 'Bearer ' + apiKey }
                });
                return resp.ok;
            } catch(e) {
                return false;
            }
        }
    };
})();
