import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isBatchAvailable, findBatchByLotIdentifier } from '@/lib/trace-publish';
import type { HcTraceDetail } from '@/lib/hanoicheck-trace';
import { PRODUCTION_STEPS } from '@/lib/production-steps';
import LotQrThumbnail from './LotQrThumbnail';
import './lot.css';
import './lot-status.css';

/* eslint-disable @next/next/no-img-element -- admin-uploaded product photo of arbitrary origin/size, not a static Next-optimizable asset. */

function parseHanoiCheckPayload(sourceSystem: string, payload: string | null): HcTraceDetail | null {
  if (sourceSystem !== 'HANOICHECK' || !payload) return null;
  try { return JSON.parse(payload) as HcTraceDetail; } catch { return null; }
}

type DisplayStep = { key: string | number; title: string; performedBy: string | null; performedByRole: string | null; note: string | null };

export const dynamic = 'force-dynamic';

const format = (date: Date | null) => date
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
  : 'Chưa có dữ liệu đã xác minh';
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

type InfoRowKind = 'received' | 'produced' | 'shelfLife' | 'expires' | 'storage' | 'supplier' | 'address' | 'box';

const ROW_ICON_PATHS: Record<InfoRowKind, ReactNode> = {
  received: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  produced: <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></>,
  shelfLife: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></>,
  expires: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9.5" y1="14.5" x2="14.5" y2="18.5" /><line x1="14.5" y1="14.5" x2="9.5" y2="18.5" /></>,
  storage: <path d="M14 4.5v10a4 4 0 1 1-4 0v-10a2 2 0 0 1 4 0Z" />,
  supplier: <><rect x="4" y="3" width="16" height="18" rx="1" /><line x1="9" y1="8" x2="9" y2="8" /><line x1="15" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="15" y2="12" /><line x1="10" y1="21" x2="10" y2="17" /><line x1="14" y1="21" x2="14" y2="17" /></>,
  address: <><path d="M12 21.5s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  box: <><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
};

