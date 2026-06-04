import { CalendarDays, Search } from "lucide-react";
import { displayDate } from "../utils/date.js";

export default function DateSelector({ selectedDate, onDateChange, searchDate, onSearchDateChange, onSearch }) {
  return (
    <div className="report-filter-card grid gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] lg:items-end lg:p-6">
      <span className="hidden h-16 w-16 place-items-center rounded-[22px] bg-[#fff8f4] text-violet-500 shadow-[8px_8px_18px_rgba(128,104,178,0.18),-8px_-8px_18px_rgba(255,255,255,0.9)] lg:grid">
        <CalendarDays className="h-8 w-8" />
      </span>
      <label className="grid gap-2">
        <span className="text-sm font-black text-[#15143b]">Report Date</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg md:hidden">
            <CalendarDays className="h-5 w-5" />
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-14 w-full rounded-[18px] border border-[#e5d8f4] bg-[#fff8f4] pl-14 pr-3 text-base font-black text-[#15143b] shadow-[inset_5px_5px_11px_rgba(128,104,178,0.13),inset_-5px_-5px_11px_rgba(255,255,255,0.9)] outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 lg:pl-5"
          />
        </div>
        <span className="text-xs font-semibold text-[#6e6496]">{displayDate(selectedDate)}</span>
      </label>

      <div className="hidden h-16 w-px bg-violet-900/12 lg:block" />

      <label className="grid gap-2">
        <span className="text-sm font-black text-[#15143b]">Search Old Report</span>
        <input
          type="date"
          value={searchDate}
          onChange={(event) => onSearchDateChange(event.target.value)}
          className="h-14 w-full rounded-[18px] border border-[#e5d8f4] bg-[#fff8f4] px-5 text-base font-bold text-[#15143b] shadow-[inset_5px_5px_11px_rgba(128,104,178,0.13),inset_-5px_-5px_11px_rgba(255,255,255,0.9)] outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />
      </label>

      <button
        type="button"
        onClick={onSearch}
        className="inline-flex h-14 items-center justify-center gap-3 rounded-[20px] border border-white/70 bg-gradient-to-br from-violet-500 to-purple-600 px-8 text-base font-black text-white shadow-xl shadow-violet-300/60 transition hover:-translate-y-0.5"
      >
        <Search className="h-5 w-5" />
        Search
      </button>
    </div>
  );
}
