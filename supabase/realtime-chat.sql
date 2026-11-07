-- 啟用聊天訊息與交易狀態的即時變動通知；不刪除資料，也不修改 RLS 權限。
begin;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception '找不到 supabase_realtime publication，請先確認 Supabase Realtime 設定';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trade_requests') then
    alter publication supabase_realtime add table public.trade_requests;
  end if;
end $$;
commit;
select tablename as "已啟用即時通知的資料表"
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('messages', 'trade_requests')
order by tablename;
