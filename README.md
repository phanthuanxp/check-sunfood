# Sunfood Traceability — check.sunfoodtaydo.com

MVP localhost cho hệ thống truy xuất nguồn gốc riêng của **CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ**.

## URL chuẩn

- Public QR: `/qr/NCC-01` ... `/qr/NCC-23`
- Admin MVP: `/admin`
- API: `/api/suppliers/NCC-01`

Khi deploy production, URL sẽ là:
`https://check.sunfoodtaydo.com/qr/NCC-01`

## Stack

- Next.js 15 + React 19
- Prisma
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

Mở:
- http://localhost:3000
- http://localhost:3000/admin
- http://localhost:3000/qr/NCC-01

## Import dữ liệu SmartCheck một lần

Script sau chỉ dùng cho migration ban đầu, không dùng ở runtime production:

```bash
npm run import:smartcheck
```

Kết quả: `data/imported-smartcheck.json`.

Mục tiêu kiến trúc là sau khi migration xong, website **không phụ thuộc SmartCheck**. Hồ sơ pháp lý/chứng nhận cần được tải về kho lưu trữ do Sunfood kiểm soát nếu Sunfood có quyền lưu/công bố.

## Phase tiếp theo cho Codex

1. Thêm đăng nhập admin.
2. CRUD Nhà cung cấp.
3. Upload PDF/JPG/PNG cho từng NCC.
4. Phân loại hồ sơ: ĐKKD, ATTP, kiểm nghiệm, VietGAP/HACCP/ISO, hợp đồng, hồ sơ khác.
5. Ngày cấp/ngày hết hạn + cảnh báo 30/60/90 ngày.
6. QR generator xuất PNG/SVG trỏ đúng `/qr/NCC-xx`.
7. Nhật ký cập nhật hồ sơ.
8. Tìm kiếm NCC/sản phẩm.
9. Dashboard tình trạng hồ sơ.
10. Deploy PostgreSQL + object storage (S3/Cloudinary) + `check.sunfoodtaydo.com`.

## Lưu ý dữ liệu

Seed hiện có 23 NCC theo các link SmartCheck đã được đối chiếu. Một số trang SmartCheck không hiển thị đầy đủ tên NCC trong HTML công khai; dữ liệu đó cần được đối chiếu lại với hồ sơ nội bộ trước khi đưa production.
