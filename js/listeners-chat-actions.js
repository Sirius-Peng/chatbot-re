// listeners-chat-actions.js — 聊天消息操作事件绑定
// 从 listeners.js 提取，负责聊天容器内的点击事件委托：
// 删除、撤回、@提及、回复、收藏、批量操作

(function() {
    'use strict';

    window.initChatActionListeners = function() {
        DOMElements.chatContainer.addEventListener('click', (e) => {

            if (isBatchFavoriteMode) {
                const wrapper = e.target.closest('.message-wrapper');
                if (wrapper && !e.target.closest('.message-meta-actions')) {
                    const messageId = Number(wrapper.dataset.id);
                    const index = selectedMessages.indexOf(messageId);

                    if (index > -1) {
                        selectedMessages.splice(index, 1);
                        wrapper.classList.remove('selected');
                    } else {
                        selectedMessages.push(messageId);
                        wrapper.classList.add('selected');
                    }

                    const confirmBtn = document.getElementById('confirm-batch-favorite');
                    if (confirmBtn) {
                        confirmBtn.textContent = `确认收藏 (${selectedMessages.length})`;
                    }
                    return;
                }
            }

            const favoriteBtn = e.target.closest('.favorite-action-btn');
            if (favoriteBtn) {
                const wrapper = e.target.closest('.message-wrapper');
                const messageId = Number(wrapper.dataset.id);
                const message = messages.find(m => m.id === messageId);

                if (message) {
                    message.favorited = !message.favorited;

                    showNotification(message.favorited ? '已收藏': '已取消收藏', 'success', 1500);
                    playSound('favorite');

                    throttledSaveData();

                    renderMessages(true);
                }
                return;
            }

            const target = e.target.closest('.meta-action-btn');
            if (!target) return;

            const wrapper = e.target.closest('.message-wrapper');
            if (!wrapper) return;

            const messageId = Number(wrapper.dataset.id);
            const message = messages.find(m => m.id === messageId);
            if (!message) return;

            if (target.classList.contains('delete-btn')) {
                if (confirm('确定要删除这条消息吗？')) {
                    const index = messages.findIndex(m => m.id === messageId);
                    if (index > -1) {
                        const savedScrollTop = DOMElements.chatContainer.scrollTop;
                        messages.splice(index, 1);
                        throttledSaveData();
                        renderMessages(true);
                        requestAnimationFrame(() => {
                            DOMElements.chatContainer.scrollTop = savedScrollTop;
                        });
                        showNotification('消息已删除', 'success');
                    }
                }
                return;
            }
            if (target.classList.contains('recall-btn')) {
                // 检查是否在5分钟内
                if (message.timestamp) {
                    var elapsed = Date.now() - new Date(message.timestamp).getTime();
                    if (elapsed > 5 * 60 * 1000) {
                        showNotification('该消息已无法撤回', 'info', 2000);
                        return;
                    }
                }
                // 撤回：将消息内容放入输入框，然后删除消息
                if (message.text) {
                    DOMElements.messageInput.value = message.text;
                    DOMElements.messageInput.focus();
                }
                var idx = messages.findIndex(m => m.id === messageId);
                if (idx > -1) {
                    var savedScrollTop = DOMElements.chatContainer.scrollTop;
                    messages.splice(idx, 1);
                    throttledSaveData();
                    renderMessages(true);
                    requestAnimationFrame(() => {
                        DOMElements.chatContainer.scrollTop = savedScrollTop;
                    });
                    showNotification('消息已撤回', 'success');
                }
                return;
            }
            if (target.classList.contains('mention-btn')) {
                // @对方：在输入框插入 @昵称
                // 群聊模式下使用群成员角色名
                var grpMem = (typeof getGroupMemberForMessage === 'function') ? getGroupMemberForMessage(messageId) : null;
                var mentionName = grpMem ? (grpMem.name || '对方').trim() : (settings.partnerName || '对方').trim();
                var mentionInput = DOMElements.messageInput;
                if (mentionInput) {
                    var mStart = mentionInput.selectionStart;
                    var mEnd = mentionInput.selectionEnd;
                    var mBefore = mentionInput.value.substring(0, mStart);
                    var mAfter = mentionInput.value.substring(mEnd);
                    mentionInput.value = mBefore + '@' + mentionName + ' ' + mAfter;
                    mentionInput.focus();
                    var mNewPos = mStart + mentionName.length + 2;
                    mentionInput.setSelectionRange(mNewPos, mNewPos);
                    mentionInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
            if (target.classList.contains('reply-btn')) {
                currentReplyTo = {
                    id: message.id,
                    sender: message.sender,
                    text: message.text
                };
                updateReplyPreview();
                DOMElements.messageInput.focus();
                const targetMessageElement = DOMElements.chatContainer.querySelector(`[data-id="${message.id}"]`);
                if (targetMessageElement) targetMessageElement.scrollIntoView({
                    behavior: 'smooth', block: 'center'
                });
                return;
            }
            throttledSaveData();
        });

        DOMElements.batchPreview.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.batch-preview-remove');
            if (removeBtn) {
                const index = removeBtn.closest('.batch-preview-item').dataset.index;
                batchMessages.splice(index, 1); updateBatchPreview();
                return;
            }
            const editBtn = e.target.closest('.batch-preview-edit');
            if (editBtn) {
                const item = editBtn.closest('.batch-preview-item');
                const index = parseInt(item.dataset.index);
                const msg = batchMessages[index];
                if (!msg || msg.image) return;
                const newText = prompt('编辑内容：', msg.text);
                if (newText !== null) {
                    batchMessages[index].text = newText.trim();
                    updateBatchPreview();
                }
                return;
            }
            const sendBtn = e.target.closest('.batch-send-btn');
            if (sendBtn && !sendBtn.disabled) sendBatchMessages();
            if (e.target.matches('.batch-cancel-btn')) {
                isBatchMode = false; DOMElements.batchBtn.classList.remove('active');
                DOMElements.batchPreview.style.display = 'none';
                const placeholder = "";
                DOMElements.messageInput.placeholder = placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder;
                batchMessages = [];
            }
        });
    };
})();
