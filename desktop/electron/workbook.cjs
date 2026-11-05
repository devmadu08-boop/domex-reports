const ExcelJS = require('exceljs');
function makeWorkbook(rows) {
  if (!Array.isArray(rows) || rows.length > 10000 || rows.some(r => !Array.isArray(r) || r.length > 50)) throw Error('Invalid workbook data.');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('DOMEX Running Chart', {views:[{state:'frozen', ySplit:2, xSplit:2}]});
  for(const row of rows) sheet.addRow(row.map(cell => {
    if(typeof cell === 'number') return Number.isFinite(cell) ? cell : '';
    const text=String(cell ?? '').slice(0,16000);
    return /^[=+@-]/.test(text) ? "'"+text : text;
  }));
  sheet.eachRow((row,index) => { row.eachCell(cell => {
    cell.alignment={vertical:'middle',wrapText:true};
    if(index<=2){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF7C1026'}};cell.font={color:{argb:'FFFFFFFF'},bold:true};}
  }); });
  sheet.columns.forEach(column => {let width=14;column.eachCell(c=>width=Math.min(45,Math.max(width,String(c.value??'').length+2)));column.width=width;});
  if(sheet.rowCount>=2) sheet.autoFilter={from:{row:2,column:1},to:{row:sheet.rowCount,column:Math.max(1,sheet.columnCount)}};
  return book;
}
module.exports={makeWorkbook};
