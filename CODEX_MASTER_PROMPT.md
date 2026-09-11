# CODEX MASTER PROMPT — SUNFOOD TRACEABILITY

Bạn đang tiếp tục phát triển dự án `check-sunfood` cho CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ.

## Mục tiêu
Xây hệ thống truy xuất nguồn gốc độc lập tại `https://check.sunfoodtaydo.com`, không phụ thuộc SmartCheck ở runtime. URL QR public cố định theo mẫu `https://check.sunfoodtaydo.com/qr/NCC-01` đến `NCC-23`.

## Giai đoạn hiện tại
Chạy localhost trước. Dự án đã có Next.js + Prisma + SQLite, seed 23 NCC, public detail route `/qr/[code]`, `/admin` MVP và API read-only.

## Việc cần làm tiếp theo theo thứ tự
1. Chạy và sửa mọi lỗi build/type/runtime cho tới khi `npm run dev` hoạt động sạch.
2. Hoàn thiện giao diện responsive cao cấp, ưu tiên mobile vì khách quét QR bằng điện thoại.
3. Xây authentication cho `/admin` (credential/env cho localhost; thiết kế để production có thể dùng Auth.js).
4. CRUD Supplier đầy đủ: tên, mã NCC, sản phẩm, địa chỉ, MST, ghi chú, trạng thái.
5. CRUD Document theo NCC: tiêu đề, loại hồ sơ, file URL, ngày cấp, ngày hết hạn, trạng thái.
6. Cho upload PDF/JPG/PNG ở localhost vào `public/uploads`; tạo abstraction storage để sau này đổi S3/Cloudinary.
7. Dashboard hồ sơ: hợp lệ, sắp hết hạn 30/60/90 ngày, hết hạn, thiếu hồ sơ.
8. Trang `/qr/[code]` có 4 tab thật: Thông tin nguồn gốc; Hồ sơ pháp lý; Chứng nhận & kiểm nghiệm; Lịch sử cập nhật.
9. Tạo QR generator trong admin, xuất PNG và SVG; nội dung QR phải chính xác là URL `NEXT_PUBLIC_SITE_URL/qr/NCC-xx`.
10. Tạo nút tải QR, in tem A6/A5, và preview trước khi in.
11. Không gọi SmartCheck trong runtime. Script `import:smartcheck` chỉ dùng migration một lần.
12. Viết migration path từ SQLite localhost sang PostgreSQL production.
13. Thêm audit log khi admin sửa dữ liệu/hồ sơ.
14. Thêm search/filter theo NCC, tên nhà cung cấp, nhóm sản phẩm.
15. Viết README triển khai production và checklist DNS `check.sunfoodtaydo.com`.

## Quy tắc dữ liệu
- Không tự bịa thông tin pháp lý.
- Dữ liệu seed được lấy từ các nguồn công khai hiện tại và phải cho phép admin sửa lại.
- File giấy tờ chỉ lưu/công khai khi Sunfood có quyền sử dụng.
- Giữ `sourceUrl`/`legacyDocsUrl` chỉ làm dữ liệu migration/audit, không dùng làm dependency production.

## Thông tin Sunfood hiển thị public
- CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ
- MST: 0110716043
- Địa chỉ cơ sở: Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội
- Email: tpsunfoodtaydoo@gmail.com
- Website: www.sunfoodtaydo.com

## Tiêu chí hoàn thành localhost Phase 1
- `npm install`, `prisma generate`, `db:push`, `db:seed`, `npm run dev` chạy thành công.
- `/qr/NCC-01` đến `/qr/NCC-23` đều trả trang hợp lệ.
- `/admin` đăng nhập được và CRUD NCC + documents được.
- Upload file localhost hoạt động.
- QR tải xuống quét được và mở đúng `/qr/NCC-xx`.
- `npm run build` pass.
