import test from 'node:test';
import assert from 'node:assert/strict';
import { getColomboClock, shouldRunDailyTask, getRescheduleReadiness } from '../backend/whatsapp/schedule.js';
import { getTabFromPath, getTabPath, TAB_PATHS } from '../src/navigation.js';
import { DEFAULT_REPORT_CAPTIONS, formatReportCaption, upgradeDefaultCaptions } from '../shared/whatsappCaptions.js';
test('reschedule jobs catch up after 20:00 and remain once per Colombo date',()=>{
  const late = new Date('2026-10-09T15:45:00Z');
  assert.deepEqual(getColomboClock(late),{date:'2026-10-09',hour:21,minute:15});
  assert.equal(shouldRunDailyTask(late,20,''),true);
  assert.equal(shouldRunDailyTask(late,20,'2026-10-09'),false);
  assert.equal(shouldRunDailyTask(new Date('2026-10-09T13:00:00Z'),20,''),false);
});
test('schedule diagnostics expose missing setup and use the correct date around UTC midnight',()=>{
  const now=new Date('2026-10-08T23:45:00Z');
  assert.equal(getColomboClock(now).date,'2026-10-09');
  assert.equal(getRescheduleReadiness({},now).missing.length,3);
  assert.equal(getRescheduleReadiness({backupWhatsappNumber:'94771234567',rescheduleDefaultGroupJids:['group'],latestBackupSnapshot:{reports:{'2026-10-09':{rescheduleRows:[{}]}}}},now).ready,true);
});
test('each tab has a reloadable route and slashless paths resolve to the same tab',()=>{
  for(const [tab,route] of Object.entries(TAB_PATHS)) { assert.equal(getTabFromPath(route),tab); assert.equal(getTabFromPath(route.slice(0,-1)),tab); assert.equal(getTabPath(tab),route); }
});
test('new DOMEX captions fill supported fields and leave custom templates intact',()=>{
  const legacy='Reschedule Report - {date}\nSent automatically from Daily Report System';
  assert.equal(upgradeDefaultCaptions({reschedule:legacy}).reschedule,DEFAULT_REPORT_CAPTIONS.reschedule);
  assert.equal(upgradeDefaultCaptions({courier:'My custom message'}).courier,'My custom message');
  assert.match(formatReportCaption(DEFAULT_REPORT_CAPTIONS.reschedule,{date:'2026-10-09',branch:'Middeniya'}),/Middeniya Branch/);
});
