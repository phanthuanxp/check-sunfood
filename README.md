# Sunfood Traceability — check.sunfoodtaydo.com

Môi trường phát triển localhost cho hệ thống truy xuất nguồn gốc riêng của **CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ**.

## URL chuẩn

- Public QR: `/qr/NCC-01` ... `/qr/NCC-23`
- Admin MVP: `/admin`
- Thư viện QR: module `Thư viện QR` trong `/admin` (`/admin/qr` được giữ làm URL tương thích và chuyển về đúng module)
- API: `/api/suppliers/NCC-01`

Khi deploy production, URL sẽ là:
`https://check.sunfoodtaydo.com/qr/NCC-01`

## Stack

- Next.js 16 + React 19
- Prisma 7 với SQLite driver adapter
- SQLite khi chạy localhost
- Có thể đổi sang PostgreSQL khi deploy

## Chạy localhost

```bash
cp .env.example .env
npm install
npx prisma generate
npm run db:push
npm run db:seed
npm run dev
```

Tài khoản localhost mặc định (đổi trong `.env`):

- Username: `admin`
- Password: `change-me-local`

Không dùng các giá trị mặc định này ở production. `AUTH_SECRET` phải được thay bằng chuỗi ngẫu nhiên dài trước khi triển khai.

Mở:
- http://localhost:3010
- http://localhost:3010/admin
- http://localhost:3010/qr/NCC-01

Check Sunfood dùng riêng cổng `3010` để không xung đột với các dự án chạy ở cổng `3000`.

`UPLOAD_DIR` mặc định là `./storage/uploads`. Trên VPS phải đặt thành thư mục dữ liệu bền vững nằm ngoài thư mục release và đưa thư mục này vào lịch backup.

## Cổng kiểm soát chất lượng

Chạy các lệnh sau trước khi bàn giao hoặc tạo bản deploy:

```bash
npm run check:data
npm run lint
npx tsc --noEmit
npm run build
```

Khi localhost đang chạy ở cổng 3010:

```bash
npm run test:smoke
```

Smoke test kiểm tra trang chủ, đăng nhập admin, health check, toàn bộ 23 trang QR, toàn bộ 23 API nhà cung cấp và QR PNG/SVG. Trạng thái runtime có thể kiểm tra tại `GET /api/health`.

## Import dữ liệu SmartCheck một lần

Script sau chỉ dùng cho migration ban đầu, không dùng ở runtime production:

```bash
npm run import:smartcheck
```

Kết quả: `data/imported-smartcheck.json`.

Mục tiêu kiến trúc là sau khi migration xong, website **không phụ thuộc SmartCheck**. Hồ sơ pháp lý/chứng nhận cần được tải về kho lưu trữ do Sunfood kiểm soát nếu Sunfood có quyền lưu/công bố.

## Phase 1 đã có trên localhost

1. Đăng nhập admin bằng credential trong `.env` và cookie ký HMAC.
2. CRUD nhà cung cấp và API CRUD hồ sơ.
3. Upload PDF/JPG/PNG tối đa 10 MB vào kho riêng `storage/uploads`, kiểm tra MIME và chữ ký đầu tệp. Tệp nội bộ chỉ được đọc qua API có xác thực.
4. Phân loại hồ sơ: ĐKKD, ATTP, kiểm nghiệm, VietGAP/HACCP/ISO, hợp đồng và hồ sơ khác.
5. Ngày cấp/ngày hết hạn, dashboard cảnh báo 30/60/90 ngày, hết hạn và thiếu hồ sơ; có lọc và xuất CSV.
6. Thư viện hiển thị QR riêng cho từng NCC, tải PNG/SVG, in A6/A5 và tải ZIP toàn bộ; mỗi mã trỏ đúng `NEXT_PUBLIC_SITE_URL/qr/NCC-xx`.
7. Nhật ký cập nhật và tìm kiếm theo mã NCC/tên/sản phẩm.
8. Trang public mobile-first với bốn tab dữ liệu độc lập; tài liệu mặc định là nội bộ và chỉ xuất hiện public sau khi admin duyệt.
9. Khi thay tệp hồ sơ, đường dẫn phiên bản cũ được lưu trong lịch sử tài liệu.
10. Chặn mutation khác nguồn, giới hạn đăng nhập sai và cho xem trước PDF/ảnh trong admin.
11. Admin tách thành bốn module trong cùng layout: Tổng quan, Nhà cung cấp, Thư viện QR và Nhật ký.
12. Trang `/qr/NCC-xx` hỗ trợ giao diện Việt/Anh. Các trường bản dịch tiếng Anh được admin nhập riêng và để trống mặc định nhằm tránh tự dịch sai thông tin pháp lý.

Lưu ý: upload localhost không phù hợp với hạ tầng serverless có filesystem tạm. Trước production cần chuyển storage sang S3-compatible/Cloudinary và Prisma sang PostgreSQL. Không deploy ở giai đoạn localhost này.

Checklist chuyển VPS, PostgreSQL, object storage, DNS và rollback nằm trong [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md). Tài liệu này chỉ chuẩn bị quy trình; không thực hiện deploy ở giai đoạn localhost.

## Bộ đóng gói VPS

- `Dockerfile` tạo Next.js standalone image bằng Node 22.
- `compose.production.yml` chạy PostgreSQL 16, migration/seed một lần và application trên `127.0.0.1:3010`.
- `.env.production.example` liệt kê biến bắt buộc; không commit file chứa secret thật.
- `deploy/nginx-check-sunfood.conf` là reverse-proxy HTTP mẫu để cấp TLS sau khi DNS đã trỏ đúng.

