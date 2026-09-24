# Đợt 1–2: bảo toàn source và đưa backend vào release riêng

Cập nhật: 24/09/2026. Tài liệu này mô tả cách triển khai sau khi code đã được kiểm tra. Việc bổ sung các công cụ trong repo **không có nghĩa đã deploy, đổi Nginx, thay database hoặc hoàn thành chuyển PostgreSQL**.

## 1. Trạng thái cần bảo toàn

- Nhánh backend làm việc độc lập với model đang nâng cấp giao diện. Không thay bố cục, CSS, font, banner hay component public trong đợt này.
- Tại thời điểm khảo sát, source live xuất phát từ `c57703b`, Nginx chuyển tới cổng `3018`, còn thay đổi chưa commit do model giao diện đang tiếp tục làm. Phải xác nhận lại PID/cwd/upstream trước mọi thao tác production; không xem con số này là cấu hình cố định.
- Nhánh phục hồi giao diện ở commit `8d3d108` chỉ ghi lại một phần thay đổi từng được thu hồi. Không tự động cherry-pick bản đó đè lên giao diện mới hơn. Chủ nhánh giao diện cần commit phần việc mới nhất, rồi so sánh ba phía và hợp nhất thành một release có thể tái tạo.
- Các release cũ có thể đang chứa database và uploads thật, hoặc được release mới trỏ tới bằng symlink. Chưa được xóa checkout cũ chỉ vì Nginx đã chuyển sang release mới.
- `NCC-01` đến `NCC-23` là mã và QR nhà cung cấp cố định. Lô dùng `Batch.publicId` và `/lot/{publicId}`. Migration phải giữ các định danh đã in ra tem.
- Không chạy seed trên production; không dùng database local thay database thật; không đổi `AUTH_SECRET`/`INTEGRATION_ENCRYPTION_KEY` vì các khóa này có thể đang bảo vệ API token đã lưu.

## 2. Điều kiện trước release

1. Kiểm tra `git status`, commit, diff và untracked ở local, nhánh UI và thư mục live. Giữ lại cả thay đổi chưa commit; chỉ stage source đã xem xét. `.env`, database, uploads, log và snapshot chứa dữ liệu riêng không được đưa vào Git.
2. Xác định một commit tích hợp chứa cả giao diện mới nhất đã được chủ nhánh xác nhận và backend đợt 1–2. Build trong checkout/release mới; không build đè `.next` của process đang phục vụ khách.
3. Cài dependency bằng lockfile trên đúng OS/Node production. Đã quan sát `npm ci` bị registry từ chối `undici@7.29.1` trong lockfile hiện tại. Bộ `node_modules` sẵn có có thể phục vụ kiểm tra local, nhưng **không chứng minh cài mới tái lập thành công**. Phải giải quyết nguồn package/lockfile và chạy `npm ci` sạch thành công trước khi phát hành; không tự ý hạ phiên bản dependency bảo mật chỉ để vượt lỗi. Không chuyển `node_modules`, `.next` hay `.next/standalone` đã build trên Windows sang Linux VPS.
4. Chạy kiểm tra backend, auth/HMAC/read-only policy, job queue, migration trên bản sao database, lint và build. PostgreSQL chỉ được tuyên bố đã chạy khi đã thử trên một PostgreSQL thật; validate/generate schema chưa đủ.
5. Xác nhận hợp đồng API/type cho model UI: giữ các trường đang hiển thị, bổ sung tương thích; kết quả tạo tác vụ sync có thể cần UI nhận `jobId`/poll trạng thái. Khi UI chưa hỗ trợ hợp đồng mới, chưa cutover luồng quản trị đó.

## 3. Cấu hình dữ liệu bền vững

Server Next standalone tự đổi working directory vào `.next/standalone`. Vì vậy các giá trị tương đối như `file:./prisma/dev.db` hoặc `storage/uploads` có thể trỏ nhầm sang dữ liệu rỗng. Wrapper `scripts/start-standalone.mjs` từ chối cấu hình như vậy, kiểm tra SQLite đã tồn tại, và phân giải symlink trước khi chạy.

Các biến bắt buộc của process:

