import { useState } from "react";

const Translator = () => {
  const [text, setText] = useState("");
  const [translated, setTranslated] = useState("");
  const [targetLang, setTargetLang] = useState("hi"); // default Hindi
  const [loading, setLoading] = useState(false);

  const translateText = async () => {
    if (!text.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("https://libretranslate.de/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: "en",
          target: targetLang,
          format: "text",
        }),
      });

      const data = await res.json();
      setTranslated(data.translatedText);
    } catch (error) {
      console.error("Translation failed:", error);
      setTranslated("❌ Translation error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4 border rounded-lg shadow-md bg-white">
      <h2 className="text-xl font-bold">Free Translator</h2>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text to translate..."
        className="w-full border p-2 rounded"
        rows={3}
      />

      <select
        value={targetLang}
        onChange={(e) => setTargetLang(e.target.value)}
        className="border p-2 rounded"
      >
        <option value="hi">Hindi</option>
        <option value="bn">Bengali</option>
        <option value="fr">French</option>
        <option value="es">Spanish</option>
        <option value="de">German</option>
      </select>

      <button
        onClick={translateText}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {loading ? "Translating..." : "Translate"}
      </button>

      {translated && (
        <div className="mt-3 p-2 bg-gray-100 rounded">
          <b>Result:</b> {translated}
        </div>
      )}
    </div>
  );
};

export default Translator;
