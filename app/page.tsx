import Link from 'next/link';
import { connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TraceabilityHero } from '@/components/home/TraceabilityHero';

export default async function Home() {
  await connection();
  const suppliers = await prisma.supplier.findMany({ orderBy: { code: 'asc' } });
  return <main className="home-page"><header className="home-nav"><div className="trace-logo"><span>SF</span><div><b>SUNFOOD TÂY ĐÔ</b><small>Thực phẩm an toàn mỗi ngày</small></div></div></header>
    <TraceabilityHero />
    <section className="supplier-directory" id="danh-sach-ncc"><div className="directory-head"><div><p className="eyebrow">DANH BẠ NHÀ CUNG CẤP</p><h2>23 nguồn cung được quản lý</h2></div><span>{suppliers.length} mã truy xuất</span></div><div className="supplier-cards">{suppliers.map(s=><Link href={`/qr/${s.code}`} key={s.code}><b>{s.code}</b><div><h3>{s.productName||'Sản phẩm đang đối chiếu'}</h3><p>{s.name}</p></div><strong>→</strong></Link>)}</div></section>
    <footer className="trace-footer"><b>CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ</b><p>MST 0110716043 · Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội</p><p>tpsunfoodtaydoo@gmail.com · www.sunfoodtaydo.com</p></footer>
  </main>
}