| Biến | Ý nghĩa |
| --- | --- |
| `SUNFOOD_ENV_FILE` | Đường dẫn tuyệt đối tới file cấu hình được bảo vệ; Linux quyền `600` hoặc chặt hơn. Không nằm trong Git hay thư mục public. |
| `DATABASE_URL` | SQLite: `file:/đường/dẫn/tuyệt/đối/database.sqlite`, không query/fragment; hoặc URL PostgreSQL do vận hành cung cấp. |
| `UPLOAD_DIR` | Thư mục uploads bền vững, tuyệt đối và đã tồn tại. |
| `PORT` | Cổng canary trống đã xác nhận, từ 1024–65535. |
| `HOSTNAME` | `127.0.0.1` cho VPS sau Nginx. PM2 mẫu đặt rõ để không kế thừa hostname của máy. |
| `NEXT_PUBLIC_SITE_URL` | `https://check.sunfoodtaydo.com`, thống nhất khi build và khi chạy. |

Biến đã có trong environment được ưu tiên so với `SUNFOOD_ENV_FILE`. Không để PM2 giữ biến cũ rồi nghĩ chỉnh file env đã có hiệu lực; kiểm tra cấu hình qua hành vi, không dump toàn bộ môi trường ra log.

Giữ nguyên mật khẩu, khóa mã hóa và các thiết lập tích hợp hiện có. Trong giai đoạn chuyển tiếp có thể tiếp tục dùng đường dẫn tuyệt đối đến dữ liệu đang nằm trong checkout cũ. Chuyển sang thư mục persistent riêng là một thao tác có backup, dừng ghi, đối chiếu và cutover riêng; không thực hiện ngầm khi thay runtime.

## 4. Backup có kiểm tra phục hồi

`deploy/backup-release.mjs` tạo thư mục đích mới độc quyền, SQLite online backup (bao gồm dữ liệu trong WAL), kiểm tra `integrity_check`, tạo bản phục hồi độc lập và so sánh số hàng từng bảng. Nó còn sao chép `.env`, Nginx tùy chọn và uploads, giữ thư mục/file ở quyền `700`/`600` trên Linux, lưu manifest SHA-256. Nội dung secret không được in ra stdout.

Ví dụ các đường dẫn dưới đây là **mẫu**, phải thay bằng đường dẫn đã xác nhận trên VPS:

```bash
node deploy/backup-release.mjs \
  --database /srv/sunfood-data/database.sqlite \
  --destination /root/backups/check-sunfood/phase12-YYYYMMDD-HHMM \
  --env-file /etc/check-sunfood/runtime.env \
  --uploads-dir /srv/sunfood-data/uploads \
  --nginx-file /etc/nginx/sites-available/check.sunfoodtaydo.com
```

Thư mục cha của đích phải tồn tại; thư mục đích chưa được tồn tại. Script không ghi đè backup cũ và không xóa bản chụp dang dở nếu lỗi. Chỉ dùng snapshot có `backup-manifest.json` ghi `status: verified` và `restoreVerified: true`.

SQLite snapshot nhất quán theo transaction. Để database và uploads khớp cùng thời điểm, tạm dừng thao tác ghi của admin, job đồng bộ và worker trong cửa sổ backup. Nếu thấy file đổi trong lúc sao chép, script báo lỗi; cần giữ snapshot lỗi để kiểm tra rồi tạo snapshot mới. Script từ chối symlink nằm bên trong uploads để tránh sao chép ngoài phạm vi; symlink của chính thư mục gốc được phân giải.

Backup chứa token/mật khẩu và dữ liệu hồ sơ riêng, kể cả bản phục hồi `restore-verified.sqlite`. Chỉ lưu ở vùng nội bộ được bảo vệ; không upload GitHub hoặc public bucket. Backup `.env` cũ có thể chứa mật khẩu cũ: rollback code không đồng nghĩa tự động khôi phục cấu hình bảo mật cũ.

## 5. Migration trên bản sao trước

- Công cụ mặc định chỉ dry-run và yêu cầu đường dẫn tuyệt đối tới database đã tồn tại. Ví dụ: `npm run db:upgrade:phase12 -- --database /srv/staging-copy/database.sqlite`.
- Apply bắt buộc chỉ định một file backup mới, không ghi đè: `npm run db:upgrade:phase12 -- --database /srv/staging-copy/database.sqlite --apply --backup /srv/staging-copy/before-phase12.sqlite`.
- Chạy công cụ migration additive đợt 1–2 trước ở chế độ dry-run trên **bản sao SQLite**; kiểm tra danh sách thay đổi schema và dữ liệu.
- Chạy apply chỉ với backup mới, sau đó kiểm tra integrity, foreign keys, số NCC/sản phẩm/lô/sự kiện, `publicId`, trạng thái công khai và dữ liệu tùy chỉnh.
- Lưu báo cáo migration cùng manifest release. So sánh mã NCC/URL lô trước và sau, không chỉ tổng số hàng.
- Chỉ dùng migration production có phiên bản được xem xét. Không dùng `prisma db push --accept-data-loss`, `migrate reset` hoặc chạy seed để sửa chênh lệch.
- Schema mới phải tương thích với app rollback trong cửa sổ chuyển đổi. Nếu thay đổi phá vỡ tương thích, cần cửa sổ maintenance và kế hoạch phục hồi dữ liệu đã diễn tập; không giả định đổi Nginx là đủ rollback.

