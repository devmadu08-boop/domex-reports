import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {makeWorkbook}=require('../desktop/electron/workbook.cjs');
test('desktop Excel exports preserve numeric cells, style headers and neutralize formulas',async()=>{
  const book=makeWorkbook([['DOMEX'],['Date','KM'],['=UNTRUSTED',50]]);
  const buffer=await book.xlsx.writeBuffer();
  const ExcelJS=require('../desktop/electron/node_modules/exceljs');
  const decoded=await new ExcelJS.Workbook().xlsx.load(buffer);
  assert.equal(decoded.worksheets[0].getCell('A3').value,"'=UNTRUSTED");
  assert.equal(decoded.worksheets[0].getCell('B3').value,50);
  assert.equal(decoded.worksheets[0].getCell('A1').font.bold,true);
  assert.throws(()=>makeWorkbook({}),/Invalid/);
  assert.throws(()=>makeWorkbook([new Array(51)]),/Invalid/);
});
