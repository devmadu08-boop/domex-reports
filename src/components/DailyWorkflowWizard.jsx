import { ArrowRight, CalendarDays, Check, Circle, FileCheck2, PackageCheck, Send, Truck } from "lucide-react";
import { displayDate } from "../utils/date.js";

export default function DailyWorkflowWizard({ date, steps, onOpen }) {
  const completed = steps.filter((step) => step.complete).length;
  const percent = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const nextStep = steps.find((step) => !step.complete);

  return (
    <section id="daily-workflow" className="daily-workflow frosted-card">
      <div className="dashboard-panel-heading">
        <span className="panel-icon"><CalendarDays size={21} /></span>
        <div><h2>Today’s Workflow</h2><p>{displayDate(date)}</p></div>
        <div className="workflow-progress" role="progressbar" aria-label="Daily workflow completion"
          aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <small className="workflow-percent">{percent}% Complete</small>
      </div>
      <div className="workflow-steps">
        {steps.map((step, index) => (
          <button key={step.id} type="button" onClick={() => onOpen(step.tab)}
            className={`workflow-step ${step.complete ? "is-complete" : step.id === nextStep?.id ? "is-next" : ""}`}>
            <span className="workflow-number">{index + 1}</span>
            <span className="workflow-step-icon">{step.complete ? <Check size={20} /> : <WorkflowIcon type={step.id} />}</span>
            <span className="workflow-step-copy"><strong>{step.label}</strong><small>{step.helper}</small></span>
            <span className="workflow-step-status">
              {step.complete ? "Completed" : step.id === nextStep?.id ? <>Do Now<ArrowRight size={13} /></> : "Pending"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function WorkflowIcon({ type }) {
  const Icon = { delivered: FileCheck2, courier: Truck, operation: PackageCheck, send: Send }[type] || Circle;
  return <Icon size={19} />;
}