## 6. Build và chạy standalone trên canary

Các lệnh chạy trong release mới sau khi đã chọn đúng schema và biến build:

```bash
npm ci
node --env-file=/etc/check-sunfood/runtime.env node_modules/prisma/build/index.js generate
node --env-file=/etc/check-sunfood/runtime.env node_modules/next/dist/bin/next build
node --env-file=/etc/check-sunfood/runtime.env scripts/prepare-standalone.mjs
```

Thay đường dẫn file env bằng đường dẫn đã xác nhận của release. Việc nạp cùng file ở bước generate/build bảo đảm `DATABASE_URL` và biến public build-time như `NEXT_PUBLIC_SITE_URL` không vô tình lấy từ checkout hoặc shell cũ. Không in nội dung file env vào log.

Toàn bộ bốn lệnh phải chạy trên Linux release host (hoặc image Linux có cùng kiến trúc, libc và phiên bản Node ABI với runtime). `better-sqlite3` là native module: artifact Windows gây `invalid ELF header`, còn artifact build bằng Node ABI khác gây `NODE_MODULE_VERSION`/`ERR_DLOPEN_FAILED`. Không sửa nóng bằng cách chép một file `.node`, chạy `npm rebuild` trong release đang live hay lấy `node_modules` từ release cũ; bỏ artifact lỗi và build lại sạch trên đúng runtime.

`prepare-standalone` sao chép `public` và `.next/static` vào output standalone theo tài liệu của Next.js đang cài. Nó tự nạp thử **đúng bản** `better-sqlite3` nằm trong output, chạy truy vấn SQLite trong bộ nhớ, rồi ghi OS/architecture/Node ABI/libc vào `sunfood-release.json`. Wrapper khởi động kiểm tra lại các giá trị này và từ chối chạy nếu artifact không khớp VPS. Nó cũng xóa các **bản sao `.env*` trong output được sinh ra**; không xóa file cấu hình nguồn. Runtime nhận secret qua file bảo vệ bên ngoài. `.next/standalone` vẫn là artifact nội bộ vì bundle server có thể chứa cấu hình build; không chia sẻ công khai.

Ghi lại `node --version`, `node -p "process.platform + ' ' + process.arch + ' abi=' + process.versions.modules"` ở bước build và trước khi PM2 start. Dùng cùng binary Node để cài, build, chạy `prepare:standalone` và start. Nếu kiểm tra native thất bại thì release chưa đạt điều kiện canary, không được đổi Nginx.

Mẫu PM2 `deploy/ecosystem.config.cjs` mặc định chỉ chạy app. Truyền đường dẫn tuyệt đối và tên process mới; chưa dùng tên của process live đang có:

```bash
SUNFOOD_RELEASE_DIR=/srv/check-sunfood/releases/RELEASE_ID \
SUNFOOD_ENV_FILE=/etc/check-sunfood/runtime.env \
SUNFOOD_PROCESS_NAME=check-sunfood-phase12-canary \
PORT=CANARY_PORT \
pm2 start deploy/ecosystem.config.cjs
```

Thay `CANARY_PORT` bằng số cổng trống đã kiểm tra. `next start` không phải lệnh của mẫu này: wrapper gọi `.next/standalone/server.js`. Wrapper chuyển tiếp SIGINT/SIGTERM và PM2 có 30 giây chờ shutdown.

Worker là process riêng, chỉ bật `SUNFOOD_ENABLE_WORKER=true` sau khi schema/job queue đã được kiểm tra. Mẫu PM2 truyền cùng `SUNFOOD_ENV_FILE` cho worker qua tùy chọn `node --env-file`; Node production phải đáp ứng `engines` của dự án. Release cần giữ `scripts`, source worker, Prisma generated client và dependency `tsx`; bản standalone tối giản một mình không chứa đầy đủ worker. Mặc định không tự bật đồng bộ hay khởi chạy thêm worker trên dữ liệu thật. Trước canary cutover, nên dùng bản sao DB và tắt tác vụ nền; ngay cả một app canary cũng có thể ghi vào DB thật nếu admin thao tác.

