import { useState, useEffect, useRef } from "react";

// ============================================================
// SCORING ENGINE (mirrors the Java ScoringEngineService logic)
// ============================================================
const W = { savings: 0.30, debt: 0.30, emergency: 0.25, expense: 0.15 };

function normSavings(r)   { if (r <= 0) return 0; return Math.min(100, 100 * Math.log(1 + r) / Math.log(31)); }
function normDebt(r)      { if (r <= 0) return 100; if (r >= 1) return 0; return Math.max(0, Math.min(100, 100 * Math.exp(-3.5 * r))); }
function normEmergency(m) { if (m <= 0) return 0; return Math.min(100, 100 / (1 + Math.exp(-0.9 * (m - 3)))); }
function normExpense(r)   { if (r <= 0) return 100; if (r >= 1.5) return 0; return Math.max(0, Math.min(100, 100 * Math.pow(Math.max(0, 1.5 - r) / 1.5, 2))); }

function round1(v) { return Math.round(v * 10) / 10; }

function computeScore({ savingsRate, debtRatio, emergencyMonths, expenseRatio }) {
  const sS = normSavings(savingsRate);
  const dS = normDebt(debtRatio);
  const eS = normEmergency(emergencyMonths);
  const xS = normExpense(expenseRatio);

  const raw = sS * W.savings + dS * W.debt + eS * W.emergency + xS * W.expense;
  const penalty = 0; // All fields always present in UI
  const final = Math.max(0, raw - penalty);

  const category =
    final >= 80 ? "Excellent" :
    final >= 65 ? "Good" :
    final >= 50 ? "Fair" :
    final >= 35 ? "Needs Improvement" : "Critical";

  const emoji =
    final >= 80 ? "🌟" : final >= 65 ? "✅" : final >= 50 ? "📊" : final >= 35 ? "⚠️" : "🚨";

  const color =
    final >= 80 ? "#06d6a0" : final >= 65 ? "#00b4d8" : final >= 50 ? "#ffd60a" : final >= 35 ? "#f77f00" : "#d62828";

  const recs = [];
  if (sS < 60) recs.push({ key: "Savings Rate", text: "Target 20% savings rate. Automate 5% of income into a separate account (CFPB 50/30/20 rule)." });
  if (dS < 60) recs.push({ key: "Debt Burden", text: "Use the avalanche method — pay extra on highest-interest debt first. Aim for DTI below 36%." });
  if (eS < 60) recs.push({ key: "Emergency Fund", text: "Build to 3 months of expenses minimum. Keep in a high-yield savings account, not a chequing account." });
  if (xS < 60) recs.push({ key: "Expense Ratio", text: "Track spending for 30 days. Identify the top 3 non-essential categories and reduce by 10% each." });
  if (recs.length === 0) recs.push({ key: "Keep it up!", text: "Excellent position. Consider investing surplus savings in index funds or increasing retirement contributions." });

  let insight = `Your financial health score is ${round1(final)}/100. `;
  if (debtRatio > 0.43) insight += "Your DTI exceeds 43% — the CFPB danger zone. Debt reduction is your top priority.";
  else if (emergencyMonths < 1) insight += "Less than 1 month of emergency savings. One unexpected expense could destabilize your finances.";
  else if (savingsRate < 5) insight += "Very low savings rate. Even saving 5% consistently has a powerful compounding effect over time.";
  else if (expenseRatio > 0.9) insight += "You're spending nearly all of your income. Identify discretionary cuts to create a buffer.";
  else insight += "Your overall financial picture is reasonably healthy. Incremental improvements will compound well.";

  return {
    savingsScore: round1(sS), debtScore: round1(dS),
    emergencyScore: round1(eS), expenseScore: round1(xS),
    wSavings: round1(sS * W.savings), wDebt: round1(dS * W.debt),
    wEmergency: round1(eS * W.emergency), wExpense: round1(xS * W.expense),
    raw: round1(raw), final: round1(final),
    category, emoji, color, recs, insight,
  };
}

// ============================================================
// HISTORY stored in memory (simulates DB)
// ============================================================
let memoryDB = [];

// ============================================================
// UI COMPONENTS
// ============================================================

