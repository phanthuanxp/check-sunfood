'use client';

import { useEffect, useState } from 'react';

type Status = {
  hasKey: boolean;
  keySource: 'admin' | 'environment' | 'none';
  keyError: boolean;
  canEncrypt: boolean;
  documentModel: string;
  helperModel: string;
  publicQaEnabled: boolean;
  updatedAt: string | null;
};

const models = [
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — cân bằng, đề xuất cho đọc hồ sơ' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — tiết kiệm cho tác vụ hỗ trợ' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol — bài toán khó hơn' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra — năng lực cao nhất, chi phí cao' },
];

export default function AiSettingsForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [documentModel, setDocumentModel] = useState('gpt-5.6-terra');
  const [helperModel, setHelperModel] = useState('gpt-5.6-luna');
  const [publicQaEnabled, setPublicQaEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch('/api/admin/ai-settings', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không đọc được cài đặt AI.');
    setStatus(data);
    setDocumentModel(data.documentModel);
    setHelperModel(data.helperModel);
    setPublicQaEnabled(data.publicQaEnabled);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/admin/ai-settings', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không đọc được cài đặt AI.');
        return data as Status;
      })
      .then(data => {
        if (!active) return;
        setStatus(data); setDocumentModel(data.documentModel);
        setHelperModel(data.helperModel); setPublicQaEnabled(data.publicQaEnabled);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Không đọc được cài đặt AI.'); });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('Đang lưu cấu hình…');
    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, documentModel, helperModel, publicQaEnabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể lưu cài đặt.');
      setApiKey('');
      await refresh();
      setMessage('Đã lưu. Khóa không được hiển thị lại; hãy bấm Kiểm tra kết nối trước khi sử dụng.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu cài đặt.'); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMessage('Đang kiểm tra khóa và quyền truy cập model…');
    try {
      const response = await fetch('/api/admin/ai-settings/test', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không kiểm tra được kết nối.');
      setMessage(`Kết nối thành công: ${data.models.join(', ')}. Kiểm tra này chưa gửi hồ sơ nhà cung cấp.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không kiểm tra được kết nối.'); }
    finally { setBusy(false); }
  }

  async function removeKey() {
    if (!window.confirm('Xóa khóa AI lưu trong trang quản trị? Trợ lý công khai sẽ bị tắt. Nếu máy chủ có khóa trong .env, khóa đó vẫn là phương án dự phòng.')) return;
    setBusy(true); setMessage('Đang xóa khóa đã lưu…');
    try {
      const response = await fetch('/api/admin/ai-settings', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không xóa được khóa.');
      setApiKey(''); await refresh(); setMessage('Đã xóa khóa lưu trong trang quản trị và tắt trợ lý công khai.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không xóa được khóa.'); }
    finally { setBusy(false); }
  }

  return <main className="ai-settings-page">
    <header><a href="/admin">← Quay lại trang quản trị</a><p>CÀI ĐẶT TÍCH HỢP</p><h1>Model AI & khóa API</h1><span>Chỉ quản trị viên có thể thay đổi cấu hình này. Khóa được mã hóa ở cơ sở dữ liệu và chỉ dùng trên máy chủ.</span></header>
    <section className="ai-settings-card">
      <div className="ai-settings-status"><b>Trạng thái</b><span className={status?.hasKey ? 'ready' : 'missing'}>{status ? status.keyError ? 'Không giải mã được khóa đã lưu' : status.hasKey ? `Đã có khóa (${status.keySource === 'admin' ? 'lưu trong admin' : 'cấu hình máy chủ'})` : 'Chưa có khóa' : 'Đang tải…'}</span></div>
      {status && !status.canEncrypt && <p className="ai-settings-warning">Máy chủ chưa có khóa mã hóa ổn định. Cấu hình AUTH_SECRET hoặc INTEGRATION_ENCRYPTION_KEY dài ít nhất 32 ký tự trước khi lưu khóa API.</p>}
      {status?.keyError && <p className="ai-settings-warning">Khóa đã lưu không giải mã được. Kiểm tra khóa mã hóa máy chủ trước khi thay mới để tránh mất quyền dùng khóa cũ.</p>}
      <form onSubmit={save} autoComplete="off">
        <label>Khóa API OpenAI mới <small>Để trống nếu giữ khóa hiện tại. Không nhập khóa trong chat, URL hoặc mã nguồn.</small><input type="password" name="newOpenAiKey" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Nhập khóa mới để thay thế" autoComplete="new-password" spellCheck={false} /></label>
        <label>Model đọc PDF/JPG/PNG <select value={documentModel} onChange={event => setDocumentModel(event.target.value)}>{models.map(model => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
        <label>Model hỗ trợ đối chiếu, dịch và hỏi đáp <select value={helperModel} onChange={event => setHelperModel(event.target.value)}>{models.map(model => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
        <label className="ai-settings-checkbox"><input type="checkbox" checked={publicQaEnabled} onChange={event => setPublicQaEnabled(event.target.checked)} /><span>Bật trợ lý trả lời khách trên trang NCC đã xác minh <small>Nên để tắt cho đến khi hồ sơ được Sunfood duyệt; AI không xác nhận giấy tờ hay an toàn thực phẩm.</small></span></label>
        <div className="ai-settings-actions"><button type="submit" disabled={busy || !status}>Lưu cấu hình</button><button type="button" className="outline" onClick={test} disabled={busy || !status?.hasKey}>Kiểm tra kết nối</button>{status?.keySource === 'admin' && <button type="button" className="danger" onClick={removeKey} disabled={busy}>Xóa khóa đã lưu</button>}</div>
      </form>
      {message && <p role="status" className="ai-settings-message">{message}</p>}
    </section>
    <section className="ai-settings-card"><h2>Quy trình đọc hồ sơ</h2><p>Sau khi lưu và kiểm tra kết nối, vào <a href="/admin?view=suppliers">Nhà cung cấp</a> → mở hồ sơ → chọn PDF/JPG/PNG → xác nhận quyền gửi tệp → bấm “AI đọc & đối chiếu hồ sơ”. Kết quả chỉ điền bản nháp; anh kiểm tra chứng từ gốc trước khi lưu và duyệt công khai.</p></section>
  </main>;
}
