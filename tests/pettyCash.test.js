import assert from "node:assert/strict";
import test from "node:test";
import { applyPettyCashEmployeeMappings, amountToWords, getPettyCashPageLayout, normalizeVehicleNumber, paginatePettyCashEntries, parsePettyCashCsv } from "../src/utils/pettyCash.js";

const SAMPLE = `Key,Value
CompanyName,Domex Pvt Ltd
TimeStamp,2026-08-12 17:28:37

No,Id,Status,Reference No,Payment Date,Branch Name,Payment Type Desc,Payment For,Cash Report No,Memo,Note,Value,Created Date,Created User,Vehicle No,Employee Name,From KMs,To KMs,KMs,OFD Report No,Reimbursement,Modified Date,Modified User
1,247369,Pending,VMID01000206439,"08/11/2026, 12:00:00 AM",Middeniya,Fuel Payment - Employee,200604904083,,MR . KAVINDU,,513.36,"08/12/2026, 08:44:56 AM",A.KAVINDU,BKZ 8841,A.KAVINDU,10848,10910,62,-,False,,`;

test("petty cash CSV parser maps official voucher fields", () => {
  const parsed = parsePettyCashCsv(SAMPLE);
  assert.equal(parsed.branchName, "Middeniya");
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].referenceNo, "VMID01000206439");
  assert.equal(parsed.entries[0].paymentDate, "2026-08-11");
  assert.equal(parsed.entries[0].totalKms, "62");
  assert.equal(parsed.entries[0].value, 513.36);
});

test("petty cash amount is converted to readable Sri Lankan words", () => {
  assert.equal(amountToWords(8282.56), "Sri Lankan Rupees Eight Thousand Two Hundred and Eighty Two and Cents Fifty Six Only");
});

test("petty cash vehicle mapping replaces incorrect CSV employee names", () => {
  const entries = [{ vehicleNo: "BKZ-8841", employeeName: "Wrong CSV Name" }];
  const mapped = applyPettyCashEmployeeMappings(entries, [{ vehicleNo: "bkz 8841", employeeName: "Correct Employee" }]);
  assert.equal(normalizeVehicleNumber("BKZ-8841"), "BKZ8841");
  assert.equal(mapped[0].employeeName, "Correct Employee");
});

test("petty cash keeps up to twenty vouchers on one A4 page", () => {
  assert.equal(paginatePettyCashEntries(Array.from({ length: 20 }), 20).length, 1);
  assert.equal(paginatePettyCashEntries(Array.from({ length: 21 }), 20).length, 2);
  assert.deepEqual(getPettyCashPageLayout(4), { rowHeight: 104, fontSize: 13 });
  assert.deepEqual(getPettyCashPageLayout(20), { rowHeight: 21, fontSize: 7.5 });
});
