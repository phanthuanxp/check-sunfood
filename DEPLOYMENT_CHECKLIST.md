# Checklist triển khai Check Sunfood lên VPS

Tài liệu này là cổng kiểm soát trước production. Không chạy các bước production cho tới khi dữ liệu NCC và hồ sơ đã được Sunfood duyệt.

## 1. Điều kiện bắt buộc trước deploy

- [ ] `npm run check:data`, `npm run lint`, `npx tsc --noEmit` và `npm run build` đều đạt.
- [ ] `npm run test:smoke` đạt trên localhost.
- [ ] NCC-01 đến NCC-23 đã được đối chiếu; các mục trong `DATA_REVIEW.md` đã có kết luận nội bộ.
- [ ] Hồ sơ công khai đã được xác nhận quyền lưu trữ và công bố.
- [ ] Không còn mật khẩu/secret mặc định; `AUTH_SECRET` là chuỗi ngẫu nhiên dài.
- [ ] Source đã được commit, gắn tag phiên bản và có phương án rollback.
- [ ] Cảnh báo bảo mật dependency đã được xử lý hoặc có biên bản đánh giá rủi ro.

## 2. PostgreSQL

- [ ] Tạo database và user riêng, chỉ cấp quyền cần thiết.
- [ ] Sao lưu SQLite trước khi chuyển đổi và kiểm tra khả năng phục hồi bản sao.
- [ ] Tạo schema Prisma production dùng `provider = "postgresql"`; không sửa trực tiếp schema localhost đang dùng SQLite.
- [ ] Tạo migration có version và chạy bằng `prisma migrate deploy`; production không dùng `prisma db push`.
- [ ] Viết/import dữ liệu theo giao dịch, giữ nguyên mã NCC-01 đến NCC-23.
- [ ] Đối chiếu tổng số NCC, document, version và audit log sau import.
- [ ] Bật backup tự động, retention và diễn tập restore.

## 3. Object storage

- [ ] Dùng S3-compatible storage, Cloudflare R2 hoặc dịch vụ tương đương.
- [ ] Bucket mặc định private; public document chỉ được tải qua luồng đã kiểm tra quyền công bố.
- [ ] Giới hạn PDF/JPG/PNG, dung lượng, chữ ký file và quét mã độc.
- [ ] Lưu object key thay vì phụ thuộc đường dẫn ổ đĩa VPS.
- [ ] Có lifecycle cho file mồ côi nhưng không tự xóa phiên bản hồ sơ đang nằm trong audit/version history.
- [ ] Bật versioning/backup và kiểm tra phục hồi một tệp mẫu.

## 4. Runtime VPS

- [ ] Dùng Node LTS được Next.js hỗ trợ; khóa phiên bản Node và package lock.
- [ ] Chạy ứng dụng bằng service manager với user không có quyền root.
- [ ] Reverse proxy HTTPS tới cổng nội bộ; cổng ứng dụng không mở trực tiếp ra Internet.
- [ ] Giới hạn kích thước request/upload ở reverse proxy phù hợp giới hạn ứng dụng.
- [ ] Thiết lập log rotation, giám sát CPU/RAM/disk và cảnh báo lỗi 5xx.
- [ ] Uptime monitor gọi `/api/health`; không dùng endpoint admin làm health check.
- [ ] Rate limit đăng nhập và API ở tầng dùng chung như reverse proxy/Redis, không chỉ trong RAM của một process.

## 5. DNS và TLS

- [ ] Tạo bản ghi A/AAAA hoặc CNAME cho `check.sunfoodtaydo.com` đúng VPS/reverse proxy.
- [ ] Xác nhận DNS công khai từ ít nhất hai resolver.
- [ ] Cấp chứng chỉ TLS và kiểm tra tự động gia hạn.
- [ ] Đặt `NEXT_PUBLIC_SITE_URL=https://check.sunfoodtaydo.com` trước khi tạo QR production.
- [ ] Kiểm tra QR production mở đúng `/qr/NCC-xx`, không trỏ localhost hoặc domain tạm.

## 6. Kiểm thử sau deploy và rollback

- [ ] Chạy smoke test với `SMOKE_BASE_URL=https://check.sunfoodtaydo.com npm run test:smoke`.
- [ ] Đăng nhập, tạo/sửa một NCC thử nghiệm được phê duyệt và kiểm tra audit log.
- [ ] Upload, xem private, chuyển public rồi thu hồi một hồ sơ thử nghiệm.
- [ ] Quét QR NCC-01 và NCC-23 bằng ít nhất một thiết bị iOS và Android.
- [ ] Kiểm tra giao diện Việt/Anh, PDF/JPG/PNG và cảnh báo hết hạn.
- [ ] Nếu smoke test lỗi, rollback application về tag trước; nếu có migration dữ liệu, dùng kế hoạch rollback đã diễn tập thay vì tự ý xóa database.
