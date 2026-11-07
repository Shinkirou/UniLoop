-- 商品管理：保留紀錄、限制權限，並記錄待清理的圖片。
begin;
alter table public.products add column if not exists deleted_at timestamptz;
create table if not exists public.product_image_cleanup (
  product_id uuid primary key references public.products(id),
  owner_id uuid not null references auth.users(id),
  paths text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.product_image_cleanup enable row level security;
revoke all on public.product_image_cleanup from public, anon, authenticated;
grant select on public.product_image_cleanup to authenticated;
drop policy if exists product_cleanup_owner on public.product_image_cleanup;
create policy product_cleanup_owner on public.product_image_cleanup for select to authenticated using (owner_id = (select auth.uid()));
revoke delete on public.products from public, anon, authenticated;
revoke update on public.products from public, anon, authenticated;
revoke update (id,owner_id,name,description,category,price,city,school,methods,condition,exchange_wish,accept_difference,image_urls,status,created_at,legacy_source_key,deleted_at) on public.products from public, anon, authenticated;
grant update (name,description,category,price,city,school,methods,condition,exchange_wish,accept_difference,image_urls) on public.products to authenticated;
drop policy if exists products_insert_valid_state on public.products;
create policy products_insert_valid_state on public.products as restrictive for insert to authenticated with check (deleted_at is null and status='上架中');
drop policy if exists products_editable_only on public.products;
create policy products_editable_only on public.products as restrictive for update to authenticated
using (deleted_at is null and status in ('上架中','下架'))
with check (deleted_at is null and status in ('上架中','下架'));
create or replace function public.set_product_listing_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.products; uid uuid := auth.uid();
begin
  if uid is null or p_status not in ('上架中','下架') then raise exception '狀態無效'; end if;
  select * into p from public.products where id=p_id for update;
  if not found or p.owner_id<>uid or p.deleted_at is not null then raise exception '找不到商品'; end if;
  if p.status not in ('上架中','下架') then raise exception '交易中或交易完成的商品無法更改狀態'; end if;
  if p_status = '下架' and exists(select 1 from public.trade_requests t where t.product_id=p.id and t.status in ('待賣家確認','已接受','買家已確認收貨')) then raise exception '請先處理進行中的交易申請'; end if;
  update public.products set status=p_status where id=p.id;
end $$;
create or replace function public.archive_product(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.products; uid uuid := auth.uid(); prefix text; item text; paths text[] := '{}';
begin
  if uid is null then raise exception '請先登入'; end if;
  select * into p from public.products where id=p_id for update;
  if not found or p.owner_id<>uid or p.deleted_at is not null then raise exception '找不到商品'; end if;
  if p.status not in ('上架中','下架','交易完成') or exists(select 1 from public.trade_requests t where t.product_id=p.id and t.status in ('待賣家確認','已接受','買家已確認收貨')) then raise exception '請先處理進行中的交易申請'; end if;
  prefix := 'https://nsfgtaqpbwstpkmhgxrp.supabase.co/storage/v1/object/public/Uniloop-product-images/' || uid::text || '/';
  foreach item in array coalesce(p.image_urls,'{}') loop
    if item is null or left(item,length(prefix))<>prefix or substring(item from length(prefix)+1) !~ '^[0-9a-fA-F-]+\.(jpg|png|webp)$' then
      raise exception '商品圖片的位置無法自動清理，請先聯絡管理員';
    end if;
    if not exists(select 1 from public.products other where other.id<>p.id and other.deleted_at is null and item=any(other.image_urls)) then
      paths := array_append(paths, uid::text || '/' || substring(item from length(prefix)+1));
    end if;
  end loop;
  insert into public.product_image_cleanup(product_id,owner_id,paths) values(p.id,uid,paths);
  delete from public.favorites where product_id=p.id;
  update public.products set deleted_at=now(),status='下架',name=left(name,90) || '（商品已刪除）',description='',price=0,city='',school='',methods='{}',condition='',exchange_wish='',accept_difference='',image_urls='{}',legacy_source_key=null where id=p.id;
end $$;
create or replace function public.finish_product_image_cleanup(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.product_image_cleanup q join storage.objects o on o.bucket_id='Uniloop-product-images' and o.name=any(q.paths) where q.product_id=p_id and q.owner_id=auth.uid()) then raise exception '仍有圖片未刪除'; end if;
  delete from public.product_image_cleanup where product_id=p_id and owner_id=auth.uid();
end $$;
revoke all on function public.set_product_listing_status(uuid,text) from public;
revoke all on function public.archive_product(uuid) from public;
revoke all on function public.finish_product_image_cleanup(uuid) from public;
grant execute on function public.set_product_listing_status(uuid,text), public.archive_product(uuid), public.finish_product_image_cleanup(uuid) to authenticated;
commit;
