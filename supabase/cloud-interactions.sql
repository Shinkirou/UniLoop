-- UniLoop 雲端聊天與模擬交易。尚未套用至 Supabase。
-- 交易狀態變更只透過資料庫函式執行，以原子操作維護商品狀態。
begin;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  unique (product_id, buyer_id, seller_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_time_idx on public.messages(conversation_id, created_at);

create table if not exists public.trade_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  buyer_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  method text not null check (method in ('買賣','交換','贈送')),
  status text not null default '待賣家確認' check (status in ('待賣家確認','已接受','已拒絕','買家已確認收貨','已取消','交易完成','商品已成交')),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create unique index if not exists trade_one_active_buyer_idx on public.trade_requests(product_id, buyer_id)
  where status in ('待賣家確認','已接受','買家已確認收貨');
create unique index if not exists trade_one_accepted_product_idx on public.trade_requests(product_id)
  where status in ('已接受','買家已確認收貨');

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.trade_requests enable row level security;

-- 商品狀態只由交易函式更動；一般帳號仍可編輯自己的商品文字資料。
-- 原本的 products_update_own RLS 繼續限制只能修改自己的資料列。
revoke update on public.products from public, anon, authenticated;
revoke update (id, owner_id, name, description, category, price, city, school,
  methods, condition, exchange_wish, accept_difference, image_urls, status,
  created_at, legacy_source_key) on public.products from public, anon, authenticated;
grant update (name, description, category, price, city, school, methods,
  condition, exchange_wish, accept_difference, image_urls)
  on public.products to authenticated;

drop policy if exists conversations_read_participant on public.conversations;
drop policy if exists conversations_create_buyer on public.conversations;
drop policy if exists messages_read_participant on public.messages;
drop policy if exists messages_send_participant on public.messages;
drop policy if exists trade_read_participant on public.trade_requests;
create policy conversations_read_participant on public.conversations for select to authenticated
  using (auth.uid() in (buyer_id, seller_id));
create policy conversations_create_buyer on public.conversations for insert to authenticated
  with check (buyer_id = auth.uid() and buyer_id <> seller_id and exists
    (select 1 from public.products p where p.id = conversations.product_id and p.owner_id = conversations.seller_id and p.status = '上架中'));

create policy messages_read_participant on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = messages.conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
create policy messages_send_participant on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and exists
    (select 1 from public.conversations c where c.id = messages.conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
create policy trade_read_participant on public.trade_requests for select to authenticated
  using (auth.uid() in (buyer_id,seller_id));

-- 所有交易寫入均由資料庫函式進行，不開放客戶端直接更新交易列。
create or replace function public.create_trade_request(p_product_id uuid, p_method text)
returns public.trade_requests
language plpgsql security definer set search_path = '' as $$
declare p public.products; result public.trade_requests; uid uuid := auth.uid();
begin
  if uid is null then raise exception '請先登入'; end if;
  select * into p from public.products where id = p_product_id for update;
  if not found or p.status <> '上架中' then raise exception '商品目前無法申請'; end if;
  if p.owner_id = uid then raise exception '不能申請自己的商品'; end if;
  if p_method is null or not (p_method = any(p.methods)) or p_method not in ('買賣','交換','贈送') then
    raise exception '交易方式無效';
  end if;
  insert into public.trade_requests(product_id,buyer_id,seller_id,method)
    values (p.id,uid,p.owner_id,p_method) returning * into result;
  return result;
end $$;

create or replace function public.transition_trade_request(p_id uuid, p_status text, p_reason text default null)
returns public.trade_requests
language plpgsql security definer set search_path = '' as $$
declare t public.trade_requests; p public.products; uid uuid := auth.uid();
begin
  if uid is null then raise exception '請先登入'; end if;
  -- 一律先鎖商品，再鎖申請，避免不同申請同時操作時互相等待。
  select * into t from public.trade_requests where id = p_id;
  if not found or uid not in (t.buyer_id,t.seller_id) then raise exception '找不到交易'; end if;
  select * into p from public.products where id = t.product_id for update;
  select * into t from public.trade_requests where id = p_id for update;
  if p.owner_id <> t.seller_id then raise exception '商品擁有者已變更'; end if;
  if p_status = '已接受' and uid = t.seller_id and t.status = '待賣家確認' then
    if p.status <> '上架中' then raise exception '商品目前無法接受申請'; end if;
    update public.products set status = '預約中' where id = p.id;
  elsif p_status = '已拒絕' and uid = t.seller_id and t.status = '待賣家確認' then
    null;
  elsif p_status = '買家已確認收貨' and uid = t.buyer_id and t.status = '已接受' then
    null;
  elsif p_status = '已取消' and uid = t.buyer_id and t.status in ('待賣家確認','已接受','買家已確認收貨') then
    if char_length(trim(coalesce(p_reason,''))) not between 1 and 200 then raise exception '請填寫取消原因'; end if;
    if t.status in ('已接受','買家已確認收貨') and p.status = '預約中' then
      update public.products set status = '上架中' where id = p.id;
    end if;
  elsif p_status = '交易完成' and uid = t.seller_id and t.status = '買家已確認收貨' then
    if p.status <> '預約中' then raise exception '商品狀態不符'; end if;
    update public.products set status = '交易完成' where id = p.id;
    update public.trade_requests set status = '商品已成交', updated_at = now()
      where product_id = p.id and id <> t.id and status = '待賣家確認';
  else
    raise exception '目前身分或交易狀態無法執行此操作';
  end if;
  update public.trade_requests set status = p_status, cancel_reason = case when p_status = '已取消' then trim(p_reason) else cancel_reason end,
    updated_at = now() where id = t.id returning * into t;
  return t;
end $$;

revoke all on function public.create_trade_request(uuid,text) from public;
revoke all on function public.transition_trade_request(uuid,text,text) from public;
grant execute on function public.create_trade_request(uuid,text) to authenticated;
grant execute on function public.transition_trade_request(uuid,text,text) to authenticated;
revoke all on public.conversations, public.messages, public.trade_requests from anon, authenticated;
grant select, insert on public.conversations, public.messages to authenticated;
grant select on public.trade_requests to authenticated;
commit;
