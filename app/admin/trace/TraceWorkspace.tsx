'use client';
import { FormEvent, useState } from 'react';

type Event = { id: number; title: string; stage: string; occurredAt: string; isPublic: boolean };
type Batch = { id: number; publicId: string; code: string; receivedAt: string | null; producedAt: string | null; expiresAt: string | null; sourceSystem: string; isPublic: boolean; everPublished: boolean; events: Event[] };
type Product = { id: number; name: string; sku: string | null; gtin: string | null; isPublic: boolean; batches: Batch[] };
type Supplier = { id: number; code: string; name: string; status: string; verificationStatus: string; products: Product[] };

export default function TraceWorkspace({ suppliers }: { suppliers: Supplier[] }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState(String(suppliers[0]?.id || ''));
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const products = suppliers.flatMap(supplier => supplier.products.map(product => ({ ...product, supplier })));
  const batches = products.flatMap(product => product.batches.map(batch => ({ ...batch, product })));

  async function create(event: FormEvent<HTMLFormElement>, type: 'product' | 'batch' | 'event') {
    event.preventDefault(); setBusy(true); setMessage('Đang lưu bản nháp…');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/admin/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được.');
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không lưu được.'); setBusy(false); }
  }

  async function toggle(type: 'product' | 'batch' | 'event', id: number, isPublic: boolean) {
    setBusy(true); setMessage('Đang kiểm tra điều kiện công khai…');
    try {
      const response = await fetch('/api/admin/trace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id, isPublic }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không cập nhật được.');
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không cập nhật được.'); setBusy(false); }
  }

  return <main className="import-workspace trace-workspace"><header className="import-header"><a href="/admin">← Tổng quan</a><p className="panel-kicker">TRUY XUẤT THEO LÔ</p><h1>Sản phẩm · Lô · Sự kiện</h1><p>Dữ liệu tạo mới luôn là bản nháp riêng tư. Mã NCC vẫn giữ nguyên; QR lô chỉ công khai sau khi NCC, sản phẩm và lô đã được duyệt.</p></header>{message && <p role="status" className="import-message">{message}</p>}
    <section className="import-panel trace-forms"><form onSubmit={event => create(event, 'product')}><h2>1. Thêm sản phẩm</h2><select name="supplierId" value={supplierId} onChange={event => setSupplierId(event.target.value)} required>{suppliers.map(supplier => <option value={supplier.id} key={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select><input name="name" placeholder="Tên sản phẩm đã đối chiếu" required /><input name="sku" placeholder="SKU (nếu có)" /><input name="gtin" placeholder="GTIN 8–14 số (nếu có)" /><input name="origin" placeholder="Xuất xứ (nếu có chứng từ)" /><input name="unit" placeholder="Quy cách/đơn vị" /><input name="storage" placeholder="Bảo quản" /><button disabled={busy}>Tạo sản phẩm nháp</button></form>
    <form onSubmit={event => create(event, 'batch')}><h2>2. Thêm lô nhập</h2><select name="productId" value={productId} onChange={event => setProductId(event.target.value)} required><option value="">Chọn sản phẩm</option>{products.map(product => <option key={product.id} value={product.id}>{product.supplier.code} · {product.name}</option>)}</select><input name="code" placeholder="Mã lô trên chứng từ" required /><label>Ngày nhập hàng <input name="receivedAt" type="date" /></label><label>Ngày sản xuất <input name="producedAt" type="date" /></label><label>Hạn dùng <input name="expiresAt" type="date" /></label><button disabled={busy}>Tạo lô nháp</button></form>
    <form onSubmit={event => create(event, 'event')}><h2>3. Thêm sự kiện</h2><select name="batchId" value={batchId} onChange={event => setBatchId(event.target.value)} required><option value="">Chọn lô</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.product.supplier.code} · {batch.product.name} · {batch.code}</option>)}</select><input name="stage" placeholder="Khâu: cung cấp, vận chuyển, kiểm định…" required /><input name="title" placeholder="Nội dung sự kiện" required /><label>Thời điểm thực tế <input name="occurredAt" type="datetime-local" required /></label><input name="location" placeholder="Địa điểm (nếu công khai)" /><input name="details" placeholder="Chi tiết đã kiểm tra" /><button disabled={busy}>Tạo sự kiện nháp</button></form></section>
    <section className="import-panel"><h2>Danh mục và duyệt công khai</h2>{suppliers.map(supplier => supplier.products.length > 0 && <div className="trace-supplier" key={supplier.id}><h3>{supplier.code} · {supplier.name} <small>({supplier.verificationStatus})</small></h3>{supplier.products.map(product => <article key={product.id} className="trace-product"><div className="trace-row"><div><b>{product.name}</b><small> SKU: {product.sku || '—'} · GTIN: {product.gtin || '—'}</small></div><button disabled={busy} onClick={() => toggle('product', product.id, !product.isPublic)}>{product.isPublic ? 'Ẩn sản phẩm' : 'Duyệt sản phẩm'}</button></div>{product.batches.map(batch => <div className="trace-batch" key={batch.id}><div className="trace-row"><div><b>Lô {batch.code}</b><small>Nhập: {batch.receivedAt?.slice(0, 10) || 'chưa rõ'} · NSX: {batch.producedAt?.slice(0, 10) || 'chưa rõ'} · HSD: {batch.expiresAt?.slice(0, 10) || 'chưa rõ'} · Nguồn: {batch.sourceSystem}</small></div><button disabled={busy} onClick={() => toggle('batch', batch.id, !batch.isPublic)}>{batch.isPublic ? 'Tạm ngừng công khai' : 'Duyệt lô'}</button></div>{(batch.isPublic || batch.everPublished) && <div className="trace-qr-links"><a href={`/lot/${batch.publicId}`} target="_blank">Trang truy xuất</a><a href={`/api/qr/lot/${batch.publicId}?format=png&download=1`}>QR PNG</a><a href={`/api/qr/lot/${batch.publicId}?format=svg&download=1`}>QR SVG</a></div>}{batch.events.map(event => <div className="trace-row trace-event" key={event.id}><div><b>{event.stage}: {event.title}</b><small>{new Date(event.occurredAt).toLocaleString('vi-VN')}</small></div><button disabled={busy} onClick={() => toggle('event', event.id, !event.isPublic)}>{event.isPublic ? 'Ẩn sự kiện' : 'Duyệt sự kiện'}</button></div>)}</div>)}</article>)}</div>)}{!products.length && <p>Chưa có sản phẩm đã đối chiếu. Không có dữ liệu mẫu được công khai tự động.</p>}</section>
  </main>;
}