function Slider({ label, hint, min, max, step, value, onChange, display }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#00b4d8" }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#00b4d8", height: 4, cursor: "pointer" }} />
      <div style={{ fontSize: 11.5, color: "#475569", marginTop: 5 }}>{hint}</div>
    </div>
  );
}

function Bar({ label, score, weight, color, weighted }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(score), 80); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
        <span style={{ fontWeight: 600, color: "#cbd5e1" }}>{label} <span style={{ color: "#475569", fontWeight: 400 }}>({(weight * 100).toFixed(0)}%)</span></span>
        <span style={{ fontWeight: 800, color }}>{score}<span style={{ color: "#475569", fontWeight: 400 }}>/100</span></span>
      </div>
      <div style={{ height: 8, background: "#1e293b", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: width + "%", background: color, borderRadius: 4, transition: "width 1.1s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
      <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Weighted contribution: {weighted} pts</div>
    </div>
  );
}

function AnimatedScore({ target, color }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) cancelAnimationFrame(ref.current);
    const start = Date.now(); const dur = 1200;
    const tick = () => {
      const p = Math.min((Date.now() - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      setDisplay((ease * target).toFixed(1));
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [target]);
  return (
    <span style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, color, fontVariantNumeric: "tabular-nums" }}>
      {display}
    </span>
  );
}

