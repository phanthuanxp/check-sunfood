'use client';
import { FormEvent, useState } from 'react';

export default function ImportPanel({ onImported }: { onImported: () => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [traceUrl, setTraceUrl] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [syncDateFrom, setSyncDateFrom] = useState(today);
  const [syncDateTo, setSyncDateTo] = useState(today);

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
      if (result.created + result.updated > 0) onImported();
      setMessage(`Đã đọc ${result.processed} dòng: ${result.created} lô mới, ${result.updated} cập nhật, ${result.skipped.length} bỏ qua.${result.skipped.length ? ' ' + result.skipped.slice(0, 5).map((s: { code: string; reason: string }) => `${s.code}: ${s.reason}`).join(' | ') : ''}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không nhập được file.'); }
    finally { setBusy(false); form.reset(); }
  }

  async function importFromTraceUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('Đang tải và đối chiếu trang truy xuất HanoiCheck…');
    try {
      const response = await fetch('/api/admin/hanoicheck/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traceUrl }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không nhập được lô.');
      setTraceUrl(''); onImported(); setMessage(`Đã nhập lô ${result.batchCode}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không nhập được lô.'); }
    finally { setBusy(false); }
  }

  async function syncAll() {
    setBusy(true); setMessage(`Đang đọc đơn hàng từ ${syncDateFrom} đến ${syncDateTo} trên HanoiCheck…`);
    try {
      const response = await fetch('/api/admin/hanoicheck/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateFrom: syncDateFrom, dateTo: syncDateTo }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Không đồng bộ được.');
      if (result.created + result.updated > 0) onImported();
      setMessage(`Đã đọc ${result.processed} lô: ${result.created} mới, ${result.updated} cập nhật, ${result.skipped.length} bỏ qua.${result.skipped.length ? ' ' + result.skipped.slice(0, 3).map((s: { code: string; reason: string }) => `${s.code}: ${s.reason}`).join(' | ') : ''}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không đồng bộ được.'); }
    finally { setBusy(false); }
  }

  return <div className="trace-import">
    {message && <p role="status" className="import-message">{message}</p>}
    <section className="import-panel"><h2>Đồng bộ lô từ HanoiCheck</h2><p>Cách nhanh nhất: trên cổng HanoiCheck, mở <b>QL lô nhập hàng</b> → xuất Excel danh sách lô trong ngày → tải file <code>.xlsx</code> đó lên đây. Hệ thống đọc cột &quot;Link truy xuất&quot; của từng dòng, tải trang công khai tương ứng và nhập lô — không cần token hay API riêng. Lô nhận về luôn ở trạng thái riêng tư; NCC được nhận diện tự động qua mã thực phẩm/mã lô (ví dụ <code>-NCC07</code>) và cần đã có hồ sơ trong hệ thống.</p>
      <form onSubmit={importFromExcel} className="trace-hanoicheck-form"><input type="file" name="file" accept=".xlsx" required /><button disabled={busy}>Nhập danh sách lô từ Excel</button></form>
    </section>
    <section className="import-panel"><h2>Đồng bộ qua API (đã kết nối HanoiCheck)</h2><p>Đọc đơn hàng trong khoảng ngày giao, lấy mã truy xuất từng dòng hàng và nhập lô tương ứng — dùng khi không tiện xuất Excel thủ công.</p>
      <div className="trace-hanoicheck-form"><label>Từ ngày giao <input type="date" value={syncDateFrom} onChange={event => setSyncDateFrom(event.target.value)} /></label><label>Đến ngày <input type="date" value={syncDateTo} onChange={event => setSyncDateTo(event.target.value)} /></label><button type="button" className="outline" disabled={busy} onClick={syncAll}>Đồng bộ theo ngày qua API</button></div>
    </section>
    <section className="import-panel"><h2>Nhập 1 lô từ URL truy xuất</h2><p>Dán trực tiếp đường dẫn trang truy xuất công khai của HanoiCheck cho một lô cụ thể.</p>
      <form onSubmit={importFromTraceUrl} className="trace-hanoicheck-form"><input type="url" value={traceUrl} onChange={event => setTraceUrl(event.target.value)} placeholder="https://tracuu.hanoicheck.com.vn/.../truy-xuat/san-pham/..." required /><button disabled={busy}>Nhập 1 lô từ URL</button></form>
    </section>
  </div>;
}
