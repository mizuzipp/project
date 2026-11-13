"""Claude 處理「回報問題」用的小工具（金鑰放在 ~/.mizu/claude_key，不在 repo 裡）
  python3 mizu/tools/claude_reports.py list            # 列出待處理／處理中的回報
  python3 mizu/tools/claude_reports.py all             # 列出全部回報
  python3 mizu/tools/claude_reports.py reply ID 狀態 "給 00/米米 看的說明"
       狀態：處理中／已修好／等你確認／需要你幫忙／不用處理
  python3 mizu/tools/claude_reports.py cases           # 讀案件資料（找原因用，只讀；不要貼進 repo）
  python3 mizu/tools/claude_reports.py copykey         # 把金鑰複製到剪貼簿（設定 Apps Script 用）
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
API = re.search(r"API = '([^']+)'", open(os.path.join(ROOT, 'mizu/build/build.py'), encoding='utf-8').read()).group(1)
KEY = open(os.path.expanduser('~/.mizu/claude_key')).read().strip()

def call(fn, *args):
    # 用 curl（這台 Mac 的 Python 沒裝 SSL 憑證）；Apps Script 會 302 轉址，-L 跟過去
    out = subprocess.run(['curl', '-sSL', '--max-time', '90', '-H', 'Content-Type: text/plain;charset=utf-8',
                          '--data-binary', '@-', API], input=json.dumps({'fn': fn, 'args': list(args)}).encode(),
                         capture_output=True, check=True).stdout
    j = json.loads(out)
    if not j.get('ok'):
        sys.exit('錯誤：' + str(j.get('error')))
    return j['data']

cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
if cmd in ('list', 'all'):
    rs = call('apiClaudeReports', KEY, cmd == 'all')
    for r in rs:
        r.pop('row', None)
    print(json.dumps(rs, ensure_ascii=False, indent=1) if rs else '沒有待處理的回報')
elif cmd == 'reply':
    print(call('apiClaudeReply', KEY, sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None))
elif cmd == 'cases':
    print(json.dumps(call('apiClaudeLoad', KEY), ensure_ascii=False))
elif cmd == 'copykey':
    subprocess.run('pbcopy', input=KEY.encode()); print('金鑰已複製到剪貼簿')
else:
    print(__doc__)
