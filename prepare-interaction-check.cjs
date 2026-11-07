// 產生只在交易中暫時建立結構、最後回滾的檢查腳本。
const fs = require('node:fs');
const sql = fs.readFileSync('supabase/cloud-interactions.sql', 'utf8');
if (!/^begin;\s*$/m.test(sql) || !/commit;\s*$/.test(sql)) throw new Error('Unexpected migration transaction');
const checks = `
do $$
begin
  if has_table_privilege('authenticated', 'public.products', 'UPDATE') then
    raise exception 'authenticated still has table-wide UPDATE privilege';
  end if;
  if has_column_privilege('authenticated', 'public.products', 'status', 'UPDATE') then
    raise exception 'authenticated can still directly update product status';
  end if;
  if has_column_privilege('authenticated', 'public.products', 'owner_id', 'UPDATE') then
    raise exception 'authenticated can still directly update product ownership';
  end if;
  if not has_column_privilege('authenticated', 'public.products', 'name', 'UPDATE') then
    raise exception 'authenticated cannot update product name';
  end if;
  if has_table_privilege('authenticated', 'public.trade_requests', 'INSERT') or
     has_table_privilege('authenticated', 'public.trade_requests', 'UPDATE') then
    raise exception 'trade writes are directly accessible';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.messages'::regclass) then
    raise exception 'messages row level security is not enabled';
  end if;
end $$;
rollback;
select '權限與資料結構檢查通過；所有暫時變更已回滾' as result;
`;
fs.writeFileSync('supabase/check-interactions-rollback.sql', sql.replace(/commit;\s*$/, () => checks), 'utf8');
