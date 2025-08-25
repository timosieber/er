import React, { useEffect, useMemo, useRef, useState } from "react";

// =============================
// Utils
// =============================
function stripDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("’", "'")
    .trim();
}

function startsWithVowelOrH(s) {
  return /^[aeiouhâêîôûéèëïüœæàù]/i.test(s);
}

// =============================
// Data (regular -ER verbs)
// =============================
// Bank aus *regelmässigen* -er Verben (ohne orthographische Sonderfälle wie préférer, acheter, appeler)
// Wir erlauben jedoch die Standard-Schreibregeln für -ger (nous mangeons) und -cer (nous commençons).
const VERB_BANK = [
  { key: "parler", label: "parler (sprechen)" },
  { key: "aimer", label: "aimer (mögen/lieben)" },
  { key: "regarder", label: "regarder (anschauen)" },
  { key: "travailler", label: "travailler (arbeiten)" },
  { key: "écouter", label: "écouter (zuhören)" },
  { key: "habiter", label: "habiter (wohnen)" },
  { key: "jouer", label: "jouer (spielen)" },
  { key: "marcher", label: "marcher (laufen)" },
  { key: "chercher", label: "chercher (suchen)" },
  { key: "arriver", label: "arriver (ankommen)" },
  { key: "chanter", label: "chanter (singen)" },
  { key: "étudier", label: "étudier (studieren)" },
  { key: "penser", label: "penser (denken)" },
  { key: "porter", label: "porter (tragen)" },
  { key: "visiter", label: "visiter (besuchen)" },
  { key: "danser", label: "danser (tanzen)" },
  { key: "manger", label: "manger (essen)" }, // -ger Sonderfall → nous mangeons
  { key: "commencer", label: "commencer (anfangen)" }, // -cer Sonderfall → nous commençons
];

const ALL_PRONOUNS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];

// =============================
// Conjugation helpers for regular -ER verbs (Présent)
// =============================
const ER_ENDINGS = {
  "je": "e",
  "tu": "es",
  "il/elle": "e",
  "nous": "ons",
  "vous": "ez",
  "ils/elles": "ent",
};

function conjugateEr(verb, pronoun) {
  // Basis: Stamm + Endung
  const stem = verb.slice(0, -2); // entferne -er
  if (pronoun === "nous") {
    if (verb.endsWith("ger")) return stem + "eons"; // manger → mangeons
    if (verb.endsWith("cer")) return stem.slice(0, -1) + "çons"; // commencer → commençons
  }
  return stem + ER_ENDINGS[pronoun];
}

function displayPronounForAnswer(pronoun) {
  if (pronoun === "il/elle") return "il"; // wir nutzen die männliche Form als Referenz
  if (pronoun === "ils/elles") return "ils";
  return pronoun;
}

function fullAnswer(verb, pronoun) {
  const conj = conjugateEr(verb, pronoun); // z. B. parle / aimes / regardons …
  const p = displayPronounForAnswer(pronoun); // z. B. je / tu / il / nous …
  // Elision: je + Vokal/H → j'
  if (p === "je" && startsWithVowelOrH(conj)) return "j'" + conj;
  return p + " " + conj;
}

// =============================
// Learning stages
// =============================
const STAGES = [
  { pronouns: ["je", "tu"], hints: true, ignoreAccents: true, label: "Einfach starten" },
  { pronouns: ["je", "tu", "il/elle"], hints: true, ignoreAccents: true, label: "+ il/elle" },
  { pronouns: ["je", "tu", "il/elle", "nous", "vous"], hints: true, ignoreAccents: true, label: "+ nous, vous" },
  { pronouns: ALL_PRONOUNS, hints: true, ignoreAccents: true, label: "Alle Pronomen" },
  { pronouns: ALL_PRONOUNS, hints: false, ignoreAccents: false, label: "Pro: Akzente & ohne Hinweis" },
];

