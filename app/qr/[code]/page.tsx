import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getAiRuntimeSettings } from '@/lib/ai-settings';
import { prisma } from '@/lib/prisma';
import PublicSupplier from './PublicSupplier';

export const dynamic = 'force-dynamic';

type Language = 'vi' | 'en';
type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

function requestedLanguage(searchParams: Record<string, string | string[] | undefined>): Language | null {
  const raw = Array.isArray(searchParams.lang) ? searchParams.lang[0] : searchParams.lang;
  return raw === 'vi' || raw === 'en' ? raw : null;
}

function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { /* Fall through to the public production origin. */ }
  }
  return 'https://check.sunfoodtaydo.com';
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const normalizedCode = code.trim().toUpperCase();
  const supplier = await getPublicSupplier(normalizedCode);
  const lang = requestedLanguage(query) || 'vi';

  if (!supplier) {
    return {
      title: lang === 'en' ? 'Supplier not found | Sunfood Tây Đô' : 'Không tìm thấy nhà cung cấp | Sunfood Tây Đô',
      robots: { index: false, follow: false },
    };
  }

  const supplierName = lang === 'en' ? (supplier.nameEn || supplier.name) : supplier.name;
  const productName = lang === 'en' ? (supplier.productNameEn || supplier.productName) : supplier.productName;
  const description = lang === 'en'
    ? `Traceability information for ${supplierName}${productName ? ` — ${productName}` : ''}, managed by Sunfood Tây Đô.`
    : `Thông tin truy xuất nguồn gốc của ${supplierName}${productName ? ` — ${productName}` : ''}, do Sunfood Tây Đô quản lý.`;
  const canonical = `${siteOrigin()}/qr/${encodeURIComponent(supplier.code)}`;

  return {
    title: `${supplierName} | ${lang === 'en' ? 'Traceability' : 'Truy xuất nguồn gốc'} Sunfood Tây Đô`,
    description,
    alternates: {
      canonical,
      languages: { vi: canonical, en: `${canonical}?lang=en` },
    },
    openGraph: {
      type: 'website',
      url: lang === 'en' ? `${canonical}?lang=en` : canonical,
      siteName: 'Sunfood Tây Đô',
      title: `${supplierName} | ${lang === 'en' ? 'Traceability' : 'Truy xuất nguồn gốc'}`,
      description,
      locale: lang === 'en' ? 'en_US' : 'vi_VN',
    },
  };
}

export default async function SupplierPage({ params, searchParams }: PageProps) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const supplier = await getPublicSupplier(code.trim().toUpperCase());
  if (!supplier) notFound();

  const ai = await getAiRuntimeSettings();
  return <PublicSupplier
    supplier={JSON.parse(JSON.stringify(supplier))}
    aiEnabled={ai.publicQaEnabled && Boolean(ai.apiKey) && supplier.status === 'ACTIVE' && supplier.verificationStatus === 'VERIFIED'}
    initialLanguage={requestedLanguage(query)}
  />;
}
