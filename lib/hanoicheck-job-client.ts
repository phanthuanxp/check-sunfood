export type HanoiCheckSyncResult = {
  processed: number;
  created: number;
  updated: number;
  pending: number;
  unchanged: number;
  skipped: { code: string; reason: string }[];
};

type JobResponse = {
  id?: string;
  status?: string;
  result?: HanoiCheckSyncResult | null;
  error?: string | null;
};

const TERMINAL = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function normalizeResult(value: unknown): HanoiCheckSyncResult | null {
  const item = value as Partial<HanoiCheckSyncResult> | null;
  if (!item || !Number.isFinite(item.processed) || !Number.isFinite(item.created) || !Number.isFinite(item.updated) || !Array.isArray(item.skipped)) return null;
  return {
    processed: item.processed!, created: item.created!, updated: item.updated!,
    pending: Number.isFinite(item.pending) ? item.pending! : 0,
    unchanged: Number.isFinite(item.unchanged) ? item.unchanged! : 0,
    skipped: item.skipped,
  };
}

/** Accepts both legacy immediate results and the Phase 1+2 durable-job response. */
export async function waitForHanoiCheckJob(
  response: Response,
  onState?: (status: string) => void,
  options: { sleep?: (ms: number) => Promise<void>; maxAttempts?: number } = {},
): Promise<HanoiCheckSyncResult> {
  const initial = await response.json().catch(() => null) as JobResponse | HanoiCheckSyncResult | null;
  if (!response.ok) throw new Error((initial as JobResponse | null)?.error || 'Không tạo được lượt đồng bộ.');
  const immediate = normalizeResult(initial);
  if (response.status !== 202 && immediate) return immediate;
  const id = (initial as JobResponse | null)?.id;
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Máy chủ không trả về ID lượt đồng bộ hợp lệ.');

  const sleep = options.sleep ?? delay;
  for (let attempt = 0; attempt < (options.maxAttempts ?? 500); attempt++) {
    await sleep(attempt < 10 ? 1_000 : 1_500);
    const currentResponse = await fetch(`/api/admin/hanoicheck/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const current = await currentResponse.json().catch(() => null) as JobResponse | null;
    if (!currentResponse.ok) throw new Error(current?.error || 'Không đọc được tiến độ đồng bộ.');
    onState?.(current?.status || 'QUEUED');
    if (!current?.status || !TERMINAL.has(current.status)) continue;
    const result = normalizeResult(current.result);
    if ((current.status === 'SUCCEEDED' || current.status === 'PARTIAL') && result) return result;
    throw new Error(current.error || `Lượt đồng bộ kết thúc với trạng thái ${current.status}.`);
  }
  throw new Error(`Lượt đồng bộ ${id} vẫn đang chạy. Có thể đóng trang và xem lại trong lịch sử đồng bộ.`);
}
