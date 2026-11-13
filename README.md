# MIZU 接案管理

00 × 米米 的接案管理網頁：https://mizuzipp.github.io/project/

| 位置 | 內容 |
|---|---|
| `mizu/src/index.tpl.html` | 網頁原始碼（模板） |
| `mizu/gas/Code.gs` | Google Apps Script 後台原始碼 |
| `mizu/build/build.py` | 打包：產生 `index.html` 和預覽版 |
| `mizu/build/demo-cases.json` | 預覽用的假案件 |
| `mizu/CLAUDE.md` | 給 Claude 的交接筆記（架構、規則、部署流程） |
| `index.html`、`logo.png` | GitHub Pages 正式網頁（由 build 產生） |
| `apps-script/Code.gs` | 要貼到 Apps Script 的程式（由 build 複製） |

更新流程：改 `mizu/` 裡的檔案 → `python3 mizu/build/build.py` → commit & push。
後台有改時：把 `apps-script/Code.gs` 貼到 Apps Script → 部署 → 管理部署 → 編輯 → 新版本。
