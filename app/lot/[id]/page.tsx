import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { prisma } from '@/lib/prisma';
import type { HcTraceDetail } from '@/lib/hanoicheck-trace';
import './lot.css';
import './lot-status.css';

function parseHanoiCheckPayload(sourceSystem: string, payload: string | null): HcTraceDetail | null {
  if (sourceSystem !== 'HANOICHECK' || !payload) return null;
  try { return JSON.parse(payload) as HcTraceDetail; } catch { return null; }
}

export const dynamic = 'force-dynamic';

const format = (date: Date | null) => date
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  : 'Chưa có dữ liệu đã xác minh';
const formatDateTime = (date: Date | null) => date
  ? `${format(date)} ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date)}`
  : '';

function expiryStatus(expiresAt: Date | null, now: Date) {
  if (!expiresAt) return { key: 'unknown', icon: '—', label: 'Chưa công bố hạn sử dụng' };
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { key: 'expired', icon: '✕', label: `Đã hết hạn sử dụng ${Math.abs(days)} ngày` };
  if (days <= 3) return { key: 'warning', icon: '⚠', label: days === 0 ? 'Hết hạn hôm nay' : `Còn hạn — sắp hết hạn trong ${days} ngày` };
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

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const publicId = (await params).id;
  if (!/^c[a-z0-9]{20,40}$/.test(publicId)) notFound();
  const batch = await prisma.batch.findUnique({
    where: { publicId },
    include: { product: { include: { supplier: true } } },
  });
  if (!batch || (!batch.isPublic && !batch.everPublished)) notFound();

  const { product } = batch;
  const available = batch.isPublic && product.isPublic && product.supplier.verificationStatus === 'VERIFIED'
    && product.supplier.status === 'ACTIVE' && (!batch.producedAt || batch.producedAt <= new Date());
  const sourceDetail = available ? parseHanoiCheckPayload(batch.sourceSystem, batch.sourcePayload) : null;
  const expiry = expiryStatus(batch.expiresAt, new Date());
  const shelfDays = shelfLifeDays(batch.producedAt, batch.expiresAt);
  const steps = sourceDetail?.steps ?? [];

  const infoRows = [
    ['Ngày sản xuất', format(batch.producedAt)],
    shelfDays != null ? ['Hạn sử dụng', `${shelfDays} ngày`] : null,
    ['Ngày hết hạn', format(batch.expiresAt)],
    ['Bảo quản', product.storage || 'Chưa có dữ liệu đã xác minh'],
    product.hygieneCertNumber ? ['K.T.V.S.T.Y', `Mã số ${product.hygieneCertNumber}`] : null,
    ['Xuất xứ', product.origin || 'Chưa công bố'],
    ['Ngày nhập kho', format(batch.receivedAt)],
    product.unit ? ['Quy cách', product.unit] : null,
    product.sku ? ['SKU', product.sku] : null,
    product.gtin ? ['GTIN', product.gtin] : null,
  ].filter((row): row is [string, string] => row !== null);

  return <main className="lot-page">
    <header><Link href="/">SF · SUNFOOD TÂY ĐÔ</Link><span>TRUY XUẤT THEO LÔ</span></header>
    {!available ? <section className="lot-hero lot-hero-hold">
      <p>THÔNG BÁO VỀ MÃ QR ĐÃ PHÁT HÀNH</p>
      <h1>Thông tin lô đang tạm ngừng công khai</h1>
      <p>Mã QR này vẫn dẫn đến đúng hồ sơ lô, nhưng Sunfood đang rà soát dữ liệu. Vui lòng không coi thông tin đã lưu hoặc ảnh chụp trước đây là xác nhận hiện tại.</p>
      <div><span>Mã NCC: <b>{product.supplier.code}</b></span><span>Mã lô: <b>{batch.code}</b></span></div>
    </section> : <>
      <section className="lot-hero">
        <p>{batch.sourceSystem === 'HANOICHECK' ? 'Hồ sơ được xác minh và đồng bộ lên HanoiCheck' : 'HỒ SƠ LÔ ĐÃ CÔNG BỐ'}</p>
        <h1>{product.name}</h1>
        <p className="lot-hero-supplier">{product.supplier.name}</p>
        {product.supplier.address && <p className="lot-hero-address">{product.supplier.address}</p>}
        <div className="lot-hero-codes"><span>Mã NCC <b>{product.supplier.code}</b></span><span>Mã lô <b>{batch.code}</b></span></div>
      </section>
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
    </>}
    <footer>Thông tin do Sunfood Tây Đô quản lý và công bố sau đối chiếu. Không có điểm tin cậy hoặc xác nhận kiểm định tự động khi thiếu chứng từ.</footer>
  </main>;
}
