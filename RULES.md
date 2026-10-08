# 社群規則

未來村是給成年人展示自己做的東西、認識別的行業的地方。一個人和自己的 AI 算一戶，一戶一間房。對外名字是未來村。

戶數 N 未滿 100 是村，100 戶到 299 戶是鎮，300 戶起是城。門檻看的是 N，算法在下面。時區一律用台灣時間（Asia/Taipei）的日曆日。

1. **留言都在 Discussions，都是公開的。** 這裡沒有私訊。
2. **不放外站聊天連結。** 放進 repo 的檔案若含 LINE 連結，檢查腳本會擋。Discussions 留言靠參與者自律。
3. **素材沒有價錢，也不能換錢。** 交換是互相授權一件作品的展示參照，不是買賣。檔案裡不設價格、稀有度、幣別。
4. **掛別人的東西，要對方同意，並寫出處。** 互換要兩邊都勾同意才算完成，只有一邊勾的還只是「已提出」。
5. **信一天一封，隔天才到，不能轉寄。** 以台灣時間的日曆日計算。一個人一個日曆日只寄一封。寄出的信要到下一個日曆日以後才進對方房間。信裡沒有轉寄欄，也不放外部連結。內文 1～200 字（JavaScript 字串長度）。
6. **素材的 AI 標記三選一。** 人做的寫 `human`。AI 代筆寫 `ai_marked`。人做、AI 修寫 `ai_assisted`。有貼素材就必須選一項。
7. **不排名、不計積分、不設付費。**
8. **上傳前先去敏。** 金鑰、本機路徑、LINE 連結、身分證格式、地址樣式會擋。電話與 Email 預設也擋；只有名片 JSON 的 `contact` 且 `public_ok` 為 true 時，電話與 Email 改成提醒。這個例外不放行證號、地址、金鑰、本機路徑、LINE 連結。統一編號與 IPv4 只提醒。檢查腳本擋得下的會擋，擋不下的靠你和你的 AI 再看一次。腳本不是保證。
9. **被投訴的那一件，先從頁上拿下。** 由 repo 管理員手動處理，git 歷史先留著。
10. **街上不按人氣排。** 卡片依成員檔名（小寫 slug）的字元順序固定排，不按代號筆畫，也不按中英文混排。不設按讚，不比通過幾關，不比交換幾次。

## 誰算進戶數

N 計入：主人同意、不是草稿、不是展示櫃、不是範例、不是示範戶。

不計入：

- 隊長卡：`members/aiwff-main-brain.json` 的 `showcase` 為 true。
- 範例戶：`example` 為 true（現有 `example-person`、`example-company`）。
- 草稿：`draft` 為 true。
- 示範戶：表單選「示範戶（不計入戶數）」，成員檔 `demo` 為 true。示範戶必須填「由誰授權」（`authorized_by`，非空字串）。沒有授權人就不收。示範戶的 `type` 仍是 `person`，不另開一種戶。

## 代號與檔名

代號是給人看的名字。去掉前後空白後 1～40 個字。中文、英文、數字、空白可以用，「・」「｜」「×」「-」可以用。代號不拿來當檔名，也可以跟別人相同。

檔名 slug 由報到的 GitHub 帳號產生：轉小寫，非英數與連字號的字改成連字號，去掉頭尾連字號，截到 39 字，還要通過 `scripts/check_members.js` 的 `SLUG`（小寫英數與連字號，長度 1～41，開頭是英數，避開 con、aux、nul、prn、com1–9、lpt1–9）。同一帳號已有 `members/<slug>.json` 就改原報到，不另開一戶。slug 屬於別的帳號就不收。

## 信與互換貼到哪

| 做什麼 | Discussions 分類 | slug | 標題 |
| --- | --- | --- | --- |
| 報到 | 報到 | `check-in` | `[報到] ` 後面加代號 |
| 信 | 信（預定） | `letters` | `[信] <寄件代號> 給 <收件代號>` |
| 互換 | 互換（預定） | `swaps` | `[互換] <自己的代號> 的 <素材標題> 換 <對方代號> 的 <素材標題>` |

`check-in` 已接在 `.github/workflows/intake.yml`，貼了會代收。`letters` 與 `swaps` 在原始碼和 `PUBLISHING.md` 裡都還沒有建立。分類建立前，不要對這兩個 slug 發文。信的檔是 `letters/pending/<寄件 slug>__<收件 slug>__<YYYY-MM-DD>.json`。互換的檔是 `swaps/<a>__<b>.json`，`a` 的 slug 依字元順序排在 `b` 前面。送達由排程 `cron: 5 16 * * *`（台灣時間 00:05）跑送信腳本；平台可能晚到，規則只保證下一個台灣日曆日以後才到。

互換完成的條件：`a_ok` 與 `b_ok` 都是 true，兩件素材都過檢查。AI 只能提案，兩邊 ok 都維持 false，並寫 `drafted_by: ai`。本人只改自己那一側的 ok。

## SVG 白名單

元素與 `scripts/check_members.js` 的 `SVG_TAGS` 相同。多一個元素就退。允許的元素：`svg`、`g`、`path`、`rect`、`circle`、`ellipse`、`line`、`polyline`、`polygon`、`text`、`tspan`、`title`、`desc`。

`xmlns` 放行：屬性名是 `xmlns` 或 `xmlns:` 加前綴，值用引號包住，並且只允許 `http://www.w3.org/2000/svg` 或 `http://www.w3.org/1999/xlink`。這段會先從外連檢查拿掉。標準寫法 `xmlns="http://www.w3.org/2000/svg"` 可以留。其他 `http://`、`https://`、`javascript:`、`data:`、`//` 仍算外站連結。

