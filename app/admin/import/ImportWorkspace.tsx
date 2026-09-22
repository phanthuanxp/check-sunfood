'use client';
import { useState } from 'react';

const labels = { name: 'Tên nhà cung cấp', productName: 'Sản phẩm', address: 'Địa chỉ NCC', taxCode: 'Mã số thuế NCC', storage: 'Bảo quản', shelfLife: 'Hạn sử dụng' } as const;
type Key = keyof typeof labels;
type Fields = Partial<Record<Key, string>>;
type Supplier = { code: string; name: string; productName: string | null; address: string | null; taxCode: string | null; storage: string | null; shelfLife: string | null; sourceUrl: string | null };
type Draft = { id: number; code: string; sourceUrl: string; sourceHash: string; status: string; fetchedAt: string; fields: Fields };
type AiReview = { summary: string; findings: { field: string; issue: string }[] };

export default function ImportWorkspace({ suppliers, initialDrafts }: { suppliers: Supplier[]; initialDrafts: Draft[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [code, setCode] = useState('NCC-01');
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedDraft, setSelectedDraft] = useState<number | null>(null);
  const [selected, setSelected] = useState<Key[]>([]);
  const [edits, setEdits] = useState<Fields>({});
  const [notes, setNotes] = useState('');
  const [aiReview, setAiReview] = useState<AiReview | null>(null);
  const current = drafts.find(draft => draft.id === selectedDraft);
  const existing = suppliers.find(supplier => supplier.code === current?.code);

  async function reloadDrafts() {
    const response = await fetch('/api/admin/import-drafts');
    if (response.ok) setDrafts(await response.json());
  }

  async function collect(targetCode: string, targetUrl = '') {
    const response = await fetch('/api/admin/import-drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: targetCode, sourceUrl: targetUrl }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`${targetCode}: ${result.error || 'Không đọc được nguồn.'}`);
    return result;
  }

  async function collectOne() {
    setBusy(true); setMessage('Đang đọc nguồn công khai…');
    try { await collect(code, sourceUrl); await reloadDrafts(); setMessage(`Đã tạo bản nháp ${code}. Chưa cập nhật dữ liệu public.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể nhập.'); }
    finally { setBusy(false); }
  }

  async function collectAll() {
    setBusy(true);
    let success = 0; const failures: string[] = [];
    for (const [index, supplier] of suppliers.entries()) {
      if (!supplier.sourceUrl) continue;
      setMessage(`Đang đọc ${index + 1}/${suppliers.length}: ${supplier.code}…`);
      try { await collect(supplier.code); success++; } catch (error) { failures.push(error instanceof Error ? error.message : supplier.code); }
    }
    await reloadDrafts();
    setMessage(`Đã đọc ${success} nguồn; ${failures.length} lỗi. ${failures.join(' | ')} Dữ liệu vẫn chờ duyệt.`);
    setBusy(false);
  }

  function openDraft(draft: Draft) {
    setSelectedDraft(draft.id);
    setSelected([]);
    setEdits(draft.fields);
    setNotes('');
    setAiReview(null);
  }

  async function reviewWithAi() {
    if (!current) return;
    setBusy(true); setMessage('AI đang so sánh bản nháp với hồ sơ đã lưu…'); setAiReview(null);
    try {
      const response = await fetch('/api/admin/ai/review-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể đối chiếu AI.');
      setAiReview(data); setMessage('Đã có gợi ý nội bộ. AI không tự duyệt dữ liệu.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể đối chiếu AI.'); }
    finally { setBusy(false); }
  }

  async function review(decision: 'APPROVE' | 'REJECT') {
    if (!current) return;
    setBusy(true); setMessage('Đang lưu đối chiếu…');
    try {
      const response = await fetch(`/api/admin/import-drafts/${current.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, selected, edits, notes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể lưu.');
      setSelectedDraft(null);
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu.'); setBusy(false); }
  }

  return <main className="import-workspace">
    <header className="import-header"><a href="/admin">← Tổng quan</a><p className="panel-kicker">DỮ LIỆU CÓ NGUỒN</p><h1>Nhập & đối chiếu QR</h1><p>Chỉ tạo bản nháp từ SmartCheck. Anh chọn trường, chỉnh sửa và duyệt trước khi ghi vào hệ thống. Hồ sơ/tệp không được sao chép tự động.</p></header>
    <section className="import-panel"><div><h2>Thu thập nguồn</h2><p>23 URL hiện có được lấy từ hồ sơ NCC. NCC mới cần URL QR SmartCheck anh cung cấp.</p></div><div className="import-controls"><select value={code} onChange={event => setCode(event.target.value)}>{suppliers.map(supplier => <option key={supplier.code} value={supplier.code}>{supplier.code} · {supplier.name}</option>)}<option value="NCC-24">NCC-24 (chưa có nguồn)</option></select>{!suppliers.some(supplier => supplier.code === code) && <input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://truyxuat.smartcheck.vn/check/..." aria-label="URL QR NCC mới" />}<button disabled={busy} onClick={collectOne}>Đọc mã đã chọn</button><button disabled={busy} onClick={collectAll}>Đọc tất cả NCC hiện có</button></div>{message && <p role="status" className="import-message">{message}</p>}</section>
    <section className="import-panel"><h2>Bản nháp ({drafts.filter(d => d.status === 'PENDING').length} chờ duyệt)</h2><div className="import-drafts">{drafts.map(draft => <button key={draft.id} className={selectedDraft === draft.id ? 'active' : ''} onClick={() => openDraft(draft)}><b>{draft.code}</b><span>{draft.fields.name || draft.fields.productName || 'Không đọc được tên'}</span><small>{new Date(draft.fetchedAt).toLocaleString('vi-VN')} · {draft.status === 'PENDING' ? 'Chờ duyệt' : draft.status === 'APPROVED' ? 'Đã duyệt' : 'Bỏ qua'}</small></button>)}</div>{!drafts.length && <p>Chưa có bản nháp. Bắt đầu đọc một mã để đối chiếu.</p>}</section>
    {current && <section className="import-panel"><h2>Đối chiếu {current.code}</h2><p>Nguồn: <a href={current.sourceUrl} target="_blank" rel="noreferrer">{current.sourceUrl}</a> · SHA-256: <code>{current.sourceHash.slice(0, 16)}…</code></p><button disabled={busy} onClick={reviewWithAi}>AI gợi ý điểm cần kiểm tra</button>{aiReview&&<div className="import-ai-review"><b>{aiReview.summary}</b>{aiReview.findings.length>0?<ul>{aiReview.findings.map((finding,index)=><li key={index}><strong>{labels[finding.field as Key] || finding.field}:</strong> {finding.issue}</li>)}</ul>:<p>AI chưa phát hiện chênh lệch từ các trường hiện có; vẫn cần đối chiếu bản gốc.</p>}</div>}<div className="import-field-head"><b>Trường</b><b>Đang lưu</b><b>Đề xuất / chỉnh sửa</b></div>{(Object.keys(labels) as Key[]).map(key => <div className="import-field" key={key}><label><input type="checkbox" disabled={current.status !== 'PENDING' || !current.fields[key]} checked={selected.includes(key)} onChange={event => setSelected(event.target.checked ? [...selected, key] : selected.filter(item => item !== key))} /> {labels[key]}</label><span>{existing?.[key] || '—'}</span><input value={edits[key] || ''} disabled={current.status !== 'PENDING' || !current.fields[key]} onChange={event => setEdits({ ...edits, [key]: event.target.value })} aria-label={`Giá trị ${labels[key]}`} /></div>)}<p>Chỉ các trường đã tích mới được cập nhật. Duyệt bản nháp không tự đánh dấu NCC là “đã xác minh”.</p><textarea value={notes} disabled={current.status !== 'PENDING'} onChange={event => setNotes(event.target.value)} placeholder="Ghi chú đối chiếu (không bắt buộc)" aria-label="Ghi chú đối chiếu" />{current.status === 'PENDING' && <div className="import-actions"><button disabled={busy || selected.length === 0} onClick={() => review('APPROVE')}>Duyệt trường đã chọn</button><button disabled={busy} onClick={() => review('REJECT')}>Bỏ qua bản nháp</button></div>}</section>}
  </main>;
}
