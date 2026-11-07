// 訊息與已讀時間均由資料庫提供；只計算對方傳送且晚於已讀時間的訊息。
export function collectUnread(messages, reads, conversations, owner) {
  const readTimes = new Map((reads || []).map(row => [row.conversation_id, Date.parse(row.last_read_at)]));
  const names = new Map((conversations || []).map(row => [row.id, row.products?.name || '商品']));
  return (messages || []).filter(message => {
    if (!message?.id || !message.conversation_id || message.sender_id === owner || !names.has(message.conversation_id)) return false;
    const sentAt = Date.parse(message.created_at);
    const readAt = readTimes.get(message.conversation_id);
    return Number.isFinite(sentAt) && (!Number.isFinite(readAt) || sentAt > readAt);
  }).map(message => ({ ...message, productName: names.get(message.conversation_id) }));
}