Prisma tự dùng schema SQLite khi `DATABASE_URL=file:...` và schema PostgreSQL khi URL bắt đầu bằng `postgresql://` hoặc `postgres://`. Production chạy migration có version bằng `npm run db:migrate`.

`npm run db:seed` chỉ tạo mã NCC còn thiếu. Chạy lại seed trong lần deploy sau không ghi đè thông tin hoặc trạng thái xác minh mà admin đã chỉnh. Muốn sửa dữ liệu NCC hiện có, hãy dùng giao diện admin và đối chiếu hồ sơ nội bộ.

## Nhập nguồn & truy xuất theo lô (localhost)

- `/admin/import`: đọc từng nguồn hoặc lần lượt 23 QR SmartCheck đã có, lưu bản nháp có URL và SHA-256 của trang nguồn. Admin chọn từng trường, chỉnh sửa và duyệt; bản nháp không tự ghi đè supplier hay đổi trạng thái `VERIFIED`. Không sao chép tệp pháp lý, ảnh hoặc đường dẫn hồ sơ thành tệp public.
- NCC mới chỉ được tạo sau khi nhập URL nguồn và duyệt tên. Parser hiện hỗ trợ URL `https://truyxuat.smartcheck.vn/check/<mã>`; QR từ nhà cung cấp khác cần bộ trích xuất riêng sau khi xem nguồn, không gửi URL tuỳ ý từ server.
- `/admin/trace`: tạo sản phẩm, lô và sự kiện ở chế độ riêng tư. Công khai phải đi theo thứ tự NCC đã xác minh → sản phẩm → lô → từng sự kiện; chặn ngày sự kiện và ngày sản xuất trong tương lai.
- QR lô (khi công khai) trỏ tới `/lot/<publicId>` bất biến và tải PNG/SVG ở `/api/qr/lot/<publicId>`. Giữ `publicId` khi chuyển database/backup để tem đã in không đổi đích. QR nhà cung cấp `/qr/NCC-xx` vẫn giữ nguyên.
- Kiểm thử parser bằng `npm run test:import`; production có migration version tại `prisma/migrations-postgresql/20260922000000_trace_and_import`.

Đã thu thập 23 bản nháp trên SQLite localhost ngày 22/09/2026; đây là dữ liệu chưa được Sunfood duyệt và không nằm trong Git. Sao lưu `prisma/dev.db` trước khi chuyển dữ liệu thật sang PostgreSQL. Không dùng dữ liệu mẫu GoTrace làm chứng cứ.

## Lưu ý dữ liệu

## Trợ lý AI trên localhost

- Quản trị viên cấu hình khóa và model tại `/admin/settings/ai`. Khóa được mã hóa AES-256-GCM trong database, không hiển thị lại; `AUTH_SECRET` (hoặc `INTEGRATION_ENCRYPTION_KEY`) phải ổn định, dài ít nhất 32 ký tự và cần được sao lưu an toàn. `OPENAI_API_KEY` trong `.env` vẫn là phương án dự phòng phía server; không dùng tiền tố `NEXT_PUBLIC_`.
- Nút **Kiểm tra kết nối** chỉ kiểm tra quyền truy cập các model đã chọn qua API Models, chưa gửi hồ sơ. Sau khi kết nối thành công, quản trị viên có thể tải PDF/JPG/PNG lên màn hình hồ sơ và chấp thuận gửi tệp để AI đọc thành bản nháp đối chiếu.
- Admin → Nhà cung cấp → Hồ sơ → chọn PDF/JPG/PNG → xác nhận quyền gửi tệp → **AI đọc & đối chiếu hồ sơ**. Mặc định dùng `gpt-5.6-terra`. AI chỉ trả tiêu đề, số giấy, ngày, tên/MST, trích đoạn và cảnh báo; admin bấm **Điền trường đề xuất**, so bản gốc rồi mới lưu. Không tự xác minh/công khai tài liệu. Chỉ gửi tệp khi admin chủ động đồng ý.
- `/admin/import` có nút **AI gợi ý điểm cần kiểm tra** để so sánh trường trong QR nguồn với NCC hiện lưu. Biểu mẫu NCC có **AI gợi ý bản dịch EN** cho các mô tả; tên pháp nhân và địa chỉ không được tự dịch. Cả hai chỉ đề xuất, không tự duyệt hoặc tự ghi dữ liệu.
- Trang `/qr/NCC-xx` có khung hỏi đáp Việt/Anh. Mặc định **tắt** (`AI_PUBLIC_QA_ENABLED=false`). Chỉ bật sau khi dữ liệu NCC được Sunfood xác minh, tài liệu công khai đã rà soát và đã có giới hạn request thích hợp trên reverse proxy. Mặc định dùng `gpt-5.6-luna`; gửi đến model duy nhất trường NCC đã lưu và metadata của tệp public, không gửi tệp nội bộ. Câu trả lời phải có liên kết nguồn hoặc thông báo thiếu dữ liệu.
- Các phép tính ngày hết hạn tiếp tục dùng logic ứng dụng, không giao AI quyết định hiệu lực pháp lý. Trước production cần kiểm thử với tài liệu thật được phép xử lý, giới hạn chi phí, giám sát câu trả lời và rate limit dùng chung giữa nhiều instance. `npm run test:ai` kiểm tra quy tắc dữ liệu đầu ra; khi chưa có API key không thể thử call model thật.

Seed hiện có 23 NCC theo các link SmartCheck đã được đối chiếu. Một số trang SmartCheck không hiển thị đầy đủ tên NCC trong HTML công khai; dữ liệu đó cần được đối chiếu lại với hồ sơ nội bộ trước khi đưa production.

Danh sách cụ thể cần đối chiếu nằm trong [`DATA_REVIEW.md`](./DATA_REVIEW.md).
