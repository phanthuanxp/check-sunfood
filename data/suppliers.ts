export type SupplierSeed = {
  code: string;
  name: string;
  sourceUrl: string;
  productName?: string;
  address?: string;
  taxCode?: string;
  legacyDocsUrl?: string;
};

export const suppliers: SupplierSeed[] = [
  { code: 'NCC-01', name: 'CÔNG TY CỔ PHẦN CHĂN NUÔI CP VIỆT NAM - CHI NHÁNH NM 3 TẠI HÀ NỘI', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3312', productName: 'THỊT LỢN AN TOÀN SUNFOOD - CP', address: 'Lô CN-5 Khu công nghiệp Phú Nghĩa, Xã Phú Nghĩa, Thành phố Hà Nội, Việt Nam', legacyDocsUrl: 'https://drive.google.com/file/d/1IjnaFbdatUdPWh9jMYvpDAzmKQneVjfj/view' },
  { code: 'NCC-02', name: 'THỊT BÒ LONG BÍCH', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3313', productName: 'Sản phẩm thịt bò', address: 'AD14-106, Khu đô thị sinh thái Dream City, Xã Nghĩa Trụ, Tỉnh Hưng Yên, Việt Nam', legacyDocsUrl: 'https://drive.google.com/file/d/1q9evJhgrQ2YQUS85RExrrxPi9642Faax/view' },
  { code: 'NCC-03', name: 'Công ty cổ phần thương mại Lan Vinh', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3314', productName: 'Sản phẩm thịt gia cầm', address: 'Thôn Đỗ Xá, Xã Phù Đổng, Thành phố Hà Nội, Việt Nam', legacyDocsUrl: 'https://drive.google.com/file/d/1b_iT4IV4BRC5_juFZRvL0gkqJN7m6Wry/view' },
  { code: 'NCC-04', name: 'Hợp tác xã sản xuất và tiêu thụ rau an toàn Bắc Hồng', sourceUrl: 'https://truyxuat.smartcheck.vn/check/4256', productName: 'Các loại rau sạch (Bắc Hồng)', address: 'Thôn Quan Âm, xã Phúc Thịnh, TP. Hà Nội' },
  { code: 'NCC-05', name: 'Hợp tác xã sản xuất rau sạch Đông Anh', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3315', productName: 'Các loại rau sạch (Đông Anh)', address: 'Thôn Cổ Dương, xã Phúc Thịnh, Thành Phố Hà Nội, Việt Nam', legacyDocsUrl: 'https://drive.google.com/file/d/1KzYKbXjuj6yE6ziQiFvPZuPpwn9sExRh/view' },
  { code: 'NCC-06', name: 'HKD VĨNH - TƯỜNG', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3318', productName: 'Sản phẩm hải sản tươi sống', address: 'Kiốt 22 chợ Mỹ Đình, Phường Từ Liêm, Thành phố Hà Nội, Việt Nam', legacyDocsUrl: 'https://drive.google.com/file/d/1V2hoPTS9blJfTUtWSVVsL5yBJ7_C8xRq/view' },
  { code: 'NCC-07', name: 'CHI NHÁNH CÔNG TY TNHH MTV ĐT & PT NÔNG NGHIỆP HÀ NỘI - XN BẮC HÀ', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3317', productName: 'Sản phẩm Hải sản đông lạnh', address: 'Thôn Nhì, Xã Phúc Thịnh, Thành phố Hà Nội, Việt Nam', legacyDocsUrl: 'https://drive.google.com/file/d/1LCHkeM57E08zHWUCGWw-0jlU8Kp2n4Gi/view' },
  { code: 'NCC-08', name: 'CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ VÀ XNK HÀ AN', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3316', productName: 'Hải sản tươi sống, đông lạnh - Hà An', address: 'Số 38, ngõ 273, phố Trần Cung, Phường Nghĩa Đô, TP Hà Nội, Việt Nam', taxCode: '0104991993', legacyDocsUrl: 'https://drive.google.com/file/d/1RRNFPWio8-hF-dUOug2mhjsZajFDdWS-/view' },
  { code: 'NCC-09', name: 'Công ty TNHH VISOY TOFU Việt Nam', sourceUrl: 'https://truyxuat.smartcheck.vn/check/4558', productName: 'Đậu phụ Visoy Tofu', legacyDocsUrl: 'https://drive.google.com/file/d/1B8BiS56vaUbqRC7Gw8y9heShPXmUjlse/view' },
  { code: 'NCC-10', name: 'Công ty TNHH mầm xanh SoyFood', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3320', productName: 'Sản phẩm đậu phụ', address: 'Thôn Võng La, Xã Thiên Lộc, Thành phố Hà Nội, Việt Nam', legacyDocsUrl: 'https://drive.google.com/file/d/1wLT1-KGSBHcVCKY8hzs-eqGPJeehsWwx/view' },
  { code: 'NCC-11', name: 'CÔNG TY CỔ PHẦN NÔNG SẢN HOA DÂN', sourceUrl: 'https://truyxuat.smartcheck.vn/check/4559', productName: 'Hoa quả Hoa Dân', address: 'Số 33 Đường Văn Tiến Dũng, Phường Phú Diễn, TP Hà Nội' },
  { code: 'NCC-12', name: 'HỘ KINH DOANH LÊ THỊ LOAN', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3321', productName: 'Các loại hoa quả', address: 'Đội 11, xã Thọ An, huyện Đan Phượng, Hà Nội' },
  { code: 'NCC-13', name: 'CÔNG TY CP SẢN XUẤT THƯƠNG MẠI VÀ XÂY DỰNG TÂM THÀNH', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3323', productName: 'Sản phẩm bún, Phở, các loại', address: 'Thôn Cao Hạ, Xã Hoài Đức, Thành phố Hà Nội, Việt Nam' },
  { code: 'NCC-14', name: 'Liên Hạnh', sourceUrl: 'https://truyxuat.smartcheck.vn/check/4561', productName: 'Hàng khô Liên Hạnh' },
  { code: 'NCC-15', name: 'CÔNG TY CỔ PHẦN NÔNG SẢN HOÀNG NGỌC', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3633', productName: 'Gạo Hoàng Ngọc', address: 'Số 14 đường Tân Xuân, Phường Đông Ngạc, TP Hà Nội, Việt Nam' },
  { code: 'NCC-16', name: 'Công ty TNHH thực phẩm Huy Cương', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3319', productName: 'Các loại gạo an toàn', address: 'Số nhà 88 đường Phúc Diễn, Phường Xuân Phương, TP Hà Nội, Việt Nam' },
  { code: 'NCC-17', name: 'Công ty cổ phần thực phẩm Sunfood Tây Đô', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3324', productName: 'Sản phẩm giò chả', address: 'Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội' },
  { code: 'NCC-18', name: 'CÔNG TY TNHH SX ĐẦU TƯ PHÁT TRIỂN NÔNG NGHIỆP THASCOM', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3330', productName: 'Sản phẩm trứng gà', address: 'Lô 3, C6 Khu đô thị mới Định Công, Phường Phương Liệt, Thành phố Hà Nội, Việt Nam' },
  { code: 'NCC-19', name: 'Công ty TNHH Hải Hà - Kotobuki', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3659', productName: 'Sữa Vinamilk', address: 'Số nhà 25, phố Trương Định, Phường Tương Mai, Thành phố Hà Nội, Việt Nam' },
  { code: 'NCC-20', name: 'Công ty TNHH Hải Hà - Kotobuki', sourceUrl: 'https://truyxuat.smartcheck.vn/check/4232', productName: 'Bánh ngọt', address: 'Số 25 Trương Định, P. Tương Mai, TP. Hà Nội' },
  { code: 'NCC-21', name: 'CÔNG TY TNHH ĐẦU TƯ PHÁT TRIỂN MINH GROUP', sourceUrl: 'https://truyxuat.smartcheck.vn/check/4560', productName: 'Bánh ngọt Minh Group', address: '124 Ng. 78 Tổ 12 Mậu Lương, Mậu Lương, Kiến Hưng, Hà Nội' },
  { code: 'NCC-22', name: 'Công ty TNHH đầu tư và thương mại Mai Toàn Đức', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3322', productName: 'Các loại hàng khô an toàn', address: 'Số 5, ngõ 2 phố Đại Linh, Phường Đại Mỗ, Thành phố Hà Nội, Việt Nam' },
  { code: 'NCC-23', name: 'Công ty TNHH thương mại Tín Nghĩa', sourceUrl: 'https://truyxuat.smartcheck.vn/check/3329', productName: 'Sản phẩm dầu ăn', address: 'Thôn Phú Thụy, Xã Gia Lâm, TP Hà Nội, Việt Nam' }
];
