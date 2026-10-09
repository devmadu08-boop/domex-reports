export function todayIso() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function displayDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(`${date}T00:00:00`));
}
