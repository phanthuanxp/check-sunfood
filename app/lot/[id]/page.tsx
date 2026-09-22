import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import './lot.css';
import './lot-status.css';

export const dynamic = 'force-dynamic';

const format = (date: Date | null) => date
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date)
  : 'Chưa có dữ liệu đã xác minh';

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const publicId = (await params).id;
  if (!/^c[a-z0-9]{20,40}$/.test(publicId)) notFound();
  const batch = await prisma.batch.findUnique({
    where: { publicId },
    include: {
      product: { include: { supplier: { include: { documents: { where: { isPublic: true }, orderBy: { createdAt: 'desc' } } } } } },
      events: { where: { isPublic: true, occurredAt: { lte: new Date() } }, orderBy: { occurredAt: 'asc' } },
    },
  });
  if (!batch || (!batch.isPublic && !batch.everPublished)) notFound();

  const { product } = batch;
  const available = batch.isPublic && product.isPublic && product.supplier.verificationStatus === 'VERIFIED'
    && product.supplier.status === 'ACTIVE' && (!batch.producedAt || batch.producedAt <= new Date());

  return <main className="lot-page">
    <header><Link href="/">SF · SUNFOOD TÂY ĐÔ</Link><span>TRUY XUẤT THEO LÔ</span></header>
    {!available ? <section className="lot-hero lot-hero-hold">
      <p>THÔNG BÁO VỀ MÃ QR ĐÃ PHÁT HÀNH</p>
      <h1>Thông tin lô đang tạm ngừng công khai</h1>
      <p>Mã QR này vẫn dẫn đến đúng hồ sơ lô, nhưng Sunfood đang rà soát dữ liệu. Vui lòng không coi thông tin đã lưu hoặc ảnh chụp trước đây là xác nhận hiện tại.</p>
      <div><span>Mã NCC: <b>{product.supplier.code}</b></span><span>Mã lô: <b>{batch.code}</b></span></div>
    </section> : <>
      <section className="lot-hero"><p>HỒ SƠ LÔ ĐÃ CÔNG BỐ</p><h1>{product.name}</h1><p>{product.supplier.name}</p><div><span>Mã NCC: <b>{product.supplier.code}</b></span><span>Mã lô: <b>{batch.code}</b></span></div></section>
      <section className="lot-card"><h2>Thông tin lô nhập hàng</h2><dl>
        <div><dt>Ngày nhập</dt><dd>{format(batch.receivedAt)}</dd></div>
        <div><dt>SKU</dt><dd>{product.sku || 'Chưa công bố'}</dd></div>
        <div><dt>GTIN</dt><dd>{product.gtin || 'Chưa công bố'}</dd></div>
        <div><dt>Xuất xứ</dt><dd>{product.origin || 'Chưa công bố'}</dd></div>
        <div><dt>Quy cách</dt><dd>{product.unit || 'Chưa công bố'}</dd></div>
        <div><dt>Ngày sản xuất</dt><dd>{format(batch.producedAt)}</dd></div>
        <div><dt>Hạn dùng</dt><dd>{format(batch.expiresAt)}</dd></div>
        <div><dt>Bảo quản</dt><dd>{product.storage || 'Chưa có dữ liệu đã xác minh'}</dd></div>
      </dl><p className="lot-source">Nguồn dữ liệu: {batch.sourceSystem === 'HANOICHECK' ? 'HanoiCheck' : 'Sunfood nhập và đối chiếu'}{batch.sourceSyncedAt ? ` · Đồng bộ lần cuối ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(batch.sourceSyncedAt)}` : ''}</p></section>
      <section className="lot-card"><h2>Hành trình đã công bố</h2>{batch.events.length ? <ol className="lot-events">{batch.events.map(event => <li key={event.id}><time>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(event.occurredAt)}</time><b>{event.stage} · {event.title}</b>{event.location && <p>{event.location}</p>}{event.details && <p>{event.details}</p>}</li>)}</ol> : <p>Chưa có sự kiện được duyệt công khai cho lô này.</p>}</section>
      <section className="lot-card"><h2>Hồ sơ công khai của nhà cung cấp</h2>{product.supplier.documents.length ? <ul>{product.supplier.documents.map(document => <li key={document.id}><a href={document.fileUrl} target="_blank" rel="noreferrer">{document.title} ↗</a>{document.expiresAt && <small> · Hết hạn {format(document.expiresAt)}</small>}</li>)}</ul> : <p>Chưa có hồ sơ được phép công khai.</p>}<Link href={`/qr/${product.supplier.code}`}>Xem hồ sơ nhà cung cấp →</Link></section>
    </>}
    <footer>Thông tin do Sunfood Tây Đô quản lý và công bố sau đối chiếu. Không có điểm tin cậy hoặc xác nhận kiểm định tự động khi thiếu chứng từ.</footer>
  </main>;
}
