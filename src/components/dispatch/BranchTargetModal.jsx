import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Check, X, RotateCcw, Target, Users, Phone, UserCheck } from "lucide-react";
import {
  addDispatchTarget,
  updateDispatchTarget,
  deleteDispatchTarget,
  resetDefaultDispatchTargets,
  getDispatchTargets
} from "../../services/dispatchStorage.js";
import { getWhatsAppAccountKey } from "../../services/whatsappApi.js";

function formatPhoneNumber(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("94") && digits.length === 11) {
    return `+94 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length >= 9 && digits.length <= 12) {
    return `+${digits}`;
  }
  return phone;
}

export default function BranchTargetModal({ targets, onTargetsChange, onClose, session }) {
  const [newBranch, setNewBranch] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [newAssignedPhone, setNewAssignedPhone] = useState("");
  const [newAssignedName, setNewAssignedName] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editBranch, setEditBranch] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editAssignedPhone, setEditAssignedPhone] = useState("");
  const [editAssignedName, setEditAssignedName] = useState("");

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMembers() {
      setLoadingMembers(true);
      try {
        const accountKey = getWhatsAppAccountKey(session);
        const res = await fetch("/api/regional-dispatch/group-members", {
          headers: { "x-whatsapp-account": accountKey }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.participants)) {
            setMembers(data.participants);
          }
        }
      } catch (e) {
        console.warn("Failed to load group members:", e);
      } finally {
        setLoadingMembers(false);
      }
    }
    loadMembers();
  }, [session]);

  // Auto-migrate any previously saved targets where assigned_phone is an LID (>12 digits)
  useEffect(() => {
    if (members.length > 0 && targets.length > 0) {
      let changed = false;
      for (const t of targets) {
        const pStr = String(t.assigned_phone || "").replace(/\D/g, "");
        if (pStr.length > 13) {
          const match = members.find(m => 
            (m.lidJid && m.lidJid.includes(pStr)) || 
            (m.jid && m.jid.includes(pStr))
          );
          if (match && match.phone && match.phone !== t.assigned_phone) {
            updateDispatchTarget(t.id, {
              assigned_phone: match.phone,
              assigned_name: t.assigned_name === t.assigned_phone ? (match.name || match.formattedPhone) : t.assigned_name,
              assigned_jid: match.pnJid || `${match.phone}@s.whatsapp.net`,
              assigned_lid: match.lidJid || ""
            });
            changed = true;
          }
        }
      }
      if (changed) {
        onTargetsChange();
      }
    }
  }, [members, targets]);

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
      if (newAssignedPhone) {
        const current = getDispatchTargets();
        const created = current.find(t => t.branch_name.toLowerCase() === newBranch.trim().toLowerCase());
        if (created) {
          const found = members.find(m => m.phone === newAssignedPhone);
          updateDispatchTarget(created.id, {
            assigned_name: newAssignedName.trim() || (found?.name !== found?.phone ? found?.name : formatPhoneNumber(newAssignedPhone)),
            assigned_phone: newAssignedPhone.trim(),
            assigned_jid: found?.pnJid || `${newAssignedPhone.replace(/\D/g, "")}@s.whatsapp.net`,
            assigned_lid: found?.lidJid || ""
          });
        }
      }
      setNewBranch("");
      setNewTarget("");
      setNewAssignedPhone("");
      setNewAssignedName("");
      onTargetsChange();
    } catch (err) {
      setError(err.message || "Failed to add target.");
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditBranch(t.branch_name);
    setEditTarget(String(t.target || 0));
    setEditAssignedPhone(t.assigned_phone || "");
    setEditAssignedName(t.assigned_name || "");
  }

  function saveEdit(id) {
    setError("");
    const count = parseInt(editTarget || 0, 10);
    if (isNaN(count) || count < 0) {
      setError("Please enter a valid target count.");
      return;
    }

    try {
      const found = members.find(m => m.phone === editAssignedPhone);
      updateDispatchTarget(id, {
        branch_name: editBranch.trim(),
        target: count,
        assigned_name: editAssignedName.trim(),
        assigned_phone: editAssignedPhone.trim(),
        assigned_jid: editAssignedPhone ? (found?.pnJid || `${editAssignedPhone.replace(/\D/g, "")}@s.whatsapp.net`) : "",
        assigned_lid: found?.lidJid || ""
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
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-100 text-violet-700 shadow-inner">
              <Target className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-black text-[#071537]">Branch Targets & Group Members</h2>
              <p className="text-xs font-semibold text-blue-950/60">
                Assign WhatsApp group members to branches for automatic tagging and personal reminders
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
        <form onSubmit={handleAdd} className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-3.5">
          <div className="text-[11px] font-black uppercase tracking-wider text-violet-900 mb-2 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span>Add New Branch Target & In-Charge Member</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Branch (e.g. Kahawatte)"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              className="h-10 rounded-xl border border-white bg-white px-3 text-xs font-bold text-[#071537] outline-none focus:ring-2 focus:ring-violet-400"
            />
            <input
              type="number"
              min="0"
              placeholder="Target (e.g. 160)"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="h-10 rounded-xl border border-white bg-white px-3 text-xs font-bold text-[#071537] outline-none focus:ring-2 focus:ring-violet-400"
            />

            {/* Member selector */}
            <select
              value={newAssignedPhone}
              onChange={(e) => {
                const phone = e.target.value;
                setNewAssignedPhone(phone);
                const found = members.find(m => m.phone === phone);
                if (found && !newAssignedName) {
                  const defaultName = found.name && found.name !== found.phone && found.name !== found.formattedPhone
                    ? found.name
                    : found.formattedPhone || found.phone;
                  setNewAssignedName(defaultName);
                }
              }}
              className="h-10 rounded-xl border border-white bg-white px-2.5 text-xs font-bold text-[#071537] outline-none focus:ring-2 focus:ring-violet-400 truncate"
            >
              <option value="">-- Select Member --</option>
              {members.map((m) => {
                const phoneText = m.formattedPhone || (m.phone ? `+${m.phone}` : m.jid);
                const hasCustomName = m.name && m.name !== m.phone && m.name !== m.formattedPhone && m.name !== `+${m.phone}`;
                return (
                  <option key={m.jid || m.phone} value={m.phone}>
                    {phoneText} {hasCustomName ? `(${m.name})` : ""} {m.admin ? "⭐" : ""}
                  </option>
                );
              })}
            </select>

            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-black text-white shadow-md hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" />
              Add Target
            </button>
          </div>
          {newAssignedPhone && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">Member Name / Note:</span>
              <input
                type="text"
                placeholder="Optional display name (e.g. Kamal)"
                value={newAssignedName}
                onChange={(e) => setNewAssignedName(e.target.value)}
                className="h-8 flex-1 max-w-xs rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
              />
            </div>
          )}
        </form>

        {/* Targets Table */}
        <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 text-[11px] font-black uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Branch Name</th>
                <th className="px-3 py-2.5 text-right">Target</th>
                <th className="px-3 py-2.5">In-Charge (Member)</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-[#071537]">
              {targets.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-xs text-slate-400">
                    No branch targets configured. Click "Reset Defaults" or add branches above.
                  </td>
                </tr>
              ) : (
                targets.map((t, idx) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 text-xs text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      {editingId === t.id ? (
                        <input
                          type="text"
                          value={editBranch}
                          onChange={(e) => setEditBranch(e.target.value)}
                          className="h-8 w-full min-w-[120px] rounded-lg border border-violet-300 bg-white px-2 text-xs font-bold outline-none"
                        />
                      ) : (
                        <span className="font-extrabold text-slate-900">{t.branch_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {editingId === t.id ? (
                        <input
                          type="number"
                          min="0"
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          className="h-8 w-20 rounded-lg border border-violet-300 bg-white px-2 text-right text-xs font-bold outline-none"
                        />
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-800">
                          {t.target}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {editingId === t.id ? (
                        <div className="space-y-1">
                          <select
                            value={editAssignedPhone}
                            onChange={(e) => {
                              const phone = e.target.value;
                              setEditAssignedPhone(phone);
                              const found = members.find(m => m.phone === phone);
                              if (found && !editAssignedName) {
                                const defaultName = found.name && found.name !== found.phone && found.name !== found.formattedPhone
                                  ? found.name
                                  : found.formattedPhone || found.phone;
                                setEditAssignedName(defaultName);
                              }
                            }}
                            className="h-8 w-full max-w-[180px] rounded-lg border border-violet-300 bg-white px-2 text-xs font-bold outline-none"
                          >
                            <option value="">-- No Member --</option>
                            {members.map((m) => {
                              const phoneText = m.formattedPhone || (m.phone ? `+${m.phone}` : m.jid);
                              const hasCustomName = m.name && m.name !== m.phone && m.name !== m.formattedPhone && m.name !== `+${m.phone}`;
                              return (
                                <option key={m.jid || m.phone} value={m.phone}>
                                  {phoneText} {hasCustomName ? `(${m.name})` : ""} {m.admin ? "⭐" : ""}
                                </option>
                              );
                            })}
                          </select>
                          <input
                            type="text"
                            placeholder="Custom Name / Phone"
                            value={editAssignedName}
                            onChange={(e) => setEditAssignedName(e.target.value)}
                            className="h-7 w-full max-w-[180px] rounded border border-slate-200 px-2 text-[11px]"
                          />
                        </div>
                      ) : (
                        <div>
                          {t.assigned_phone || t.assigned_jid ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-xs font-black text-blue-700 border border-blue-200">
                              <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>{t.assigned_name && t.assigned_name !== t.assigned_phone ? t.assigned_name : formatPhoneNumber(t.assigned_phone)}</span>
                              {t.assigned_name && t.assigned_name !== t.assigned_phone && (
                                <span className="text-[10px] text-blue-500 font-semibold">
                                  ({formatPhoneNumber(t.assigned_phone)})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[11px] font-normal text-slate-400 italic">
                              Not assigned
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
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
