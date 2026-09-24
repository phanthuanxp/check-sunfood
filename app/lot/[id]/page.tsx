import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isBatchAvailable, findBatchByLotIdentifier } from '@/lib/trace-publish';
import type { HcTraceDetail } from '@/lib/hanoicheck-trace';
import LotQrThumbnail from './LotQrThumbnail';
import './lot.css';
import './lot-status.css';

function parseHanoiCheckPayload(sourceSystem: string, payload: string | null): HcTraceDetail | null {
  if (sourceSystem !== 'HANOICHECK' || !payload) return null;
  try { return JSON.parse(payload) as HcTraceDetail; } catch { return null; }
}

export const dynamic = 'force-dynamic';

const format = (date: Date | null) => date
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
  : 'Chưa có dữ liệu đã xác minh';
const formatDateTime = (date: Date | null) => date
  ? `${format(date)} ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)}`
  : '';

function expiryStatus(expiresAt: Date | null, now: Date) {
  if (!expiresAt) return { key: 'unknown', icon: '—', label: 'Chưa công bố hạn sử dụng' };
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { key: 'expired', icon: '✕', label: `Đã hết hạn sử dụng ${Math.abs(days)} ngày` };
  if (days <= 3) return { key: 'warning', icon: '⚠', label: days === 0 ? 'Hết hạn hôm nay' : `Sắp hết hạn — còn ${days} ngày sử dụng` };
  return { key: 'valid', icon: '✓', label: 'Sản phẩm còn hạn sử dụng' };
}

