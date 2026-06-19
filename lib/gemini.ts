const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const NEXUS_URL = 'https://nexus-ai-tobh.onrender.com/ask';
const NEXUS_KEY = process.env.NEXUS_API_KEY || 'dt-ask';

export async function askGemini(prompt: string): Promise<string> {
  // ── STEP 1: Try NexusAI Gateway First ──
  // If the user has their own API key, bypass NexusAI entirely for maximum speed and token allowance.
  if (!GEMINI_API_KEY) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(NEXUS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': NEXUS_KEY },
        body: JSON.stringify({ prompt, provider: 'auto', max_tokens: 8192 }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json() as { response?: string };
        if (data.response) return data.response;
      }
    } catch (error) {
      console.warn('NexusAI failed or timed out (cold start). Falling back to direct Gemini API.');
    }
  }

  // ── STEP 2: Safe Fallback to Direct Gemini ──
  if (!GEMINI_API_KEY) {
    return 'NexusAI is waking up and GEMINI_API_KEY is not configured. Please wait 40 seconds for the free AI to wake up and try again.';
  }

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return `Gemini API error: ${err}`;
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response from Gemini';
  } catch (error) {
    return `Error calling Gemini: ${error}`;
  }
}
