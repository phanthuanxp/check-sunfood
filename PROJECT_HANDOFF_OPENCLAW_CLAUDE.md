# Bàn giao dự án Check Sunfood cho OpenClaw / Claude Code

> Cập nhật: 22/09/2026. Tài liệu này là ảnh chụp trạng thái và định hướng triển khai tiếp, không phải bằng chứng rằng dữ liệu nhà cung cấp/lô hàng đã được xác minh. Trước khi sửa mã, đọc toàn bộ `AGENTS.md`, `CODEX_MASTER_PROMPT.md`, tài liệu này và các hướng dẫn Next.js liên quan trong `node_modules/next/dist/docs/`. Chỉ dẫn mới của chủ dự án có ưu tiên cao hơn những phần kế hoạch cũ trong `CODEX_MASTER_PROMPT.md`.

## 1. Mục tiêu kinh doanh và các ranh giới không được phá

Check Sunfood là website **công khai truy xuất nguồn gốc** tại `https://check.sunfoodtaydo.com`, không phải hệ thống ERP chính. Sunfood-One mới là phần mềm quản lý nghiệp vụ và ghi/đọc HanoiCheck. Check Sunfood chỉ cần **đọc dữ liệu nhà cung cấp, lô nhập hàng và thông tin phân phối được phép công bố** từ HanoiCheck, lưu bản sao có kiểm soát, bổ sung hồ sơ Sunfood và trình bày cho khách quét QR.

- QR nhà cung cấp cố định: `/qr/NCC-01` đến `/qr/NCC-23`. Không đổi URL, không dùng chúng làm QR lô.
- Mỗi lô nhập hàng có mã định danh công khai và QR riêng, trỏ tới `/lot/{publicId}`. Một NCC có nhiều lô; một lô gắn đúng một NCC theo mã đã đối chiếu.
- Không ghi dữ liệu nghiệp vụ lên HanoiCheck từ Check Sunfood; không gọi các endpoint `merge`/tạo/sửa/xóa bên đó. Việc lấy token/refresh token phục vụ đọc là ngoại lệ kỹ thuật.
- Không bịa tên pháp nhân, địa chỉ, số giấy, hạn giấy, số lô, ngày sản xuất/hạn dùng hoặc tình trạng kiểm định. AI chỉ đề xuất bản nháp có nguồn; người có quyền duyệt mới được công bố.
- Không để SmartCheck là dependency khi phục vụ khách. URL SmartCheck cũ chỉ là nguồn kiểm toán/di trú.
- Chỉ lưu và công khai hồ sơ mà Sunfood có quyền sử dụng/công bố. Không đưa API key, mật khẩu, token, `.env` hoặc bản sao hồ sơ nhạy cảm vào Git, log, tài liệu hay chat.

## 2. Ảnh chụp mã nguồn và môi trường

| Mục | Trạng thái ngày 22/09/2026 |
| --- | --- |
| Repository | `https://github.com/phanthuanxp/check-sunfood.git`; `main` đã lên commit `4f67a8d` (sửa kiểm tra Origin khi đăng nhập sau Nginx), trên nền `69dc50a` (cài đặt AI). |
| Local | `C:\Users\User\Documents\check-sunfood`, nhánh `codex/ai-settings-vps`; `next-env.d.ts` đang sửa do Next.js tự sinh, không tự ý reset/ghi đè. |
| Stack | Next.js 16, React 19, Prisma 7. SQLite cho localhost; production hiện **vẫn SQLite**, PostgreSQL là việc chuyển đổi còn thiếu. |
| Bản live | HTTPS qua Nginx tới PM2 `check-sunfood-loginfix`, cổng `3013`, checkout `/root/.openclaw/workspace/projects/check-sunfood-release-4f67a8d`. |
| Bản rollback | PM2 `check-sunfood-canary`, cổng `3012`, checkout release `69dc50a`; bản cũ hơn `check-sunfood`, cổng `3011`, commit `c86007b`. Cả hai bản cũ vẫn có lỗi Origin đăng nhập qua HTTPS, nên không phải rollback đầy đủ chức năng đăng nhập. |
| Dữ liệu live | SQLite ở checkout **cũ**: `/root/.openclaw/workspace/projects/check-sunfood/prisma/dev.db`; checkout mới dùng symlink đến cùng DB. Upload nằm tại `/root/.openclaw/workspace/projects/check-sunfood/storage/uploads`. **Không xóa checkout cũ**. |
| Nginx | `/etc/nginx/sites-available/check.sunfoodtaydo.com` (symlink trong `sites-enabled`); hiện proxy `127.0.0.1:3012`. |
| Backup gần nhất | `/root/backups/check-sunfood-ai-20260922-1555`, chứa SQLite nhất quán, upload, Nginx và `.env` cũ; có chứa bí mật nên chỉ quản trị viên được đọc. Cần tạo backup mới trước mỗi migration/cutover. |

