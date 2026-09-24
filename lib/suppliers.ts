export function supplierData(body: Record<string, unknown>, code: string, name: string) {
  const optional = (key: string) => String(body[key] || '').trim() || null;
  return {
    code, name, nameEn: optional('nameEn'), productName: optional('productName'), productNameEn: optional('productNameEn'),
    address: optional('address'), addressEn: optional('addressEn'), taxCode: optional('taxCode'),
    phone: optional('phone'), website: optional('website'), email: optional('email'),
    description: optional('description'), descriptionEn: optional('descriptionEn'),
    storage: optional('storage'), storageEn: optional('storageEn'), shelfLife: optional('shelfLife'), shelfLifeEn: optional('shelfLifeEn'),
    notes: optional('notes'), notesEn: optional('notesEn'),
    status: String(body.status || 'ACTIVE'), verificationStatus: String(body.verificationStatus || 'PENDING'),
  };
}
