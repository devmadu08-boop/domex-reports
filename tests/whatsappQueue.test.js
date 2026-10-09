import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function fixture(t, jobs = []) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'domex-queue-test-'));
  const file = path.join(folder, 'queue.json');
  await fs.writeFile(file, JSON.stringify(jobs));
  process.env.WHATSAPP_QUEUE_PATH = file;
  const queue = await import(`../backend/whatsapp/whatsappQueue.js?test=${Math.random()}`);
  t.after(async () => { delete process.env.WHATSAPP_QUEUE_PATH; await fs.rm(folder, { recursive: true, force: true }); });
  return queue;
}
function job(id, accountKey = 'branch-a', status = 'pending') {
  return { id, accountKey, status, type: 'recipient-report', payload: { phoneNumber: '94771234567', caption: 'Before', imageDataUrls: ['data:image/png;base64,dGVzdA=='] }, attempts: 0, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z', nextRetryAt: '2026-10-09T00:00:00Z' };
}
test('send returns after durable enqueue while the processor is still blocked; account identity is authoritative', async t => {
  const q = await fixture(t);
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  let received;
  q.configureWhatsAppQueue(async (_, payload) => { received = payload; await gate; return { sentCount: 1 }; });
  const result = await q.sendWithWhatsAppQueue('recipient-report', { caption: 'Hello', __whatsappAccountKey: 'wrong-account' }, 'branch-a');
  assert.equal(result.queued, true);
  assert.equal(result.job.status, 'pending');
  await new Promise(resolve => setImmediate(resolve));
  for (let i=0; i<20 && !received; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(received.__whatsappAccountKey, 'branch-a');
  await assert.rejects(q.updateWhatsAppQueueJob(result.job.id, { caption: 'Too late' }, 'branch-a'), { statusCode: 409 });
  assert.equal((await q.clearWhatsAppQueue('branch-a')).sendingKept, 1);
  finish();
  for (let i=0; i<40; i++) { if ((await q.getWhatsAppQueueStatus('branch-a')).counts.sent) break; await new Promise(resolve => setTimeout(resolve,5)); }
  assert.equal((await q.getWhatsAppQueueStatus('branch-a')).counts.sent, 1);
});
test('view, edit and delete are isolated to the selected account and preserve attachments', async t => {
  const q = await fixture(t, [job('mine'), job('other','branch-b'), job('sent','branch-a','sent')]);
  assert.equal((await q.getWhatsAppQueueStatus('branch-a')).jobs.length, 2);
  await assert.rejects(q.getWhatsAppQueueJob('other','branch-a'), { statusCode:404 });
  await assert.rejects(q.updateWhatsAppQueueJob('other',{caption:'Wrong'},'branch-a'), {statusCode:404});
  await q.updateWhatsAppQueueJob('mine', { caption:'Revised', __whatsappAccountKey:'branch-b' }, 'branch-a');
  const edited = await q.getWhatsAppQueueJob('mine','branch-a');
  assert.equal(edited.payload.caption,'Revised');
  assert.equal(edited.payload.imageDataUrls.length,1);
  assert.equal(edited.accountKey,'branch-a');
  await assert.rejects(q.updateWhatsAppQueueJob('mine', undefined, 'branch-a'), {statusCode:400});
  await assert.rejects(q.retryWhatsAppJob('sent','branch-a'), {statusCode:409});
  await q.deleteWhatsAppQueueJob('mine','branch-a');
  assert.equal((await q.getWhatsAppQueueStatus('branch-b')).jobs.length,1);
});
test('clear all keeps in-flight messages and never discards another account’s pending jobs', async t => {
  const q = await fixture(t, [job('busy','branch-a','sending'),job('mine'),...Array.from({length:120},(_,i)=>job('other-'+i,'branch-b'))]);
  const cleared = await q.clearWhatsAppQueue('branch-a');
  assert.equal(cleared.deletedCount,1);
  assert.equal(cleared.sendingKept,1);
  assert.equal((await q.getWhatsAppQueueStatus('branch-b')).jobs.length,120);
  await assert.rejects(q.deleteWhatsAppQueueJob('busy','branch-a'),{statusCode:409});
});