Trang live đã được kiểm tra sau deploy: `/`, QR của cả 23 NCC, `/api/suppliers/NCC-01`, đăng nhập admin và `/admin/settings/ai` hoạt động. API quản trị trả `401` khi chưa đăng nhập. Mật khẩu admin đã được chủ dự án yêu cầu đổi trong lượt làm việc trước và kiểm tra đăng nhập thành công; **tài liệu này cố ý không ghi mật khẩu**. Không tự ý thay đổi `AUTH_SECRET`: khóa mã hóa OpenAI key hiện có thể phụ thuộc vào nó nếu chưa cấu hình `INTEGRATION_ENCRYPTION_KEY` riêng.

Ngày 22/09/2026 phát hiện login live báo “Nguồn yêu cầu không hợp lệ”: `lib/security.ts` so sánh `Origin` của trình duyệt với `request.url` nội bộ sau reverse proxy. Commit `4f67a8d` chuyển sang đối chiếu `NEXT_PUBLIC_SITE_URL`, có test origin đúng/sai. Build/lint/test đạt; canary và HTTPS công khai xác nhận POST login với dữ liệu thử rỗng trả `401` (đã tới bước kiểm tra tài khoản) thay vì `403`, Origin lạ vẫn `403`, trang chủ và `/qr/NCC-23` trả `200`. PM2 đã save. Nếu người dùng vẫn không đăng nhập được, kiểm tra tiếp mật khẩu/cookie/browser, đừng lặp lại bản vá Origin.

**Cảnh báo vận hành:** `/api/health` trên production trả `503/degraded` dù database kết nối được và 23 mã NCC tồn tại. Lý do được báo là `DATABASE_NOT_POSTGRESQL`; production chưa đạt chuẩn lưu trữ dự kiến. Không sửa health để báo giả `200`. Hiện production có 23 NCC, **0 hồ sơ đính kèm, 0 NCC được xác minh** và chưa có lô thật đồng bộ từ HanoiCheck.

## 3. Những chức năng đã có và giới hạn hiện tại

- Public: trang chủ, trang NCC `/qr/[code]`, trang lô `/lot/[id]`, API thông tin NCC, QR PNG/SVG và tab lô nhập hàng trên trang NCC. Giao diện đã có desktop/mobile và banner riêng. Nếu QR lô đã phát hành nhưng bị ẩn công khai, trang lô hiển thị thông báo tạm giữ thay vì làm QR chết.
- Admin: xác thực, CRUD NCC/hồ sơ, upload PDF/JPG/PNG, cảnh báo giấy tờ hết hạn, quản lý lô/sự kiện truy xuất, tìm kiếm và một số audit log. Kiểm tra từng luồng trước khi coi là hoàn chỉnh, nhất là quyền xóa/sửa dữ liệu đã công bố.
- AI: `/admin/settings/ai` và `/api/admin/ai-settings` cho phép lưu OpenAI key đã mã hóa AES-256-GCM; API không trả lại key. Có endpoint kiểm tra kết nối `/api/admin/ai-settings/test`. Trích xuất PDF/JPG/PNG ở `/api/admin/ai/extract` yêu cầu đồng ý xử lý tài liệu, kiểm tra loại file/dung lượng và trả gợi ý có bằng chứng. **Chưa có key được cấu hình trên site live vào thời điểm bàn giao, chưa thử suy luận thật**. Phần giao diện hiện chủ yếu gợi ý tiêu đề/loại/ngày của hồ sơ; chưa phải màn hình duyệt chi tiết để tự điền toàn bộ hồ sơ NCC.
- Mặc định hiện có `gpt-5.6-terra` cho đọc hồ sơ, `gpt-5.6-luna` cho rà soát/dịch/hỏi đáp; cần xác minh tên model, quyền API, chi phí và giới hạn tại thời điểm cấu hình. Không bật chatbot công khai khi nguồn chưa được Sunfood xác minh. Quy tắc tính ngày/hạn, số lượng, trùng khóa phải là code xác định, không giao cho AI tự đoán.
- Schema Prisma đã có `Supplier`, `Document`, `Product`, `Batch`, `TraceEvent` và `Batch.publicId/sourceSystem/sourceKey/sourceSyncedAt/everPublished/isPublic`. Có nền tảng cho lô/QR nhưng **chưa có nguồn lô HanoiCheck tự động**.

