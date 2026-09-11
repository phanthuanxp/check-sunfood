import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export default async function AdminPage(){
  const suppliers = await prisma.supplier.findMany({ include:{ documents:true }, orderBy:{ code:'asc' } });
  return <main className="wrap"><section className="card"><div className="header"><h1 className="brand">SUNFOOD TRACEABILITY · ADMIN</h1><p className="muted">MVP localhost: danh sách 23 NCC. Giai đoạn tiếp theo sẽ thêm đăng nhập, form sửa, upload PDF/ảnh, cảnh báo hết hạn.</p></div><div className="supplier"><table className="admin-table"><thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>Sản phẩm</th><th>Hồ sơ</th><th>Trạng thái</th><th></th></tr></thead><tbody>{suppliers.map(s=><tr key={s.id}><td><b>{s.code}</b></td><td>{s.name}</td><td>{s.productName || '-'}</td><td>{s.documents.length}</td><td><span className="badge">ACTIVE</span></td><td><Link href={`/qr/${s.code}`}>Xem</Link></td></tr>)}</tbody></table></div></section></main>
}
