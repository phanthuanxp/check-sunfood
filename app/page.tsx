import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export default async function Home() {
  const suppliers = await prisma.supplier.findMany({ orderBy: { code: 'asc' } });
  return <main className="wrap">
    <section className="card">
      <div className="header">
        <h1 className="brand">CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ</h1>
        <div className="meta">MST: 0110716043<br/>Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội<br/>Email: tpsunfoodtaydoo@gmail.com · Website: www.sunfoodtaydo.com</div>
      </div>
      <div className="bar">HỆ THỐNG TRUY XUẤT NGUỒN GỐC</div>
      <div className="supplier">
        <p className="muted">Chọn nhà cung cấp hoặc quét QR trên tem/hồ sơ.</p>
        <div className="docs">
          {suppliers.map(s => <Link className="doc" key={s.code} href={`/qr/${s.code}`}><span><b>{s.code}</b><br/><span className="muted">{s.name}</span></span><span>→</span></Link>)}
        </div>
      </div>
    </section>
  </main>
}