## 4. Chất lượng dữ liệu: đừng nhầm bản nháp với sự thật

`DATA_REVIEW.md` ghi các mục cần đối chiếu, gồm NCC-02, NCC-14, NCC-19/NCC-20 và thiếu địa chỉ tại NCC-09/NCC-14. 23 NCC ban đầu là dữ liệu bản nháp `PENDING`, chưa có tài liệu xác minh; bản nhập từ SmartCheck (nếu thấy trong local) chưa được phê duyệt. Local hiện có **24 dòng NCC**, thêm `NCC-24` chưa rõ nguồn/QR do chủ dự án chưa cung cấp theo tài liệu rà soát; production có 23. Điều tra sự lệch này trước khi đồng bộ; không tự xóa, tự công bố hay coi NCC-24 là chính thức.

Nên áp dụng trạng thái dữ liệu rõ ràng: `imported/draft → reviewed → approved → public`, kèm người duyệt, thời điểm, nguồn, bản gốc/snapshot, field-level provenance và audit diff. Thay đổi từ HanoiCheck không được âm thầm ghi đè trường Sunfood đã sửa/duyệt. Khi dữ liệu thiếu hoặc mâu thuẫn, hiển thị “chưa được xác minh”/“cần đối chiếu”, không che lấp bằng câu chữ quảng cáo.

## 5. Hợp đồng tích hợp HanoiCheck cần xác nhận trước khi code sync

Chủ dự án có Endpoint, Client ID, Client Secret và HMAC Secret, muốn nhập qua trang quản trị an toàn — **chưa được cung cấp trong repo/chat và không được hard-code**. PDF từng được cung cấp là `HanoiCheck API Đồng bộ dữ liệu NCC_v2.2.pdf`. Bản đó mô tả token/HMAC, nhiều endpoint ghi/merge, GET thực phẩm chuẩn, đơn hàng, chi tiết đơn; **chưa thể hiện rõ GET danh sách/chi tiết NCC và GET danh sách/chi tiết lô nhập hàng**. HanoiCheck nói API của họ có đầy đủ chức năng; cần xin tài liệu OpenAPI/Postman hoặc đường dẫn GET chính xác cùng JSON mẫu đã ẩn thông tin nhạy cảm. Không suy diễn endpoint chỉ từ link website truy xuất.

Đối với đặc tả đã xem: HMAC dùng `X-Timestamp` (epoch giây), `X-Nonce` duy nhất, `X-Signature` Base64 HMAC-SHA256 trên chuỗi `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256_HEX(raw body)`; path có `/api` nhưng không gồm query. Đồng hồ cần sai số dưới khoảng 300 giây. Token ngắn hạn, refresh token xoay vòng; triển khai khóa đồng bộ/refresh chống race và không log token. **Đối chiếu lại với tài liệu chính thức hiện hành trước khi lập trình**, vì PDF có thể thay đổi.

Thiết kế sync đề xuất:

