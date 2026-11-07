-- UniLoop 功能整合：評價、收藏通知、校園驗證與管理後台
-- 單一交易：任何步驟失敗時整批回滾。
begin;

-- 評價與收藏通知設定。套用前請核對目標專案及資料庫狀態。

create table if not exists public.trade_reviews (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trade_requests(id),
  reviewer_id uuid not null references auth.users(id),
  reviewee_id uuid not null references auth.users(id),
  reviewee_role text not null check (reviewee_role in ('buyer','seller')),
  stars smallint not null check (stars between 0 and 5),
  body text not null default '' check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);
alter table public.trade_reviews enable row level security;
revoke all on public.trade_reviews from public, anon, authenticated;

create or replace function public.save_trade_review(p_trade_id uuid, p_stars integer, p_body text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare t public.trade_requests; uid uuid := auth.uid(); target uuid; target_role text; clean_body text := trim(coalesce(p_body,''));
begin
  if uid is null then raise exception '請先登入'; end if;
  if p_stars is null or p_stars not between 0 and 5 or char_length(clean_body)>500 then raise exception '請選擇 0 至 5 星，留言最多 500 字'; end if;
  select * into t from public.trade_requests where id=p_trade_id for update;
  if not found or uid not in (t.buyer_id,t.seller_id) or t.status <> '交易完成' then raise exception '僅交易完成的雙方可以評價'; end if;
  if uid=t.buyer_id then target:=t.seller_id; target_role:='seller'; else target:=t.buyer_id; target_role:='buyer'; end if;
  insert into public.trade_reviews(trade_id,reviewer_id,reviewee_id,reviewee_role,stars,body)
  values(t.id,uid,target,target_role,p_stars,clean_body)
  on conflict (trade_id,reviewer_id) do update set stars=excluded.stars,body=excluded.body,updated_at=now();
end $$;

create or replace function public.get_my_trade_review(p_trade_id uuid)
returns table(stars smallint,body text) language sql stable security definer set search_path = '' as $$
  select r.stars,r.body from public.trade_reviews r where r.trade_id=p_trade_id and r.reviewer_id=auth.uid()
$$;

create or replace function public.get_public_reviews(p_user_id uuid)
returns table(reviewee_role text,stars smallint,body text,created_at timestamptz,updated_at timestamptz,reviewer_name text)
language sql stable security definer set search_path = '' as $$
  select r.reviewee_role,r.stars,r.body,r.created_at,r.updated_at,coalesce(nullif(p.display_name,''),'UniLoop 會員')
  from public.trade_reviews r left join public.profiles p on p.id=r.reviewer_id
  where r.reviewee_id=p_user_id order by r.updated_at desc
$$;
revoke all on function public.save_trade_review(uuid,integer,text),public.get_my_trade_review(uuid),public.get_public_reviews(uuid) from public;
grant execute on function public.save_trade_review(uuid,integer,text),public.get_my_trade_review(uuid) to authenticated;
grant execute on function public.get_public_reviews(uuid) to anon,authenticated;

create table if not exists public.favorite_change_notices (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  kind text not null check (kind in ('price_drop','unlisted','methods_changed')),
  old_price integer, new_price integer,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists favorite_change_notices_recipient_idx on public.favorite_change_notices(recipient_id,created_at desc);
alter table public.favorite_change_notices enable row level security;
revoke all on public.favorite_change_notices from public,anon,authenticated;
grant select on public.favorite_change_notices to authenticated;
grant update(read_at) on public.favorite_change_notices to authenticated;
drop policy if exists favorite_change_notice_read_own on public.favorite_change_notices;
create policy favorite_change_notice_read_own on public.favorite_change_notices for select to authenticated using(recipient_id=(select auth.uid()));
drop policy if exists favorite_change_notice_update_own on public.favorite_change_notices;
create policy favorite_change_notice_update_own on public.favorite_change_notices for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));

