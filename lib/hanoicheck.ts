import { hcSignedRequest } from '@/lib/hanoicheck-auth';

export { HanoiCheckApiError } from '@/lib/hanoicheck-errors';

export type HcOrderSummary = {
  code: string;
  status?: string | null;
  school?: { name: string } | null;
  products?: { code: string; name: string }[];
};

export type HcOrderAllocation = { supplier_food_code?: string; ma_lo?: string; ma_kho?: string; so_luong?: number };
export type HcOrderItem = {
  code: string;
  trace_code?: string | null;
  allocations?: HcOrderAllocation[];
};

export type HcOrderDetail = HcOrderSummary & { items?: HcOrderItem[] };

type Pagination = { current_page?: number; last_page?: number; per_page?: number; total?: number };

export async function listOrders(params: { page?: number; per_page?: number; order_date_from?: string; order_date_to?: string; status?: string } = {}) {
  return hcSignedRequest<{ data: HcOrderSummary[]; pagination?: Pagination }>('GET', '/orders', {
    page: params.page ?? 1,
    per_page: params.per_page ?? 100,
    order_date_from: params.order_date_from,
    order_date_to: params.order_date_to,
    status: params.status,
  });
}

export async function getOrder(code: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(code)) throw new Error('Mã đơn hàng không hợp lệ.');
  return hcSignedRequest<{ data: HcOrderDetail }>('GET', `/orders/${encodeURIComponent(code)}`);
}
