import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sunfood Tây Đô - Truy xuất nguồn gốc',
  description: 'Hệ thống truy xuất nguồn gốc và hồ sơ nhà cung cấp Sunfood Tây Đô'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
