export type ExpiryState = 'NO_EXPIRY' | 'VALID' | 'DUE_90' | 'DUE_60' | 'DUE_30' | 'EXPIRED';

export function getExpiryState(expiresAt?: Date | string | null): ExpiryState {
  if (!expiresAt) return 'NO_EXPIRY';
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'EXPIRED';
  if (days <= 30) return 'DUE_30';
  if (days <= 60) return 'DUE_60';
  if (days <= 90) return 'DUE_90';
  return 'VALID';
}

export const expiryLabels: Record<ExpiryState, string> = {
  NO_EXPIRY: 'Không thời hạn', VALID: 'Còn hiệu lực', DUE_90: 'Sắp hết hạn ≤ 90 ngày',
  DUE_60: 'Sắp hết hạn ≤ 60 ngày', DUE_30: 'Sắp hết hạn ≤ 30 ngày', EXPIRED: 'Đã hết hạn'
};

export const legalCategories = ['BUSINESS_LICENSE', 'FOOD_SAFETY', 'CONTRACT', 'OTHER'];
export const certificateCategories = ['TESTING', 'VIETGAP', 'HACCP', 'ISO'];