// =============================
// Leitner + Persistenz
// =============================
const MAX_LEVEL = 3;
const STORAGE_KEY = "fr_conj_er_app_v1";

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveProgress(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function weightedChoice(items) {
  // Höheres Gewicht für niedriges Level + kürzlich falsch
  const weights = items.map((it) => 1 + (MAX_LEVEL - (it.level ?? 0)) + (it.streakWrong ?? 0) * 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function buildDeck(verbs, pronouns) {
  const deck = [];
  for (const v of verbs) for (const p of pronouns) deck.push({ id: `${v}::${p}`, verb: v, pronoun: p, answer: fullAnswer(v, p) });
  return deck;
}

export default function App() {
  // Screens
  const [screen, setScreen] = useState("setup"); // setup | practice | review | results

  // Setup
  const defaultVerbs = VERB_BANK.slice(0, 8).map((v) => v.key);
  const [enabledVerbs, setEnabledVerbs] = useState(defaultVerbs);
  const [stageIndex, setStageIndex] = useState(0);
  const [sessionLength, setSessionLength] = useState(20);

  // Practice State
  const [ignoreAccents, setIgnoreAccents] = useState(STAGES[0].ignoreAccents);
  const [showHints, setShowHints] = useState(STAGES[0].hints);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null); // { ok, expected, user }
  const [session, setSession] = useState({ correct: 0, total: 0, target: sessionLength });

  // Focus mode
  const appRef = useRef(null);
  const [focusMode, setFocusMode] = useState(false);

  // Mistakes
  const [mistakeQueue, setMistakeQueue] = useState([]);
  const [wrongList, setWrongList] = useState([]);

  // Progress store (lazy-init per Karte)
  const [progress, setProgress] = useState(() => loadProgress() || { version: 1, cards: {} });
  useEffect(() => saveProgress(progress), [progress]);

  // Active deck
  const activePronouns = STAGES[stageIndex].pronouns;
  const activeDeck = useMemo(() => buildDeck(enabledVerbs, activePronouns), [enabledVerbs, stageIndex]);
  const candidateCards = useMemo(
    () => activeDeck.map((c) => ({ ...c, ...(progress.cards[c.id] || {}) })),
    [activeDeck, progress]
  );

  // Derived
  const masteredCount = candidateCards.filter((c) => c.level >= MAX_LEVEL).length;

  // Current card + timer
  const [current, setCurrent] = useState(null);
  const okTimerRef = useRef(null);

  useEffect(() => {
    if (screen !== "practice" && screen !== "review") return;
    setIgnoreAccents(STAGES[stageIndex].ignoreAccents);
    setShowHints(STAGES[stageIndex].hints);
  }, [stageIndex, screen]);

  useEffect(() => {
    if (screen !== "practice" && screen !== "review") return;
    if (feedback !== null) return; // Feedback sichtbar → blockiere Auswahl

    let nextCard = null;
    if (screen === "practice") {
      if (mistakeQueue.length) {
        const id = mistakeQueue[0];
        nextCard = candidateCards.find((c) => c.id === id) || weightedChoice(candidateCards);
      } else {
        nextCard = weightedChoice(candidateCards);
      }
    } else if (screen === "review") {
      const id = wrongList[0];
      nextCard = candidateCards.find((c) => c.id === id) || weightedChoice(candidateCards);
    }

    setCurrent(nextCard);
    setInput("");

    if (okTimerRef.current) {
      clearTimeout(okTimerRef.current);
      okTimerRef.current = null;
    }
  }, [screen, progress, enabledVerbs, stageIndex, mistakeQueue.length, wrongList.length, feedback]);

  useEffect(() => {
    if (screen === "review" && wrongList.length === 0) setScreen("results");
  }, [screen, wrongList.length]);

  // Fullscreen helpers
  function enterFocus() {
    setFocusMode(true);
    const el = appRef.current;
    if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
  function exitFocus() {
    setFocusMode(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function normalize(s) {
    return ignoreAccents ? stripDiacritics(s.toLowerCase()) : s.toLowerCase().trim();
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!current) return;
    const expected = current.answer;
    const ok = normalize(input) === normalize(expected);

    setSession((prev) => ({ ...prev, correct: prev.correct + (ok ? 1 : 0), total: prev.total + 1 }));

    setProgress((prev) => {
      const copy = { ...prev, cards: { ...prev.cards } };
      const card = { ...(copy.cards[current.id] || { level: 0, seen: 0, correct: 0, wrong: 0, streakCorrect: 0, streakWrong: 0 }) };
      card.seen += 1;
      if (ok) {
        card.correct += 1;
        card.streakCorrect += 1;
        card.streakWrong = 0;
        if (card.level < MAX_LEVEL && card.streakCorrect >= 2) {
          card.level += 1;
          card.streakCorrect = 0;
        }
        setMistakeQueue((q) => q.filter((id) => id !== current.id));
        if (screen === "review") setWrongList((lst) => lst.filter((id) => id !== current.id));
      } else {
        card.wrong += 1;
        card.streakWrong += 1;
        card.streakCorrect = 0;
        card.level = Math.max(0, card.level - 1);
        setMistakeQueue((q) => {
          const next = [...q.filter((id) => id !== current.id), current.id];
          return next.slice(-3);
        });
        setWrongList((lst) => (lst.includes(current.id) ? lst : [...lst, current.id]));
      }
      copy.cards[current.id] = card;
      return copy;
    });

    setFeedback({ ok, expected, user: input });

    if (ok) {
      okTimerRef.current = setTimeout(() => {
        nextCard();
      }, 10000); // 10s sichtbar (grün)
    }
  }

  function nextCard() {
    setMistakeQueue((q) => q.slice(1));
    setFeedback(null);
    setInput("");
    setProgress((p) => ({ ...p })); // trigger Reselection
    if (okTimerRef.current) {
      clearTimeout(okTimerRef.current);
      okTimerRef.current = null;
    }
  }

  // ENTER nur bei grünem Feedback → weiter
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Enter" && feedback?.ok) {
        e.preventDefault();
        nextCard();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedback]);

  useEffect(() => {
    if (screen !== "practice") return;
    if (session.total >= session.target) {
      if (wrongList.length > 0) setScreen("review"); else setScreen("results");
    }
  }, [session.total, session.target, screen, wrongList.length]);

  function startPractice() {
    setSession({ correct: 0, total: 0, target: sessionLength });
    setMistakeQueue([]);
    setWrongList([]);
    setScreen("practice");
    setTimeout(() => enterFocus(), 50);
  }

  function resetAll() {
    if (!confirm("Gesamten Lernfortschritt löschen?")) return;
    const fresh = { version: 1, cards: {} };
    setProgress(fresh);
    saveProgress(fresh);
  }

  const deckEmpty = enabledVerbs.length === 0;

  // Helpers für Verb-Auswahl
  function toggleVerb(key, checked) {
    setEnabledVerbs((prev) => (checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)));
  }
  function selectAll() {
    setEnabledVerbs(VERB_BANK.map((v) => v.key));
  }
  function selectNone() {
    setEnabledVerbs([]);
  }

  return (
    <div ref={appRef} className={`min-h-screen ${screen === "practice" || screen === "review" ? "bg-zinc-950 text-white" : "bg-gray-50 text-gray-900"} transition-colors`}>
      {screen === "setup" && (
        <div className="max-w-3xl mx-auto p-6">
          <header className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold">Regelmässige -ER Verben – Übungsmodus (Présent)</h1>
            <button onClick={resetAll} className="px-3 py-2 text-sm rounded-xl bg-gray-200 hover:bg-gray-300">Fortschritt zurücksetzen</button>
          </header>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-white shadow-sm">
              <div className="font-semibold mb-3">Schritt 1 – Verben wählen</div>
              <div className="flex gap-2 mb-3">
                <button onClick={selectAll} className="px-2 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200">Alle</button>
                <button onClick={selectNone} className="px-2 py-1 text-xs rounded-lg bg-gray-100 hover:bg-gray-200">Keine</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-auto pr-1">
                {VERB_BANK.map((v) => (
                  <label key={v.key} className="flex items-center gap-2 text-sm p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={enabledVerbs.includes(v.key)}
                      onChange={(e) => toggleVerb(v.key, e.target.checked)}
                    />
                    <span>{v.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Tipp: Starte mit 5–8 Verben. Später kannst du mehr hinzufügen.</p>
            </div>

            <div className="p-5 rounded-3xl bg-white shadow-sm">
              <div className="font-semibold mb-3">Schritt 2 – Schwierigkeits‑Stufe</div>
              <div className="space-y-2">
                {STAGES.map((s, idx) => (
                  <label key={idx} className={`flex items-center justify-between gap-3 p-3 rounded-2xl border ${stageIndex === idx ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                    <div>
                      <div className="font-medium">Stufe {idx + 1}: {s.label}</div>
                      <div className="text-xs text-gray-600">Pronomen: {s.pronouns.join(", ")} {s.hints ? "• Hinweise an" : "• Hinweise aus"} {s.ignoreAccents ? "• Akzente ignorieren" : "• Akzente nötig"}</div>
                    </div>
                    <input type="radio" name="stage" checked={stageIndex === idx} onChange={() => setStageIndex(idx)} />
                  </label>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-white shadow-sm">
              <div className="font-semibold mb-3">Schritt 3 – Sitzungsdauer</div>
              <input
                type="range"
                min={10}
                max={60}
                step={5}
                value={sessionLength}
                onChange={(e) => setSessionLength(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="mt-2 text-sm">Aufgaben in dieser Sitzung: <b>{sessionLength}</b></div>
              <p className="text-xs text-gray-600 mt-2">Fehler werden bevorzugt wiederholt (innerhalb der nächsten 3 Karten) und am Schluss nochmals geprüft.</p>
            </div>

            <div className="p-5 rounded-3xl bg-white shadow-sm">
              <div className="font-semibold mb-3">Start</div>
              <ul className="text-sm text-gray-700 list-disc pl-4 space-y-1">
                <li>Minimal‑UI im Übungsmodus (dunkel, ohne Ablenkung) – optional Vollbild.</li>
                <li>2 richtige Antworten pro Karte → Level hoch. Falsch → Level runter + Wiederholung.</li>
                <li>Elision: <code>je</code> + Vokal/H → <code>j'</code> (z. B. <code>j'aime</code>, <code>j'habite</code>).</li>
              </ul>
              <button
                disabled={deckEmpty}
                onClick={startPractice}
                className={`mt-4 w-full py-3 rounded-2xl ${deckEmpty ? "bg-gray-300 text-gray-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                title={deckEmpty ? "Bitte mindestens 1 Verb wählen" : "Übung starten"}
              >
                Übung starten
              </button>
            </div>
          </div>
        </div>
      )}

      {(screen === "practice" || screen === "review") && (
        <div className="max-w-xl mx-auto px-6 pt-10 pb-16">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="text-xs uppercase tracking-widest text-zinc-400">{screen === "review" ? "Fehler‑Wiederholung" : "Fokus‑Übung"}</div>
            <div className="text-sm text-zinc-400">{session.total}/{session.target}</div>
          </div>

          {/* Card */}
          {current && (
            <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 backdrop-blur">
              <div className="text-zinc-300 text-sm mb-2">Schreibe die konjugierte Form</div>
              <div className="text-2xl font-semibold mb-4">
                <span className="italic text-zinc-100">{current.pronoun}</span>
                <span className="mx-2">+</span>
                <span className="italic text-zinc-100">{current.verb}</span>
              </div>

              {showHints && (
                <div className="text-xs text-zinc-400 mb-3">Hinweis: Präsens • {ignoreAccents ? "Akzente optional" : "Akzente nötig"}</div>
              )}

              <form onSubmit={onSubmit} className="flex gap-3">
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-100 placeholder-zinc-500"
                  placeholder="z. B. j'aime / nous parlons / vous regardez"
                  spellCheck={false}
                />
                <button type="submit" className="px-5 py-3 rounded-2xl bg-blue-600 text-white font-medium hover:bg-blue-700">Prüfen</button>
              </form>

              {feedback && (
                <div className={`mt-4 p-3 rounded-2xl border ${feedback.ok ? "bg-emerald-900/40 border-emerald-700 text-emerald-100" : "bg-rose-900/40 border-rose-700 text-rose-100"}`}>
                  {feedback.ok ? (
                    <div>
                      <div className="font-semibold">Richtig! 🎉</div>
                      <div className="text-xs opacity-80 mt-1">Automatisch weiter in 10 s oder Enter drücken.</div>
                    </div>
                  ) : (
                    <div>
                      <div className="font-semibold">Leider falsch.</div>
                      <div className="mt-2 text-sm space-y-1">
                        <div>Deine Eingabe: <span className="font-mono bg-zinc-900/60 px-2 py-1 rounded-md border border-zinc-800 line-through decoration-2 decoration-rose-400 text-zinc-200">{feedback.user}</span></div>
                        <div>Richtig: <span className="font-mono bg-zinc-900/60 px-2 py-1 rounded-md border border-zinc-700 text-emerald-200">{feedback.expected}</span></div>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button onClick={nextCard} className={`px-3 py-2 rounded-xl ${feedback.ok ? "bg-emerald-700 hover:bg-emerald-600 text-white" : "bg-rose-700 hover:bg-rose-600 text-white"} text-sm`}>Weiter</button>
                    {!feedback.ok && (
                      <span className="text-xs text-zinc-400 self-center">(Diese Karte kommt am Schluss nochmals.)</span>
                    )}
                  </div>
                </div>
              )}

              {/* Minimal footer infos */}
              <div className="mt-6 flex items-center justify-between text-xs text-zinc-500">
                <div>Trefferquote: {session.total ? Math.round((session.correct / session.total) * 100) : 0}%</div>
                <div className="flex items-center gap-2">
                  {focusMode ? (
                    <button onClick={exitFocus} className="underline underline-offset-2">Vollbild verlassen</button>
                  ) : (
                    <button onClick={enterFocus} className="underline underline-offset-2">Vollbild</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {screen === "results" && (
        <div className="max-w-xl mx-auto p-6">
          <div className="p-6 rounded-3xl bg-white shadow-sm">
            <h2 className="text-2xl font-bold mb-2">Sitzung beendet</h2>
            <div className="text-sm mb-4">Richtig: <b>{session.correct}</b> / Versuche: <b>{session.total}</b> → Trefferquote <b>{session.total ? Math.round((session.correct / session.total) * 100) : 0}%</b></div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-gray-100">
                <div className="text-gray-500 text-xs">Mastery (aktuelle Stufe)</div>
                <div className="font-semibold">{Math.round((candidateCards.filter((c) => c.level >= MAX_LEVEL).length / Math.max(1, candidateCards.length)) * 100)}%</div>
              </div>
              <div className="p-3 rounded-xl bg-gray-100">
                <div className="text-gray-500 text-xs">Fehler insgesamt</div>
                <div className="font-semibold">{wrongList.length}</div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setScreen("setup")} className="px-4 py-3 rounded-2xl bg-gray-200 hover:bg-gray-300">Zurück zu den Einstellungen</button>
              <button onClick={() => setScreen(wrongList.length ? "review" : "practice")} className="px-4 py-3 rounded-2xl bg-blue-600 text-white hover:bg-blue-700">{wrongList.length ? "Fehler wiederholen" : "Nochmals üben"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
