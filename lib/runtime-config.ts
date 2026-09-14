const DEFAULT_ADMIN_PASSWORD = 'change-me-local';
const DEFAULT_AUTH_SECRET = 'replace-with-a-long-random-secret-before-production';

export function productionConfigurationIssues() {
  if (process.env.NODE_ENV !== 'production') return [];

  const issues: string[] = [];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const databaseUrl = process.env.DATABASE_URL || '';
  const authSecret = process.env.AUTH_SECRET || '';

  if (siteUrl !== 'https://check.sunfoodtaydo.com') issues.push('SITE_URL_INVALID');
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) issues.push('DATABASE_NOT_POSTGRESQL');
  if (!process.env.ADMIN_USERNAME) issues.push('ADMIN_USERNAME_MISSING');
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) issues.push('ADMIN_PASSWORD_INSECURE');
  if (!authSecret || authSecret === DEFAULT_AUTH_SECRET || authSecret.length < 32) issues.push('AUTH_SECRET_INSECURE');
  if (!process.env.UPLOAD_DIR) issues.push('UPLOAD_DIR_MISSING');

  return issues;
}
