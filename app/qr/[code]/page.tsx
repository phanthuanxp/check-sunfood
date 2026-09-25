import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import PublicSupplier from './PublicSupplier';

// Data only changes via admin actions (not continuously), so a short cache window lets
// repeat/popular QR scans hit the render cache instead of re-querying on every view.
// Reading `?lang=`/`?tab=` here would force this page to fully re-render on every request
// (searchParams access opts a page out of caching) — PublicSupplier reads them client-side
// via useSearchParams() instead, so this page stays cacheable.
export const revalidate = 60;

type PageProps = {
  params: Promise<{ code: string }>;
};

const getPublicSupplier = cache((code: string) => prisma.supplier.findUnique({
  where: { code },
  select: {
    code: true,
    name: true,
    nameEn: true,
    productName: true,
    productNameEn: true,
    address: true,
    addressEn: true,
    taxCode: true,
    phone: true,
    website: true,
    email: true,
    description: true,
    descriptionEn: true,
    logoUrl: true,
    status: true,
    verificationStatus: true,
    updatedAt: true,
    documents: {
      where: { isPublic: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        titleEn: true,
        category: true,
        fileUrl: true,
        issuedAt: true,
        expiresAt: true,
      },
    },
    products: {
      where: { isPublic: true },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        name: true,
        batches: {
          where: { isPublic: true },
          orderBy: { receivedAt: 'desc' },
          select: {
            publicId: true,
            code: true,
            name: true,
            receivedAt: true,
            expiresAt: true,
          },
        },
      },
    },
  },
}));

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { /* Fall through to the public production origin. */ }
  }
  return 'https://check.sunfoodtaydo.com';
}

// No supplier codes are known at build time; an explicit empty list (rather than omitting
// this function) is what tells Next.js to treat this segment as ISR-eligible on demand
// instead of fully dynamic, since self-hosted output only registers dynamicRoutes when present.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const normalizedCode = code.trim().toUpperCase();
  const supplier = await getPublicSupplier(normalizedCode);

  if (!supplier) {
    return {
      title: 'Không tìm thấy nhà cung cấp | Sunfood Tây Đô',
      robots: { index: false, follow: false },
    };
  }

  // Metadata is generated once per revalidate window (not per-request), so it can't vary by
  // the requester's ?lang= — always Vietnamese here; `alternates.languages` below still tells
  // search engines the English variant exists at ?lang=en.
  const supplierName = supplier.name;
  const productName = supplier.productName;
  const description = `Thông tin truy xuất nguồn gốc của ${supplierName}${productName ? ` — ${productName}` : ''}, do Sunfood Tây Đô quản lý.`;
  const canonical = `${siteOrigin()}/qr/${encodeURIComponent(supplier.code)}`;

  return {
    title: `${supplierName} | Truy xuất nguồn gốc Sunfood Tây Đô`,
    description,
    alternates: {
      canonical,
      languages: { vi: canonical, en: `${canonical}?lang=en` },
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: 'Sunfood Tây Đô',
      title: `${supplierName} | Truy xuất nguồn gốc`,
      description,
      locale: 'vi_VN',
    },
  };
}

export default async function SupplierPage({ params }: PageProps) {
  const { code } = await params;
  const supplier = await getPublicSupplier(code.trim().toUpperCase());
  if (!supplier) notFound();

  return <Suspense>
    <PublicSupplier supplier={JSON.parse(JSON.stringify(supplier))} />
  </Suspense>;
}
