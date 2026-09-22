export const aiDocumentCategories = ['BUSINESS_LICENSE', 'FOOD_SAFETY', 'CONTRACT', 'TESTING', 'VIETGAP', 'HACCP', 'ISO', 'OTHER'] as const;
export const aiConfidenceLevels = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ExtractedDocument = {
  title: string | null;
  category: (typeof aiDocumentCategories)[number] | null;
  supplierName: string | null;
  taxCode: string | null;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  evidence: string | null;
  warnings: string[];
  confidence: Record<'title' | 'category' | 'issuedAt' | 'expiresAt', (typeof aiConfidenceLevels)[number] | null>;
};

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableConfidence = { anyOf: [{ type: 'string', enum: [...aiConfidenceLevels] }, { type: 'null' }] };
export const extractionSchema = {
  type: 'object',
  properties: {
    title: nullableString, category: { anyOf: [{ type: 'string', enum: [...aiDocumentCategories] }, { type: 'null' }] },
    supplierName: nullableString, taxCode: nullableString, documentNumber: nullableString,
    issuedAt: nullableString, expiresAt: nullableString, evidence: nullableString,
    warnings: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      properties: { title: nullableConfidence, category: nullableConfidence, issuedAt: nullableConfidence, expiresAt: nullableConfidence },
      required: ['title', 'category', 'issuedAt', 'expiresAt'],
      additionalProperties: false,
    },
  },
  required: ['title', 'category', 'supplierName', 'taxCode', 'documentNumber', 'issuedAt', 'expiresAt', 'evidence', 'warnings', 'confidence'],
  additionalProperties: false,
};

function clean(value: unknown, max = 250) {
  return typeof value === 'string' ? value.trim().slice(0, max) || null : null;
}
function date(value: unknown) {
  const text = clean(value, 10);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}
function confidenceLevel(value: unknown): (typeof aiConfidenceLevels)[number] | null {
  return aiConfidenceLevels.includes(value as (typeof aiConfidenceLevels)[number]) ? value as (typeof aiConfidenceLevels)[number] : null;
}

export function validateExtraction(value: unknown): ExtractedDocument {
  if (!value || typeof value !== 'object') throw new Error('AI_INVALID_RESPONSE');
  const data = value as Record<string, unknown>;
  const category = aiDocumentCategories.includes(data.category as (typeof aiDocumentCategories)[number]) ? data.category as ExtractedDocument['category'] : null;
  const warnings = Array.isArray(data.warnings) ? data.warnings.filter((item): item is string => typeof item === 'string').slice(0, 8).map(item => item.slice(0, 240)) : [];
  const confidenceRaw = data.confidence && typeof data.confidence === 'object' ? data.confidence as Record<string, unknown> : {};
  const result: ExtractedDocument = {
    title: clean(data.title), category, supplierName: clean(data.supplierName), taxCode: clean(data.taxCode, 40),
    documentNumber: clean(data.documentNumber, 100), issuedAt: date(data.issuedAt), expiresAt: date(data.expiresAt),
    evidence: clean(data.evidence, 700), warnings,
    confidence: {
      title: confidenceLevel(confidenceRaw.title), category: confidenceLevel(confidenceRaw.category),
      issuedAt: confidenceLevel(confidenceRaw.issuedAt), expiresAt: confidenceLevel(confidenceRaw.expiresAt),
    },
  };
  if (result.issuedAt && result.expiresAt && result.expiresAt < result.issuedAt) result.warnings.push('Ngày hết hạn trước ngày cấp; cần đối chiếu bản gốc.');
  return result;
}
