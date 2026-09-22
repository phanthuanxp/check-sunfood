'use client';
import { FormEvent, useEffect, useState } from 'react';
import './trace.css';

type Event = { id: number; title: string; stage: string; occurredAt: string; isPublic: boolean };
type Batch = { id: number; publicId: string; code: string; receivedAt: string | null; producedAt: string | null; expiresAt: string | null; sourceSystem: string; sourceTraceUrl: string | null; isPublic: boolean; everPublished: boolean; events: Event[] };
type Product = { id: number; name: string; sku: string | null; gtin: string | null; origin: string | null; unit: string | null; storage: string | null; hygieneCertNumber: string | null; isPublic: boolean; batches: Batch[] };
type Supplier = { id: number; code: string; name: string; status: string; verificationStatus: string; products: Product[] };

export default function TraceWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [traceUrl, setTraceUrl] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [syncDateFrom, setSyncDateFrom] = useState(today);
  const [syncDateTo, setSyncDateTo] = useState(today);
  const products = suppliers.flatMap(supplier => supplier.products.map(product => ({ ...product, supplier })));
  const batches = products.flatMap(product => product.batches.map(batch => ({ ...batch, product })));
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<number | null>(null);

  async function refresh() {
    const response = await fetch('/api/admin/trace', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không đọc được dữ liệu.');
    setSuppliers(data);
    setSupplierId(current => current || String(data[0]?.id || ''));
  }

  useEffect(() => {
    let active = true;
    fetch('/api/admin/trace', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không đọc được dữ liệu.');
        return data as Supplier[];
      })
      .then(data => { if (!active) return; setSuppliers(data); setSupplierId(String(data[0]?.id || '')); })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Không đọc được dữ liệu.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveProductEdit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault(); setBusy(true); setMessage('Đang lưu sản phẩm…');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/admin/trace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'product', id, ...data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được sản phẩm.');
      setEditingProductId(null); await refresh(); setMessage('Đã lưu sản phẩm.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không lưu được sản phẩm.'); }
    finally { setBusy(false); }
  }

  async function saveBatchEdit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault(); setBusy(true); setMessage('Đang lưu lô…');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/admin/trace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch', id, ...data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được lô.');
      setEditingBatchId(null); await refresh(); setMessage('Đã lưu lô.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không lưu được lô.'); }
    finally { setBusy(false); }
  }

  async function importFromExcel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) { setMessage('Chọn file Excel danh sách lô trước.'); return; }
    setBusy(true); setMessage(`Đang đọc ${file.name} và nhập từng lô…`);
    try {
      const payload = new FormData(); payload.set('file', file);
      const response = await fetch('/api/admin/hanoicheck/import-excel', { method: 'POST', body: payload });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không nhập được file.');
      if (result.created + result.updated > 0) await refresh();
      setMessage(`Đã đọc ${result.processed} dòng: ${result.created} lô mới, ${result.updated} cập nhật, ${result.skipped.length} bỏ qua.${result.skipped.length ? ' ' + result.skipped.slice(0, 5).map((s: { code: string; reason: string }) => `${s.code}: ${s.reason}`).join(' | ') : ''}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không nhập được file.'); }
    finally { setBusy(false); }
  }

  async function importFromTraceUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('Đang tải và đối chiếu trang truy xuất HanoiCheck…');
    try {
      const response = await fetch('/api/admin/hanoicheck/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traceUrl }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không nhập được lô.');
      setTraceUrl(''); await refresh(); setMessage(`Đã nhập lô ${result.batchCode}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không nhập được lô.'); }
    finally { setBusy(false); }
  }

  async function syncAll() {
    setBusy(true); setMessage(`Đang đọc đơn hàng từ ${syncDateFrom} đến ${syncDateTo} trên HanoiCheck…`);
    try {
      const response = await fetch('/api/admin/hanoicheck/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom: syncDateFrom, dateTo: syncDateTo }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không đồng bộ được.');
      if (result.created + result.updated > 0) await refresh();
      setMessage(`Đã đọc ${result.processed} lô: ${result.created} mới, ${result.updated} cập nhật, ${result.skipped.length} bỏ qua.${result.skipped.length ? ' ' + result.skipped.slice(0, 3).map((s: { code: string; reason: string }) => `${s.code}: ${s.reason}`).join(' | ') : ''}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không đồng bộ được.'); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>, type: 'product' | 'batch' | 'event') {
    event.preventDefault(); setBusy(true); setMessage('Đang lưu bản nháp…');
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/admin/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được.');
      form.reset(); await refresh(); setMessage('Đã lưu bản nháp.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không lưu được.'); }
    finally { setBusy(false); }
  }

  async function toggle(type: 'product' | 'batch' | 'event', id: number, isPublic: boolean) {
    setBusy(true); setMessage('Đang kiểm tra điều kiện công khai…');
    try {
      const response = await fetch('/api/admin/trace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id, isPublic }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không cập nhật được.');
      await refresh(); setMessage('Đã cập nhật.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không cập nhật được.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="import-workspace trace-workspace"><p role="status">Đang tải dữ liệu lô…</p></div>;

  return <div className="import-workspace trace-workspace">{message && <p role="status" className="import-message">{message}</p>}
    <section className="import-panel"><h2>Đồng bộ lô từ HanoiCheck</h2><p>Cách nhanh nhất: trên cổng HanoiCheck, mở <b>QL lô nhập hàng</b> → xuất Excel danh sách lô trong ngày → tải file <code>.xlsx</code> đó lên đây. Hệ thống đọc cột &quot;Link truy xuất&quot; của từng dòng, tải trang công khai tương ứng và nhập lô — không cần token hay API riêng. Lô nhận về luôn ở trạng thái riêng tư; NCC được nhận diện tự động qua mã thực phẩm/mã lô (ví dụ <code>-NCC07</code>) và cần đã có hồ sơ trong hệ thống.</p>
      <form onSubmit={importFromExcel} className="trace-hanoicheck-form"><input type="file" name="file" accept=".xlsx" required /><button disabled={busy}>Nhập danh sách lô từ Excel</button></form>
      <details className="trace-hanoicheck-advanced"><summary>Cách khác (nâng cao)</summary>
        <form onSubmit={importFromTraceUrl} className="trace-hanoicheck-form"><input type="url" value={traceUrl} onChange={event => setTraceUrl(event.target.value)} placeholder="https://tracuu.hanoicheck.com.vn/.../truy-xuat/san-pham/..." required /><button disabled={busy}>Nhập 1 lô từ URL</button></form>
        <div className="trace-hanoicheck-form"><label>Từ ngày giao <input type="date" value={syncDateFrom} onChange={event => setSyncDateFrom(event.target.value)} /></label><label>Đến ngày <input type="date" value={syncDateTo} onChange={event => setSyncDateTo(event.target.value)} /></label><button type="button" className="outline" disabled={busy} onClick={syncAll}>Đồng bộ theo ngày qua API (cần cấu hình ở Kết nối HanoiCheck)</button></div>
      </details>
    </section>
    <section className="import-panel trace-forms"><form onSubmit={event => create(event, 'product')}><h2>1. Thêm sản phẩm</h2><select name="supplierId" value={supplierId} onChange={event => setSupplierId(event.target.value)} required>{suppliers.map(supplier => <option value={supplier.id} key={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select><input name="name" placeholder="Tên sản phẩm đã đối chiếu" required /><input name="sku" placeholder="SKU (nếu có)" /><input name="gtin" placeholder="GTIN 8–14 số (nếu có)" /><input name="origin" placeholder="Xuất xứ (nếu có chứng từ)" /><input name="unit" placeholder="Quy cách/đơn vị" /><input name="storage" placeholder="Bảo quản" /><button disabled={busy}>Tạo sản phẩm nháp</button></form>
    <form onSubmit={event => create(event, 'batch')}><h2>2. Thêm lô nhập</h2><select name="productId" value={productId} onChange={event => setProductId(event.target.value)} required><option value="">Chọn sản phẩm</option>{products.map(product => <option key={product.id} value={product.id}>{product.supplier.code} · {product.name}</option>)}</select><input name="code" placeholder="Mã lô trên chứng từ" required /><label>Ngày nhập hàng <input name="receivedAt" type="date" /></label><label>Ngày sản xuất <input name="producedAt" type="date" /></label><label>Hạn dùng <input name="expiresAt" type="date" /></label><button disabled={busy}>Tạo lô nháp</button></form>
    <form onSubmit={event => create(event, 'event')}><h2>3. Thêm sự kiện</h2><select name="batchId" value={batchId} onChange={event => setBatchId(event.target.value)} required><option value="">Chọn lô</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.product.supplier.code} · {batch.product.name} · {batch.code}</option>)}</select><input name="stage" placeholder="Khâu: cung cấp, vận chuyển, kiểm định…" required /><input name="title" placeholder="Nội dung sự kiện" required /><label>Thời điểm thực tế <input name="occurredAt" type="datetime-local" required /></label><input name="location" placeholder="Địa điểm (nếu công khai)" /><input name="details" placeholder="Chi tiết đã kiểm tra" /><button disabled={busy}>Tạo sự kiện nháp</button></form></section>
    <section className="import-panel"><h2>Danh mục và duyệt công khai</h2>{suppliers.map(supplier => supplier.products.length > 0 && <div className="trace-supplier" key={supplier.id}><h3>{supplier.code} · {supplier.name} <small>({supplier.verificationStatus})</small></h3>{supplier.products.map(product => <article key={product.id} className="trace-product"><div className="trace-row"><div><b>{product.name}</b><small> SKU: {product.sku || '—'} · GTIN: {product.gtin || '—'}</small></div><div className="trace-row-actions"><button disabled={busy} onClick={() => setEditingProductId(editingProductId === product.id ? null : product.id)}>{editingProductId === product.id ? 'Đóng' : 'Sửa'}</button><button disabled={busy} onClick={() => toggle('product', product.id, !product.isPublic)}>{product.isPublic ? 'Ẩn sản phẩm' : 'Duyệt sản phẩm'}</button></div></div>
      {editingProductId === product.id && <form className="trace-edit-form" onSubmit={event => saveProductEdit(event, product.id)}>
        <input name="name" defaultValue={product.name} placeholder="Tên sản phẩm" required />
        <input name="sku" defaultValue={product.sku || ''} placeholder="SKU" />
        <input name="gtin" defaultValue={product.gtin || ''} placeholder="GTIN 8–14 số" />
        <input name="origin" defaultValue={product.origin || ''} placeholder="Xuất xứ" />
        <input name="unit" defaultValue={product.unit || ''} placeholder="Quy cách/đơn vị" />
        <input name="storage" defaultValue={product.storage || ''} placeholder="Bảo quản" />
        <label>Mã K.T.V.S.T.Y <small>Chỉ điền cho sản phẩm thịt lợn có mã kiểm dịch thú y thật; để trống với sản phẩm khác.</small><input name="hygieneCertNumber" defaultValue={product.hygieneCertNumber || ''} placeholder="VD: 12.033.02" /></label>
        <button disabled={busy}>Lưu sản phẩm</button>
      </form>}
      {product.batches.map(batch => <div className="trace-batch" key={batch.id}><div className="trace-row"><div><b>Lô {batch.code}</b><small>Nhập: {batch.receivedAt?.slice(0, 10) || 'chưa rõ'} · NSX: {batch.producedAt?.slice(0, 10) || 'chưa rõ'} · HSD: {batch.expiresAt?.slice(0, 10) || 'chưa rõ'} · Nguồn: {batch.sourceSystem}</small></div><div className="trace-row-actions"><button disabled={busy} onClick={() => setEditingBatchId(editingBatchId === batch.id ? null : batch.id)}>{editingBatchId === batch.id ? 'Đóng' : 'Sửa'}</button><button disabled={busy} onClick={() => toggle('batch', batch.id, !batch.isPublic)}>{batch.isPublic ? 'Tạm ngừng công khai' : 'Duyệt lô'}</button></div></div>
        {editingBatchId === batch.id && <form className="trace-edit-form" onSubmit={event => saveBatchEdit(event, batch.id)}>
          <input name="code" defaultValue={batch.code} placeholder="Mã lô" required />
          <label>Ngày nhập hàng <input name="receivedAt" type="date" defaultValue={batch.receivedAt?.slice(0, 10) || ''} /></label>
          <label>Ngày sản xuất <input name="producedAt" type="date" defaultValue={batch.producedAt?.slice(0, 10) || ''} /></label>
          <label>Hạn dùng <input name="expiresAt" type="date" defaultValue={batch.expiresAt?.slice(0, 10) || ''} /></label>
          <button disabled={busy}>Lưu lô</button>
        </form>}
        {(batch.isPublic || batch.everPublished) && <div className="trace-qr-links"><a href={`/lot/${batch.publicId}`} target="_blank">Trang truy xuất</a><a href={`/api/qr/lot/${batch.publicId}?format=png&download=1`}>QR PNG</a><a href={`/api/qr/lot/${batch.publicId}?format=svg&download=1`}>QR SVG</a><a href={`/admin/print/lot/${batch.publicId}`} target="_blank">In tem A6/A5</a></div>}{batch.sourceTraceUrl && <div className="trace-qr-links"><a href={batch.sourceTraceUrl} target="_blank" rel="noreferrer">Xem trên HanoiCheck ↗</a></div>}{batch.events.map(event => <div className="trace-row trace-event" key={event.id}><div><b>{event.stage}: {event.title}</b><small>{new Date(event.occurredAt).toLocaleString('vi-VN')}</small></div><button disabled={busy} onClick={() => toggle('event', event.id, !event.isPublic)}>{event.isPublic ? 'Ẩn sự kiện' : 'Duyệt sự kiện'}</button></div>)}</div>)}</article>)}</div>)}{!products.length && <p>Chưa có sản phẩm đã đối chiếu. Không có dữ liệu mẫu được công khai tự động.</p>}</section>
  </div>;
}
