-- 第一階段：讓同一帳號的同一筆舊商品只能被匯入一次。
-- 不會搬移或刪除資料；所有權仍由現有產品 RLS 控制。
begin;
alter table public.products add column legacy_source_key text;
alter table public.products add constraint products_legacy_source_unique unique (owner_id, legacy_source_key);
commit;
