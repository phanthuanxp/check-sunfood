import Image from 'next/image';
import { connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HomeHeader } from '@/components/home/HomeHeader';
import { SupplierDirectory } from '@/components/home/SupplierDirectory';
import { TraceabilityHero } from '@/components/home/TraceabilityHero';
import styles from '@/components/home/HomePage.module.css';

export default async function Home() {
  await connection();
  const suppliers = await prisma.supplier.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { code: 'asc' },
    select: {
      code: true,
      name: true,
      productName: true,
      status: true,
      verificationStatus: true,
    },
  });

  return (
    <>
      <a className={styles.skipLink} href="#noi-dung-chinh">
        Bỏ qua điều hướng
      </a>
      <HomeHeader supplierCount={suppliers.length} />

      <main className={`${styles.homePage} home-page`} id="noi-dung-chinh">
        <TraceabilityHero />
        <SupplierDirectory suppliers={suppliers} />

        <section className={styles.processSection} id="quy-trinh" aria-labelledby="process-title">
          <div className={styles.processHeading}>
            <div>
              <p className={styles.eyebrow}>CÁCH KIỂM TRA THÔNG TIN</p>
              <h2 id="process-title">Ba bước để truy xuất rõ ràng</h2>
            </div>
            <p>
              Hệ thống phân biệt rõ dữ liệu đã được xác minh và dữ liệu Sunfood đang đối chiếu,
              giúp người xem hiểu đúng trạng thái của từng hồ sơ.
            </p>
          </div>

          <ol className={styles.processList}>
            <li>
              <span>01</span>
              <div>
                <h3>Tìm đúng nhà cung cấp</h3>
                <p>Tra cứu theo mã NCC, tên đơn vị hoặc nhóm sản phẩm cần kiểm tra.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Đọc trạng thái dữ liệu</h3>
                <p>Nhận biết hồ sơ đã xác minh và thông tin vẫn đang được đối chiếu.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Mở trang truy xuất</h3>
                <p>Xem thông tin và hồ sơ được Sunfood cho phép công khai của nhà cung cấp.</p>
              </div>
            </li>
          </ol>
        </section>
      </main>

      <footer className={styles.footer} id="lien-he">
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Image src="/brand/sunfood-logo.png" alt="" aria-hidden="true" width={44} height={44} />
            <div>
              <strong>CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ</strong>
              <small>Thực phẩm an toàn mỗi ngày</small>
            </div>
          </div>
          <div className={styles.footerDetails}>
            <p>Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội</p>
            <p>MST: 0110716043 · Hotline: <a href="tel:0353010398">0353010398</a></p>
            <p>
              <a href="mailto:tpsunfoodtaydoo@gmail.com">tpsunfoodtaydoo@gmail.com</a>
              <span aria-hidden="true"> · </span>
              <a href="https://www.sunfoodtaydo.com" rel="noreferrer" target="_blank">
                www.sunfoodtaydo.com
              </a>
            </p>
            <p className={styles.footerCredit}>
              Vận hành bởi Công Ty CP Thương Mại Dịch Vụ 30Nice · <a href="tel:0345076789">0345 07 6789</a> ·{' '}
              <a href="mailto:info@30nice.vn">info@30nice.vn</a>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