1. Trang quản trị tích hợp chỉ cho admin, HTTPS: cấu hình endpoint allowlist, Client ID và secret được mã hóa/ẩn, test kết nối read-only, trạng thái lần sync, lỗi đã làm sạch. Phân quyền và CSRF/same-origin như cài đặt AI; không để server gọi URL tùy ý (SSRF).
2. Tạo adapter server-side riêng cho token/HMAC, phân trang, retry có giới hạn/backoff, timeout, rate limit. Khóa `sourceSystem + sourceKey` phải duy nhất/idempotent; lưu external ID, thời điểm sync, payload hash và raw snapshot có kiểm soát truy cập.
3. Đồng bộ NCC theo **mã NCC chính xác**. Nếu HanoiCheck dùng định dạng khác, lập bảng ánh xạ 1:1 và yêu cầu admin duyệt; không ghép theo tên gần giống.
4. Đồng bộ lô hàng hằng ngày (và backfill theo khoảng thời gian) với `sourceKey` ổn định. Map: mã NCC, mã lô, tên/mã sản phẩm, số lượng + đơn vị, ngày nhập/sản xuất/hạn dùng, nơi sản xuất, chứng từ, trạng thái, đường dẫn/ID nguồn, các mốc truy xuất. Tách dữ liệu nguồn và trường Sunfood bổ sung; không khẳng định một trường có trong API nếu chưa thấy JSON thật.
5. Nếu có dữ liệu đơn hàng/phân phối: mô hình lô–đơn hàng nhiều-nhiều qua phân bổ có số lượng; chỉ công khai thông tin phù hợp quyền riêng tư, không đưa tên/địa chỉ khách hàng lên QR.
6. Lần đầu pilot 1 NCC và vài lô, kiểm tra bản ghi với giao diện HanoiCheck và người phụ trách. Sau đó mới backfill, job hằng ngày và cảnh báo sync lỗi. Không tự phát QR/công bố lô chưa qua gate kiểm tra.

Luồng khuyến nghị: `HanoiCheck GET → raw snapshot → chuẩn hóa & kiểm tra khóa → bản nháp/diff → admin duyệt → bản công khai → /lot/{publicId} + QR PNG/SVG`. `publicId` phải bền vững qua mọi lần sync/đổi tên sản phẩm. QR NCC và QR lô là hai loại khác nhau; giao diện/in nhãn phải thể hiện rõ.

## 6. Thứ tự triển khai tiếp theo (có tiêu chí hoàn thành)

### P0 — Xác nhận nền tảng và dữ liệu an toàn

1. Đọc các tài liệu mục đầu, `git status`, schema, route, test, cấu hình deploy. Không ghi đè `next-env.d.ts` hay thay `.env` của người dùng. Xác nhận commit local/GitHub/VPS trước khi code.
2. Kiểm tra lại health, backup/restore, upload và các điểm rò bí mật. Chốt kế hoạch chuyển SQLite production + upload cục bộ sang PostgreSQL + object storage hoặc persistent volume có backup; kiểm thử restore trên môi trường riêng. Không thực hiện migration phá hủy khi chưa có backup và rollback.
3. Chủ dự án nhập OpenAI key **trực tiếp tại** `/admin/settings/ai`, chạy test kết nối rồi pilot trích xuất một hồ sơ NCC có quyền sử dụng. Xác nhận model thực sự suy luận được, chi phí/logging và quy trình đồng ý gửi tài liệu. Không yêu cầu gửi key qua chat.

### P1 — Trợ lý hoàn thiện hồ sơ NCC

4. Xây màn hình review theo từng trường: giá trị hiện tại, đề xuất AI, vị trí/trích dẫn trang tài liệu hoặc URL QR gốc, độ tin cậy, xung đột, nút chấp nhận/sửa/bỏ qua. Chỉ lưu bản nháp; riêng xuất bản phải có quyền/confirm và audit. Ưu tiên 23 NCC hiện có, rà soát danh sách `DATA_REVIEW.md` và NCC-24 local.
5. Cảnh báo rule-based: thiếu giấy, giấy hết hạn hoặc còn 30/60/90 ngày, mã/số giấy trùng, tên/mã số thuế không khớp giữa nguồn, thiếu sản phẩm/địa chỉ. AI chỉ phụ trợ cho trường hợp khó nhận dạng; không quyết định pháp lý.

### P2 — HanoiCheck read-only và lô nhập hàng

