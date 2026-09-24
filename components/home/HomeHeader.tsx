import Image from 'next/image';
import Link from 'next/link';
import styles from './HomePage.module.css';

type HomeHeaderProps = {
  supplierCount: number;
};

export function HomeHeader({ supplierCount }: HomeHeaderProps) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label="Trang chủ Sunfood Tây Đô">
          <Image className={styles.brandMark} src="/brand/sunfood-logo.png" alt="" aria-hidden="true" width={44} height={44} priority />
          <span className={styles.brandCopy}>
            <strong>SUNFOOD TÂY ĐÔ</strong>
            <small>Hệ thống truy xuất nguồn gốc</small>
          </span>
        </Link>

        <nav className={styles.primaryNav} aria-label="Điều hướng trang chủ">
          <a href="#danh-sach-ncc">Tra cứu NCC</a>
          <a href="#quy-trinh">Cách kiểm tra</a>
          <a href="#lien-he">Liên hệ</a>
        </nav>

        <div className={styles.headerActions}>
          <span
            className={styles.systemStatus}
            aria-label={`Hệ thống tra cứu đang trực tuyến với ${supplierCount} mã nhà cung cấp`}
          >
            <i aria-hidden="true" />
            <span className={styles.statusMeta}>
              <strong>Trực tuyến</strong>
              <small>{supplierCount} mã NCC</small>
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