## 7. Smoke test chỉ đọc

Chọn `publicId` của một lô thật **đã công khai** làm mẫu. Canary gọi loopback nhưng QR vẫn phải trỏ domain production:

```bash
SMOKE_BASE_URL=http://127.0.0.1:CANARY_PORT \
SMOKE_PUBLIC_SITE_URL=https://check.sunfoodtaydo.com \
SMOKE_LOT_PUBLIC_ID=PUBLIC_ID_DA_CONG_KHAI \
ALLOW_SQLITE_DEGRADED=true \
node deploy/smoke-release.mjs
```

Script kiểm tra homepage và JS/CSS, redirect admin khi chưa đăng nhập, API admin không công khai, đủ 23 trang NCC cố định, API NCC, trang lô và PNG/SVG của QR NCC/lô. Nó không nhập dữ liệu, gọi sync, tạo phiên đăng nhập hoặc ghi HanoiCheck.

`ALLOW_SQLITE_DEGRADED=true` chỉ cho phép đúng cảnh báo `DATABASE_NOT_POSTGRESQL`, DB vẫn phải kết nối và mã NCC phải đủ. Đây là ngoại lệ tạm thời có hiển thị cảnh báo; `/api/health` vẫn giữ HTTP 503. Mọi lỗi khác đều làm smoke thất bại. Khi đã chuyển PostgreSQL phải bỏ ngoại lệ.

Ngoài smoke tự động, kiểm tra đăng nhập HTTPS/origin, admin hiện tại hiển thị đúng dữ liệu, tải ảnh private/public đúng quyền và một lần quét tem thật. Kiểm tra desktop/mobile theo commit giao diện đã duyệt để phát hiện thiếu assets hoặc thay đổi ngoài ý muốn. Không dùng smoke pass làm bằng chứng rằng mọi dữ liệu đã được Sunfood xác minh.

## 8. Cutover, theo dõi và rollback

1. Ghi lại upstream/cwd/commit/PID live đang phục vụ, diff chưa commit, config Nginx và danh sách process dự án. Không ghi secret vào báo cáo. Giữ các ứng dụng khác trên VPS nguyên trạng.
2. Backup đã phục hồi thử; migration đã chạy trên bản sao; release tích hợp UI đã được xác nhận; clean install/build/test đã đạt.
3. Nếu cần migrate DB thật, dừng ghi trong cửa sổ có kế hoạch, backup mới ngay trước migration, rồi kiểm tra lại invariant. Chỉ một worker được sở hữu tác vụ định kỳ đang hoạt động; cấu hình lease của queue cần được kiểm tra riêng.
4. Chuyển **riêng upstream của virtual host Check Sunfood** tới cổng canary đã pass. Chạy `nginx -t` trước khi reload. Không thay cert/domain/vhost của dự án khác.
5. Chạy smoke qua HTTPS thật, kiểm tra nguồn QR, đăng nhập, lỗi 5xx, log sync, RAM, restart count và dữ liệu mới. Chỉ `pm2 save` sau khi topology mới đã được kiểm tra.
6. Khi lỗi app và schema còn tương thích, chuyển Nginx về process đã biết hoạt động, dừng worker mới để không tiếp tục ghi; kiểm tra lại HTTPS. Giữ nguyên DB để bảo toàn giao dịch mới.
7. Nếu rollback cần phục hồi DB: chặn ghi, chụp thêm trạng thái lỗi hiện tại, thống kê dữ liệu phát sinh sau backup và thực hiện kế hoạch đã duyệt. Không chép backup cũ đè database đang mở hoặc tự bỏ các lô mới.
8. Chỉ dọn process cũ sau thời gian theo dõi và sau khi xác nhận không process khác/đường dẫn DB/uploads phụ thuộc checkout đó. Không dùng `pm2 delete all`, không xóa thư mục theo glob.

## 9. Giới hạn hoàn thành đợt 1–2

Đợt này hoàn thiện công cụ và backend có thể kiểm tra/review trên release riêng. Cutover production chỉ hoàn tất khi đã hợp nhất commit UI mới nhất và thực hiện đầy đủ kiểm chứng ở trên. PostgreSQL/object storage, thay đổi thiết kế public và bật chatbot cho khách thuộc đợt khác. Luồng HanoiCheck của Check Sunfood tiếp tục chỉ đọc dữ liệu nghiệp vụ; Sunfood-One mới là hệ thống ghi dữ liệu lên HanoiCheck.