6. Sau khi có tài liệu GET và mẫu JSON: cài adapter + màn hình cấu hình an toàn, sync NCC/lô/đơn hàng tùy khả năng API. Test unit bằng fixture đã ẩn danh, integration với sandbox/vendor, idempotency và pagination. Không gọi API ghi.
7. Hoàn thiện admin danh sách lô theo NCC: lọc ngày/trạng thái/sản phẩm, xem diff nguồn, bổ sung mốc nhận–kiểm–phân phối, duyệt/ẩn, audit. Public `/qr/NCC-xx` có tab danh sách lô; `/lot/{publicId}` trình bày thông tin lô, NCC liên kết, bằng chứng, timeline, trạng thái xác minh/thiếu dữ liệu. Song ngữ Việt–Anh trên dữ liệu đã duyệt; bản dịch AI cũng cần duyệt.
8. Tạo/tải QR riêng từng lô ở PNG/SVG, đường dẫn chuẩn `https://check.sunfoodtaydo.com/lot/{publicId}`; mẫu in nhãn phải có mã lô và chữ ngắn cho người đọc, kích thước/độ tương phản đủ quét. Test QR sau in thực tế. Không thay QR NCC hiện hữu.

### P3 — Vận hành production

9. Chuyển DB production sang PostgreSQL bằng kế hoạch cutover/rollback có kiểm đếm 23 NCC, hồ sơ, lô, audit; chuẩn hóa nơi lưu upload, backup tự động và diễn tập khôi phục. Sau chuyển mới yêu cầu `/api/health` báo healthy. Bổ sung giám sát lỗi đồng bộ, tuổi dữ liệu, chứng từ sắp hết hạn, tỷ lệ QR 404, backup và bảo mật admin/rate limit.
10. Chỉ cân nhắc chatbot công khai khi có bộ dữ liệu đã duyệt. Mọi câu trả lời phải trỏ tới NCC/lô/hồ sơ đã công bố; không có bằng chứng thì nói chưa xác minh. Có bảo vệ chi phí, rate limit, log an toàn và bộ câu hỏi kiểm thử Việt–Anh.

**Definition of done cho một lô:** đúng NCC theo mã, nguồn HanoiCheck rõ, ID không đổi, dữ liệu bắt buộc đã đối chiếu, công khai có kiểm soát, QR tải/in/quét tới đúng trang, timeline không bịa, trang mobile đọc được, đổi trạng thái/thu hồi vẫn giữ link và audit.

## 7. Kiểm thử và lệnh làm việc

Local `.env` được tạo từ `.env.example` nếu thiếu, tự điền bí mật ở máy phù hợp; không commit. Theo `package.json`, kiểm tra các lệnh chính: `npm ci` (hoặc `npm install` nếu lockfile thay đổi có chủ đích), `npx prisma generate`, `npm run db:push`, `npm run db:seed` trên **DB thử nghiệm**, `npm run build`, `npm run dev`, `npm run test:ai`, `npm run test:ai-settings`, `npm run test:import`, `npm run test:smoke`, `npm run check:data`, lint. **Không chạy seed/db:push lên production một cách máy móc**; review schema diff và backup trước.

Regression tối thiểu trước deploy: `/`, `/admin`, `/admin/settings/ai`, `/qr/NCC-01`, `/qr/NCC-23`, `/api/suppliers/NCC-01`, QR NCC PNG/SVG và đích URL, trang NCC mobile, lô public/ẩn, upload hợp lệ và file giả mạo, auth chưa đăng nhập, quyền admin, dữ liệu không lộ key. Với đồng bộ mới, thêm test 2 lần cùng payload không nhân bản, nguồn đổi không ghi đè overlay đã duyệt, NCC không ánh xạ vào hàng chờ, API lỗi/timeout/retry không làm mất dữ liệu, QR đã in vẫn sống.

Đã kiểm tra trước bàn giao: build và các test AI/settings/import/smoke local pass; schema PostgreSQL đã `prisma validate`/generate/build với URL giả nhưng **chưa kiểm tra migration trên PostgreSQL thật**. Kết quả `check:data` local cảnh báo NCC-24 và dữ liệu thiếu; đó là thông tin cần xử lý, không phải test cần “làm xanh” bằng cách che lỗi.

## 8. Quy trình deploy/rollback hiện tại

