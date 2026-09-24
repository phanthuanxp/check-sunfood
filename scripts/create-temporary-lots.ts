import 'dotenv/config';
import { prisma } from '../lib/prisma';

type LotSeed = {
  supplierCode: string;
  productName: string;
  sku: string;
  batchCode: string;
  batchName: string;
  receivedAt: Date | null;
  publish: boolean;
};

const seeds: LotSeed[] = [
  {
    supplierCode: 'NCC-01',
    productName: 'Thịt Lợn An Toàn Sunfood Tây Đô - CP',
    sku: 'THITLONCP-NCC01',
    batchCode: 'LO-THITLONCP-NCC01-20260925',
    batchName: 'Thịt Lợn An Toàn Sunfood Tây Đô - CP NGÀY 25/9',
    receivedAt: new Date('2026-09-25T00:00:00+07:00'),
    publish: true,
  },
  {
    supplierCode: 'NCC-02',
    productName: 'Thịt bò Sunfood Tây Đô',
    sku: 'THITBOSUNFOOD-NCC02',
    batchCode: 'LO-THITBOSUNFOOD-NCC02-20260925',
    batchName: 'Thịt bò Sunfood Tây Đô ngày 25/9',
    receivedAt: new Date('2026-09-25T00:00:00+07:00'),
    publish: true,
  },
  {
    supplierCode: 'NCC-03',
    productName: 'Thịt gà Sunfood Tây Đô',
    sku: 'THITGASUNFOOD-NCC03',
    batchCode: 'LO-THITGASUNFOOD-NCC03-20260925',
    batchName: 'Thịt gà Sunfood Tây Đô ngày 25/9',
    receivedAt: new Date('2026-09-25T00:00:00+07:00'),
    publish: true,
  },
  {
    supplierCode: 'NCC-06',
    productName: 'Hải sản tươi sống Sunfood Tây Đô - NCC06',
    sku: 'HAISANTUOISONG-NCC06',
    batchCode: 'LO-HAISANTUOISONG-NCC06-TEMP',
    batchName: 'Hải sản tươi sống Sunfood Tây Đô - NCC06',
    receivedAt: null,
    publish: false,
  },
  {
    supplierCode: 'NCC-07',
    productName: 'Hải sản tươi sống Sunfood Tây Đô - NCC07',
    sku: 'HAISANTUOISONG-NCC07',
    batchCode: 'LO-HAISANTUOISONG-NCC07-TEMP',
    batchName: 'Hải sản tươi sống Sunfood Tây Đô - NCC07',
    receivedAt: null,
    publish: false,
  },
  {
    supplierCode: 'NCC-08',
    productName: 'Hải sản tươi sống Sunfood Tây Đô - NCC08',
    sku: 'HAISANTUOISONG-NCC08',
    batchCode: 'LO-HAISANTUOISONG-NCC08-TEMP',
    batchName: 'Hải sản tươi sống Sunfood Tây Đô - NCC08',
    receivedAt: null,
    publish: false,
  },
];

async function main() {
  const results: Array<{ supplier: string; batch: string; publicId: string; status: 'PUBLIC' | 'DRAFT' }> = [];

  for (const seed of seeds) {
    const supplier = await prisma.supplier.findUnique({
      where: { code: seed.supplierCode },
      select: { id: true, code: true, status: true, verificationStatus: true },
    });
    if (!supplier) throw new Error(`Không tìm thấy nhà cung cấp ${seed.supplierCode}.`);
    if (seed.publish && (supplier.status !== 'ACTIVE' || supplier.verificationStatus !== 'VERIFIED')) {
      throw new Error(`${seed.supplierCode} chưa đủ điều kiện công khai; không thay đổi trạng thái xác minh tự động.`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existingProduct = await tx.product.findUnique({
        where: { supplierId_sku: { supplierId: supplier.id, sku: seed.sku } },
        select: { id: true },
      });
      const product = await tx.product.upsert({
        where: { supplierId_sku: { supplierId: supplier.id, sku: seed.sku } },
        create: {
          supplierId: supplier.id,
          name: seed.productName,
          sku: seed.sku,
          isPublic: seed.publish,
        },
        update: {
          name: seed.productName,
          ...(seed.publish ? { isPublic: true } : {}),
        },
        select: { id: true },
      });

      const existingBatch = await tx.batch.findUnique({
        where: { productId_code: { productId: product.id, code: seed.batchCode } },
        select: { id: true },
      });
      const batch = await tx.batch.upsert({
        where: { productId_code: { productId: product.id, code: seed.batchCode } },
        create: {
          productId: product.id,
          code: seed.batchCode,
          name: seed.batchName,
          receivedAt: seed.receivedAt,
          sourceSystem: 'LOCAL',
          isPublic: seed.publish,
          everPublished: seed.publish,
        },
        update: {
          name: seed.batchName,
          receivedAt: seed.receivedAt,
          ...(seed.publish ? { isPublic: true, everPublished: true } : {}),
        },
        select: { publicId: true },
      });

      if (!existingProduct) {
        await tx.auditLog.create({
          data: {
            supplierId: supplier.id,
            action: 'CREATE',
            entity: 'PRODUCT',
            entityId: String(product.id),
            summary: `Tạo sản phẩm ${seed.productName}`,
          },
        });
      }
      if (!existingBatch) {
        await tx.auditLog.create({
          data: {
            supplierId: supplier.id,
            action: 'CREATE',
            entity: 'BATCH',
            summary: `Tạo lô ${seed.batchName}${seed.publish ? ' và công khai theo yêu cầu quản trị' : ' ở trạng thái bản nháp chờ bổ sung dữ liệu'}`,
          },
        });
      }

      return batch;
    });

    results.push({
      supplier: seed.supplierCode,
      batch: seed.batchName,
      publicId: result.publicId,
      status: seed.publish ? 'PUBLIC' : 'DRAFT',
    });
  }

  console.table(results);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
