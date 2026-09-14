import { isAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import PrintButton from './PrintButton';

/* eslint-disable @next/next/no-img-element -- The print sheet needs the original generated QR pixels. */

export default async function PrintQr({ params }:{ params:Promise<{code:string}> }) {
  if (!(await isAdmin())) redirect('/admin/login');
  const {code:raw}=await params; const code=raw.toUpperCase(); const supplier=await prisma.supplier.findUnique({where:{code}}); if(!supplier)notFound();
  const url=`${(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000').replace(/\/$/,'')}/qr/${code}`;
  return <main className="print-sheet"><section className="qr-label"><p className="eyebrow">SUNFOOD TÂY ĐÔ</p><h1>TRUY XUẤT NGUỒN GỐC</h1><img src={`/api/qr/${code}?format=png`} alt={`QR ${code}`}/><h2>{code}</h2><p>{supplier.productName||supplier.name}</p><small>Quét mã để xem thông tin nhà cung cấp</small><code>{url}</code></section><PrintButton /></main>;
}
