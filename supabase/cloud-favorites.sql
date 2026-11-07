-- 雲端商品收藏：每個使用者只能讀取、加入及移除自己的收藏。
begin;
create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.favorites enable row level security;
drop policy if exists favorites_read_own on public.favorites;
drop policy if exists favorites_add_own on public.favorites;
drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_read_own on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_add_own on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_delete_own on public.favorites for delete to authenticated using (user_id = auth.uid());
revoke all on public.favorites from anon;
revoke all on public.favorites from authenticated;
grant select, insert, delete on public.favorites to authenticated;
commit;
