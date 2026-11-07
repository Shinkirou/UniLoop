// 根據商品狀態、擁有者、已接受的交易與收藏，決定首頁卡片行為。
export function cardPolicy({status, own, buyer, favorite}) {
  if (status === '上架中') return {visible:true, locked:false, style:own?'own':''};
  if (status !== '預約中') return {visible:false,locked:true,style:''};
  if (own) return {visible:true,locked:false,style:'reserved'};
  if (buyer) return {visible:true,locked:false,style:'reserved'};
  if (favorite) return {visible:true,locked:true,style:'unavailable'};
  return {visible:false,locked:true,style:''};
}
