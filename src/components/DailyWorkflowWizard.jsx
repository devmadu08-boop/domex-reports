import { ArrowRight, Check, Circle, FileCheck2, PackageCheck, Send, Truck } from "lucide-react";

export default function DailyWorkflowWizard({ date, steps, onOpen }) {
  const completed = steps.filter((step) => step.complete).length;
  const percent = Math.round((completed / steps.length) * 100);
  const nextStep = steps.find((step) => !step.complete);

  return (
    <section className="glass-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-violet-600">Daily workflow - {date}</p>
          <h2 className="text-xl font-black text-[#071537]">Complete Today&apos;s Reports</h2>
        </div>
        <span className="rounded-full bg-violet-100 px-4 py-2 text-sm font-black text-violet-700">{percent}% complete</span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100">
        <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-4 grid gap-2">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onOpen(step.tab)}
            className={`grid min-h-14 w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border px-3 text-left transition ${
              step.complete
                ? "border-emerald-100 bg-emerald-50"
                : step.id === nextStep?.id
                  ? "border-violet-300 bg-violet-100 shadow-[6px_7px_16px_rgba(112,78,190,0.15)]"
                  : "border-white bg-[#fffaf7]"
            }`}
          >
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${step.complete ? "bg-emerald-500 text-white" : "bg-white text-violet-600"}`}>
              {step.complete ? <Check className="h-5 w-5" /> : <WorkflowIcon type={step.id} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-[#071537]">{index + 1}. {step.label}</span>
              <span className="block truncate text-xs font-bold text-blue-950/55">{step.helper}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-violet-500" />
          </button>
        ))}
      </div>
    </section>
  );
}

function WorkflowIcon({ type }) {
  if (type === "delivered") return <FileCheck2 className="h-5 w-5" />;
  if (type === "courier") return <Truck className="h-5 w-5" />;
  if (type === "operation") return <PackageCheck className="h-5 w-5" />;
  if (type === "send") return <Send className="h-5 w-5" />;
  return <Circle className="h-5 w-5" />;
}
