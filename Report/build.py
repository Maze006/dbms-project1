import re
q=open('out/queries.txt').read()
blocks=['mysql> '+b.rstrip() for b in q.split('mysql> ')[1:]]
t=open('report_template.md').read()
def rep(m): return blocks[int(m.group(1))]
t=re.sub(r'@@Q(\d+)@@',rep,t)
tests=open('out/tests.txt').read().split('== change cancelled')[0]  # placeholder replaced below
full=open('out/tests.txt').read().strip()
t=t.replace('@@TESTS@@',full+'\n\n'+'\n'.join(b for b in blocks[23:27]))
open('PROJECT_REPORT.md','w').write(t)
print(len(blocks))
