// 舊版測試資料尚未區分訊息類型；僅辨認程式產生的既有固定格式。
export function splitTransactionNotice(body) {
  if (typeof body !== 'string') return { notice:null, message:String(body ?? '') };
  const application = body.match(/^(已提出「(?:買賣|交換|贈送)」交易申請。)(?:\r?\n([\s\S]*))?$/);
  if (application) return { notice:application[1], message:application[2] || '' };
  const status = body.match(/^交易狀態已更新：(已接受|已拒絕|買家已確認收貨|交易完成|商品已成交|已取消)(?:（原因：[\s\S]{1,200}）)?$/);
  if (status) return { notice:body, message:'' };
  return { notice:null, message:body };
}
