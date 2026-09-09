import { useState } from "react";
import { Plus, Trash2, Edit2, Check, X, RotateCcw, Target } from "lucide-react";
import {
  addDispatchTarget,
  updateDispatchTarget,
  deleteDispatchTarget,
  resetDefaultDispatchTargets
} from "../../services/dispatchStorage.js";

export default function BranchTargetModal({ targets, onTargetsChange, onClose }) {
  const [newBranch, setNewBranch] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editBranch, setEditBranch] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [error, setError] = useState("");

  function handleAdd(e) {
    e.preventDefault();
    setError("");
    if (!newBranch.trim()) {
      setError("Please enter a branch name.");
      return;
    }
    const count = parseInt(newTarget || 0, 10);
    if (isNaN(count) || count < 0) {
      setError("Please enter a valid target number.");
      return;
    }

    try {
      addDispatchTarget(newBranch.trim(), count);
      setNewBranch("");
      setNewTarget("");
      onTargetsChange();
    } catch (err) {
      setError(err.message || "Failed to add target.");
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditBranch(t.branch_name);
    setEditTarget(String(t.target || 0));
  }

  function saveEdit(id) {
    setError("");
    const count = parseInt(editTarget || 0, 10);
    if (isNaN(count) || count < 0) {
      setError("Please enter a valid target count.");
      return;
    }

    try {
      updateDispatchTarget(id, {
        branch_name: editBranch.trim(),
        target: count
      });
      setEditingId(null);
      onTargetsChange();
    } catch (err) {
      setError(err.message || "Failed to update target.");
    }
  }

  function handleDelete(id, name) {
    if (!confirm(`Are you sure you want to delete target for "${name}"?`)) return;
    deleteDispatchTarget(id);
    onTargetsChange();
  }

  function handleReset() {
    if (!confirm("Reset all targets to DOMEX standard default branches?")) return;
    resetDefaultDispatchTargets();
    onTargetsChange();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100 text-violet-700 shadow-inner">
              <Target className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-black text-[#071537]">Branch Target Configuration</h2>
              <p className="text-xs font-semibold text-blue-950/60">
                Configure daily dispatch targets for regional branches
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700">
            {error}
          </div>
        )}

        {/* Add new target form */}
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
          <input
            type="text"
            placeholder="Branch name (e.g. Embilipitiya)"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            className="h-11 flex-1 min-w-[160px] rounded-xl border border-white bg-white px-3 text-sm font-bold text-[#071537] outline-none focus:ring-2 focus:ring-violet-400"
          />
          <input
            type="number"
            min="0"
            placeholder="Target"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            className="h-11 w-28 rounded-xl border border-white bg-white px-3 text-sm font-bold text-[#071537] outline-none focus:ring-2 focus:ring-violet-400"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-black text-white shadow-md hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            Add Target
          </button>
        </form>

        {/* Targets Table */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 text-xs font-black uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Branch Name</th>
                <th className="px-4 py-3 text-right">Target</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-[#071537]">
              {targets.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-xs text-slate-400">
                    No branch targets configured. Click "Reset Defaults" or add branches above.
                  </td>
                </tr>
              ) : (
                targets.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      {editingId === t.id ? (
                        <input
                          type="text"
                          value={editBranch}
                          onChange={(e) => setEditBranch(e.target.value)}
                          className="h-9 w-full rounded-lg border border-violet-300 bg-white px-2 text-sm font-bold outline-none"
                        />
                      ) : (
                        <span>{t.branch_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === t.id ? (
                        <input
                          type="number"
                          min="0"
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          className="h-9 w-24 rounded-lg border border-violet-300 bg-white px-2 text-right text-sm font-bold outline-none"
                        />
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-800">
                          {t.target}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === t.id ? (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => saveEdit(t.id)}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            title="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(t.id, t.branch_name)}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to DOMEX Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#071537] px-5 py-2 text-xs font-black text-white shadow hover:bg-slate-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