create or replace function public.notify_favorite_product_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.price < old.price then
    insert into public.favorite_change_notices(recipient_id,product_id,product_name,kind,old_price,new_price)
    select f.user_id,new.id,new.name,'price_drop',old.price,new.price from public.favorites f where f.product_id=new.id and f.user_id<>new.owner_id;
  end if;
  if old.status <> '下架' and new.status='下架' and new.deleted_at is null then
    insert into public.favorite_change_notices(recipient_id,product_id,product_name,kind)
    select f.user_id,new.id,new.name,'unlisted' from public.favorites f where f.product_id=new.id and f.user_id<>new.owner_id;
  end if;
  if not (coalesce(new.methods,'{}'::text[]) @> coalesce(old.methods,'{}'::text[]) and coalesce(old.methods,'{}'::text[]) @> coalesce(new.methods,'{}'::text[])) then
    insert into public.favorite_change_notices(recipient_id,product_id,product_name,kind)
    select f.user_id,new.id,new.name,'methods_changed' from public.favorites f where f.product_id=new.id and f.user_id<>new.owner_id;
  end if;
  return new;
end $$;
revoke all on function public.notify_favorite_product_change() from public;
drop trigger if exists notify_favorite_product_change on public.products;
create trigger notify_favorite_product_change after update of price,status,methods on public.products
for each row execute function public.notify_favorite_product_change();
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='favorite_change_notices') then
    alter publication supabase_realtime add table public.favorite_change_notices;
  end if;
end $$;

-- 校園信箱與管理員設定。套用前請核對目標專案及資料庫狀態。
create table if not exists public.uniloop_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('super_admin')),
  created_at timestamptz not null default now()
);
alter table public.uniloop_user_roles enable row level security;
revoke all on public.uniloop_user_roles from public,anon,authenticated;
grant select on public.uniloop_user_roles to authenticated;
drop policy if exists uniloop_roles_read_own on public.uniloop_user_roles;
create policy uniloop_roles_read_own on public.uniloop_user_roles for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.uniloop_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.uniloop_user_roles where user_id=auth.uid() and role='super_admin')
$$;
revoke all on function public.uniloop_is_admin() from public;
grant execute on function public.uniloop_is_admin() to authenticated;

-- 只返回真偽，不公開信箱；以 Auth 記錄中的已驗證登入信箱為準。
create or replace function public.uniloop_campus_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@]+@([a-z0-9-]+\.)+edu\.tw$')
$$;
revoke all on function public.uniloop_campus_verified(uuid) from public;
grant execute on function public.uniloop_campus_verified(uuid) to anon,authenticated;