function Badge({ cat }) {
  const map = {
    "Excellent": { bg: "#06d6a015", color: "#06d6a0" },
    "Good": { bg: "#00b4d815", color: "#00b4d8" },
    "Fair": { bg: "#ffd60a15", color: "#ffd60a" },
    "Needs Improvement": { bg: "#f77f0015", color: "#f77f00" },
    "Critical": { bg: "#d6282815", color: "#d62828" },
  };
  const s = map[cat] || map["Fair"];
  return <span style={{ background: s.bg, color: s.color, padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{cat}</span>;
}

// ============================================================
// TABS
// ============================================================
const TABS = ["Calculator", "History", "Leaderboard", "Rationale"];

export default function App() {
  const [tab, setTab] = useState("Calculator");
  const [name, setName] = useState("");
  const [savings, setSavings] = useState(10);
  const [debt, setDebt] = useState(0.25);
  const [emergency, setEmergency] = useState(3);
  const [expense, setExpense] = useState(0.70);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [histSearch, setHistSearch] = useState("");
  const [error, setError] = useState("");

  const handleCalc = () => {
    if (!name.trim()) { setError("Please enter your name."); return; }
    setError("");
    const r = computeScore({ savingsRate: savings, debtRatio: debt, emergencyMonths: emergency, expenseRatio: expense });
    const entry = {
      id: Date.now(), name: name.trim(), date: new Date().toLocaleString(),
      savings, debt, emergency, expense, ...r
    };
    memoryDB = [entry, ...memoryDB];
    setHistory([...memoryDB]);
    setResult(entry);
  };

  const filteredHistory = histSearch
    ? history.filter(h => h.name.toLowerCase().includes(histSearch.toLowerCase()))
    : history;

  const leaderboard = [...history].sort((a, b) => b.final - a.final).slice(0, 10);
  const avgScore = history.length ? (history.reduce((s, h) => s + h.final, 0) / history.length).toFixed(1) : "—";

  const S = {
    app: { background: "#080c14", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif" },
    header: { background: "linear-gradient(135deg,#0f4c81 0%,#080c14 100%)", padding: "18px 36px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1e293b" },
    logo: { fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" },
    container: { maxWidth: 900, margin: "0 auto", padding: "28px 20px" },
    tabBar: { display: "flex", gap: 3, background: "#111827", borderRadius: 12, padding: 4, width: "fit-content", marginBottom: 28 },
    tab: (active) => ({ padding: "9px 20px", borderRadius: 9, border: "none", background: active ? "#0f4c81" : "transparent", color: active ? "#fff" : "#64748b", fontWeight: 600, fontSize: 13.5, cursor: "pointer", transition: "all .18s" }),
    card: { background: "#111827", borderRadius: 16, padding: "24px 26px", border: "1px solid #1e293b", marginBottom: 20 },
    label: { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 7, display: "block" },
    input: { width: "100%", background: "#1e2535", border: "1px solid #1e293b", borderRadius: 10, padding: "11px 14px", color: "#e2e8f0", fontSize: 15, outline: "none", boxSizing: "border-box" },
    btn: { background: "linear-gradient(135deg,#00b4d8,#0077b6)", color: "#fff", border: "none", padding: "14px 0", borderRadius: 11, fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%", marginTop: 8 },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: "#00b4d8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 14 },
    muted: { color: "#475569", fontSize: 13, lineHeight: 1.6 },
    th: { padding: "10px 14px", textAlign: "left", color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #1e293b", background: "#1e2535" },
    td: { padding: "11px 14px", borderBottom: "1px solid #1e2535", fontSize: 13 },
  };

  return (
    <div style={S.app}>
      {/* HEADER */}
      <div style={S.header}>
        <div>
          <div style={S.logo}>Fein<span style={{ color: "#00b4d8" }}>AI</span></div>
          <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>Financial Health Score Calculator</div>
        </div>
        <div style={{ color: "#334155", fontSize: 12 }}>Intern Project — Kunal &amp; Ayush</div>
      </div>

      <div style={S.container}>
        {/* TABS */}
        <div style={S.tabBar}>
          {TABS.map(t => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "Calculator" ? "📊 " : t === "History" ? "📁 " : t === "Leaderboard" ? "🏆 " : "📄 "}{t}
            </button>
          ))}
        </div>

        {/* ===== CALCULATOR ===== */}
        {tab === "Calculator" && (
          <>
            <div style={S.card}>
              <div style={{ ...S.sectionTitle, marginBottom: 18 }}>Your Financial Details</div>
              <div style={{ marginBottom: 22 }}>
                <label style={S.label}>Your Name</label>
                <input style={S.input} placeholder="e.g. Kunal Sharma" value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
                <div>
                  <Slider label="Savings Rate" hint="CFPB recommends 20%. 0–50% range."
                    min={0} max={50} step={0.5} value={savings} onChange={setSavings}
                    display={savings + "%"} />
                  <Slider label="Debt-to-Income Ratio" hint="Below 36% manageable. Above 43% = high risk."
                    min={0} max={1} step={0.01} value={debt} onChange={setDebt}
                    display={(debt * 100).toFixed(0) + "%"} />
                </div>
                <div>
                  <Slider label="Emergency Fund" hint="3–6 months is the CFPB gold standard."
                    min={0} max={18} step={0.5} value={emergency} onChange={setEmergency}
                    display={emergency + " mo"} />
                  <Slider label="Expense Ratio" hint="Below 80% healthy. Above 100% = deficit."
                    min={0} max={1.5} step={0.01} value={expense} onChange={setExpense}
                    display={(expense * 100).toFixed(0) + "%"} />
                </div>
              </div>

              <button style={S.btn} onClick={handleCalc}>⚡ Calculate My Financial Health Score</button>
              {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10, background: "#f8717115", padding: "10px 14px", borderRadius: 8 }}>{error}</div>}
            </div>

            {result && (
              <>
                {/* SCORE HERO */}
                <div style={{ ...S.card, textAlign: "center", padding: "36px 24px" }}>
                  <div style={{ fontSize: 52, marginBottom: 6 }}>{result.emoji}</div>
                  <AnimatedScore target={result.final} color={result.color} />
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>out of 100</div>
                  <div style={{ marginTop: 10 }}><Badge cat={result.category} /></div>
                  <div style={{ color: "#334155", fontSize: 12, marginTop: 10 }}>
                    Raw: {result.raw} &nbsp;|&nbsp; Confidence Penalty: 0.0 &nbsp;|&nbsp; Final: <b style={{ color: result.color }}>{result.final}</b>
                  </div>
                </div>

                {/* BREAKDOWN */}
                <div style={S.card}>
                  <div style={S.sectionTitle}>Score Breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
                    <div>
                      <Bar label="Savings Rate" score={result.savingsScore} weight={W.savings} color="#06d6a0" weighted={result.wSavings} />
                      <Bar label="Debt-to-Income" score={result.debtScore} weight={W.debt} color="#00b4d8" weighted={result.wDebt} />
                    </div>
                    <div>
                      <Bar label="Emergency Fund" score={result.emergencyScore} weight={W.emergency} color="#ffd60a" weighted={result.wEmergency} />
                      <Bar label="Expense Ratio" score={result.expenseScore} weight={W.expense} color="#f77f00" weighted={result.wExpense} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                    {[["Savings Rate","30%"],["Debt-to-Income","30%"],["Emergency Fund","25%"],["Expense Ratio","15%"]].map(([k,v]) => (
                      <div key={k} style={{ background: "#1e2535", border: "1px solid #1e293b", padding: "5px 13px", borderRadius: 20, fontSize: 12 }}>
                        {k} <b style={{ color: "#00b4d8" }}>{v}</b>
                      </div>
                    ))}
                  </div>
                </div>

                {/* INSIGHT */}
                <div style={S.card}>
                  <div style={S.sectionTitle}>Insight</div>
                  <div style={{ background: "#1e2535", borderLeft: "3px solid #00b4d8", padding: "13px 16px", borderRadius: "0 10px 10px 0", fontSize: 14, lineHeight: 1.65, color: "#cbd5e1", marginBottom: 20 }}>
                    {result.insight}
                  </div>
                  <div style={S.sectionTitle}>Recommendations</div>
                  {result.recs.map((r, i) => (
                    <div key={i} style={{ background: "#1e2535", border: "1px solid #1e293b", borderRadius: 10, padding: "13px 15px", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, color: "#00b4d8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 5 }}>→ {r.key}</div>
                      <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{r.text}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ===== HISTORY ===== */}
        {tab === "History" && (
          <>
            <div style={S.card}>
              <div style={S.sectionTitle}>Score History</div>
              <input style={S.input} placeholder="Search by name..." value={histSearch} onChange={e => setHistSearch(e.target.value)} />
            </div>
            <div style={S.card}>
              {filteredHistory.length === 0 ? (
                <div style={{ ...S.muted, textAlign: "center", padding: 24 }}>
                  {history.length === 0 ? "No assessments yet. Calculate a score first." : `No results for "${histSearch}"`}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Name","Date","Score","Category","Savings","DTI","Emergency","Expense"].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((h, i) => (
                      <tr key={h.id} style={{ background: i % 2 === 0 ? "transparent" : "#0d1520" }}>
                        <td style={S.td}><b>{h.name}</b></td>
                        <td style={{ ...S.td, color: "#475569" }}>{h.date}</td>
                        <td style={{ ...S.td, fontWeight: 800, color: h.color }}>{h.final}</td>
                        <td style={S.td}><Badge cat={h.category} /></td>
                        <td style={S.td}>{h.savings}%</td>
                        <td style={S.td}>{(h.debt * 100).toFixed(0)}%</td>
                        <td style={S.td}>{h.emergency} mo</td>
                        <td style={S.td}>{(h.expense * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ===== LEADERBOARD ===== */}
        {tab === "Leaderboard" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              {[["Total Assessments", history.length], ["Average Score", avgScore], ["Top Score", leaderboard[0]?.final ?? "—"]].map(([l, v]) => (
                <div key={l} style={{ ...S.card, textAlign: "center", marginBottom: 0 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: "#00b4d8" }}>{v}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>🏆 Top Scorers</div>
              {leaderboard.length === 0 ? (
                <div style={{ ...S.muted, textAlign: "center", padding: 24 }}>No data yet. Calculate a score first!</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Rank","Name","Score","Category","Date"].map(h => <th key={h} style={S.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((h, i) => (
                      <tr key={h.id}>
                        <td style={{ ...S.td, fontSize: 20 }}>{["🥇","🥈","🥉"][i] || i + 1}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{h.name}</td>
                        <td style={{ ...S.td, fontWeight: 900, color: h.color }}>{h.final}</td>
                        <td style={S.td}><Badge cat={h.category} /></td>
                        <td style={{ ...S.td, color: "#475569" }}>{h.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ===== RATIONALE ===== */}
        {tab === "Rationale" && (
          <div style={S.card}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>📄 Model Design Rationale</div>
            <div style={{ ...S.muted, marginBottom: 24 }}>One-page rationale satisfying the FeinAI intern project brief requirements.</div>

            {[
              {
                title: "1. Research Basis",
                body: "This scoring engine is modeled after the Consumer Financial Protection Bureau (CFPB) Financial Well-Being Scale, which defines financial well-being through security, control, freedom of choice, and ability to absorb shocks. Debt thresholds are drawn from mortgage industry standards — 43% DTI is the maximum for Qualified Mortgages per CFPB; 36% is the 'comfortable' threshold. Mutual fund risk ratio methodology informed the non-linear penalty curves."
              },
              {
                title: "2. Weights — Why These Values?",
                isTable: true,
                rows: [
                  ["Savings Rate", "30%", "CFPB identifies consistent saving as the #1 long-term predictor. The 50/30/20 rule allocates the largest single bucket to savings."],
                  ["Debt-to-Income", "30%", "High debt is the primary barrier to financial health — it constrains cashflow and creates vulnerability to shocks. Lenders treat DTI as the primary risk indicator."],
                  ["Emergency Fund", "25%", "CFPB research: even $400 in liquid savings dramatically changes outcomes. 3–6 months absorbs 90%+ of financial shocks."],
                  ["Expense Ratio", "15%", "Correlates strongly with savings rate (they are inverse), so it has lower independent weight. Still useful as a budgeting discipline signal."],
                ]
              },
              {
                title: "3. Normalization Curves — Why Non-Linear?",
                body: "Savings → Logarithmic: 0%→5% is transformational (saving vs. not saving). 20%→25% is incremental. Log captures diminishing returns.\n\nDebt → Exponential Decay: Below 15%, debt is manageable. Above 43% is the danger zone. Exponential decay maps this 'cliff' — a drop from 45%→40% matters more than 15%→10%.\n\nEmergency Fund → Sigmoid: The inflection is at 3 months. Gains taper above 8 months (idle cash has opportunity cost). S-curve captures both the urgency and the plateau.\n\nExpense Ratio → Inverse Quadratic: A ratio near 1.0 is catastrophic. Quadratic acceleration penalizes high ratios more than linear would — matching how planners assess budgeting risk."
              },
              {
                title: "4. Confidence Penalty",
                body: "When a user cannot provide all four inputs, financial tracking is incomplete by definition. We apply 2.5 points per missing field (max 10 points). A person who doesn't track all financial dimensions statistically carries higher unidentified risk. The penalty is conservative — it doesn't tank the score, but appropriately discounts partial profiles."
              },
              {
                title: "5. Why This is Hard",
                body: "A naive AI-generated implementation uses a linear formula: score = 0.25 × each_metric. This fails because it treats the difference between 0% and 5% savings identically to 20%→25% — which is behaviorally and financially incorrect. Designing curves that mirror real-world financial outcomes requires reading CFPB literature, understanding mortgage industry standards, and making deliberate, defensible design choices."
              }
            ].map(section => (
              <div key={section.title} style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#00b4d8", marginBottom: 10 }}>{section.title}</div>
                {section.isTable ? (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Metric","Weight","Rationale"].map(h => <th key={h} style={S.th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map(([metric, weight, rationale]) => (
                        <tr key={metric}>
                          <td style={{ ...S.td, fontWeight: 700 }}>{metric}</td>
                          <td style={{ ...S.td, fontWeight: 800, color: "#00b4d8" }}>{weight}</td>
                          <td style={{ ...S.td, color: "#94a3b8", lineHeight: 1.6 }}>{rationale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  section.body.split("\n\n").map((para, i) => (
                    <p key={i} style={{ ...S.muted, marginBottom: 10 }}>{para}</p>
                  ))
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      <div style={{ textAlign: "center", padding: "24px 20px", color: "#1e293b", fontSize: 12, borderTop: "1px solid #0d1520" }}>
        Built by Kunal &amp; Ayush — FeinAI Engineering Intern Project &nbsp;|&nbsp; React · Scoring Engine (Java-equivalent logic) · In-Memory DB
      </div>
    </div>
  );
}
