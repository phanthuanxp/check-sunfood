import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export default async function SupplierPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { code: code.toUpperCase() }, include: { documents: true } });
  if (!supplier) notFound();
  return <main className="wrap">
    <section className="card">
      <div className="header">
        <h1 className="brand">CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ</h1>
        <div className="meta">MST: 0110716043<br/>Địa chỉ cơ sở: Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội<br/>Email: tpsunfoodtaydoo@gmail.com · Website: www.sunfoodtaydo.com</div>
      </div>
      <div className="bar">THÔNG TIN NGUỒN GỐC XUẤT XỨ</div>
      <div className="supplier">
        <div className="grid">
          <div className="box"><div className="label">Mã NCC</div><div className="value">{supplier.code}</div></div>
          <div className="box"><div className="label">Trạng thái hồ sơ</div><div className="value">ĐANG HOẠT ĐỘNG</div></div>
          <div className="box"><div className="label">Tên nhà cung cấp</div><div className="value">{supplier.name}</div></div>
          <div className="box"><div className="label">Nhóm sản phẩm</div><div className="value">{supplier.productName || 'Đang cập nhật'}</div></div>
        </div>
        <div className="tabs"><span className="tab active">Thông tin nguồn gốc</span><span className="tab">Hồ sơ pháp lý</span><span className="tab">Chứng nhận & kiểm nghiệm</span><span className="tab">Lịch sử cập nhật</span></div>
        <div className="docs">
          <div className="doc"><span><b>Địa chỉ nhà cung cấp</b><br/><span className="muted">{supplier.address || 'Đang cập nhật'}</span></span></div>
          {supplier.taxCode && <div className="doc"><span><b>Mã số thuế</b><br/><span className="muted">{supplier.taxCode}</span></span></div>}
          {supplier.documents.length ? supplier.documents.map(d => <a className="doc" href={d.fileUrl} key={d.id} target="_blank"><span><b>{d.title}</b><br/><span className="muted">{d.category} · {d.status}</span></span><span>Mở ↗</span></a>) : <div className="doc"><span><b>Hồ sơ pháp lý / chứng nhận</b><br/><span className="muted">Chưa nhập file vào hệ thống mới.</span></span>{supplier.legacyDocsUrl && <a className="btn" href={supplier.legacyDocsUrl} target="_blank">Xem hồ sơ cũ</a>}</div>}
        </div>
      </div>
      <div className="footer">Dữ liệu được quản lý bởi Sunfood Tây Đô · URL chuẩn: /qr/{supplier.code}</div>
    </section>
  </main>
}