function RowIcon({ kind }: { kind: InfoRowKind }) {
  return <span className={`lot-row-icon lot-row-icon-${kind}`}><Icon>{ROW_ICON_PATHS[kind]}</Icon></span>;
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
  const expiry = expiryStatus(batch.expiresAt, new Date());
  const shelfDays = shelfLifeDays(batch.producedAt, batch.expiresAt);
  // HanoiCheck-synced batches already carry their own process trail in sourcePayload; batches
  // entered by hand have no such payload, so their steps come from the admin's checkbox picks
  // (TraceEvent rows) instead.
  const sourceDetail = available ? parseHanoiCheckPayload(batch.sourceSystem, batch.sourcePayload) : null;
  const steps: DisplayStep[] = sourceDetail
    ? sourceDetail.steps.map(step => ({ key: step.code || step.index, title: step.title || `Khâu ${step.index}`, performedBy: step.performedBy, performedByRole: step.performedByRole, note: step.note }))
    : available ? PRODUCTION_STEPS
        .map(step => batch.events.find(event => event.stage === step.key))
        .filter((event): event is NonNullable<typeof event> => Boolean(event))
        .map(event => ({ key: event.id, title: event.title, performedBy: event.performedBy, performedByRole: event.performedByRole, note: event.details }))
      : [];
  const displayName = batch.name || product.name;

  type InfoRow = { key: string; kind: InfoRowKind; label: string; value: string; legalLink?: boolean };
  const infoRows: InfoRow[] = [
    { key: 'received', kind: 'received', label: 'Ngày nhập hàng', value: format(batch.receivedAt) },
    { key: 'produced', kind: 'produced', label: 'Ngày sản xuất', value: format(batch.producedAt) },
    shelfDays != null ? { key: 'shelfLife', kind: 'shelfLife', label: 'Hạn sử dụng', value: `${shelfDays} ngày` } : null,
    { key: 'expires', kind: 'expires', label: 'Ngày hết hạn', value: format(batch.expiresAt) },
    { key: 'storage', kind: 'storage', label: 'Bảo quản', value: product.storage || 'Chưa có dữ liệu đã xác minh' },
    product.hygieneCertNumber ? { key: 'hygiene', kind: 'box', label: 'K.T.V.S.T.Y', value: `Mã số ${product.hygieneCertNumber}` } : null,
    { key: 'supplierName', kind: 'supplier', label: 'Nguồn gốc nhà cung cấp', value: product.supplier.name, legalLink: true },
    product.supplier.address ? { key: 'address', kind: 'address', label: 'Địa chỉ', value: product.supplier.address } : null,
    product.unit ? { key: 'unit', kind: 'box', label: 'Quy cách', value: product.unit } : null,
    product.sku ? { key: 'sku', kind: 'box', label: 'SKU', value: product.sku } : null,
    product.gtin ? { key: 'gtin', kind: 'box', label: 'GTIN', value: product.gtin } : null,
  ].filter((row): row is InfoRow => row !== null);

  return <main className="trace-page lot-page">
    <header className="trace-header"><Link href="/" className="trace-logo"><Image src="/brand/sunfood-logo.png" alt="" width={44} height={44} /><div><b>SUNFOOD TÂY ĐÔ</b><small>Truy xuất theo lô</small></div></Link></header>
    {!available ? <section className="trace-hero lot-hero-hold"><div className="hero-glow" /><div className="hero-content">
      <p>THÔNG BÁO VỀ MÃ QR ĐÃ PHÁT HÀNH</p>
      <h1>Thông tin lô đang tạm ngừng công khai</h1>
      <p className="lot-hero-address">Mã QR này vẫn dẫn đến đúng hồ sơ lô, nhưng Sunfood đang rà soát dữ liệu. Vui lòng không coi thông tin đã lưu hoặc ảnh chụp trước đây là xác nhận hiện tại.</p>
      <div className="code-pill">Mã NCC <b>{product.supplier.code}</b></div>
      <div className="code-pill">Mã lô <b>{batch.code}</b></div>
    </div></section> : <>
      <section className="trace-hero lot-hero-has-qr">
        <div className="hero-glow" /><div className="hero-content">
        <div className="lot-hero-top-row">
          <div className="lot-hero-meta">
            <span className="lot-hero-badge">✓ Đã xác minh &amp; đồng bộ HanoiCheck</span>
            <div className="lot-hero-code-row">Mã NCC: <b>{product.supplier.code}</b></div>
            <div className="lot-hero-code-row">Mã lô: <b>{batch.code}</b></div>
          </div>
          <LotQrThumbnail batchCode={batch.code} />
        </div>
      </div></section>
      <div className="trace-container lot-container">
      {product.imageUrl && <div className="lot-photo-block"><img src={product.imageUrl} alt={displayName} /></div>}
      <h1 className="lot-title">{!product.imageUrl && <span className="lot-hero-title-icon" aria-hidden="true">{productIcon(displayName)}</span>}{displayName}</h1>
      <div className={`lot-expiry-badge ${expiry.key}`}>{expiry.icon} {expiry.label}</div>
      <section className="lot-card">
        <h2><Icon className="lot-card-title-icon"><rect x="3" y="3" width="18" height="18" rx="3" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="12" y2="17" /></Icon>Thông tin lô nhập hàng</h2>
        <dl className="lot-info-rows">{infoRows.map(row => <div key={row.key}>
          <RowIcon kind={row.kind} />
          <dt>{row.label}:</dt>
          <dd>
            {row.value}
            {row.legalLink && <Link href={`/qr/${product.supplier.code}?tab=legal`} className="lot-legal-link">
              <Icon className="lot-legal-link-icon"><path d="M8 3h7l5 5v13H8V3Z" /><path d="M15 3v5h5" /><line x1="10.5" y1="11.5" x2="17.5" y2="11.5" /><line x1="10.5" y1="15.5" x2="17.5" y2="15.5" /></Icon>
              Xem hồ sơ pháp lý
              <span className="lot-legal-link-arrow" aria-hidden="true">›</span>
            </Link>}
          </dd>
        </div>)}</dl>
      </section>
      {steps.length > 0 && <section className="lot-card">
        <h2><Icon className="lot-card-title-icon"><path d="M4 6h16M4 12h16M4 18h7" /><circle cx="19" cy="18" r="2" /></Icon>Quy trình sản xuất</h2>
        <ol className="lot-process">
          {steps.map(step => <li key={step.key}>
            <span className="lot-process-icon">{stepIcon(step.title)}</span>
            <div>
              <b>{step.title}</b>
              {step.performedBy && <small>{step.performedBy}{step.performedByRole ? ` · ${step.performedByRole}` : ''}</small>}
              {step.note && <p>{step.note}</p>}
            </div>
          </li>)}
        </ol>
      </section>}
      </div>
    </>}
    <footer className="trace-footer"><b>CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ</b><p>Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội</p><p>MST: 0110716043 · Hotline: 0353010398</p><p>tpsunfoodtaydoo@gmail.com · www.sunfoodtaydo.com</p><p className="trace-footer-credit">Vận hành bởi Công Ty CP Thương Mại Dịch Vụ 30Nice · 0345 07 6789 · info@30nice.vn</p></footer>
  </main>;
}
