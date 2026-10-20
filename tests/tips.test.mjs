// npx tsx tests/tips.test.mjs — unit tests for the tip-allocation logic
import assert from 'node:assert/strict'
import { computeTipDistribution } from '../src/lib/tips.ts'

const S = { runnerRate: 50, includeHostess: false, hostessRate: 40 }

// 1) Normal night: runner 5h ×50 = 250, pool 1000 → 750 left for 2 waiters (6h+4h=10h → 75/h)
{
  const a = computeTipDistribution(1000, [
    { waiter_id: 'r1', full_name: 'ראנר', role: 'runner', hours_worked: 5 },
    { waiter_id: 'w1', full_name: 'מלצר א', role: 'waiter', hours_worked: 6 },
    { waiter_id: 'w2', full_name: 'ברמן', role: 'bartender', hours_worked: 4 },
  ], S)
  assert.equal(a.capped, false)
  assert.equal(a.totalFixedPay, 250)
  assert.equal(a.remainingForWaiters, 750)
  assert.equal(a.results.find(r => r.waiter_id === 'w1').tip_amount, 450)
  assert.equal(a.results.find(r => r.waiter_id === 'w2').tip_amount, 300)
  const total = a.results.reduce((s, r) => s + r.tip_amount, 0)
  assert.equal(total, 1000)
}

// 2) THE BUG CASE: runner pay (8h×50=400) exceeds a tiny pool (300).
//    Old code: runner gets 400, waiters 0 → distributed 400 > 300 pool.
//    New code: runner capped at 300, waiters 0, total never exceeds the pool.
{
  const a = computeTipDistribution(300, [
    { waiter_id: 'r1', full_name: 'ראנר', role: 'runner', hours_worked: 8 },
    { waiter_id: 'w1', full_name: 'מלצר', role: 'waiter', hours_worked: 6 },
  ], S)
  assert.equal(a.capped, true)
  assert.equal(a.results.find(r => r.waiter_id === 'r1').tip_amount, 300)
  assert.equal(a.results.find(r => r.waiter_id === 'w1').tip_amount, 0)
  const total = a.results.reduce((s, r) => s + r.tip_amount, 0)
  assert.ok(total <= 300, `distributed ${total} > pool 300`)
}

// 3) Two runners capped proportionally (6h and 2h ×50 = 400 raw, pool 200 → scale 0.5)
{
  const a = computeTipDistribution(200, [
    { waiter_id: 'r1', full_name: 'ראנר א', role: 'runner', hours_worked: 6 },
    { waiter_id: 'r2', full_name: 'ראנר ב', role: 'runner', hours_worked: 2 },
  ], S)
  assert.equal(a.capped, true)
  assert.equal(a.results.find(r => r.waiter_id === 'r1').tip_amount, 150)
  assert.equal(a.results.find(r => r.waiter_id === 'r2').tip_amount, 50)
}

// 4) Hostess excluded by default, included via settings
{
  const shifts = [
    { waiter_id: 'h1', full_name: 'מארחת', role: 'hostess', hours_worked: 5 },
    { waiter_id: 'w1', full_name: 'מלצר', role: 'waiter', hours_worked: 5 },
  ]
  const off = computeTipDistribution(1000, shifts, S)
  assert.equal(off.results.find(r => r.waiter_id === 'h1'), undefined)
  assert.equal(off.results.find(r => r.waiter_id === 'w1').tip_amount, 1000)

  const on = computeTipDistribution(1000, shifts, { ...S, includeHostess: true })
  assert.equal(on.results.find(r => r.waiter_id === 'h1').tip_amount, 200) // 5h × 40
  assert.equal(on.results.find(r => r.waiter_id === 'w1').tip_amount, 800)
}

console.log('tips.test: all assertions passed')
