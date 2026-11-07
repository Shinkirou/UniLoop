-- 唯讀檢查：把下方檔名換成商品原本使用的完整檔名，再執行。
-- 不會修改、刪除資料或 Storage 物件。先記下舊檔名，再更換圖片並重新執行。
with target as (
  select '請換成舊圖片完整檔名.png'::text as filename
)
select
  exists (
    select 1 from storage.objects o, target t
    where o.bucket_id = 'Uniloop-product-images'
      and split_part(o.name, '/', array_length(string_to_array(o.name, '/'), 1)) = t.filename
  ) as image_in_storage,
  (
    select count(distinct p.id)
    from public.products p, target t, unnest(coalesce(p.image_urls, '{}')) u(url)
    where p.deleted_at is null
      and split_part(u.url, '/', array_length(string_to_array(u.url, '/'), 1)) = t.filename
  ) as active_products_using_image,
  exists (
    select 1 from public.product_image_cleanup q, target t,
      unnest(coalesce(q.paths, '{}')) u(path)
    where split_part(u.path, '/', array_length(string_to_array(u.path, '/'), 1)) = t.filename
  ) as cleanup_pending;
