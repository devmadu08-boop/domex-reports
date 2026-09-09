import { useState } from "react";
import { Sparkles, Bot, FileText, AlertTriangle, KeyRound, Check, RefreshCw, CheckCircle2 } from "lucide-react";
import { testGeminiApiKey } from "../../services/geminiDispatchService.js";

const SAMPLE_TEXT = `DOMEX Branch Dispatch Updates:
Embilipitiya 240
Colombo: 530
Kandy - 320
Galle 265
Middeniya 160
Tangalle: 195
Matara - 210
Kurunegala 285
Negombo: 290
Gampaha 340`;

export default function DispatchProcessor({
  rawText,
  onRawTextChange,
  onProcess,
  processing,
  processMeta,
  apiKey,
  onSaveApiKey
}) {
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey || "");
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState(null);

  function handlePasteSample() {
    onRawTextChange(SAMPLE_TEXT);
  }

  function handleClear() {
    onRawTextChange("");
  }

  async function handleTestKey() {
    setTestingKey(true);
    setTestResult(null);
    const res = await testGeminiApiKey(tempKey);
    setTestResult(res);
    setTestingKey(false);
  }

  function handleSaveKeySubmit() {
    onSaveApiKey(tempKey.trim());
    setShowKeyModal(false);
  }

  return (
    <div className="glass-panel p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/60">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-200">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-black text-[#071537]">Unstructured Text Parser</h3>
            <p className="text-xs font-bold text-blue-950/60">
              Paste raw branch dispatch updates from WhatsApp or SMS
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTempKey(apiKey || "");
              setTestResult(null);
              setShowKeyModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white/70 px-3 py-1.5 text-xs font-black text-violet-800 shadow-sm transition hover:bg-violet-100"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {apiKey ? "Gemini Key Configured" : "Set Gemini API Key"}
          </button>

          <button
            type="button"
            onClick={handlePasteSample}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <FileText className="h-3.5 w-3.5" />
            Paste Sample
          </button>
          {rawText && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border border-red-200 bg-white/70 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
          placeholder={`Paste text here, for example:\nEmbilipitiya 250\nColombo 520\nKandy: 180\nGalle - 95`}
          className="w-full resize-y rounded-2xl border border-white/80 bg-white/80 p-3.5 font-mono text-sm font-semibold text-[#071537] shadow-inner outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {processMeta?.method === "gemini" && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-1 font-black text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Parsed by AI ({processMeta.modelUsed})
            </span>
          )}
          {processMeta?.method === "regex" && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-1 font-black text-amber-800">
              <Bot className="h-3.5 w-3.5" />
              Parsed with Smart Regex Fallback
            </span>
          )}
          {processMeta?.warning && (
            <span className="text-amber-800 font-medium">
              {processMeta.warning}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onProcess}
          disabled={processing || !rawText?.trim()}
          className="primary-action primary-action-blue min-h-11 px-6 shadow-md transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Sparkles className={`h-4 w-4 ${processing ? "animate-spin" : ""}`} />
          {processing ? "Processing Dispatch Data..." : "Process Dispatch Data"}
        </button>
      </div>

      {/* Inline API Key Fix / Config Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-100 text-violet-700">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h4 className="text-base font-black text-[#071537]">Google Gemini API Key</h4>
                <p className="text-xs font-semibold text-blue-950/60">
                  Used for sequential multi-model parsing (2.5 &rarr; 2.0 &rarr; 1.5)
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-black uppercase text-slate-600">
                API Key
              </label>
              <input
                type="text"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="AIzaSy..."
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs font-bold text-[#071537] outline-none focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Get a free key from{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-violet-600 underline"
                >
                  Google AI Studio
                </a>. If left blank or if an error occurs, the system automatically uses the offline Smart Regex Fallback.
              </p>
            </div>

            {testResult && (
              <div
                className={`mt-3 rounded-xl p-3 text-xs font-bold ${
                  testResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                }`}
              >
                {testResult.message}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testingKey || !tempKey.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testingKey ? "animate-spin" : ""}`} />
                Test Key
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveKeySubmit}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-xs font-black text-white shadow hover:bg-violet-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
