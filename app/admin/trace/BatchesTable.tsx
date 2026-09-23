'use client';
import { FormEvent, useEffect, useState } from 'react';

type BatchRow = {
  id: number; publicId: string; code: string; name: string | null;
  receivedAt: string | null; producedAt: string | null; expiresAt: string | null;
  sourceSystem: string; sourceTraceUrl: string | null;
  isPublic: boolean; everPublished: boolean; status: 'DRAFT' | 'PUBLIC' | 'HIDDEN';
  eventsTotal: number; eventsPublic: number;
  product: { id: number; name: string; sku: string | null; isPublic: boolean };
  supplier: { id: number; code: string; name: string; verificationStatus: string; status: string };
};
type SupplierOption = { id: number; code: string; name: string };
type Event = { id: number; title: string; stage: string; occurredAt: string; isPublic: boolean; location: string | null; details: string | null };
type ProductDetail = { id: number; name: string; sku: string | null; gtin: string | null; origin: string | null; unit: string | null; storage: string | null; hygieneCertNumber: string | null; isPublic: boolean };
type BatchDetail = Omit<BatchRow, 'product'> & { events: Event[]; product: ProductDetail };
type ProductOption = { id: number; name: string; supplierCode: string; supplierName: string };
type OrphanProduct = { id: number; name: string; sku: string | null; isPublic: boolean; supplierCode: string; supplierName: string };

const statusLabels: Record<BatchRow['status'], string> = { DRAFT: 'Nháp', PUBLIC: 'Đã duyệt', HIDDEN: 'Tạm ẩn' };
const sourceLabels: Record<string, string> = { LOCAL: 'Nhập tay', HANOICHECK: 'HanoiCheck' };

const fmt = (iso: string | null) => iso ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '—';
const toInputValue = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function publishBlockedReasons(batch: BatchDetail) {
  const reasons: string[] = [];
  if (!batch.product.isPublic) reasons.push('sản phẩm chưa được duyệt công khai (xem mục "Thông tin sản phẩm" bên dưới)');
  if (batch.supplier.verificationStatus !== 'VERIFIED') reasons.push(`nhà cung cấp ${batch.supplier.code} chưa được xác minh (vào mục Nhà cung cấp để xác minh)`);
  if (batch.supplier.status !== 'ACTIVE') reasons.push(`nhà cung cấp ${batch.supplier.code} đang tạm ngừng hoạt động`);
  if (!batch.receivedAt) reasons.push('chưa có ngày nhập hàng');
  else if (new Date(batch.receivedAt) > new Date()) reasons.push('ngày nhập hàng đang ở tương lai');
  if (batch.producedAt && new Date(batch.producedAt) > new Date()) reasons.push('ngày sản xuất đang ở tương lai');
  return reasons;
}

const PAGE_SIZE = 30;

