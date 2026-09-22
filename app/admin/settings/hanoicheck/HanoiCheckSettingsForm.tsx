'use client';

import { useEffect, useState } from 'react';
import '../settings.css';

type Status = {
  hasCredentials: boolean;
  credentialsError: boolean;
  canEncrypt: boolean;
  baseUrl: string;
  traceConnectionCode: string;
  hasAccessToken: boolean;
  accessTokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncCount: number | null;
  updatedAt: string | null;
};

export default function HanoiCheckSettingsForm() {
  const [status, setStatus] = useState<Status | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [traceConnectionCode, setTraceConnectionCode] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hmacSecret, setHmacSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch('/api/admin/hanoicheck-settings', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không đọc được cài đặt HanoiCheck.');
    setStatus(data);
    setBaseUrl(data.baseUrl);
    setTraceConnectionCode(data.traceConnectionCode);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/admin/hanoicheck-settings', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không đọc được cài đặt HanoiCheck.');
        return data as Status;
      })
      .then(data => {
        if (!active) return;
        setStatus(data); setBaseUrl(data.baseUrl); setTraceConnectionCode(data.traceConnectionCode);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Không đọc được cài đặt HanoiCheck.'); });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('Đang lưu cấu hình…');
    try {
      const response = await fetch('/api/admin/hanoicheck-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, traceConnectionCode, clientId, clientSecret, hmacSecret }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể lưu cài đặt.');
      setClientId(''); setClientSecret(''); setHmacSecret('');
      await refresh();
      setMessage('Đã lưu. Client Secret/HMAC Secret không hiển thị lại; hãy bấm Kiểm tra kết nối.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu cài đặt.'); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMessage('Đang lấy mã truy cập và kiểm tra chữ ký…');
    try {
      const response = await fetch('/api/admin/hanoicheck-settings/test', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không kiểm tra được kết nối.');
      setMessage(`Kết nối thành công. Tổng số đơn hàng đọc được: ${data.total}.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không kiểm tra được kết nối.'); }
    finally { setBusy(false); }
  }

  async function removeCredentials() {
    if (!window.confirm('Xóa thông tin kết nối HanoiCheck lưu trong trang quản trị? Đồng bộ lô nhập hàng sẽ dừng cho tới khi nhập lại.')) return;
    setBusy(true); setMessage('Đang xóa thông tin đã lưu…');
    try {
      const response = await fetch('/api/admin/hanoicheck-settings', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không xóa được.');
      setClientId(''); setClientSecret(''); setHmacSecret(''); await refresh(); setMessage('Đã xóa thông tin kết nối đã lưu.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không xóa được.'); }
    finally { setBusy(false); }
  }

  return <div className="hc-settings-page">
    <p className="admin-settings-tab-intro">Chỉ quản trị viên có thể thay đổi cấu hình này. Client Secret và HMAC Secret được mã hóa ở cơ sở dữ liệu, chỉ dùng trên máy chủ để đọc dữ liệu; hệ thống không ghi/sửa gì trên HanoiCheck.</p>
    <section className="hc-settings-card">
      <div className="hc-settings-status">
        <b>Trạng thái</b>
        <span className={status?.hasCredentials ? 'ready' : 'missing'}>{status ? status.credentialsError ? 'Không giải mã được thông tin đã lưu' : status.hasCredentials ? `Đã cấu hình${status.hasAccessToken ? ' · có mã truy cập' : ''}` : 'Chưa cấu hình đủ' : 'Đang tải…'}</span>
      </div>
      {status && !status.canEncrypt && <p className="hc-settings-warning">Máy chủ chưa có khóa mã hóa ổn định. Cấu hình AUTH_SECRET hoặc INTEGRATION_ENCRYPTION_KEY dài ít nhất 32 ký tự trước khi lưu.</p>}
      {status?.credentialsError && <p className="hc-settings-warning">Thông tin đã lưu không giải mã được. Kiểm tra khóa mã hóa máy chủ trước khi nhập lại.</p>}
      <form onSubmit={save} autoComplete="off">
        <label>Endpoint (base_url) <small>Địa chỉ gốc HanoiCheck cấp cho đơn vị, không kèm <code>/api</code>, không có dấu / ở cuối. Mặc định <code>https://ncc-api.hanoicheck.com.vn</code>.</small><input type="text" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://ncc-api.hanoicheck.com.vn" spellCheck={false} /></label>
        <label>Mã kết nối công khai <small>Đoạn đầu trong URL trang truy xuất công khai, ví dụ <code>NCC-2026-000232</code> trong <code>tracuu.hanoicheck.com.vn/NCC-2026-000232/truy-xuat/...</code>. Không phải bí mật.</small><input type="text" value={traceConnectionCode} onChange={event => setTraceConnectionCode(event.target.value)} placeholder="NCC-2026-000232" spellCheck={false} /></label>
        <label>Client ID <small>Không nhập thông tin này trong chat, chỉ nhập ở đây.</small><input type="password" value={clientId} onChange={event => setClientId(event.target.value)} placeholder="Để trống nếu giữ giá trị hiện tại" autoComplete="new-password" spellCheck={false} /></label>
        <label>Client Secret<input type="password" value={clientSecret} onChange={event => setClientSecret(event.target.value)} placeholder="Để trống nếu giữ giá trị hiện tại" autoComplete="new-password" spellCheck={false} /></label>
        <label>HMAC Secret <small>Khóa ký dữ liệu — khác Client Secret. HanoiCheck chỉ hiện đúng 1 lần lúc cấp, mất phải xin cấp lại.</small><input type="password" value={hmacSecret} onChange={event => setHmacSecret(event.target.value)} placeholder="Để trống nếu giữ giá trị hiện tại" autoComplete="new-password" spellCheck={false} /></label>
        <div className="hc-settings-actions"><button type="submit" disabled={busy || !status}>Lưu cấu hình</button><button type="button" className="outline" onClick={test} disabled={busy || !status?.hasCredentials}>Kiểm tra kết nối</button>{status?.hasCredentials && <button type="button" className="danger" onClick={removeCredentials} disabled={busy}>Xóa thông tin đã lưu</button>}</div>
      </form>
      {status && (status.lastSyncedAt || status.lastSyncStatus) && (
        <div className="hc-settings-meta">
          <span>Lần đồng bộ gần nhất: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString('vi-VN') : '—'}</span>
          <span>Trạng thái: {status.lastSyncStatus || '—'}{status.lastSyncCount != null ? ` · ${status.lastSyncCount} lô` : ''}</span>
        </div>
      )}
      {message && <p role="status" className="hc-settings-message">{message}</p>}
    </section>
    <section className="hc-settings-card"><h2>Cách hoạt động</h2><p>API HanoiCheck v2.2 không có dịch vụ đọc lô trực tiếp, chỉ có đọc <b>đơn hàng</b>. Sau khi lưu và kiểm tra kết nối, vào <a href="/admin?view=batches">QL lô nhập hàng</a> để đồng bộ theo ngày giao: hệ thống đọc danh sách đơn hàng trong khoảng ngày, lấy mã truy xuất của từng dòng hàng, rồi tải trang truy xuất công khai trên <code>tracuu.hanoicheck.com.vn</code> để lấy đầy đủ quy trình sản xuất, nhân sự và chứng chỉ. Lô mới mặc định riêng tư; anh bổ sung tài liệu/ảnh và duyệt công khai trước khi in QR.</p></section>
  </div>;
}
