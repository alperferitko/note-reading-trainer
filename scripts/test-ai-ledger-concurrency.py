"""Real two-connection tests. CI throwaway PostgreSQL only, stdlib + psql."""
import subprocess
from concurrent.futures import ThreadPoolExecutor


def sql(query):
    return subprocess.check_output(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', query], text=True).strip()


def reserve(user, key):
    return sql("select public.ai_usage_reserve(repeat('s',20),'10000000-0000-0000-0000-00000000000%s','%s',repeat('a',64),20000,'fixture-only')->>'status'" % (user, key))


sql("update ai_private.control set enabled=true,project_ref=repeat('s',20)")
with ThreadPoolExecutor(2) as pool:
    outcomes = list(pool.map(lambda key: reserve(1, key), ['parallel-a', 'parallel-b']))
assert sorted(outcomes) == ['limited', 'reserved'], outcomes
sql('truncate ai_private.requests')
with ThreadPoolExecutor(2) as pool:
    outcomes = list(pool.map(lambda _: reserve(1, 'same-key'), range(2)))
assert sorted(outcomes) == ['conflict', 'reserved'], outcomes
sql('truncate ai_private.requests; update ai_private.control set global_daily_micro=20000')
with ThreadPoolExecutor(2) as pool:
    outcomes = list(pool.map(lambda user: reserve(user, 'isolated'), [1, 2]))
assert sorted(outcomes) == ['limited', 'reserved'], outcomes
assert sql('select sum(charged_micro) from ai_private.requests') == '20000'
print('PASS real PostgreSQL: concurrent per-user slots, duplicate race, cross-user global budget')