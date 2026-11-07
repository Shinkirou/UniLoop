-- 每位聊天室參與者各自儲存最後讀過的訊息時間。
begin;
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (conversation_id, user_id)
);
alter table public.conversation_reads enable row level security;
drop policy if exists conversation_reads_select_own on public.conversation_reads;
drop policy if exists conversation_reads_insert_own on public.conversation_reads;
drop policy if exists conversation_reads_update_own on public.conversation_reads;
create policy conversation_reads_select_own on public.conversation_reads for select to authenticated
  using (user_id = auth.uid());
create policy conversation_reads_insert_own on public.conversation_reads for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.conversations c
    where c.id = conversation_reads.conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
create policy conversation_reads_update_own on public.conversation_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from public.conversations c
    where c.id = conversation_reads.conversation_id and auth.uid() in (c.buyer_id,c.seller_id)));
revoke all on public.conversation_reads from public, anon, authenticated;
grant select, insert, update on public.conversation_reads to authenticated;
commit;
