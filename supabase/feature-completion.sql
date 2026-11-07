-- 問答、通知、商品圖片編輯及交易通知：一次交易套用。
begin;

create table if not exists public.product_questions (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id),
 author_id uuid not null references auth.users(id),
 body text not null check(char_length(trim(body)) between 1 and 200),
 answer text check(answer is null or char_length(trim(answer)) between 1 and 200),
 created_at timestamptz not null default now(),
 answered_at timestamptz
);
create index if not exists product_questions_product_time on public.product_questions(product_id,created_at);
create table if not exists public.question_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id),
 question_id uuid not null references public.product_questions(id),
 kind text not null check(kind in ('question','answer')),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists question_notifications_recipient_time on public.question_notifications(recipient_id,created_at desc);
alter table public.product_questions enable row level security;
alter table public.question_notifications enable row level security;
revoke all on public.product_questions,public.question_notifications from public,anon,authenticated;
grant select on public.product_questions to anon,authenticated;
grant select on public.question_notifications to authenticated;
grant update(read_at) on public.question_notifications to authenticated;
drop policy if exists questions_public_read on public.product_questions;
create policy questions_public_read on public.product_questions for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_questions.product_id and p.deleted_at is null));
drop policy if exists question_notifications_read_own on public.question_notifications;
create policy question_notifications_read_own on public.question_notifications for select to authenticated using(recipient_id=(select auth.uid()));
drop policy if exists question_notifications_update_own on public.question_notifications;
create policy question_notifications_update_own on public.question_notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
create or replace function public.create_product_question(p_product_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.products; qid uuid; uid uuid:=auth.uid(); body text:=trim(p_body);
begin
 if uid is null then raise exception '請先登入'; end if;
 if body is null or char_length(body) not between 1 and 200 or body ~* '(@|([0-9][ -]*){8,}|(縣|市|區|鄉|鎮).{0,16}(路|街|巷|號))' then raise exception '請填寫200字以內的問題，勿包含電話、地址或電子郵件'; end if;
 select * into p from public.products where id=p_product_id for update;
 if not found or p.deleted_at is not null or p.status<>'上架中' then raise exception '此商品目前無法提問'; end if;
 if uid=p.owner_id then raise exception '不能向自己的商品提問'; end if;
 insert into public.product_questions(product_id,author_id,body) values(p.id,uid,body) returning id into qid;
 insert into public.question_notifications(recipient_id,question_id,kind) values(p.owner_id,qid,'question');
 return qid;
end $$;
create or replace function public.answer_product_question(p_question_id uuid,p_answer text)
returns void language plpgsql security definer set search_path='' as $$
declare q public.product_questions; p public.products; uid uuid:=auth.uid(); answer_text text:=trim(p_answer);
begin
 if uid is null then raise exception '請先登入'; end if;
 if answer_text is null or char_length(answer_text) not between 1 and 200 or answer_text ~* '(@|([0-9][ -]*){8,}|(縣|市|區|鄉|鎮).{0,16}(路|街|巷|號))' then raise exception '請填寫200字以內的回覆，勿包含電話、地址或電子郵件'; end if;
 select * into q from public.product_questions where id=p_question_id for update;
 if not found then raise exception '找不到問題'; end if;
 select * into p from public.products where id=q.product_id;
 if not found or p.owner_id<>uid or p.deleted_at is not null then raise exception '無權回覆此問題'; end if;
 if q.answer is not null then raise exception '此問題已有回覆'; end if;
 update public.product_questions set answer=answer_text,answered_at=now() where id=q.id;
 insert into public.question_notifications(recipient_id,question_id,kind) values(q.author_id,q.id,'answer');
end $$;
create or replace function public.question_start_chat(p_question_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare q public.product_questions; p public.products; cid uuid; uid uuid:=auth.uid();
begin
 if uid is null then raise exception '請先登入'; end if;
 select * into q from public.product_questions where id=p_question_id;
 if not found then raise exception '找不到問題'; end if;
 select * into p from public.products where id=q.product_id for update;
 if not found or p.deleted_at is not null or uid not in (q.author_id,p.owner_id) then raise exception '無法開啟此對話'; end if;
 select id into cid from public.conversations where product_id=p.id and buyer_id=q.author_id and seller_id=p.owner_id;
 if cid is not null then return cid; end if;
 if p.status<>'上架中' then raise exception '此商品目前無法建立新對話'; end if;
 insert into public.conversations(product_id,buyer_id,seller_id) values(p.id,q.author_id,p.owner_id) on conflict (product_id,buyer_id,seller_id) do nothing;
 select id into cid from public.conversations where product_id=p.id and buyer_id=q.author_id and seller_id=p.owner_id;
 return cid;
end $$;
revoke all on function public.create_product_question(uuid,text),public.answer_product_question(uuid,text),public.question_start_chat(uuid) from public;
grant execute on function public.create_product_question(uuid,text),public.answer_product_question(uuid,text),public.question_start_chat(uuid) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='question_notifications') then alter publication supabase_realtime add table public.question_notifications; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='product_questions') then alter publication supabase_realtime add table public.product_questions; end if;
 end if;
end $$;

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
