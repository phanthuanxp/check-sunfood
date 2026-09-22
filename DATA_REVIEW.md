# Danh sách dữ liệu cần đối chiếu

Tài liệu này chỉ ghi nhận khoảng trống hoặc dấu hiệu bất nhất trong seed hiện tại. Không có dữ liệu pháp lý nào được suy đoán để điền thay.

Trạng thái đối chiếu mặc định của dữ liệu seed là `PENDING`. Admin chỉ chuyển sang `VERIFIED` sau khi kiểm tra hồ sơ nội bộ.

## Ưu tiên cao

- **NCC-19:** tên nhà cung cấp là `Công ty TNHH Hải Hà - Kotobuki` nhưng nhóm sản phẩm là `Sữa Vinamilk`. Cần xác nhận lại nhà cung cấp, sản phẩm và mapping mã.
- **NCC-19 / NCC-20:** cùng tên `Công ty TNHH Hải Hà - Kotobuki`, trong khi nhóm sản phẩm lần lượt là `Sữa Vinamilk` và `Bánh ngọt`. Cần xác nhận đây là hai hồ sơ/mã độc lập hay một mapping bị nhầm.
- **NCC-02:** tên hiện tại là `THỊT BÒ LONG BÍCH`, có thể là tên thương mại/sản phẩm thay vì tên pháp lý. Cần đối chiếu giấy đăng ký.
- **NCC-14:** tên chỉ có `Liên Hạnh`, chưa đủ căn cứ xác định loại hình/tên pháp lý; đồng thời thiếu địa chỉ.

## Trường còn thiếu

- **Địa chỉ:** NCC-09, NCC-14.
- **Mã số thuế:** chưa có ở 21 NCC; seed mới chỉ có MST cho NCC-08 và NCC-17. Không phải mọi loại nhà cung cấp đều bắt buộc hiển thị MST, nên cần quyết định theo hồ sơ nội bộ và quyền công bố.
- **Điều kiện bảo quản và hạn sử dụng:** chưa có ở cả 23 NCC.
- **Hồ sơ lưu trong hệ thống mới:** cả 23 NCC hiện có 0 tệp. Chỉ upload các PDF/JPG/PNG mà Sunfood có quyền lưu trữ và công khai.
- **Link hồ sơ migration cũ:** chưa có ở NCC-04 và NCC-11 đến NCC-23. Các link này chỉ phục vụ audit/migration, không hiển thị và không được gọi trong public runtime.

## Cần rà soát trước production

- Đối chiếu tên pháp lý, địa chỉ hành chính hiện hành, MST, nhóm sản phẩm và trạng thái hợp tác của toàn bộ NCC-01 đến NCC-23 với hồ sơ nội bộ.
- Xác nhận ngày cấp/ngày hết hạn và quyền công bố cho từng giấy tờ trước khi upload.
- Giữ nguyên mã public NCC-01 đến NCC-23 kể cả khi chỉnh tên hoặc thông tin nhà cung cấp.

## Bản nháp nhập SmartCheck ngày 22/09/2026

Đã lấy 23/23 trang nguồn vào `ImportDraft` của SQLite localhost. **Chưa bản nháp nào được duyệt**. Bản nháp chỉ cung cấp trường có thể đọc từ HTML, không phải xác nhận tính pháp lý hay tình trạng hợp tác hiện tại. Những chỗ nguồn thiếu hoặc trình bày lẫn nhiều chủ thể phải đối chiếu bằng hồ sơ Sunfood:

- NCC-03: vùng tên/địa chỉ dính nhau; parser không đề xuất tên hoặc địa chỉ.
- NCC-04: trang nguồn không có nhãn nhà cung cấp rõ ràng; chỉ giữ tên sản phẩm.
- NCC-09: nguồn có địa chỉ và MST, nhưng tên lẫn câu mô tả sản phẩm; không đề xuất tên pháp lý. So sánh địa chỉ/MST với hồ sơ trước khi duyệt.
- NCC-12: phần địa chỉ lẫn thêm một nhà cung cấp khác; không đề xuất địa chỉ.
- NCC-14, NCC-19: nguồn chỉ có tên sản phẩm, không thể suy ra tên pháp lý/địa chỉ/MST.
- NCC-18: trang liệt kê hai nhà cung cấp và phần bảo quản dính thông tin đối tác; không đề xuất tên/địa chỉ/bảo quản.
- NCC-17: nguồn của chính Sunfood; không suy ra thông tin pháp lý NCC từ trang mô tả sản phẩm.

Các giá trị bảo quản/hạn dùng trích từ nguồn cũ cũng cần đối chiếu bao bì và hồ sơ theo từng sản phẩm/lô, không mặc nhiên áp dụng cho mọi hàng của một NCC. QR thứ 24 chưa được cung cấp; không tạo tên, địa chỉ hoặc mã định danh thay người dùng.