Không tự deploy chỉ vì đã sửa code; chủ dự án từng yêu cầu hoàn thiện trên localhost trước rồi mới lên VPS. Khi được phép deploy, làm tại release mới tách biệt: tạo backup SQLite nhất quán + upload + `.env` + Nginx; xác thực có thể restore; checkout đúng commit; `npm ci`, Prisma generate/migration đã review, build; chạy cổng canary; smoke test HTTP nội bộ và đăng nhập; đổi upstream Nginx sau `nginx -t`; kiểm tra HTTPS, 23 QR, API, AI admin; `pm2 save`. Giữ release cũ nguyên trạng để rollback. Không xóa directory cũ vì nó đang giữ **DB và upload live**; không thay secret hoặc URL trong `.env` nếu không có kế hoạch di chuyển dữ liệu/mã hóa.

Rollback Nginx về cổng `3012` giữ schema tương thích nhưng sẽ **tái phát lỗi đăng nhập Origin**; cổng `3011` còn cũ hơn và chỉ an toàn nếu schema DB tương thích với commit `c86007b`. Migration không tương thích cần rollback dữ liệu từ backup đã kiểm chứng. Không quảng bá “rollback đơn giản” khi đã có ghi dữ liệu mới hoặc thay schema. `compose.production.yml` hiện **không phải** cách site đang chạy; vận hành thực tế là PM2 + Nginx. Với PostgreSQL/object storage, phải viết lại runbook cho topology mới.

## 9. Đầu vào còn cần từ chủ dự án / HanoiCheck

- OpenAI API key: chủ dự án nhập ở UI quản trị, không gửi cho agent qua chat.
- Endpoint, Client ID, Client Secret, HMAC Secret HanoiCheck: chỉ nhập vào form tích hợp an toàn sau khi form được triển khai. Không đưa vào Git/issue/chat hoặc gửi sang frontend.
- Tài liệu GET NCC, GET lô và đơn hàng/phân phối; quy tắc phân trang, bộ lọc ngày, rate limit, trạng thái, lỗi, sample JSON đã làm sạch. Nếu không có endpoint GET lô, cần HanoiCheck xác nhận cơ chế xuất dữ liệu hợp lệ khác.
- Quyền công bố giấy tờ/ảnh, tiêu chí duyệt hồ sơ/lô, trường nào được xem công khai, người chịu trách nhiệm duyệt, cách xử lý NCC-24 và danh sách dữ liệu sai/thiếu trong `DATA_REVIEW.md`.
- Ưu tiên kinh doanh giữa backfill lô cũ và nhập lô mới hằng ngày; mẫu nhãn QR/kích thước in thực tế.

## 10. Bản đồ tài liệu/mã nguồn nên đọc

| Đường dẫn | Mục đích |
| --- | --- |
| `AGENTS.md`, `CODEX_MASTER_PROMPT.md` | Quy tắc dự án/brief gốc; lưu ý brief có chỉ dẫn “chưa deploy” đã lỗi thời. |
| `HANOICHECK_READ_INTEGRATION.md` | Bản phân tích read-only và điểm thiếu trong PDF API. |
| `DATA_REVIEW.md` | Các NCC/trường cần đối chiếu, không phải nguồn sự thật. |
| `prisma/schema.prisma`, `prisma/seed.ts` | Data model, seed; xem schema thực tế trước migration. |
| `lib/runtime-config.ts`, `app/api/health/route.ts` | Điều kiện production health/PostgreSQL. |
| `lib/ai-settings.ts`, `app/api/admin/ai-settings/route.ts`, `app/api/admin/ai/extract/route.ts` | Bảo vệ API key, cấu hình AI và trích xuất tài liệu. |
| `app/qr/[code]`, `app/lot/[id]`, `app/api/qr` | Trang public và phát QR; kiểm tra cấu trúc route thực tế. |
| `DEPLOYMENT_CHECKLIST.md`, `compose.production.yml` | Kế hoạch production; đối chiếu với PM2/Nginx thực tế trước khi dùng. |

**Việc đầu tiên của agent tiếp nhận:** xác minh trạng thái repo và VPS, đối chiếu tài liệu này với code/DB hiện tại, báo lại những khác biệt; sau đó chọn một hạng mục P0/P1 cụ thể để triển khai và kiểm thử, không mặc nhiên khẳng định HanoiCheck hay AI đã hoạt động chỉ vì có UI hoặc schema.
