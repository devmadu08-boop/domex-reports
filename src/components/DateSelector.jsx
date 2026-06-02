import { CalendarDays, Search } from "lucide-react";
import { displayDate } from "../utils/date.js";

export default function DateSelector({ selectedDate, onDateChange, searchDate, onSearchDateChange, onSearch }) {
  return (
    <div className="glass-panel grid gap-4 p-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end md:p-6">
      <label className="grid gap-2">
        <span className="text-sm font-black text-[#071537]">Report Date</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-emerald-600 text-white shadow-lg">
            <CalendarDays className="h-5 w-5" />
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-14 w-full rounded-2xl border border-white/80 bg-white/65 pl-14 pr-3 text-base font-black text-[#071537] shadow-inner outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100"
          />
        </div>
        <span className="text-xs font-semibold text-stone-500">{displayDate(selectedDate)}</span>
      </label>

      <div className="hidden h-16 w-px bg-blue-950/20 md:block" />

      <label className="grid gap-2">
        <span className="text-sm font-black text-[#071537]">Search Old Report</span>
        <input
          type="date"
          value={searchDate}
          onChange={(event) => onSearchDateChange(event.target.value)}
          className="h-14 w-full rounded-2xl border border-white/80 bg-white/65 px-5 text-base font-bold text-[#071537] shadow-inner outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
        />
      </label>

      <button
        type="button"
        onClick={onSearch}
        className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl border border-white/70 bg-gradient-to-br from-blue-600 to-violet-700 px-8 text-base font-black text-white shadow-xl shadow-blue-300/50 transition hover:-translate-y-0.5"
      >
        <Search className="h-5 w-5" />
        Search
      </button>
    </div>
  );
}
