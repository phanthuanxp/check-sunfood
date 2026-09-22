# HanoiCheck → Check Sunfood: hợp đồng tích hợp chỉ đọc

Check Sunfood không ghi dữ liệu nghiệp vụ lên HanoiCheck. Sunfood-One là hệ thống ghi/chỉnh sửa; Check Sunfood chỉ nhận dữ liệu đã có, lưu bản địa để đối chiếu và công bố theo quyết định của Sunfood.

## Những phần đã có ở localhost

- Giữ nguyên 23 URL QR cố định `/qr/NCC-01` đến `/qr/NCC-23`.
- Sản phẩm và lô được gắn với NCC trong cơ sở dữ liệu. Mỗi lô có `publicId` ổn định cho `/lot/{publicId}` và QR PNG/SVG riêng.
- Lô có ngày nhập, ngày sản xuất, hạn dùng, dấu nguồn và thời điểm đồng bộ. Lô mới mặc định riêng tư; chỉ công khai khi NCC/sản phẩm đã được duyệt và ngày nhập hợp lệ.
- Nếu lô đã phát hành QR bị tạm ngừng công khai, URL cũ hiển thị thông báo rà soát thay vì biến mất.

## Cần xác nhận với HanoiCheck trước khi bật đồng bộ thật

Tài liệu v2.2 đã cung cấp mô tả token/HMAC và một số API đọc đơn hàng, nhưng chưa mô tả đủ GET danh sách/chi tiết NCC và GET danh sách/chi tiết lô. Không suy đoán đường dẫn, tham số hoặc cấu trúc JSON. Cần bổ sung:

1. OpenAPI/Postman hoặc tài liệu GET NCC, GET lô, GET chi tiết lô; ví dụ JSON thực tế đã ẩn thông tin nhạy cảm.
2. Cách lọc lô mới/cập nhật theo thời gian, phân trang, mã lô duy nhất, mã NCC và mã sản phẩm; quy tắc sửa/xóa/thu hồi.
3. API đọc đơn hàng và phân bổ lô nếu cần thể hiện hành trình phân phối; phạm vi dữ liệu khách hàng được phép công khai.
4. Scope tài khoản chỉ đọc, giới hạn tốc độ, múi giờ/ngày tháng, quyền lưu/công bố ảnh và giấy tờ.

## Luồng đồng bộ dự kiến sau khi có hợp đồng API

1. Backend xác thực bằng Client ID/Secret, ký HMAC cho GET; thông tin bí mật chỉ ở môi trường máy chủ. Chỉ auth token/refresh dùng POST theo tài liệu; không gọi `*/merge`.
2. Tải NCC và lô theo trang/mốc cập nhật; lưu bản nguồn, hash, thời gian đồng bộ và nhật ký lỗi; chạy lại không tạo bản trùng.
3. Ghép lô vào NCC theo **mã NCC chính xác**. Mã ngoài khác dạng `NCC-xx` phải qua bảng ánh xạ 1:1 do Sunfood duyệt; không tự ghép theo tên.
4. Dữ liệu nguồn và phần bổ sung nội bộ tách biệt. Thay đổi ở HanoiCheck đưa vào hàng chờ đối chiếu, không tự ghi đè phần Sunfood đã duyệt hoặc tự công khai.
5. Chạy thử 1 NCC và vài lô; đối chiếu mã, ngày, sản phẩm, số lượng và đơn hàng; sau đó mới mở lịch đồng bộ hằng ngày.

AI không dùng để xác định mã lô, mã NCC, số lượng, ngày hoặc trạng thái đồng bộ. Nếu được cấu hình, AI chỉ hỗ trợ đọc chứng từ, phát hiện bất thường và giải thích dữ liệu đã được duyệt; quyết định công bố vẫn thuộc Sunfood.
