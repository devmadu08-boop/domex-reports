import { ArchiveRestore, CloudUpload, History, Redo2, Undo2 } from "lucide-react";

export default function SystemRecoveryPanel({
  versions,
  undoCount,
  redoCount,
  busy,
  onUndo,
  onRedo,
  onCreateVersion,
  onSwitchVersion,
}) {
  return (
    <section className="glass-panel p-4">
      <div className="mb-4">
        <p className="text-xs font-black uppercase text-violet-600">Admin recovery</p>
        <h2 className="text-xl font-black text-[#071537]">Undo & System Versions</h2>
        <p className="mt-1 text-sm font-semibold text-blue-950/65">
          Switch all Firebase branch data, settings, riders, users, and reports between saved versions. The current state is preserved before every switch.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={onUndo} disabled={!undoCount || busy} className="primary-action primary-action-blue disabled:cursor-not-allowed disabled:opacity-45">
          <Undo2 className="h-5 w-5" />
          Undo ({undoCount})
        </button>
        <button type="button" onClick={onRedo} disabled={!redoCount || busy} className="primary-action primary-action-red disabled:cursor-not-allowed disabled:opacity-45">
          <Redo2 className="h-5 w-5" />
          Redo ({redoCount})
        </button>
        <button type="button" onClick={onCreateVersion} disabled={busy} className="primary-action primary-action-green disabled:cursor-not-allowed disabled:opacity-45">
          <CloudUpload className="h-5 w-5" />
          Create Checkpoint
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {versions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50 p-4 text-sm font-bold text-violet-800">
            No cloud versions yet. Create the first v1.0 checkpoint.
          </div>
        ) : (
          versions.map((version, index) => (
            <div key={version.id} className="grid gap-3 rounded-2xl border border-white bg-[#fffaf7] p-3 shadow-sm md:grid-cols-[auto_1fr_auto] md:items-center">
              <span className="grid h-12 min-w-16 place-items-center rounded-xl bg-violet-100 px-3 text-base font-black text-violet-700">
                {version.name}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-[#071537]">{version.label || "System checkpoint"}</span>
                <span className="block text-xs font-bold text-blue-950/55">
                  {new Date(version.createdAt).toLocaleString()} {index === 0 ? "- Latest checkpoint" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onSwitchVersion(version)}
                disabled={busy}
                className="secondary-action disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ArchiveRestore className="h-4 w-4" />
                Switch to {version.name}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
        <History className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Version switching changes all saved operational data across branches. Application source code remains on the current secure deployment.
        </p>
      </div>
    </section>
  );
}
