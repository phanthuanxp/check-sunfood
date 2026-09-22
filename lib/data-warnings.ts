// Deterministic data-quality rules. No AI: expiry, duplicates and missing fields
// must stay exact and auditable, never left to model inference.

export type WarningSeverity = "critical" | "warning" | "info";

export type DataWarning = {
  rule: string;
  severity: WarningSeverity;
  code: string;
  message: string;
  relatedCodes?: string[];
};

export type WarningDocument = {
  title: string;
  expiresAt: string | Date | null;
};

export type WarningSupplier = {
  code: string;
  name: string;
  productName: string | null;
  address: string | null;
  taxCode: string | null;
  verificationStatus: string;
  documents: WarningDocument[];
};

function daysUntil(expiresAt: string | Date, now: Date) {
  const target = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase("vi").replace(/\s+/g, " ");
}

function documentWarnings(supplier: WarningSupplier, now: Date): DataWarning[] {
  if (supplier.documents.length === 0) {
    return [{ rule: "MISSING_DOCUMENTS", severity: "critical", code: supplier.code, message: "Chưa có hồ sơ nào được lưu cho nhà cung cấp này." }];
  }
  const warnings: DataWarning[] = [];
  for (const document of supplier.documents) {
    if (!document.expiresAt) continue;
    const days = daysUntil(document.expiresAt, now);
    if (days < 0) {
      warnings.push({ rule: "DOCUMENT_EXPIRED", severity: "critical", code: supplier.code, message: `Hồ sơ "${document.title}" đã hết hạn ${Math.abs(days)} ngày.` });
    } else if (days <= 30) {
      warnings.push({ rule: "DOCUMENT_DUE_30", severity: "critical", code: supplier.code, message: `Hồ sơ "${document.title}" còn ${days} ngày là hết hạn.` });
    } else if (days <= 60) {
      warnings.push({ rule: "DOCUMENT_DUE_60", severity: "warning", code: supplier.code, message: `Hồ sơ "${document.title}" còn ${days} ngày là hết hạn.` });
    } else if (days <= 90) {
      warnings.push({ rule: "DOCUMENT_DUE_90", severity: "info", code: supplier.code, message: `Hồ sơ "${document.title}" còn ${days} ngày là hết hạn.` });
    }
  }
  return warnings;
}

function fieldWarnings(supplier: WarningSupplier): DataWarning[] {
  const warnings: DataWarning[] = [];
  if (!supplier.productName) warnings.push({ rule: "MISSING_PRODUCT", severity: "warning", code: supplier.code, message: "Thiếu tên sản phẩm/nhóm hàng." });
  if (!supplier.address) warnings.push({ rule: "MISSING_ADDRESS", severity: "warning", code: supplier.code, message: "Thiếu địa chỉ nhà cung cấp." });
  if (supplier.verificationStatus !== "VERIFIED") warnings.push({ rule: "NOT_VERIFIED", severity: "info", code: supplier.code, message: "Hồ sơ chưa được xác minh nội bộ." });
  return warnings;
}

function duplicateGroups<T>(suppliers: WarningSupplier[], key: (supplier: WarningSupplier) => T | null) {
  const groups = new Map<T, string[]>();
  for (const supplier of suppliers) {
    const value = key(supplier);
    if (value === null) continue;
    const codes = groups.get(value) ?? [];
    codes.push(supplier.code);
    groups.set(value, codes);
  }
  return [...groups.values()].filter((codes) => codes.length > 1);
}

function crossSupplierWarnings(suppliers: WarningSupplier[]): DataWarning[] {
  const warnings: DataWarning[] = [];
  for (const codes of duplicateGroups(suppliers, (s) => (s.taxCode ? s.taxCode.trim() : null))) {
    for (const code of codes) {
      const relatedCodes = codes.filter((c) => c !== code);
      warnings.push({ rule: "DUPLICATE_TAX_CODE", severity: "critical", code, relatedCodes, message: `Mã số thuế trùng với ${relatedCodes.join(", ")}; cần đối chiếu trước khi công bố.` });
    }
  }
  for (const codes of duplicateGroups(suppliers, (s) => (s.name ? normalizeName(s.name) : null))) {
    for (const code of codes) {
      const relatedCodes = codes.filter((c) => c !== code);
      warnings.push({ rule: "DUPLICATE_NAME", severity: "warning", code, relatedCodes, message: `Tên nhà cung cấp trùng với ${relatedCodes.join(", ")}; xác nhận đây là hai pháp nhân độc lập hay lỗi ánh xạ mã.` });
    }
  }
  return warnings;
}

export function computeDataWarnings(suppliers: WarningSupplier[], now: Date = new Date()): DataWarning[] {
  const warnings: DataWarning[] = [];
  for (const supplier of suppliers) {
    warnings.push(...documentWarnings(supplier, now));
    warnings.push(...fieldWarnings(supplier));
  }
  warnings.push(...crossSupplierWarnings(suppliers));
  const order: Record<WarningSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return warnings.sort((a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code));
}
