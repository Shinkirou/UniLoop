-- 校園信箱與管理員設定。套用前請核對目標專案及資料庫狀態。
begin;
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
