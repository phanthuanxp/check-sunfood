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

## Lưu ý dữ liệu

Seed hiện có 23 NCC theo các link SmartCheck đã được đối chiếu. Một số trang SmartCheck không hiển thị đầy đủ tên NCC trong HTML công khai; dữ liệu đó cần được đối chiếu lại với hồ sơ nội bộ trước khi đưa production.

Danh sách cụ thể cần đối chiếu nằm trong [`DATA_REVIEW.md`](./DATA_REVIEW.md).
