export function CourierPerformanceReport({ selectedDate, rows, reportRef, companyName = "Domestic Express (pvt) ltd", branchName = "" }) {
  const displayRows = rows.length > 0 ? rows : Array.from({ length: 5 }, (_, index) => ({ id: `empty-${index}` }));

  return (
    <div ref={reportRef} className="report-paper w-full min-w-[820px]">
      <p className="report-company">{companyName}</p>
      <h2 className="report-title text-2xl">Branch Courier Performance Report</h2>
      {branchName && <p className="report-branch">Branch: {branchName}</p>}
      <table className="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Courier Name</th>
            <th>On Route Count</th>
            <th>Delivery Count</th>
            <th>Resend Count</th>
            <th>Delivery %</th>
            <th>Pickup Count</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => (
            <tr key={row.id}>
              <td>{row.courierName ? selectedDate : ""}</td>
              <td>{row.courierName || ""}</td>
              <td>{row.courierName ? row.onRouteCount || 0 : ""}</td>
              <td>{row.courierName ? row.deliveryCount || 0 : ""}</td>
              <td>{row.courierName ? row.resendCount || 0 : ""}</td>
              <td>{row.courierName ? `${row.deliveryPercent}%` : ""}</td>
              <td>{row.courierName ? row.pickupCount || 0 : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OperationReport({ selectedDate, operation, reportRef, companyName = "Domestic Express (pvt) ltd", branchName = "" }) {
  const data = operation || {};
  const totalPercent =
    data.totalPercent ||
    (parsePercent(data.sameDayPercent) + parsePercent(data.firstDayPercent)).toFixed(2);

  return (
    <div ref={reportRef} className="report-paper w-full min-w-[820px]">
      <p className="report-company">{companyName}</p>
      <h2 className="report-title text-2xl">Operation Report</h2>
      {branchName && <p className="report-branch">Branch: {branchName}</p>}
      <table className="report-table">
        <thead>
          <tr>
            <th rowSpan="2">Date</th>
            <th colSpan="4">Delivery</th>
            <th colSpan="2">Missed Route</th>
            <th colSpan="2">Dispatch</th>
          </tr>
          <tr>
            <th>Inward</th>
            <th>Same Day %</th>
            <th>1St day %</th>
            <th>Total %</th>
            <th>Outward</th>
            <th>M/Route Count</th>
            <th>Target</th>
            <th>Achievement %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{selectedDate}</td>
            <td>{data.inward || data.inword || ""}</td>
            <td>{data.sameDayPercent || ""}</td>
            <td>{data.firstDayPercent || ""}</td>
            <td>{operation ? totalPercent : ""}</td>
            <td>{data.outward || data.outWord || ""}</td>
            <td>{data.missedRouteCount || ""}</td>
            <td>{data.target || ""}</td>
            <td>{data.achievement ? `${data.achievement}%` : ""}</td>
          </tr>
          <tr>
            <td colSpan="9">&nbsp;</td>
          </tr>
          <tr>
            <td colSpan="9">&nbsp;</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function parsePercent(value) {
  const parsed = parseFloat(String(value || "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
