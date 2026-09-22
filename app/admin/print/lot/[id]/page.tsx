import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import PrintButton from '../../[code]/PrintButton';

/* eslint-disable @next/next/no-img-element -- The print sheet needs the original generated QR pixels. */

export default async function PrintLotQr({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { id: publicId } = await params;
  const batch = await prisma.batch.findUnique({ where: { publicId }, include: { product: { include: { supplier: true } } } });
  if (!batch) notFound();
  if (!batch.isPublic && !batch.everPublished) redirect('/admin/trace');
  const url = `${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3010').replace(/\/$/, '')}/lot/${publicId}`;
  return <main className="print-sheet"><section className="qr-label"><p className="eyebrow">SUNFOOD TÂY ĐÔ</p><h1>TRUY XUẤT LÔ HÀNG</h1><img src={`/api/qr/lot/${publicId}?format=png`} alt={`QR lô ${batch.code}`} /><h2>{batch.product.name}</h2><p>{batch.product.supplier.code} · Lô {batch.code}</p><small>Quét mã để xem thông tin lô nhập hàng</small><code>{url}</code></section><PrintButton /></main>;
}
