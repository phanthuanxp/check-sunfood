import { notFound } from 'next/navigation';
import { isBatchAvailable, findBatchByLotIdentifier } from '@/lib/trace-publish';
import PrintButton from '../../../admin/print/[code]/PrintButton';

/* eslint-disable @next/next/no-img-element -- The print sheet needs the original generated QR pixels. */

export default async function PrintLotQr({ params }: { params: Promise<{ id: string }> }) {
  const identifier = decodeURIComponent((await params).id);
  const batch = await findBatchByLotIdentifier(identifier);
  if (!batch) notFound();
  const { product } = batch;
  if (!isBatchAvailable(batch)) notFound();
  const shortCode = encodeURIComponent(batch.code);
  const url = `${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3010').replace(/\/$/, '')}/lot/${shortCode}`;
  return <main className="print-sheet"><section className="qr-label"><p className="eyebrow">SUNFOOD TÂY ĐÔ</p><h1>TRUY XUẤT LÔ HÀNG</h1><img src={`/api/qr/lot/${shortCode}?format=png`} alt={`QR lô ${batch.code}`} /><h2>{product.name}</h2><p>{product.supplier.code} · Lô {batch.code}</p><small>Quét mã để xem thông tin lô nhập hàng</small><code>{url}</code></section><PrintButton /></main>;
}
