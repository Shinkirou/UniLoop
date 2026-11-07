-- 更換商品圖片時先更新資料並保留待清理紀錄；實體刪除仍透過 Storage API。
begin;
revoke update(image_urls) on public.products from authenticated;
create or replace function public.update_product_images(p_id uuid,p_urls text[])
returns void language plpgsql security definer set search_path='' as $$
declare p public.products; uid uuid:=auth.uid(); item text; prefix text; paths text[]:='{}';
begin
 if uid is null then raise exception '請先登入'; end if;
 select * into p from public.products where id=p_id for update;
 if not found or p.owner_id<>uid or p.deleted_at is not null or p.status not in ('上架中','下架') then raise exception '此商品無法編輯'; end if;
 if p_urls is null or cardinality(p_urls)>3 then raise exception '最多保留3張圖片'; end if;
 if exists(select 1 from public.product_image_cleanup where product_id=p.id) then raise exception '請先回到我的商品完成圖片清理'; end if;
 prefix:='https://nsfgtaqpbwstpkmhgxrp.supabase.co/storage/v1/object/public/Uniloop-product-images/' || uid::text || '/';
 foreach item in array p_urls loop
  if item is null or left(item,length(prefix))<>prefix or substring(item from length(prefix)+1) !~ '^[0-9a-fA-F-]+\.(jpg|png|webp)$' then raise exception '圖片位置無效'; end if;
  if not exists(select 1 from storage.objects where bucket_id='Uniloop-product-images' and name=uid::text || '/' || substring(item from length(prefix)+1) and owner_id=uid::text) then raise exception '圖片不存在或不屬於此帳號'; end if;
 end loop;
 foreach item in array coalesce(p.image_urls,'{}') loop
  if item=any(p_urls) then continue; end if;
  if item is null or left(item,length(prefix))<>prefix or substring(item from length(prefix)+1) !~ '^[0-9a-fA-F-]+\.(jpg|png|webp)$' then raise exception '舊圖片位置無法自動清理'; end if;
  if not exists(select 1 from public.products other where other.id<>p.id and other.deleted_at is null and item=any(other.image_urls)) then paths:=array_append(paths,uid::text || '/' || substring(item from length(prefix)+1)); end if;
 end loop;
 update public.products set image_urls=p_urls where id=p.id;
 if cardinality(paths)>0 then insert into public.product_image_cleanup(product_id,owner_id,paths) values(p.id,uid,paths); end if;
end $$;
revoke all on function public.update_product_images(uuid,text[]) from public;
grant execute on function public.update_product_images(uuid,text[]) to authenticated;
commit;
