"""MIZU 網頁打包：從 mizu/src/index.tpl.html 產生
  - index.html（repo 根目錄，GitHub Pages 正式版，連 Apps Script）
  - mizu/build/preview.html（預覽版：不連後台、用假資料、可切換 demo）
同時把 mizu/gas/Code.gs 複製到 apps-script/Code.gs。
在 repo 根目錄執行：python3 mizu/build/build.py
"""
import base64, datetime, json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = lambda *a: os.path.join(ROOT, *a)
API = 'https://script.google.com/macros/s/AKfycbxTTw26633tgnWgNWRzv9GgxQjzNOemr9O-CcC8OWV5MiC9ewHZpXF00QxcQj7hGUw21Q/exec'

ver = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%m/%d %H:%M')
t = open(P('mizu/src/index.tpl.html'), encoding='utf-8').read().replace('__VER__', ver)

# 開關：正式版／預覽版
FLAGS = {
    'gh': {'__D2__': 'true', '__UXD__': 'false', '__HDEMO__': 'false', '__HMODE__': '1', '__MDEMO__': 'false',
           '__MMODE__': 'A', '__NEWF__': 'true', '__CHAT__': 'false', '__RPT__': 'true', '__EDT__': 'true'},
    'pv': {'__D2__': 'true', '__UXD__': 'true', '__HDEMO__': 'false', '__HMODE__': '1', '__MDEMO__': 'false',
           '__MMODE__': 'A', '__NEWF__': 'true', '__CHAT__': 'false', '__RPT__': 'true', '__EDT__': 'true'},
}

def fill(h, flags):
    for k, v in flags.items():
        h = h.replace(k, v)
    return h

def demo_cases():
    cs = json.load(open(P('mizu/build/demo-cases.json'), encoding='utf-8'))
    n = 0
    for c in cs:
        if c.get('status') in ('確定合作', '過腳本中', '剪輯中', '過稿中', '待發布') and n < 6:
            c['link'] = 'Brief｜https://drive.google.com/file/d/demo-brief/view\n腳本｜https://docs.google.com/spreadsheets/d/demo-script/edit'
            n += 1
    return json.dumps(cs, ensure_ascii=False)

gh = fill(t, FLAGS['gh']).replace('__API__', API).replace('__ICON__', 'logo.png').replace('__DEMO__', '[]')
logo = 'data:image/png;base64,' + base64.b64encode(open(P('logo.png'), 'rb').read()).decode()
pv = fill(t, FLAGS['pv']).replace('__API__', '').replace('__ICON__', logo).replace('__DEMO__', demo_cases())

open(P('index.html'), 'w', encoding='utf-8').write(gh)
open(P('mizu/build/preview.html'), 'w', encoding='utf-8').write(pv)
shutil.copy(P('mizu/gas/Code.gs'), P('apps-script/Code.gs'))

left = sorted(set(re.findall(r'__[A-Z0-9]+__', gh + pv)) - {'__proto__'})
assert not left, f'還有沒替換的 placeholder：{left}'
print(f'built {ver}  index.html {len(gh):,} bytes  preview.html {len(pv):,} bytes')
