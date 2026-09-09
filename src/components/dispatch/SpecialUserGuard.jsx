import { ShieldAlert, ArrowLeft } from "lucide-react";
import { isSpecialDispatchUser } from "../../permissions.js";

export default function SpecialUserGuard({ session, onBack, children }) {
  const authorized = isSpecialDispatchUser(session);

  if (!authorized) {
    return (
      <div className="min-h-[450px] grid place-items-center rounded-3xl border border-red-200 bg-red-50/50 p-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-red-100 text-red-600 shadow-inner">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-700">
            403 - Access Denied
          </span>
          <h2 className="mt-3 text-2xl font-black text-[#071537]">Restricted Module</h2>
          <p className="mt-2 text-sm font-semibold text-blue-950/70">
            You do not have permission to access Auto-Dispatch Operations &amp; Branch Analytics.
            This module is strictly restricted to Regional Managers and Administrators.
          </p>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return children;
}
