-- 唯讀：檢查商品、對話、交易與圖片的關聯及權限。
select 'constraint' as kind, n.nspname || '.' || c.relname as object_name,
       x.conname as name, pg_get_constraintdef(x.oid) as detail
from pg_constraint x
join pg_class c on c.oid = x.conrelid
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname in ('products','conversations','trade_requests','messages','favorites'))
   or x.confrelid = 'public.products'::regclass
union all
select 'policy', schemaname || '.' || tablename, policyname,
       cmd || ' roles=' || roles::text || ' using=' || coalesce(qual,'') || ' check=' || coalesce(with_check,'')
from pg_policies
where (schemaname = 'public' and tablename in ('products','conversations','trade_requests','messages','favorites'))
   or (schemaname = 'storage' and tablename = 'objects')
union all
select 'trigger', n.nspname || '.' || c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname='public'
  and c.relname in ('products','conversations','trade_requests','messages','favorites')
order by 1,2,3;
