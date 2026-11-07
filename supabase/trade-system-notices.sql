-- 將交易事件與聊天室系統訊息放在同一個資料庫交易中。
begin;
-- 既有訊息保留為舊版，之後使用者訊息與系統訊息各自標記。
alter table public.messages add column if not exists message_type text not null default 'legacy';
alter table public.messages alter column message_type set default 'user';
revoke insert on public.messages from public,anon,authenticated;
revoke insert(id,conversation_id,sender_id,body,created_at,message_type) on public.messages from public,anon,authenticated;
grant insert(conversation_id,sender_id,body) on public.messages to authenticated;
create or replace function public.emit_trade_system_notice()
returns trigger language plpgsql security definer set search_path='' as $$
declare chat_id uuid; actor uuid:=auth.uid(); msg text;
begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
 if actor is null then raise exception '交易通知需要登入身分'; end if;
 insert into public.conversations(product_id,buyer_id,seller_id) values(new.product_id,new.buyer_id,new.seller_id)
  on conflict(product_id,buyer_id,seller_id) do nothing;
 select id into chat_id from public.conversations where product_id=new.product_id and buyer_id=new.buyer_id and seller_id=new.seller_id;
 if tg_op='INSERT' then msg:='已提出「' || new.method || '」交易申請。';
 else msg:='交易狀態已更新：' || new.status || case when new.status='已取消' and coalesce(new.cancel_reason,'')<>'' then '（原因：' || new.cancel_reason || '）' else '' end;
 end if;
 insert into public.messages(conversation_id,sender_id,body,message_type) values(chat_id,actor,msg,'system');
 return new;
end $$;
drop trigger if exists trade_system_notice on public.trade_requests;
create trigger trade_system_notice after insert or update of status on public.trade_requests
for each row execute function public.emit_trade_system_notice();
revoke all on function public.emit_trade_system_notice() from public;
create or replace function public.server_trade_notices_enabled() returns boolean language sql stable as $$ select true $$;
revoke all on function public.server_trade_notices_enabled() from public;
grant execute on function public.server_trade_notices_enabled() to authenticated;
commit;