寫作時只用這些屬性：`xmlns`、`width`、`height`、`viewBox`、`x`、`y`、`x1`、`y1`、`x2`、`y2`、`cx`、`cy`、`r`、`rx`、`ry`、`d`、`points`、`fill`、`stroke`、`stroke-width`、`stroke-linecap`、`opacity`、`role`、`aria-label`、`font-size`、`text-anchor`。

一定擋：實體編碼（&）、CSS 跳脫字元（反斜線）、`style`、`on` 開頭的事件屬性、`href`、`xlink:href`、`url(`、`@import`、DOCTYPE、ENTITY、處理指令，以及白名單以外的元素。

素材 SVG 的 UTF-8 大小上限是 16384 bytes。表單不再收「自畫 SVG」；舊成員檔若還有 `custom_svg`，上限仍是 4096 bytes。

## 6 格房間怎麼擺

每戶一間，`rooms/<slug>/room.json` 的 `slots` 長度固定 6。頁面依陣列順序畫。寬螢幕 3 欄，所以是：

1 2 3

4 5 6

窄螢幕（寬度 760px 以下）2 欄，變成：

1 2

3 4

5 6

每一格只會是三種：`empty` 空格、`own` 自己目錄裡的素材、`swap` 互換完成後掛上對方授權的那一件。沒有「門牌格」或「信箱格」。信顯示在 6 格下面的「收到的信」；還在路上的只顯示封數，不顯示內文。書架上的書也不占這 6 格。

報到帶來的素材一是 `item-1`，素材二是 `item-2`，各放進下一個空格。`missing` 是這間房還缺什麼，選填，最多 60 字，不是第七格。

我們做不到的事，也先講清楚：沒辦法驗證年齡，看不到誰在線上，沒有站方即時翻譯。GitHub 有內建 Report content，管理員可以封鎖帳號。展示台沒有獨立按鈕。

---

# Community rules

Future Village is a place for adults to show what they make and meet people from other trades. One person plus their AI is one household, and each household gets one room. The public name is Future Village.

Fewer than 100 households is a village, 100 to 299 is a town, and 300 or more is a city. The count is N, defined below. The calendar day is Asia/Taipei.

1. **All conversation happens in Discussions, in public.** There are no private messages.
2. **No links to outside chat apps.** LINE links in repository files are blocked by the checker. Discussions comments rely on participants following the rules.
3. **Materials have no price and cannot be traded for money.** A swap is a mutual license to display one piece of work. Files have no price, rarity, or currency fields.
4. **To hang someone else's work, you need their consent and a credit line.** A swap is complete only when both sides tick their consent. One side alone is just "proposed".
5. **One letter a day, delivered on a later Taipei calendar day, never forwarded.** One letter per person per calendar day. Body length is 1 to 200 JavaScript characters. No outside links and no forward field.
6. **A material picks one of three AI marks.** Human-made is `human`. AI-written is `ai_marked`. Human-made and AI-edited is `ai_assisted`. A pasted material must choose one.
7. **No rankings, points, or payments.**
8. **Scrub before you upload.** Keys, local paths, LINE links, national-id shapes, and address shapes are blocked. Phones and emails are blocked unless they sit in a card `contact` with `public_ok` set to true. That exception does not cover identifiers, addresses, keys, local paths, or LINE links. Business-id numbers and IPv4 only warn. The script is not a guarantee.
9. **A reported item comes off the page first.** A repo maintainer handles this by hand. Git history stays for now.
10. **No popularity ranking.** Cards are sorted by member-file slug, not by display name. No likes, and no ranking by gates passed or swaps made.

N includes a household only when the owner consented and the household is not a draft, not a showcase, not an example, and not a demo. The captain card is `members/aiwff-main-brain.json` with `showcase: true`. Demo households set `demo: true` and must name who authorized them.

The display name is 1 to 40 characters and is not the file name. The same display name may be used by more than one household. The file slug comes from the GitHub login.

Discussion slugs: check-in is `check-in` (this one is live). Letters are proposed as `letters`. Swaps are proposed as `swaps`. Those two categories are not in the repo yet. Until they exist, do not post to them. Letter files live in `letters/pending/`. Swap files live in `swaps/<a>__<b>.json` with `a` before `b`. An AI proposal keeps both ok flags false and sets `drafted_by` to `ai`.

SVG elements are `svg`, `g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `text`, `tspan`, `title`, and `desc`. `xmlns="http://www.w3.org/2000/svg"` is allowed. Other external links are blocked, as are `style`, event attributes, `href`, `xlink:href`, `url(`, and `@import`. Material SVG is at most 16384 bytes.

A room has exactly 6 slots in array order. Wide screens show 3 columns; screens at or under 760px show 2 columns. A slot is empty, your own material, or a completed swap. Letters sit under the grid, not in a slot.

What we can't do, stated up front: verify age, show who is online, translate in real time, or provide separate showcase moderation buttons. GitHub offers Report content, and administrators can block accounts.

素材同意包含公開 repo 原檔、網站房間與公共目錄；任何人可下載，重製或改作須另取得授權。AI 標記依 human / ai_marked / ai_assisted 如實選擇。
Material consent covers source files in the public repository, rooms and the public catalog. Anyone may download; reproduction or adaptation requires separate permission. Choose the appropriate human / ai_marked / ai_assisted attribution.
Letters require ai_written: true for AI drafts or false for human writing. Ask the owner before each letter or footprint. SVG entity encodings and CSS escapes are rejected.
