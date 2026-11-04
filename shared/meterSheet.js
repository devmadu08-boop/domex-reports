export const METER_OFF_DAYS = ["SUNDAY", "HOLIDAY", "LEAVE"];
export function fuelEfficiency(type) {
  return /lorry|truck|van/i.test(type) ? 15.845 : /three|wheel|tuk/i.test(type) ? 20 : 50;
}
export function meterMetrics(entry, rider, price) {
  if (!entry || METER_OFF_DAYS.includes(entry.status)) return { km: 0, liters: 0, cost: 0 };
  const value = v => v !== null && v !== undefined && String(v).trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : NaN;
  const start = value(entry.in_meter), end = value(entry.out_meter);
  const km = entry.meter_broken ? value(entry.manual_km) : end - start;
  const efficiency = value(rider.km_per_liter || fuelEfficiency(rider.vehicle_type));
  const amount = value(price ?? rider.petrol_price);
  if (!Number.isFinite(km) || km < 0) throw new Error("Enter valid meter readings. OUT must be at least IN; use manual KM for a broken meter.");
  if (!(efficiency > 0) || !Number.isFinite(amount)) throw new Error("Fuel efficiency must be positive and fuel price cannot be negative.");
  return { km, liters: km / efficiency, cost: Math.round(km / efficiency * amount * 100) / 100 };
}
export function validateMeterChanges(previous, rider) {
  const readings = [];
  for (const [month, sheet] of Object.entries(rider.months || {})) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !sheet || typeof sheet.days !== "object") throw new Error("Invalid month sheet.");
    for (const [day, entry] of Object.entries(sheet.days || {})) {
      const date = month + "-" + day.padStart(2, "0");
      const parsed = new Date(date + "T00:00:00Z");
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Invalid sheet date.");
      const changed = JSON.stringify(entry) !== JSON.stringify(previous?.months?.[month]?.days?.[day]);
      if (changed) meterMetrics(entry, rider, sheet.petrol_price);
      if (!entry.meter_broken && !METER_OFF_DAYS.includes(entry.status) && entry.in_meter != null && entry.out_meter != null && String(entry.in_meter).trim() !== "" && String(entry.out_meter).trim() !== "") readings.push({ date, start: Number(entry.in_meter), end: Number(entry.out_meter), changed });
    }
  }
  readings.sort((a,b) => a.date.localeCompare(b.date));
  for (let i=0;i<readings.length;i++) {
    const r=readings[i];
    if (r.changed && ((i>0 && r.start < readings[i-1].end) || (i+1<readings.length && r.end > readings[i+1].start))) throw new Error("Meter readings conflict with the previous or next saved day.");
  }
}
