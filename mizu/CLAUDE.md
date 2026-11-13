# MIZU 接案管理 — 給 Claude 的交接筆記

00（Sandy）和米米（MIRANDA）兩個人共用的接案管理網頁。使用者講繁體中文，回覆一律用繁體中文。

## 架構
- **前端**：單一 HTML，GitHub Pages：https://mizuzipp.github.io/project/
  - 原始碼：`mizu/src/index.tpl.html`（模板，含 `__API__`、`__VER__` 等 placeholder）
  - 打包：在 repo 根目錄跑 `python3 mizu/build/build.py` → 產生根目錄 `index.html`（正式）和 `mizu/build/preview.html`（預覽，不連後台、用 `demo-cases.json` 假資料）
  - **不要直接改根目錄 index.html**，一律改模板再 build
- **後端**：Google Apps Script（綁在 Google Sheet「MIZU 接案資料庫」）
  - 原始碼：`mizu/gas/Code.gs`（build 時會複製到 `apps-script/Code.gs`）
  - Web App 網址寫在 build.py 的 `API`
  - 前端用 `fetch` POST，`Content-Type: text/plain`，body `{fn, args}`，回 `{ok, data|error}`；`doPost` 依 `body.fn` 分流，其餘當 LINE webhook
  - 登入用 token（Script Properties `tok_<uuid>`）
- **資料**：Google Sheet 分頁：案件、支出、帳號、月結、聊天（已停用）、日曆同步（隱藏）
  - 案件欄位：id、案名、品牌、歸屬(00/米米/Mizu)、接案人、規格、狀態、實拿金額、分帳方式、固定金額×2、6 個時程的「日／完成」（拍攝、腳本、AC、廠商過稿、上線、匯款）、廠商聯絡人、相關連結、備註、最後修改、修改時間、時間、隸屬月份
  - 相關連結欄存成多行：`Brief｜url`、`腳本｜url`、`其他｜url`（前端 parseLinks/serLinks）

## 業務規則
- 狀態 9 種：確定合作、On hold、過腳本中、剪輯中、過稿中、待發布、未發布已結帳、待匯款、已結案；勾時程「完成」會自動推進狀態
- Mizu 案：拍攝兩人一起、腳本 00、AC 米米、過稿／上線／匯款＝接案人（收款人）；分帳對半或固定金額
- 月份一律看「隸屬月份」，空白＝跟拍攝日的月份；都沒有的算 On hold（案件清單底部「On hold・未排拍攝」區）
- 案件排序：確定合作 → 審稿（過腳本中、過稿中）→ 剪輯中 → 發布 → 結案 → On hold；同狀態下一個時程日期近的在前
- 支出有「誰付的」＋「算誰的」（平分／全算00／全算米米），月結會扣代墊
- 日曆：00 個人案 → TZU、米米個人案 → Miranda、**Mizu 案 → mizu.zipp@gmail.com 預設日曆**（「mizu 米事」已停用）；匯款行程紅色；同一天名稱相近的手動行程會被沿用不重建
- 每晚 9 點 LINE 待辦摘要；LINE token 只放在 Script Properties，**絕對不能寫進 repo**

## 部署流程
1. 改 `mizu/src/index.tpl.html`（和 `mizu/gas/Code.gs`），跑 build
2. 用 playwright 開 `mizu/build/preview.html` 測手機（390×844）和電腦（1440×900），確認沒有 JS 錯誤
3. commit（作者 mizuzipp / mizu.zipp@gmail.com）並 push → GitHub Pages 自動部署（偶爾 GitHub 回 Internal server error，推一個空 commit 重跑）
4. 有改 Code.gs 時，要請使用者到 Apps Script 貼上新 Code.gs，**部署 → 管理部署 → 編輯 → 新版本**（不要新增部署，網址會變）
5. Pages 有約 10 分鐘快取；個人設定最下面的「MIZU 版本 MM/DD HH:MM」可確認版本

## 使用者的習慣（重要）
- 每次更新都在 `ANN` 陣列最前面加一則公告（網頁會自動跳出新功能說明）
- UI 改動先做 demo（預覽版）給她看，她說好才上正式版；給選項時常要「5 個版本」
- 她不喜歡太制式、要多一步操作的功能（信件、聊天室都做了又拿掉）；偏好電腦版操作
- 回覆簡潔、先講結論；她生氣時直接承認、修正，不要找藉口
- repo 是公開的：**不要 commit 真實案件資料、密碼、token**；預覽用 `demo-cases.json` 假資料

## 待辦／注意
- 最新 Code.gs（Mizu 案改放預設日曆、清重複行程）需要使用者部署新版本後，在編輯器執行一次 `moveMizuToMain`
- 帳號密碼明碼存在 Sheet「帳號」分頁，提醒過不要分享 Sheet
