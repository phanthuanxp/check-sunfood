import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { rejectUntrustedMutation } from '@/lib/security';
import { PRODUCTION_STEPS, randomStaff } from '@/lib/production-steps';

// Toggles one of the 5 fixed production steps for a batch. Checking a step creates its
// TraceEvent (with a randomly assigned performer, kept stable across future toggles) if it
// doesn't exist yet, then marks it public; unchecking just hides it again rather than deleting,
// so the assigned performer and history survive a re-check.
export async function PATCH(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rejected = rejectUntrustedMutation(request); if (rejected) return rejected;
  const body = await request.json().catch(() => ({}));
  const batchId = Number(body.batchId);
  const stepKey = String(body.stepKey || '');
  const checked = Boolean(body.checked);
  const step = PRODUCTION_STEPS.find(item => item.key === stepKey);
  if (!Number.isSafeInteger(batchId) || batchId < 1 || !step) return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });

  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) return NextResponse.json({ error: 'Không tìm thấy lô.' }, { status: 404 });

  const existing = await prisma.traceEvent.findFirst({ where: { batchId, stage: stepKey } });
  if (checked) {
    if (existing) {
      await prisma.traceEvent.update({ where: { id: existing.id }, data: { isPublic: true } });
    } else {
      const staff = randomStaff();
      await prisma.traceEvent.create({
        data: {
          batchId, stage: step.key, title: step.title, details: step.description,
          occurredAt: new Date(), performedBy: staff.name, performedByRole: staff.role, isPublic: true,
        },
      });
    }
  } else if (existing) {
    await prisma.traceEvent.update({ where: { id: existing.id }, data: { isPublic: false } });
  }
  return NextResponse.json({ ok: true });
}