export default function BatchesTable() {
  const [items, setItems] = useState<BatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  function notify(text: string, type: 'info' | 'error' = 'info') { setMessage(text); setMessageType(type); }
  const [syncing, setSyncing] = useState(false);

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [supplierId, setSupplierId] = useState('all');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [drawerBatch, setDrawerBatch] = useState<BatchDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'existing' | 'new'>('existing');
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  const [orphanProducts, setOrphanProducts] = useState<OrphanProduct[]>([]);
  const [showOrphans, setShowOrphans] = useState(false);

  async function refreshOrphans() {
    const response = await fetch('/api/admin/trace', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) return;
    setOrphanProducts(data.flatMap((supplier: { code: string; name: string; products: { id: number; name: string; sku: string | null; isPublic: boolean; batches: unknown[] }[] }) =>
      supplier.products.filter(product => product.batches.length === 0)
        .map(product => ({ id: product.id, name: product.name, sku: product.sku, isPublic: product.isPublic, supplierCode: supplier.code, supplierName: supplier.name }))));
  }
  useEffect(() => { const timer = setTimeout(refreshOrphans, 0); return () => clearTimeout(timer); }, []);

  async function toggleOrphan(id: number, isPublic: boolean) {
    setBusy(true); notify('Đang cập nhật…');
    try {
      const response = await fetch('/api/admin/trace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'product', id, isPublic }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không cập nhật được.');
      await refreshOrphans(); notify('Đã cập nhật.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không cập nhật được.', 'error'); }
    finally { setBusy(false); }
  }

  useEffect(() => { const timer = setTimeout(() => { setQ(qInput); setPage(1); }, 300); return () => clearTimeout(timer); }, [qInput]);

  function updateFilter<T extends string>(setter: (value: T) => void) {
    return (value: T) => { setter(value); setPage(1); };
  }

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      if (supplierId !== 'all') params.set('supplierId', supplierId);
      if (status !== 'all') params.set('status', status);
      if (source !== 'all') params.set('source', source);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const response = await fetch(`/api/admin/trace/batches?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không đọc được danh sách lô.');
      setItems(data.items); setTotal(data.total); setSuppliers(data.suppliers);
      setSelected(new Set());
    } catch (error) { notify(error instanceof Error ? error.message : 'Không đọc được danh sách lô.', 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, supplierId, status, source, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSelect(id: number) {
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelectAll() {
    setSelected(current => current.size === items.length ? new Set() : new Set(items.map(item => item.id)));
  }

  async function bulkPublish(isPublic: boolean) {
    if (!selected.size) return;
    if (!window.confirm(`${isPublic ? 'Duyệt công khai' : 'Ẩn'} ${selected.size} lô đã chọn?`)) return;
    setBusy(true); notify('Đang xử lý hàng loạt…');
    try {
      const response = await fetch('/api/admin/trace/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch', ids: Array.from(selected), isPublic }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không xử lý được.');
      await refresh();
      notify(`Đã ${isPublic ? 'duyệt' : 'ẩn'} ${result.succeeded.length}/${result.succeeded.length + result.failed.length} lô.${result.failed.length ? ' Bỏ qua: ' + result.failed.slice(0, 4).map((f: { id: number; error: string }) => `#${f.id} (${f.error})`).join(' | ') : ''}`, result.succeeded.length === 0 && result.failed.length > 0 ? 'error' : 'info');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không xử lý được.', 'error'); }
    finally { setBusy(false); }
  }

  async function quickSyncToday() {
    setSyncing(true); notify('Đang lấy lô hôm nay từ HanoiCheck…');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await fetch('/api/admin/hanoicheck/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom: today, dateTo: today }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không đồng bộ được.');
      setPage(1); await refresh();
      notify(`Đã đọc ${result.processed} lô hôm nay: ${result.created} mới, ${result.updated} cập nhật, ${result.skipped.length} bỏ qua.${result.skipped.length ? ' ' + result.skipped.slice(0, 3).map((s: { code: string; reason: string }) => `${s.code}: ${s.reason}`).join(' | ') : ''}`);
    } catch (error) { notify(error instanceof Error ? error.message : 'Không đồng bộ được.', 'error'); }
    finally { setSyncing(false); }
  }

  async function toggleOne(id: number, isPublic: boolean) {
    setBusy(true); notify('Đang kiểm tra điều kiện công khai…');
    try {
      const response = await fetch('/api/admin/trace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch', id, isPublic }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không cập nhật được.');
      await refresh(); if (drawerId === id) await openDrawer(id);
      notify('Đã cập nhật.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không cập nhật được.', 'error'); }
    finally { setBusy(false); }
  }

  async function openDrawer(id: number) {
    setDrawerId(id); setDrawerLoading(true); setSelectedEvents(new Set());
    try {
      const response = await fetch(`/api/admin/trace/batches/${id}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không đọc được lô.');
      setDrawerBatch(data);
    } catch (error) { notify(error instanceof Error ? error.message : 'Không đọc được lô.', 'error'); setDrawerId(null); }
    finally { setDrawerLoading(false); }
  }
  function closeDrawer() { setDrawerId(null); setDrawerBatch(null); setSelectedEvents(new Set()); }

  async function saveBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!drawerBatch) return;
    setBusy(true); notify('Đang lưu lô…');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/admin/trace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch', id: drawerBatch.id, ...data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được.');
      await refresh(); await openDrawer(drawerBatch.id); notify('Đã lưu lô.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không lưu được.', 'error'); }
    finally { setBusy(false); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!drawerBatch) return;
    setBusy(true); notify('Đang lưu sản phẩm…');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch('/api/admin/trace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'product', id: drawerBatch.product.id, ...data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được.');
      await refresh(); await openDrawer(drawerBatch.id); notify('Đã lưu sản phẩm.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không lưu được.', 'error'); }
    finally { setBusy(false); }
  }

  async function toggleProductPublic(isPublic: boolean) {
    if (!drawerBatch) return;
    setBusy(true); notify('Đang kiểm tra điều kiện công khai…');
    try {
      const response = await fetch('/api/admin/trace', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'product', id: drawerBatch.product.id, isPublic }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không cập nhật được.');
      await refresh(); await openDrawer(drawerBatch.id); notify('Đã cập nhật.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không cập nhật được.', 'error'); }
    finally { setBusy(false); }
  }

  function toggleEventSelect(id: number) {
    setSelectedEvents(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function bulkEventPublish(isPublic: boolean) {
    if (!drawerBatch || !selectedEvents.size) return;
    setBusy(true); notify('Đang duyệt sự kiện…');
    try {
      const response = await fetch('/api/admin/trace/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'event', ids: Array.from(selectedEvents), isPublic }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không xử lý được.');
      await openDrawer(drawerBatch.id); await refresh();
      notify(`Đã ${isPublic ? 'duyệt' : 'ẩn'} ${result.succeeded.length}/${result.succeeded.length + result.failed.length} sự kiện.${result.failed.length ? ' Bỏ qua: ' + result.failed.slice(0, 3).map((f: { id: number; error: string }) => f.error).join(' | ') : ''}`, result.succeeded.length === 0 && result.failed.length > 0 ? 'error' : 'info');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không xử lý được.', 'error'); }
    finally { setBusy(false); }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!drawerBatch) return;
    setBusy(true); notify('Đang lưu sự kiện…');
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/admin/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'event', batchId: drawerBatch.id, ...data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được.');
      form.reset(); await openDrawer(drawerBatch.id); notify('Đã lưu sự kiện.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không lưu được.', 'error'); }
    finally { setBusy(false); }
  }

  async function openCreate() {
    setShowCreate(true); setCreateMode('existing');
    if (productOptions.length) return;
    const response = await fetch('/api/admin/trace', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) setProductOptions(data.flatMap((supplier: { code: string; name: string; products: { id: number; name: string }[] }) =>
      supplier.products.map(product => ({ id: product.id, name: product.name, supplierCode: supplier.code, supplierName: supplier.name }))));
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); notify('Đang lưu lô…');
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    try {
      let productId = data.productId;
      if (createMode === 'new') {
        if (!data.newSupplierId || !data.newProductName) throw new Error('Chọn NCC và nhập tên sản phẩm mới.');
        const productResponse = await fetch('/api/admin/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'product', supplierId: data.newSupplierId, name: data.newProductName, sku: data.newSku }) });
        const product = await productResponse.json(); if (!productResponse.ok) throw new Error(product.error || 'Không tạo được sản phẩm mới.');
        productId = String(product.id);
      }
      const response = await fetch('/api/admin/trace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'batch', productId, code: data.code, name: data.name, receivedAt: data.receivedAt, producedAt: data.producedAt, expiresAt: data.expiresAt }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không lưu được.');
      form.reset(); setShowCreate(false); setProductOptions([]); await refresh(); notify('Đã tạo lô nháp.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không lưu được.', 'error'); }
    finally { setBusy(false); }
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return <div className="trace-batches">
    {message && <div role="status" className={`trace-toast${messageType === 'error' ? ' trace-toast-error' : ''}`}>
      <span>{message}</span>
      <button type="button" onClick={() => setMessage('')} aria-label="Đóng thông báo">×</button>
    </div>}
    <div className="module-toolbar trace-toolbar">
      <div><p className="panel-kicker">LÔ NHẬP HÀNG</p><h2>{total} lô{q || supplierId !== 'all' || status !== 'all' || source !== 'all' || dateFrom || dateTo ? ' phù hợp bộ lọc' : ''}</h2><p>Mỗi lô gắn với một sản phẩm — sửa lô cũng là nơi cập nhật thông tin sản phẩm đó.</p></div>
      <div className="top-actions">
        {orphanProducts.length > 0 && <button className="secondary-btn" onClick={() => setShowOrphans(true)}><span aria-hidden>⚠</span>{orphanProducts.length} sản phẩm chưa có lô</button>}
        <button className="secondary-btn" disabled={syncing} onClick={quickSyncToday}><span aria-hidden>⟳</span>{syncing ? 'Đang lấy lô…' : 'Lấy lô hôm nay từ HanoiCheck'}</button>
        <button className="primary-btn" onClick={openCreate}><span aria-hidden>＋</span>Lô mới</button>
      </div>
    </div>
    <div className="panel trace-batch-filter-panel">
      <div className="filters trace-batch-filters">
        <input className="search" placeholder="Tìm mã lô, tên lô, sản phẩm, SKU…" value={qInput} onChange={event => setQInput(event.target.value)} />
        <select value={supplierId} onChange={event => updateFilter(setSupplierId)(event.target.value)}>
          <option value="all">Mọi nhà cung cấp</option>
          {suppliers.map(supplier => <option value={supplier.id} key={supplier.id}>{supplier.code} · {supplier.name}</option>)}
        </select>
        <select value={status} onChange={event => updateFilter(setStatus)(event.target.value)}>
          <option value="all">Mọi trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="public">Đã duyệt</option>
          <option value="hidden">Tạm ẩn</option>
        </select>
        <select value={source} onChange={event => updateFilter(setSource)(event.target.value)}>
          <option value="all">Mọi nguồn</option>
          <option value="LOCAL">Nhập tay</option>
          <option value="HANOICHECK">HanoiCheck</option>
        </select>
        <label className="trace-date-filter">Nhập từ<input type="date" value={dateFrom} onChange={event => updateFilter(setDateFrom)(event.target.value)} /></label>
        <label className="trace-date-filter">đến<input type="date" value={dateTo} onChange={event => updateFilter(setDateTo)(event.target.value)} /></label>
        {(q || supplierId !== 'all' || status !== 'all' || source !== 'all' || dateFrom || dateTo) &&
          <button className="trace-clear-filters" onClick={() => { setQInput(''); setQ(''); setSupplierId('all'); setStatus('all'); setSource('all'); setDateFrom(''); setDateTo(''); setPage(1); }}>✕ Xóa lọc</button>}
      </div>
    </div>

    {showCreate && <form className="trace-edit-form trace-create-batch panel" onSubmit={createBatch}>
      <div className="trace-create-mode wide">
        <button type="button" className={createMode === 'existing' ? 'active' : ''} onClick={() => setCreateMode('existing')}>Sản phẩm có sẵn</button>
        <button type="button" className={createMode === 'new' ? 'active' : ''} onClick={() => setCreateMode('new')}>+ Sản phẩm mới</button>
      </div>
      {createMode === 'existing'
        ? <select name="productId" required><option value="">Chọn sản phẩm</option>{productOptions.map(product => <option key={product.id} value={product.id}>{product.supplierCode} · {product.name}</option>)}</select>
        : <>
          <select name="newSupplierId" required><option value="">Chọn nhà cung cấp</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select>
          <input name="newProductName" placeholder="Tên sản phẩm mới" required />
          <input name="newSku" placeholder="SKU (nếu có)" />
        </>}
      <input name="name" placeholder="Tên lô (VD: Thịt lợn vai ngày 23/9)" />
      <input name="code" placeholder="Mã lô trên chứng từ" required />
      <label>Ngày nhập hàng <input name="receivedAt" type="date" /></label>
      <label>Ngày sản xuất <input name="producedAt" type="date" /></label>
      <label>Hạn dùng <input name="expiresAt" type="date" /></label>
      <div className="trace-row-actions wide"><button className="primary-btn" disabled={busy}>Tạo lô nháp</button><button className="secondary-btn" type="button" onClick={() => setShowCreate(false)}>Hủy</button></div>
    </form>}

    {selected.size > 0 && <div className="trace-bulk-bar">
      <span>{selected.size} lô đã chọn</span>
      <button className="trace-bulk-approve" disabled={busy} onClick={() => bulkPublish(true)}>✓ Duyệt công khai</button>
      <button className="trace-bulk-hide" disabled={busy} onClick={() => bulkPublish(false)}>⊘ Ẩn</button>
      <button className="trace-bulk-clear" onClick={() => setSelected(new Set())}>✕ Bỏ chọn</button>
    </div>}

    <div className="panel">
    <div className="table-wrap">
      <table className="admin-table trace-batch-table">
        <thead><tr>
          <th className="trace-check-col"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Chọn tất cả" /></th>
          <th>Thông tin lô</th><th>Thực phẩm</th><th>Thời gian</th><th>Thao tác</th>
        </tr></thead>
        <tbody>
          {items.map(batch => <tr key={batch.id}>
            <td className="trace-check-col"><input type="checkbox" checked={selected.has(batch.id)} onChange={() => toggleSelect(batch.id)} /></td>
            <td data-label="Thông tin lô">
              <div className="trace-lot-cell">
                <span className={`trace-status-dot trace-status-dot-${batch.status.toLowerCase()}`}>● {statusLabels[batch.status]}</span>
                <div className="trace-lot-title"><span aria-hidden>📦</span><b>{batch.name || batch.product.name}</b></div>
                <code className="trace-lot-code">{batch.code}</code>
                <div className="trace-lot-tags"><span>{sourceLabels[batch.sourceSystem] || batch.sourceSystem}</span><span>{batch.eventsPublic}/{batch.eventsTotal} sự kiện</span></div>
              </div>
            </td>
            <td data-label="Thực phẩm">
              <div className="trace-food-cell">
                <b>{batch.product.name}</b>
                <small>{batch.supplier.code} · {batch.supplier.name}</small>
              </div>
            </td>
            <td data-label="Thời gian">
              <div className="trace-time-cell">
                <div><span aria-hidden>📥</span><span>Nhập: {fmt(batch.receivedAt)}</span></div>
                <div><span aria-hidden>🏭</span><span>SX: {fmt(batch.producedAt)}</span></div>
                <div><span aria-hidden>⏳</span><span>HSD: {fmt(batch.expiresAt)}</span></div>
              </div>
            </td>
            <td className="actions trace-row-btns" data-label="Thao tác">
              {(batch.isPublic || batch.everPublished) && <a className="trace-circle-btn" title="Xem trang công khai" href={`/lot/${batch.publicId}`} target="_blank">↗</a>}
              <button className="trace-circle-btn" title="Sửa lô" onClick={() => openDrawer(batch.id)}>✎</button>
              <button className={`trace-circle-btn ${batch.isPublic ? 'trace-circle-btn-hide' : 'trace-circle-btn-approve'}`} title={batch.isPublic ? 'Ẩn lô khỏi trang công khai' : 'Duyệt công khai lô này'} disabled={busy} onClick={() => toggleOne(batch.id, !batch.isPublic)}>{batch.isPublic ? '⊘' : '✓'}</button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {loading && <p className="empty">Đang tải…</p>}
      {!loading && !items.length && <p className="empty">Không có lô phù hợp bộ lọc.</p>}
    </div>
    </div>
    {totalPages > 1 && <div className="trace-pagination">
      <button className="secondary-btn" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>← Trước</button>
      <span>Trang {page}/{totalPages}</span>
      <button className="secondary-btn" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>Sau →</button>
    </div>}

    {showOrphans && <div className="modal-backdrop" onClick={() => setShowOrphans(false)}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div><h2>Sản phẩm chưa có lô</h2><p>Các sản phẩm này chưa gắn lô nào nên không hiện trong bảng lô — quản lý trạng thái công khai tại đây.</p></div>
          <button onClick={() => setShowOrphans(false)}>×</button>
        </div>
        <div className="trace-product-list">
          {orphanProducts.map(product => <div className="trace-row" key={product.id}>
            <div><b>{product.name}</b><small>{product.supplierCode} · {product.supplierName} · SKU: {product.sku || '—'}</small></div>
            <button className="secondary-btn" disabled={busy} onClick={() => toggleOrphan(product.id, !product.isPublic)}>{product.isPublic ? '⊘ Ẩn' : '✓ Duyệt'}</button>
          </div>)}
          {!orphanProducts.length && <p className="empty">Không còn sản phẩm nào chưa có lô.</p>}
        </div>
      </div>
    </div>}

    {drawerId !== null && <div className="modal-backdrop" onClick={closeDrawer}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div><h2>{drawerBatch?.name || drawerBatch?.code || 'Lô'}</h2>{drawerBatch && <p>{drawerBatch.supplier.code} · {drawerBatch.product.name} · Mã lô {drawerBatch.code} · Nguồn: {sourceLabels[drawerBatch.sourceSystem] || drawerBatch.sourceSystem}</p>}</div>
          <button onClick={closeDrawer}>×</button>
        </div>
        {drawerLoading && <p className="empty">Đang tải…</p>}
        {drawerBatch && !drawerLoading && <>
          {!drawerBatch.isPublic && publishBlockedReasons(drawerBatch).length > 0 && <p className="trace-publish-hint">Chưa thể duyệt công khai lô này vì {publishBlockedReasons(drawerBatch).join('; ')}.</p>}
          <form className="trace-edit-form" onSubmit={saveBatch}>
            <input name="name" defaultValue={drawerBatch.name || ''} placeholder="Tên lô" />
            <input name="code" defaultValue={drawerBatch.code} placeholder="Mã lô" required />
            <label>Ngày nhập hàng <input name="receivedAt" type="date" defaultValue={toInputValue(drawerBatch.receivedAt)} /></label>
            <label>Ngày sản xuất <input name="producedAt" type="date" defaultValue={toInputValue(drawerBatch.producedAt)} /></label>
            <label>Hạn dùng <input name="expiresAt" type="date" defaultValue={toInputValue(drawerBatch.expiresAt)} /></label>
            <div className="trace-row-actions">
              <button className="primary-btn" disabled={busy}>Lưu lô</button>
              <button className="secondary-btn" type="button" disabled={busy} onClick={() => toggleOne(drawerBatch.id, !drawerBatch.isPublic)}>{drawerBatch.isPublic ? '⊘ Ẩn lô' : '✓ Duyệt lô'}</button>
            </div>
          </form>
          {drawerBatch.sourceTraceUrl && <p><a href={drawerBatch.sourceTraceUrl} target="_blank" rel="noreferrer">Xem trên HanoiCheck ↗</a></p>}
          {(drawerBatch.isPublic || drawerBatch.everPublished) && <div className="trace-qr-links">
            <a href={`/lot/${drawerBatch.publicId}`} target="_blank">Trang truy xuất</a>
            <a href={`/api/qr/lot/${drawerBatch.publicId}?format=png&download=1`}>QR PNG</a>
            <a href={`/api/qr/lot/${drawerBatch.publicId}?format=svg&download=1`}>QR SVG</a>
            <a href={`/admin/print/lot/${drawerBatch.publicId}`} target="_blank">In tem A6/A5</a>
          </div>}

          <div className="document-form">
            <h3>Thông tin sản phẩm</h3>
            <form className="trace-edit-form" onSubmit={saveProduct}>
              <input name="name" defaultValue={drawerBatch.product.name} placeholder="Tên sản phẩm" required />
              <input name="sku" defaultValue={drawerBatch.product.sku || ''} placeholder="SKU" />
              <input name="gtin" defaultValue={drawerBatch.product.gtin || ''} placeholder="GTIN 8–14 số" />
              <input name="origin" defaultValue={drawerBatch.product.origin || ''} placeholder="Xuất xứ" />
              <input name="unit" defaultValue={drawerBatch.product.unit || ''} placeholder="Quy cách/đơn vị" />
              <input name="storage" defaultValue={drawerBatch.product.storage || ''} placeholder="Bảo quản" />
              <label>Mã K.T.V.S.T.Y <small>Chỉ điền cho sản phẩm thịt lợn có mã kiểm dịch thú y thật; để trống với sản phẩm khác.</small><input name="hygieneCertNumber" defaultValue={drawerBatch.product.hygieneCertNumber || ''} placeholder="VD: 12.033.02" /></label>
              <div className="trace-row-actions">
                <button className="primary-btn" disabled={busy}>Lưu sản phẩm</button>
                <button className="secondary-btn" type="button" disabled={busy} onClick={() => toggleProductPublic(!drawerBatch.product.isPublic)}>{drawerBatch.product.isPublic ? '⊘ Ẩn sản phẩm' : '✓ Duyệt sản phẩm'}</button>
              </div>
            </form>
          </div>

          <div className="document-form">
            <h3>Sự kiện truy xuất ({drawerBatch.events.length})</h3>
            {selectedEvents.size > 0 && <div className="trace-bulk-bar">
              <span>{selectedEvents.size} sự kiện đã chọn</span>
              <button className="trace-bulk-approve" disabled={busy} onClick={() => bulkEventPublish(true)}>✓ Duyệt</button>
              <button className="trace-bulk-hide" disabled={busy} onClick={() => bulkEventPublish(false)}>⊘ Ẩn</button>
            </div>}
            {drawerBatch.events.map(item => <div className="trace-row trace-event" key={item.id}>
              <label className="check-label"><input type="checkbox" checked={selectedEvents.has(item.id)} onChange={() => toggleEventSelect(item.id)} /><b>{item.stage}: {item.title}</b></label>
              <span><small>{new Date(item.occurredAt).toLocaleString('vi-VN')}</small><span className={`status ${item.isPublic ? '' : 'inactive'}`}>{item.isPublic ? 'Công khai' : 'Nháp'}</span></span>
            </div>)}
            {!drawerBatch.events.length && <p className="empty">Chưa có sự kiện.</p>}
            <form className="trace-hanoicheck-form" onSubmit={createEvent}>
              <input name="stage" placeholder="Khâu: cung cấp, vận chuyển, kiểm định…" required />
              <input name="title" placeholder="Nội dung sự kiện" required />
              <label>Thời điểm <input name="occurredAt" type="datetime-local" required /></label>
              <input name="location" placeholder="Địa điểm (nếu công khai)" />
              <button className="secondary-btn" disabled={busy}>＋ Thêm sự kiện</button>
            </form>
          </div>
        </>}
      </div>
    </div>}
  </div>;
}
