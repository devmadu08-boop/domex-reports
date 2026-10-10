import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateDeliveredEntries,DELIVERED_ROWS_PER_PAGE} from '../src/utils/deliveredReportLayout.js';
test('Delivered pages use fixed twenty-row chunks instead of splitting eighteen rows into two pages',()=>{
 assert.equal(DELIVERED_ROWS_PER_PAGE,20);
 assert.deepEqual(paginateDeliveredEntries(Array.from({length:18})).map(p=>p.entries.length),[18]);
 assert.deepEqual(paginateDeliveredEntries(Array.from({length:21})).map(p=>p.entries.length),[20,1]);
 assert.deepEqual(paginateDeliveredEntries(Array.from({length:40})).map(p=>p.entries.length),[20,20]);
});
test('pagination preserves every record, sequence and final-page marker',()=>{
 const rows=Array.from({length:43},(_,i)=>({trackingNo:'TRACK-'+i}));const pages=paginateDeliveredEntries(rows);
 assert.deepEqual(pages.flatMap(p=>p.entries),rows);assert.deepEqual(pages.map(p=>p.startIndex),[0,20,40]);
 assert.deepEqual(pages.map(p=>p.isFinalPage),[false,false,true]);
});
