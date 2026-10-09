import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePerformanceDate, parseRiderPerformanceCsv, summarizeRiderPerformance, buildPerformancePages } from '../src/utils/riderPerformance.js';
import { canAccessTab } from '../src/permissions.js';
const sample='Key,Value\nCompanyName,DOMEX\nNo,Delivered Branch,Rider Name,Rider ID,01/09/2026,02/09/2026,01/10/2026,Total\n1,Middeniya,"Rider, One",private-id,4,0,3,7\n2,Middeniya,Rider Two,private-id-2,1,2,0,3\n,,,\n';
test('reads multi-rider date-column CSV using day/month dates and excludes rider IDs from derived data',()=>{
 const source=parseRiderPerformanceCsv(sample);
 assert.equal(source.start,'2026-09-01');assert.equal(source.end,'2026-10-01');assert.equal(source.riders.length,2);
 assert.equal(source.riders[0].name,'Rider, One');assert(!JSON.stringify(source).includes('private-id'));
 const summary=summarizeRiderPerformance(source);
 assert.equal(summary.total,10);assert.equal(summary.deliveryDays,3);assert.equal(summary.periodDays,31);assert.equal(summary.missingDays,28);
 assert.equal(summary.riders[0].activeDays,2);assert.equal(summary.riders[0].average,3.5);
});
test('period and branch filters use real counts and distinguish missing date columns from zero',()=>{
 const source=parseRiderPerformanceCsv(sample.replace('2,Middeniya','2,Other'));
 const summary=summarizeRiderPerformance(source,{start:'2026-09-01',end:'2026-09-03',branch:'Middeniya'});
 assert.equal(summary.total,4);assert.equal(summary.riders.length,1);assert.deepEqual(summary.daily.map(day=>day.total),[4,0,null]);
 assert.equal(summary.average,4);
});
test('invalid counts, ambiguous duplicate columns/rows, and invalid dates are rejected',()=>{
 assert.throws(()=>parseRiderPerformanceCsv(sample.replace('4,0,3','-4,0,3')),/Invalid delivery count/);
 assert.throws(()=>parseRiderPerformanceCsv(sample.replace('02/09/2026','01/09/2026')),/duplicate date columns/);
 assert.throws(()=>parseRiderPerformanceCsv(sample.replace('02/09/2026','31/02/2026')),/Invalid date column/);
 assert.equal(parsePerformanceDate('29/02/2025'),'');assert.equal(parsePerformanceDate('29/02/2024'),'2024-02-29');
 assert.throws(()=>summarizeRiderPerformance(parseRiderPerformanceCsv(sample),{start:'2026-10-01',end:'2026-09-01'}),/valid start/);
});
test('daily sums remain authoritative and reported Total mismatches are visible',()=>{
 const source=parseRiderPerformanceCsv(sample.replace(',3,7',',3,9'));
 assert.equal(source.warnings.length,1);assert.equal(summarizeRiderPerformance(source).total,10);
});
test('exports split large rider/day sets without dropping riders or dates',()=>{
 const source=parseRiderPerformanceCsv(sample);
 source.riders=Array.from({length:8},(_,index)=>({...source.riders[0],key:String(index),name:'Rider '+index}));
 const summary=summarizeRiderPerformance(source,{start:'2026-09-01',end:'2026-10-31'});
 const pages=buildPerformancePages(summary);assert.equal(pages.length,4);assert(pages.every(page=>page.riders.length<=6&&page.daily.length<=31));
 assert.equal(pages[0].daily.length+pages[1].daily.length,61);
});
test('existing courier access covers the new report, while unrelated limited accounts stay restricted',()=>{
 assert.equal(canAccessTab({role:'branch',permissions:['courier']},'riderPerformance'),true);
 assert.equal(canAccessTab({role:'branch',permissions:['riderPerformance']},'riderPerformance'),true);
 assert.equal(canAccessTab({role:'branch',permissions:['deliveredConverter']},'riderPerformance'),false);
});
