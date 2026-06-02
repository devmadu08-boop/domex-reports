export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function displayDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(`${date}T00:00:00`));
}