function shelfLifeDays(producedAt: Date | null, expiresAt: Date | null) {
  if (!producedAt || !expiresAt) return null;
  const days = Math.round((expiresAt.getTime() - producedAt.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

const STEP_ICON_RULES: [RegExp, string][] = [
  [/nhập/i, '⇣'],
  [/phân loại|kiểm tra|chọn lọc/i, '▤'],
  [/vận chuyển|giao hàng/i, '➜'],
  [/chế biến|sơ chế/i, '⚙'],
  [/đóng gói/i, '▣'],
];
function stepIcon(title: string | null) {
  if (title) for (const [pattern, icon] of STEP_ICON_RULES) if (pattern.test(title)) return icon;
  return '●';
}

const PRODUCT_ICON_RULES: [RegExp, string][] = [
  [/bò/i, '🐄'],
  [/lợn|heo|ba chỉ|sườn|xương|chân giò|nạc vai|thịt vai/i, '🐖'],
  [/gà|vịt|trứng/i, '🐔'],
  [/tôm|cá|mực|hải sản/i, '🐟'],
  [/rau|củ|cải|bí|khoai|cà rốt|hành|tỏi|thì là|thìa là|đao|đỏ/i, '🥬'],
  [/bánh/i, '🍞'],
  [/sữa/i, '🥛'],
  [/gạo|bún|phở|mì/i, '🌾'],
  [/dầu ăn/i, '🫒'],
  [/đậu/i, '🌱'],
  [/hoa quả|trái cây|thanh long|dưa/i, '🍉'],
];
function productIcon(name: string) {
  for (const [pattern, icon] of PRODUCT_ICON_RULES) if (pattern.test(name)) return icon;
  return '🍽️';
}

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const identifier = (await params).id;
  const batch = await findBatchByLotIdentifier(identifier);
  if (!batch || (!batch.isPublic && !batch.everPublished)) notFound();

  const { product } = batch;
  const available = isBatchAvailable(batch);
  const sourceDetail = available ? parseHanoiCheckPayload(batch.sourceSystem, batch.sourcePayload) : null;
  const expiry = expiryStatus(batch.expiresAt, new Date());
  const shelfDays = shelfLifeDays(batch.producedAt, batch.expiresAt);
  const steps = sourceDetail?.steps ?? [];
  const displayName = batch.name || product.name;

  const infoRows = [
    ['Ngày nhập hàng', format(batch.receivedAt)],
    ['Ngày sản xuất', format(batch.producedAt)],
    shelfDays != null ? ['Hạn sử dụng', `${shelfDays} ngày`] : null,
    ['Ngày hết hạn', format(batch.expiresAt)],
    ['Bảo quản', product.storage || 'Chưa có dữ liệu đã xác minh'],
    product.hygieneCertNumber ? ['K.T.V.S.T.Y', `Mã số ${product.hygieneCertNumber}`] : null,
    ['Nguồn gốc nhà cung cấp', product.supplier.name],
    product.supplier.address ? ['Địa chỉ', product.supplier.address] : null,
    product.unit ? ['Quy cách', product.unit] : null,
    product.sku ? ['SKU', product.sku] : null,
    product.gtin ? ['GTIN', product.gtin] : null,
  ].filter((row): row is [string, string] => row !== null);

  return <main className="trace-page lot-page">
    <header className="trace-header"><Link href="/" className="trace-logo"><span>SF</span><div><b>SUNFOOD TÂY ĐÔ</b><small>Truy xuất theo lô</small></div></Link></header>
    {!available ? <section className="trace-hero lot-hero-hold"><div className="hero-glow" /><div className="hero-content">
      <p>THÔNG BÁO VỀ MÃ QR ĐÃ PHÁT HÀNH</p>
      <h1>Thông tin lô đang tạm ngừng công khai</h1>
      <p className="lot-hero-address">Mã QR này vẫn dẫn đến đúng hồ sơ lô, nhưng Sunfood đang rà soát dữ liệu. Vui lòng không coi thông tin đã lưu hoặc ảnh chụp trước đây là xác nhận hiện tại.</p>
      <div className="code-pill">Mã NCC <b>{product.supplier.code}</b></div>
      <div className="code-pill">Mã lô <b>{batch.code}</b></div>
    </div></section> : <>
      <section className="trace-hero lot-hero-has-qr"><div className="hero-glow" /><div className="hero-content">
        <LotQrThumbnail batchCode={batch.code} />
        <span className="lot-hero-badge">✓ {batch.sourceSystem === 'HANOICHECK' ? 'Đã xác minh & đồng bộ HanoiCheck' : 'Hồ sơ lô đã công bố'}</span>
        <h1><span className="lot-hero-title-icon" aria-hidden="true">{productIcon(displayName)}</span>{displayName}</h1>
        <div className="lot-hero-codes"><div className="code-pill">Mã NCC <b>{product.supplier.code}</b></div><div className="code-pill">Mã lô <b>{batch.code}</b></div></div>
      </div></section>
      <div className="trace-container lot-container">
      <div className={`lot-expiry-badge ${expiry.key}`}>{expiry.icon} {expiry.label}</div>
      <section className="lot-card">
        <h2><Icon className="lot-card-title-icon"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="12" y2="17" /></Icon>Thông tin lô nhập hàng</h2>
        <dl className="lot-info-rows">{infoRows.map(([label, value]) => <div key={label}><dt>{label}:</dt><dd>{value}</dd></div>)}</dl>
        <p className="lot-source">Nguồn dữ liệu: {batch.sourceSystem === 'HANOICHECK' ? 'HanoiCheck' : 'Sunfood nhập và đối chiếu'}{batch.sourceSyncedAt ? ` · Đồng bộ lần cuối ${formatDateTime(batch.sourceSyncedAt)}` : ''}</p>
      </section>
      {steps.length > 0 && <section className="lot-card">
        <h2><Icon className="lot-card-title-icon"><path d="M4 6h16M4 12h16M4 18h7" /><circle cx="19" cy="18" r="2" /></Icon>Quy trình sản xuất</h2>
        <ol className="lot-process">
          {steps.map(step => <li key={step.code || step.index}>
            <span className="lot-process-icon">{stepIcon(step.title)}</span>
            <div>
              <b>{step.title || `Khâu ${step.index}`}</b>
              {step.performedBy && <small>{step.performedBy}{step.performedByRole ? ` · ${step.performedByRole}` : ''}</small>}
              {step.note && <p>{step.note}</p>}
            </div>
          </li>)}
        </ol>
      </section>}
      </div>
    </>}
    <footer className="trace-footer"><b>CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ</b><p>MST 0110716043 · Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội</p><p>Thông tin do Sunfood Tây Đô quản lý và công bố sau đối chiếu. Không có điểm tin cậy hoặc xác nhận kiểm định tự động khi thiếu chứng từ.</p></footer>
  </main>;
}
