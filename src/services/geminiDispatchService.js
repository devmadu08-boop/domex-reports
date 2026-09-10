function normalizeName(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
    let matchedBranch = null;

    for (const target of targetBranches) {
      if (!target.normalized) continue;
      const cleanLine = normalizeName(line);
      
      if (cleanLine.includes(target.normalized)) {
        matchedBranch = target.original;
        break;
      }
    }

    const numbers = line.match(/\b\d{1,5}\b/g);
    if (matchedBranch && numbers && numbers.length > 0) {
      const dispatchCount = parseInt(numbers[numbers.length - 1], 10);
      if (!isNaN(dispatchCount)) {
        resultMap.set(matchedBranch, dispatchCount);
        continue;
      }
    }

    const genericMatch = line.match(/^([A-Za-z\s]+)[\s:\-—=]+(\d+)/);
    if (genericMatch) {
      const candidateName = genericMatch[1].trim();
      const count = parseInt(genericMatch[2], 10);
      if (candidateName && !isNaN(count)) {
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

const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-ultra:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.0-flash-thinking-exp:free"
];

export async function testGeminiApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, message: "Please provide an API key." };
  }

  const cleanKey = apiKey.trim();

  // 1. First verify key authenticity using OpenRouter auth check
  try {
    const authRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { "Authorization": `Bearer ${cleanKey}` }
    });
    if (authRes.ok) {
      const authData = await authRes.json();
      const label = authData?.data?.label ? ` (${authData.data.label})` : "";
      return { ok: true, message: `OpenRouter API key is valid and connected${label}! Free model ready.` };
    }
  } catch {
    // If auth endpoint encounters network/CORS, continue to test completions
  }

  // 2. Direct completion test with free model and low max_tokens (to avoid 402 errors)
  const url = "https://openrouter.ai/api/v1/chat/completions";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model: OPENROUTER_MODELS[0],
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 15
      })
    });

    if (res.ok) {
      return { ok: true, message: "OpenRouter API key is valid and working with Free models!" };
    }
    const errText = await res.text();
    return { ok: false, message: `API Key error (${res.status}): ${errText.slice(0, 150)}` };
  } catch (err) {
    return { ok: false, message: `Network / Connection error: ${err.message}` };
  }
}

async function callOpenRouterModel(model, apiKey, text, branchNames) {
  const prompt = `Extract dispatch counts from the following text.\nBranches available: ${branchNames.join(", ")}\n\nText:\n${text}\n\nReturn a valid JSON array exactly matching this format: [{"branch": "Branch Name", "dispatch": 123}]. If none found, return []. Do NOT include markdown blocks.`;

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500
    })
  });

  if (!res.ok) {
    throw new Error(`OpenRouter API error ${res.status}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content || "[]";
  let cleanContent = rawContent.replace(/```json/gi, "").replace(/```/g, "").trim();
  
  const parsed = JSON.parse(cleanContent);
  if (!Array.isArray(parsed)) {
    throw new Error("OpenRouter response is not an array");
  }

  return parsed.map((item) => ({
    branch: String(item.branch || "").trim(),
    dispatch: parseInt(item.dispatch || 0, 10)
  })).filter((item) => item.branch && !isNaN(item.dispatch));
}

export async function parseDispatchText(rawText, configuredTargets = [], apiKey = "") {
  if (!rawText || !rawText.trim()) {
    return { items: [], method: "empty", modelUsed: "none" };
  }

  const branchNames = configuredTargets.map((t) => t.branch_name).filter(Boolean);

  if (!apiKey || !apiKey.trim()) {
    const fallback = parseDispatchWithRegex(rawText, configuredTargets);
    return {
      ...fallback,
      warning: "No OpenRouter API key configured. Processed using Smart Local Regex Fallback."
    };
  }

  const cleanApiKey = apiKey.trim();
  const errors = [];

  for (const model of OPENROUTER_MODELS) {
    try {
      const items = await callOpenRouterModel(model, cleanApiKey, rawText, branchNames);
      return {
        items,
        method: "ai",
        modelUsed: model,
        warning: null
      };
    } catch (err) {
      errors.push(`${model}: ${err.message}`);
    }
  }

  console.warn("All OpenRouter models failed:", errors);
  const fallback = parseDispatchWithRegex(rawText, configuredTargets);
  return {
    ...fallback,
    warning: "AI parsing failed. Automatically used Smart Local Regex Fallback.",
    errors
  };
}
