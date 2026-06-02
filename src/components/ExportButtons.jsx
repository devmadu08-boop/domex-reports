import { Download, FileDown, Files } from "lucide-react";

export default function ExportButtons({
  onCourierPng,
  onCourierPdf,
  onOperationPng,
  onOperationPdf,
  onBothPdf,
  disabled,
}) {
  const buttonClass =
    "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/65 bg-gradient-to-br px-4 py-3 text-sm font-extrabold text-white shadow-xl transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <button type="button" disabled={disabled} onClick={onCourierPng} className={`${buttonClass} from-emerald-700 to-green-400 shadow-emerald-300/60`}>
        <Download className="h-5 w-5" />
        Courier PNG
      </button>
      <button type="button" disabled={disabled} onClick={onCourierPdf} className={`${buttonClass} from-red-500 to-rose-600 shadow-red-300/60`}>
        <FileDown className="h-5 w-5" />
        Courier PDF
      </button>
      <button type="button" disabled={disabled} onClick={onOperationPng} className={`${buttonClass} from-teal-600 to-emerald-500 shadow-emerald-300/60`}>
        <Download className="h-5 w-5" />
        Operation PNG
      </button>
      <button type="button" disabled={disabled} onClick={onOperationPdf} className={`${buttonClass} from-red-500 to-pink-500 shadow-red-300/60`}>
        <FileDown className="h-5 w-5" />
        Operation PDF
      </button>
      <button type="button" disabled={disabled} onClick={onBothPdf} className={`${buttonClass} from-blue-700 to-violet-700 shadow-blue-300/60 sm:col-span-2 xl:col-span-1`}>
        <Files className="h-5 w-5" />
        Both PDF
      </button>
    </div>
  );
}
