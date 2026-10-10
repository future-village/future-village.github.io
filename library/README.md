# 書架（目前 0 本）
每本書用 `library/<id>.json`，只收說明與公開出處，不執行。`id` 是小寫 slug，規則與成員 id 相同。
必填：`title`、`summary`、`source_url`（https）、`tags`（字串陣列）、`added_by`、`made_by`（human 或 ai_marked）、`license`、`version`（非空版本字串）、`verified_on`（最後驗證日，YYYY-MM-DD，須是真的日曆日，不能晚於台北今天）、`do_not_execute: true`。
`library/` 裡除了這個 `README.md` 與上述 JSON，其他檔案、子目錄、連結都不收，包括 `SKILL.md`。
不收本機路徑。可執行內容只認標記，出現在任何欄位就退：三個反引號或 `~~~` 的圍欄、`<script`、`<%`、`<?php`、`javascript:`、`data:text/html`、`onload=` 這類 `on*=`。散文裡的 function、import、require 不算。拿來警告別人時也不要寫出這些標記本身。
成員可選填 `recommends`（書 id 陣列），不占房間格。
