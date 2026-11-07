-- UniLoop 管理員身分基礎；此檔只建立安全儲存角色的位置。
-- 不自動指定任何帳號，也不賦予管理商品、帳號或私密資料的權限。
-- 必須先由專案擁有者在 Supabase 確認目標雲端帳號的 UUID。
begin;

create table public.uniloop_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin')),
  created_at timestamptz not null default now()
);

alter table public.uniloop_user_roles enable row level security;
revoke all on table public.uniloop_user_roles from public, anon, authenticated;
grant select on table public.uniloop_user_roles to authenticated;

create policy "uniloop_roles_read_own"
on public.uniloop_user_roles for select
to authenticated
using ((select auth.uid()) = user_id);

commit;
