-- 評價與收藏通知設定。套用前請核對目標專案及資料庫狀態。
begin;

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
commit;
