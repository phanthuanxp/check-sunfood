import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PrintButton from '../../../admin/print/[code]/PrintButton';

/* eslint-disable @next/next/no-img-element -- The print sheet needs the original generated QR pixels. */

export default async function PrintLotQr({ params }: { params: Promise<{ id: string }> }) {
  const { id: publicId } = await params;
  const batch = await prisma.batch.findUnique({ where: { publicId }, include: { product: { include: { supplier: true } } } });
  if (!batch) notFound();
  const { product } = batch;
  const available = batch.isPublic && product.isPublic && product.supplier.verificationStatus === 'VERIFIED'
    && product.supplier.status === 'ACTIVE' && (!batch.producedAt || batch.producedAt <= new Date());
  if (!available) notFound();
  const url = `${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3010').replace(/\/$/, '')}/lot/${publicId}`;
  return <main className="print-sheet"><section className="qr-label"><p className="eyebrow">SUNFOOD TÂY ĐÔ</p><h1>TRUY XUẤT LÔ HÀNG</h1><img src={`/api/qr/lot/${publicId}?format=png`} alt={`QR lô ${batch.code}`} /><h2>{product.name}</h2><p>{product.supplier.code} · Lô {batch.code}</p><small>Quét mã để xem thông tin lô nhập hàng</small><code>{url}</code></section><PrintButton /></main>;
}
