-- 商品公開問答與通知；請先在測試環境確認後再套用。
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
commit;
