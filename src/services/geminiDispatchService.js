/**
 * AI-Powered Unstructured Text Parser for Branch Dispatch Updates
 * Features:
 * - Sequential Gemini model fallback: gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash
 * - Robust Smart Local Regex Fallback (Offline Mode)
 */

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

/**
 * Normalizes text for comparison
 */
function normalizeName(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Smart Local Regex Fallback parser
 * Extracts branch dispatches by scanning lines for known branch names and associated numbers.
 */
export function parseDispatchWithRegex(rawText, configuredTargets = []) {
  if (!rawText || !rawText.trim()) {
    return { items: [], method: "regex", modelUsed: "local-regex", error: null };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const resultMap = new Map();
  const targetBranches = configuredTargets.map((t) => ({
    original: t.branch_name,
    normalized: normalizeName(t.branch_name),
    target: t.target || 0
  }));

  for (const line of lines) {
    // 1. Try matching known configured targets on this line
    let matchedBranch = null;

    for (const target of targetBranches) {
      if (!target.normalized) continue;
      const cleanLine = normalizeName(line);
      
      // Match exact or startsWith or contains
      if (cleanLine.includes(target.normalized)) {
        matchedBranch = target.original;
        break;
      }
    }

    // 2. Extract number from the line
    // Look for numbers like 250, 1,250, etc. (ignore potential dates/times if any)
    const numbers = line.match(/\b\d{1,5}\b/g);
    if (matchedBranch && numbers && numbers.length > 0) {
      // Pick the most likely number (usually the last number on the line)
      const dispatchCount = parseInt(numbers[numbers.length - 1], 10);
      if (!isNaN(dispatchCount)) {
        resultMap.set(matchedBranch, dispatchCount);
        continue;
      }
    }

    // 3. Fallback generic line regex: e.g. "Embilipitiya: 250", "Galle - 95", "Colombo 520"
    const genericMatch = line.match(/^([A-Za-z\s]+)[\s:\-—=]+(\d+)/);
    if (genericMatch) {
      const candidateName = genericMatch[1].trim();
      const count = parseInt(genericMatch[2], 10);
      if (candidateName && !isNaN(count)) {
        // Check if candidate matches any configured target closely
        const matched = targetBranches.find(
          (t) => t.normalized.includes(normalizeName(candidateName)) || normalizeName(candidateName).includes(t.normalized)
        );
        const finalBranch = matched ? matched.original : candidateName;
        resultMap.set(finalBranch, count);
      }
    }
  }

  const items = Array.from(resultMap.entries()).map(([branch, dispatch]) => ({
    branch,
    dispatch: Number(dispatch)
  }));

  return {
    items,
    method: "regex",
    modelUsed: "local-regex-fallback",
    error: null
  };
}

/**
 * Calls a single Gemini model with JSON schema instruction
 */
async function callGeminiModel(model, apiKey, prompt, branchNames) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = `You are an expert courier dispatch data extraction assistant for DOMEX Sri Lanka.
Your task is to extract courier branch dispatch counts from unstructured messages (copied from WhatsApp or SMS).
Configured Target Branch Names:
${branchNames.map((b) => `- "${b}"`).join("\n")}

Guidelines:
1. Extract every branch mentioned and its dispatch count (integer).
2. Fuzzy-match branch names against the configured Target Branch Names (e.g. typos, abbreviations like 'Cbo' -> 'Colombo', 'Embi' -> 'Embilipitiya', 'Kndy' -> 'Kandy', etc.).
3. If a branch is mentioned that is not in the list, still include its clean name.
4. Output MUST be STRICT valid JSON array of objects with keys "branch" (string) and "dispatch" (integer).
Example:
[
  { "branch": "Embilipitiya", "dispatch": 250 },
  { "branch": "Colombo", "dispatch": 520 }
]
Do not wrap in markdown or backticks, or if you do, ensure it parses as valid JSON.`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: `${systemInstruction}\n\nUnstructured Updates Text:\n"""\n${prompt}\n"""` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const errorObj = {
      status: response.status,
      statusText: response.statusText,
      message: errorBody
    };
    throw errorObj;
  }

  const data = await response.json();
  const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  // Clean potential markdown wrap
  const cleanJson = textOutput.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleanJson);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini response is not an array");
  }

  return parsed.map((item) => ({
    branch: String(item.branch || "").trim(),
    dispatch: parseInt(item.dispatch || 0, 10)
  })).filter((item) => item.branch && !isNaN(item.dispatch));
}

/**
 * Main parser function:
 * Sequentially executes Gemini models: gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash.
 * If all fail or API key is missing, seamlessly falls back to Smart Local Regex Fallback.
 */
export async function parseDispatchText(rawText, configuredTargets = [], apiKey = "") {
  if (!rawText || !rawText.trim()) {
    return { items: [], method: "empty", modelUsed: "none" };
  }

  const branchNames = configuredTargets.map((t) => t.branch_name).filter(Boolean);

  // If no API key provided, immediately use Smart Local Regex Fallback
  if (!apiKey || !apiKey.trim()) {
    const fallback = parseDispatchWithRegex(rawText, configuredTargets);
    return {
      ...fallback,
      warning: "No Gemini API key configured. Processed using Smart Local Regex Fallback."
    };
  }

  const cleanApiKey = apiKey.trim();
  const errors = [];

  // Try sequential fallback chain
  for (const model of GEMINI_MODELS) {
    try {
      const items = await callGeminiModel(model, cleanApiKey, rawText, branchNames);
      return {
        items,
        method: "gemini",
        modelUsed: model,
        error: null
      };
    } catch (err) {
      console.warn(`[AutoDispatch] Gemini model ${model} failed:`, err);
      errors.push({ model, error: err?.message || String(err) });
    }
  }

  // All Gemini models failed: use Smart Local Regex Fallback
  const fallbackResult = parseDispatchWithRegex(rawText, configuredTargets);
  return {
    ...fallbackResult,
    warning: `Gemini API fallback triggered. Models failed (${errors.map(e => e.model).join(", ")}). Result extracted using offline regex matching.`,
    errors
  };
}

/**
 * Helper to test a Gemini API Key quickly
 */
export async function testGeminiApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, message: "Please provide an API key." };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "ping" }] }]
      })
    });

    if (res.ok) {
      return { ok: true, message: "Google Gemini API key is valid and working!" };
    }
    const errText = await res.text();
    return { ok: false, message: `API Key error (${res.status}): ${errText.slice(0, 150)}` };
  } catch (err) {
    return { ok: false, message: `Network / Connection error: ${err.message}` };
  }
}
