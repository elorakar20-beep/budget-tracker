export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Only POST requests allowed' });
  }

  // Look for the API key in standard secure Vercel environment variables
  const apiKey = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === 'YOUR_GOOGLE_AI_API_KEY_HERE') {
    return response.status(401).json({ error: 'Backend is missing configured Google AI API Key.' });
  }

  try {
    const { prompt } = request.body;
    
    // SECURITY 1: Strict type and presence validation
    if (!prompt || typeof prompt !== 'string') {
      return response.status(400).json({ error: 'Malformed request payload.' });
    }
    
    // SECURITY 2: Strict prompt length limitation (prevents malicious token-exhaustion billing attacks)
    // 3000 chars is roughly ~800 tokens, plenty for standard budgeting but definitively stops abuse.
    if (prompt.length > 3000) {
      return response.status(413).json({ error: 'Payload too large. Request rejected to prevent API abuse.' });
    }
    
    // Call the actual Google Gemini API strictly on the secure backend
    const geminiReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    const data = await geminiReq.json();
    if (data.error) throw new Error(data.error.message);
    
    const insight = data.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate insights at the moment.";
    
    // Return exclusively the parsed response text safely down to the frontend
    response.status(200).json({ text: insight.trim() });

  } catch (error) {
    response.status(500).json({ error: error.message });
  }
}