create table if not exists public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  kind text not null check(kind in ('product','trade')),
  product_id uuid references public.products(id),
  trade_id uuid references public.trade_requests(id),
  reason text not null check(char_length(trim(reason)) between 1 and 500),
  status text not null default 'pending' check(status in ('pending','reviewing','closed')),
  resolution text not null default '' check(char_length(resolution)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((kind='product' and product_id is not null and trade_id is null) or (kind='trade' and trade_id is not null))
);
create table if not exists public.moderation_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  case_id uuid references public.moderation_cases(id),
  product_id uuid references public.products(id),
  reason text not null check(char_length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.moderation_cases enable row level security;
alter table public.moderation_audit enable row level security;
revoke all on public.moderation_cases,public.moderation_audit from public,anon,authenticated;

create or replace function public.uniloop_submit_case(p_kind text,p_product_id uuid,p_trade_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result uuid; t public.trade_requests; reason text:=trim(coalesce(p_reason,''));
begin
  if uid is null then raise exception '請先登入'; end if;
  if char_length(reason) not between 1 and 500 then raise exception '請輸入 1 至 500 字原因'; end if;
  if p_kind='product' then
    if p_trade_id is not null or not exists(select 1 from public.products p where p.id=p_product_id and p.deleted_at is null and p.owner_id<>uid) then raise exception '無法檢舉此商品'; end if;
  elsif p_kind='trade' then
    select * into t from public.trade_requests where id=p_trade_id;
    if not found or uid not in (t.buyer_id,t.seller_id) then raise exception '找不到交易或沒有權限'; end if;
    p_product_id:=t.product_id;
  else raise exception '案件類型無效'; end if;
  insert into public.moderation_cases(reporter_id,kind,product_id,trade_id,reason) values(uid,p_kind,p_product_id,p_trade_id,reason) returning id into result;
  return result;
end $$;

create or replace function public.uniloop_admin_cases()
returns table(id uuid,kind text,product_id uuid,trade_id uuid,reason text,status text,resolution text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.uniloop_is_admin() then raise exception '沒有管理員權限'; end if;
  return query select c.id,c.kind,c.product_id,c.trade_id,c.reason,c.status,c.resolution,c.created_at,c.updated_at from public.moderation_cases c order by c.created_at desc limit 200;
end $$;
create or replace function public.uniloop_admin_update_case(p_id uuid,p_status text,p_resolution text)
returns void language plpgsql security definer set search_path='' as $$
declare note text:=trim(coalesce(p_resolution,''));
begin
  if not public.uniloop_is_admin() then raise exception '沒有管理員權限'; end if;
  if p_status not in ('pending','reviewing','closed') or char_length(note) not between 1 and 500 then raise exception '請填寫處理紀錄'; end if;
  update public.moderation_cases set status=p_status,resolution=note,updated_at=now() where id=p_id;
  if not found then raise exception '案件不存在'; end if;
  insert into public.moderation_audit(admin_id,action,case_id,reason) values(auth.uid(),'update_case',p_id,note);
end $$;
create or replace function public.uniloop_admin_unlist(p_product_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.products; note text:=trim(coalesce(p_reason,''));
begin
  if not public.uniloop_is_admin() then raise exception '沒有管理員權限'; end if;
  if char_length(note) not between 1 and 500 then raise exception '請填寫下架原因'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found or p.deleted_at is not null or p.status<>'上架中' then raise exception '此商品無法下架'; end if;
  if exists(select 1 from public.trade_requests t where t.product_id=p.id and t.status in ('待賣家確認','已接受','買家已確認收貨')) then raise exception '商品有進行中的申請，請先處理交易'; end if;
  update public.products set status='下架' where id=p.id;
  insert into public.moderation_audit(admin_id,action,product_id,reason) values(auth.uid(),'unlist_product',p.id,note);
end $$;
create or replace function public.uniloop_admin_audit()
returns table(admin_id uuid,action text,case_id uuid,product_id uuid,reason text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.uniloop_is_admin() then raise exception '沒有管理員權限'; end if;
  return query select a.admin_id,a.action,a.case_id,a.product_id,a.reason,a.created_at from public.moderation_audit a order by a.created_at desc limit 200;
end $$;
create or replace function public.uniloop_admin_products()
returns table(id uuid,name text,status text,owner_id uuid) language plpgsql stable security definer set search_path='' as $$
begin
  if not public.uniloop_is_admin() then raise exception '沒有管理員權限'; end if;
  return query select p.id,p.name,p.status,p.owner_id from public.products p where p.deleted_at is null order by p.created_at desc limit 200;
end $$;
create or replace function public.uniloop_admin_members()
returns table(id uuid,display_name text,school text,city text,campus_verified boolean) language plpgsql stable security definer set search_path='' as $$
begin
  if not public.uniloop_is_admin() then raise exception '沒有管理員權限'; end if;
  return query select u.id,p.display_name,p.school,p.city,public.uniloop_campus_verified(u.id) from auth.users u left join public.profiles p on p.id=u.id order by u.created_at desc limit 200;
end $$;
revoke all on function public.uniloop_submit_case(text,uuid,uuid,text),public.uniloop_admin_cases(),public.uniloop_admin_update_case(uuid,text,text),public.uniloop_admin_unlist(uuid,text),public.uniloop_admin_audit(),public.uniloop_admin_products(),public.uniloop_admin_members() from public;
grant execute on function public.uniloop_submit_case(text,uuid,uuid,text),public.uniloop_admin_cases(),public.uniloop_admin_update_case(uuid,text,text),public.uniloop_admin_unlist(uuid,text),public.uniloop_admin_audit(),public.uniloop_admin_products(),public.uniloop_admin_members() to authenticated;

commit;
