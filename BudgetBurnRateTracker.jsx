import React, { useState, useEffect } from 'react';

// Pure functions
const getRemainingDays = (dateObj) => {
  const daysInMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();
  return daysInMonth - dateObj.getDate() + 1;
};

const getTotalSpent = (expenses) => {
  return expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
};

const getLocalYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const getLocalYM = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;

const CURRENCIES = [
  { symbol: '$', label: 'USD ($)' },
  { symbol: '€', label: 'EUR (€)' },
  { symbol: '£', label: 'GBP (£)' },
  { symbol: '₹', label: 'INR (₹)' },
  { symbol: '¥', label: 'JPY (¥)' },
  { symbol: 'A$', label: 'AUD (A$)' },
  { symbol: 'C$', label: 'CAD (C$)' },
];

const CATEGORIES = ['Food', 'Transport', 'Utilities', 'Shopping', 'Entertainment', 'Health', 'Other'];

export default function BudgetBurnRateTracker() {
  const [budget, setBudget] = useState(() => {
    const saved = localStorage.getItem('budget');
    return saved !== null ? Number(saved) : null;
  });

  const [currency, setCurrency] = useState(() => {
    return localStorage.getItem('currency') || '$';
  });

  const [expenses, setExpenses] = useState(() => {
    const saved = localStorage.getItem('expenses');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [alertMsg, setAlertMsg] = useState('');
  
  // Navigation State
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' or 'monthly'
  const [selectedDate, setSelectedDate] = useState(new Date());

  // LLM API Config State
  const [apiKey, setApiKey] = useState(() => {
    // Attempt to load from standard bundler environment variables (if deployed via Vite, Create React App, etc.)
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_GEMINI_API_KEY) {
      return process.env.REACT_APP_GEMINI_API_KEY;
    }
    // Attempt Vite specific env
    try { if (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY; } catch(e) {}
    // Attempt static window injection
    if (window.__ENV__ && window.__ENV__.GEMINI_API_KEY) return window.__ENV__.GEMINI_API_KEY;
    return '';
  });
  
  const [aiInsight, setAiInsight] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    if (apiKey) return; // If loaded from build-time ENV variables, skip the local .env file fetch
    
    fetch('/.env?t=' + Date.now())
      .then(res => res.text())
      .then(text => {
        const lines = text.split('\n');
        for (let line of lines) {
          if (line.startsWith('GEMINI_API_KEY=')) {
            setApiKey(line.replace('GEMINI_API_KEY=', '').trim());
          }
        }
      })
      .catch((err) => console.log('No .env found or failed to load.'));
  }, []);

  useEffect(() => {
    if (budget !== null) {
      localStorage.setItem('budget', budget);
    }
  }, [budget]);

  useEffect(() => {
    localStorage.setItem('currency', currency);
  }, [currency]);

  useEffect(() => {
    localStorage.setItem('expenses', JSON.stringify(expenses));
  }, [expenses]);

  const triggerBuzz = () => {
    if (window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate([200, 100, 200]);
    }
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); 
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio contexts not supported', e);
    }
  };

  const now = new Date();
  const isToday = selectedDate.toDateString() === now.toDateString();
  const monthName = selectedDate.toLocaleString('default', { month: 'long' });
  const year = selectedDate.getFullYear();
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const currentMonthDate = now.getDate(); // For dynamic calculations against the real today if viewing current month
  
  // Expenses for the selected month
  const monthlyExpenses = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear();
  });
  const monthlySpent = getTotalSpent(monthlyExpenses);
  const percentConsumed = budget ? Math.min((monthlySpent / budget) * 100, 100) : 0;

  // Expenses specifically for the selected DAY
  const dailyExpenses = monthlyExpenses.filter(e => {
    return new Date(e.date).getDate() === selectedDate.getDate();
  });
  const dailySpent = getTotalSpent(dailyExpenses);

  // Progress Bar styling (monthly)
  let progressColor = 'bg-[#00ff88]';
  if (percentConsumed > 90) progressColor = 'bg-[#ff4455]';
  else if (percentConsumed > 75) progressColor = 'bg-[#ffaa00]';

  const formatMoney = (val) => `${currency}${Number(val).toFixed(2)}`;

  // Strict Dynamic Daily Limit calculation
  let remainingBudgetVar = budget || 0;
  let dynamicDailyLimit = (budget || 0) / daysInMonth;
  
  const spentByDay = {};
  monthlyExpenses.forEach(exp => {
    const day = new Date(exp.date).getDate();
    spentByDay[day] = (spentByDay[day] || 0) + Number(exp.amount);
  });

  const upToDay = (selectedDate.getMonth() === now.getMonth() && selectedDate.getFullYear() === now.getFullYear())
     ? now.getDate() 
     : daysInMonth;

  for (let d = 1; d < upToDay; d++) {
    const spent = spentByDay[d] || 0;
    remainingBudgetVar -= spent;
    // Downward adjustment only
    if (spent > dynamicDailyLimit && daysInMonth > d) {
      dynamicDailyLimit = remainingBudgetVar / (daysInMonth - d);
    }
  }

  const burnRate = upToDay > 0 ? monthlySpent / upToDay : 0;
  const projectedTotal = burnRate * daysInMonth;

  // Evening prompt for missed expenses
  const [eveningPrompt, setEveningPrompt] = useState('');
  useEffect(() => {
    if (isToday && now.getHours() >= 20) {
      const todayCategories = new Set(dailyExpenses.map(e => e.category || 'Other'));
      const reg = ['Food', 'Transport'];
      const missing = reg.filter(c => !todayCategories.has(c));
      if (missing.length > 0) {
        setEveningPrompt("It's getting late. Did you miss logging today's " + missing.join(' or ') + "?");
      } else {
        setEveningPrompt('');
      }
    } else {
      setEveningPrompt('');
    }
  }, [expenses, isToday]);

  const handleAddExpense = (e) => {
    e.preventDefault();
    if (!label || !amount || !isToday) return;

    const numAmount = Number(amount);
    
    // Warn if we break the dynamically calculated baseline for TODAY
    const actualTodaySpent = spentByDay[now.getDate()] || 0;
    if (actualTodaySpent + numAmount > dynamicDailyLimit) {
      triggerBuzz();
      setAlertMsg("BUZZ! Daily limit (" + formatMoney(dynamicDailyLimit) + ") crossed! Remaining days limit adjusted downward.");
      setTimeout(() => setAlertMsg(''), 8000);
    }

    const newExpense = {
      id: Date.now().toString(),
      label,
      category,
      amount: numAmount,
      date: now.toISOString()
    };

    setExpenses([newExpense, ...expenses]);
    setLabel('');
    setAmount('');
  };

  const handleDelete = (id) => {
    setExpenses(expenses.filter(exp => exp.id !== id));
  };
   
  const handleBudgetSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const b = fd.get('budget');
    const c = fd.get('currency');
    if (b) {
      setBudget(Number(b));
      if (c) setCurrency(c);
      setSelectedDate(new Date());
    }
  };

  const shiftDay = (days) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    setSelectedDate(next);
  };
  
  const shiftMonth = (months) => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() + months);
    next.setDate(1); // Default to first of month when navigating logically
    setSelectedDate(next);
  };

  const handleGetInsight = async () => {
    if (!apiKey || apiKey === 'YOUR_GOOGLE_AI_API_KEY_HERE') {
      setAlertMsg("Unable to authenticate request.");
      return;
    }
    
    setIsAiLoading(true);
    setAiInsight("Analyzing spending trajectory...");
    
    // Clean up expenses payload to save tokens
    const conciseExpenses = monthlyExpenses.map(e => ({ amount: e.amount, cat: e.category, date: e.date.split('T')[0] }));
    const promptText = `
      You are a financial tracker AI. My monthly budget is ${currency}${budget}. 
      We are on day ${now.getDate()} out of ${daysInMonth}. 
      Here is my JSON list of expenses: ${JSON.stringify(conciseExpenses)}.
      Analyze my habits rapidly and provide precisely a 2-sentence predictive alert directly to me (e.g. "You're likely to overspend this week..." or "You are spending too much on transportation..."). Make it strictly financial analysis. Do not hallucinate. Do not add introductory conversational text. Wait for any errors if JSON array is blank, in which case tell me to add some expenses first.
    `;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      
      const insight = data.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to generate insights at the moment.";
      setAiInsight("🤖 " + insight.trim());
    } catch (e) {
      setAiInsight("❌ Error reaching Google AI Studio: " + e.message);
    }
    setIsAiLoading(false);
  };

  // Graphical Stats for Monthly Report
  const categoryTotals = monthlyExpenses.reduce((acc, exp) => {
    const c = exp.category || 'Other';
    acc[c] = (acc[c] || 0) + Number(exp.amount);
    return acc;
  }, {});
  const entries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const maxCategoryAmount = entries.length > 0 ? entries[0][1] : 1;

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Syne:wght@400..800&display=swap');
    
    .font-syne { font-family: 'Syne', sans-serif; }
    .font-mono-dm { font-family: 'DM Mono', monospace; }
    
    @keyframes fadeUp {
      0% { opacity: 0; transform: translateY(16px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-up {
      animation: fadeUp 0.6s ease-out forwards;
      opacity: 0;
    }
    
    @keyframes pulseSoft {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .ai-pulsing {
      animation: pulseSoft 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
  `;

  if (budget === null) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col items-center justify-center font-syne p-4">
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-8 max-w-sm w-full rounded-sm shadow-none animate-fade-up mx-auto">
          <h1 className="text-2xl mb-2 font-bold uppercase tracking-wider text-center">Configure App</h1>
          <p className="text-gray-400 mb-6 text-sm text-center">Set your monthly budget & currency to start.</p>
          <form onSubmit={handleBudgetSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1">Currency</label>
              <select 
                name="currency"
                defaultValue={currency}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] text-white p-3 font-mono-dm focus:outline-none focus:border-[#00ff88] rounded-none shadow-none cursor-pointer appearance-none"
              >
                {CURRENCIES.map(curr => (
                  <option key={curr.symbol} value={curr.symbol}>{curr.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase text-gray-500 mb-1">Monthly Budget</label>
              <input 
                name="budget"
                type="number" 
                step="0.01"
                required
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] text-white p-3 font-mono-dm focus:outline-none focus:border-[#00ff88] text-xl rounded-none shadow-none"
                placeholder="0.00"
              />
            </div>
            <button 
              type="submit"
              className="bg-white text-black font-bold uppercase p-3 hover:bg-gray-200 transition-colors rounded-none shadow-none mt-4"
            >
              Start Tracking
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pt-6 pb-12 px-4 font-syne flex justify-center selection:bg-[#00ff88] selection:text-black">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      
      <div className="w-full max-w-md">
        
        {/* TOP TAB NAVIGATION */}
        <div className="flex border border-[#2a2a2a] rounded-sm overflow-hidden mb-6 bg-[#1a1a1a]">
          <button 
             onClick={() => setActiveTab('daily')}
             className={`flex-1 py-3 text-xs uppercase font-bold tracking-widest transition-colors ${activeTab === 'daily' ? 'bg-[#00ff88] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            Daily Tracker
          </button>
          <button 
             onClick={() => setActiveTab('monthly')}
             className={`flex-1 py-3 text-xs uppercase font-bold tracking-widest transition-colors border-l border-[#2a2a2a] ${activeTab === 'monthly' ? 'bg-[#00ff88] text-black' : 'text-gray-400 hover:text-white'}`}
          >
            Monthly Report
          </button>
        </div>

        {/* TIME TRAVEL HEADER */}
        {activeTab === 'daily' ? (
           <header className="flex items-center justify-between mb-6 bg-[#0f0f0f] border-b border-[#2a2a2a] pb-4">
             <button onClick={() => shiftDay(-1)} className="text-[#00ff88] hover:text-white text-2xl px-2 leading-none">‹</button>
             <div className="text-center flex-1 relative group">
               <input 
                 type="date" 
                 value={getLocalYMD(selectedDate)}
                 onClick={(e) => {
                   try { e.target.showPicker(); } catch (err) { console.warn(err); }
                 }}
                 onChange={(e) => {
                   if(e.target.value) {
                     const parts = e.target.value.split('-');
                     setSelectedDate(new Date(parts[0], parts[1] - 1, parts[2]));
                   }
                 }}
                 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                 title="Click to open calendar popup"
               />
               <h1 className="text-sm font-bold uppercase tracking-wider text-white group-hover:text-[#00ff88] transition-colors relative z-0 flex items-center justify-center gap-1.5">
                 <span>{isToday ? 'Today' : selectedDate.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                 <span className="text-lg leading-none">📅</span>
               </h1>
               <div className="text-[10px] text-gray-500 font-mono-dm uppercase tracking-widest mt-1">Daily View</div>
             </div>
             <button onClick={() => shiftDay(1)} className="text-[#00ff88] hover:text-white text-2xl px-2 leading-none">›</button>
           </header>
        ) : (
           <header className="flex items-center justify-between mb-6 bg-[#0f0f0f] border-b border-[#2a2a2a] pb-4">
             <button onClick={() => shiftMonth(-1)} className="text-[#00ff88] hover:text-white text-2xl px-2 leading-none">‹</button>
             <div className="text-center flex-1 relative group">
               <input 
                 type="month" 
                 value={getLocalYM(selectedDate)}
                 onClick={(e) => {
                   try { e.target.showPicker(); } catch (err) { console.warn(err); }
                 }}
                 onChange={(e) => {
                   if(e.target.value) {
                     const parts = e.target.value.split('-');
                     setSelectedDate(new Date(parts[0], parts[1] - 1, 1));
                   }
                 }}
                 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                 title="Click to open month picker popup"
               />
               <h1 className="text-sm font-bold uppercase tracking-wider text-white group-hover:text-[#00ff88] transition-colors relative z-0 flex items-center justify-center gap-1.5">
                 <span>{monthName} {year}</span>
                 <span className="text-lg leading-none">📅</span>
               </h1>
               <div className="text-[10px] text-gray-500 font-mono-dm uppercase tracking-widest mt-1">Monthly Report</div>
             </div>
             <button onClick={() => shiftMonth(1)} className="text-[#00ff88] hover:text-white text-2xl px-2 leading-none">›</button>
           </header>
        )}

        {/* ALERTS */}
        {alertMsg && (
          <div className="mb-4 p-3 border border-[#ff4455] bg-[#ff4455]/10 text-[#ff4455] text-xs animate-fade-up rounded-sm font-mono-dm flex items-start gap-3">
            <span className="text-lg leading-none">⚠️</span>
            <p className="flex-1 mt-0.5 font-bold uppercase">{alertMsg}</p>
            <button onClick={() => setAlertMsg('')} className="text-[#ff4455] hover:text-white font-bold px-1 text-lg leading-none">×</button>
          </div>
        )}
        
        {eveningPrompt && !alertMsg && activeTab === 'daily' && (
          <div className="mb-4 p-3 border border-[#ffaa00] bg-[#ffaa00]/10 text-[#ffaa00] text-xs animate-fade-up rounded-sm font-mono-dm flex items-start gap-3">
            <span className="text-lg leading-none">🌙</span>
            <p className="flex-1 mt-0.5">{eveningPrompt}</p>
          </div>
        )}
        
        {/* ---------- DAILY TAB ---------- */}
        {activeTab === 'daily' && (
          <div className="animate-fade-up">

            {/* Form visible ONLY if it's today */}
            {isToday ? (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 rounded-sm mb-6">
                <h2 className="text-[10px] font-bold uppercase tracking-widest mb-3 text-[#00ff88]">Active: Record Expense</h2>
                <form onSubmit={handleAddExpense} className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <input 
                        type="text" 
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Label"
                        required
                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] text-white p-2.5 text-sm focus:outline-none focus:border-[#00ff88] rounded-none placeholder-gray-600"
                      />
                    </div>
                    <div className="sm:w-32 relative">
                      <span className="absolute left-2.5 top-2.5 text-gray-500 font-mono-dm text-sm">{currency}</span>
                      <input 
                        type="number" 
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        required
                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] text-white p-2.5 pl-6 font-mono-dm text-sm focus:outline-none focus:border-[#00ff88] rounded-none placeholder-gray-600"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <select 
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] text-gray-300 p-2.5 text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-[#00ff88] rounded-none appearance-none cursor-pointer"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button 
                      type="submit"
                      className="w-24 bg-[#00ff88] text-black text-xs font-bold uppercase tracking-wider p-2.5 hover:bg-white transition-colors rounded-none"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 rounded-sm mb-6 text-center text-gray-500">
                <div className="text-xl mb-1">🔒</div>
                <h2 className="text-[10px] font-bold uppercase tracking-widest">Read-Only Mode</h2>
                <p className="text-[9px] font-mono-dm mt-1">Navigate to 'Today' to add expenses.</p>
              </div>
            )}

            {/* Daily Expense Log */}
            <div>
              <div className="flex justify-between items-end mb-3 border-b border-[#2a2a2a] pb-1">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Day's Expenses</h2>
                <span className="text-[10px] font-mono-dm text-white uppercase tracking-widest bg-[#2a2a2a] px-2 py-0.5 rounded-sm">
                  Spent: {formatMoney(dailySpent)}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {dailyExpenses.length === 0 ? (
                  <div className="py-12 border border-dashed border-[#2a2a2a] flex items-center justify-center flex-col text-gray-600 rounded-sm">
                     <div className="text-3xl mb-2">🍃</div>
                     <div className="text-[10px] uppercase tracking-widest font-bold">No Expenses for this date</div>
                  </div>
                ) : (
                  dailyExpenses.map(exp => (
                    <div key={exp.id} className="bg-transparent border border-[#2a2a2a] p-3 flex justify-between items-center group rounded-sm bg-[#111]">
                      <div className="flex-1 overflow-hidden pr-2">
                        <div className="text-sm font-bold truncate text-gray-200">{exp.label}</div>
                        <div className="mt-1">
                          <span className="text-[9px] bg-[#222] border border-[#333] px-1.5 py-0.5 text-gray-400 uppercase tracking-widest rounded-sm">{exp.category || 'Other'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="font-mono-dm text-white text-sm bg-[#ff4455]/20 px-2 py-1 border border-[#ff4455]/30 rounded-sm">
                          -{formatMoney(exp.amount)}
                        </div>
                        {isToday && (
                          <button 
                            onClick={() => handleDelete(exp.id)}
                            className="text-gray-600 hover:text-[#ff4455] transition-colors text-lg leading-none p-1"
                            title="Delete expense"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* ---------- MONTHLY REPORT TAB ---------- */}
        {activeTab === 'monthly' && (
          <div className="animate-fade-up">

            {/* PROGRESS BAR */}
            <div className="mb-8">
              <div className="flex justify-between text-xs mb-1.5 uppercase tracking-wide">
                <span className="text-gray-400">Budget Consumed ({monthName})</span>
                <span className="font-mono-dm font-bold">{percentConsumed.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-[#1a1a1a] relative">
                <div className={`h-full ${progressColor} transition-all duration-500`} style={{ width: `${percentConsumed}%` }}></div>
              </div>
              <div className="flex justify-between text-[10px] uppercase tracking-widest text-gray-500 mt-1 font-mono-dm">
                <span>{formatMoney(monthlySpent)}</span>
                <span>{formatMoney(budget)}</span>
              </div>
            </div>

            {/* STAT CARDS */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 text-center rounded-sm">
                <div className="text-2xl mb-1">🎯</div>
                <h2 className="text-gray-500 uppercase tracking-widest text-[9px] mb-1">Target Daily Limit</h2>
                <div className="text-xl font-mono-dm text-[#00ff88]">{formatMoney(dynamicDailyLimit)}</div>
              </div>
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 text-center rounded-sm">
                 <div className="text-2xl mb-1">🔥</div>
                 <h3 className="text-gray-500 uppercase tracking-widest text-[9px] mb-1">Avg Burn Rate</h3>
                 <div className="text-xl font-mono-dm">{formatMoney(burnRate)}</div>
              </div>
              <div className="col-span-2 bg-[#1a1a1a] border border-[#2a2a2a] p-4 text-center rounded-sm flex justify-between items-center">
                 <div className="text-left">
                   <h3 className="text-gray-500 uppercase tracking-widest text-[9px]">Calculated Projection</h3>
                   <div className="text-[10px] font-mono-dm text-gray-600 mt-0.5 lowercase">for {monthName}</div>
                 </div>
                 <div className={`text-2xl font-mono-dm ${projectedTotal > budget ? 'text-[#ff4455]' : 'text-white'}`}>
                   {formatMoney(projectedTotal)}
                 </div>
              </div>
            </div>

            {/* GRAPHICAL REPORT: SPENDING STATS */}
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-5 rounded-sm mb-6">
               <h2 className="text-[11px] font-bold uppercase tracking-widest mb-6 text-white pb-2 border-b border-[#2a2a2a] flex justify-between">
                 <span>Category Trends</span>
                 <span className="text-[#00ff88] font-mono-dm">📊</span>
               </h2>
               
               <div className="flex flex-col gap-5">
                 {entries.length === 0 ? (
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest text-center py-4">No data generated yet for {monthName}</div>
                 ) : (
                    entries.map(([cat, amount]) => {
                      const pct = Math.min((amount / maxCategoryAmount) * 100, 100);
                      const isDanger = (amount / budget) > 0.5; // If a single category eats half budget
                      
                      return (
                        <div key={cat} className="flex flex-col gap-1.5 group">
                          <div className="flex justify-between items-end">
                             <span className="text-xs uppercase font-bold tracking-wider text-gray-300 group-hover:text-white transition-colors">{cat}</span>
                             <span className="font-mono-dm text-sm font-bold text-white">{formatMoney(amount)}</span>
                          </div>
                          <div className="h-2 w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-sm overflow-hidden p-[1px]">
                             <div 
                               className={`h-full ${isDanger ? 'bg-[#ff4455]' : 'bg-[#00ff88]'} transition-all duration-1000 ease-out`} 
                               style={{ width: `${pct}%` }}
                             ></div>
                          </div>
                        </div>
                      );
                    })
                 )}
               </div>
            </div>

            {/* AI PREDICTIVE INSIGHTS */}
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-5 rounded-sm pb-6">
               <h2 className="text-[11px] font-bold uppercase tracking-widest mb-4 text-white pb-2 border-b border-[#2a2a2a] flex justify-between">
                 <span>AI Spending Predictor</span>
                 <span className="text-[#00ff88]">✨</span>
               </h2>
               
               {aiInsight ? (
                 <div className="bg-[#0f0f0f] border border-[#00ff88]/30 p-4 text-xs font-mono-dm text-[#00ff88] leading-relaxed relative">
                   <div className={isAiLoading ? "ai-pulsing" : ""}>{aiInsight}</div>
                   {!isAiLoading && (
                     <button onClick={() => setAiInsight(null)} className="absolute top-1 right-2 text-gray-500 hover:text-white text-lg">×</button>
                   )}
                 </div>
               ) : (
                 <button 
                   onClick={handleGetInsight}
                   className="w-full bg-[#2a2a2a] text-white text-xs font-bold uppercase tracking-wider p-3 hover:bg-[#00ff88] hover:text-black transition-colors rounded-none shadow-none"
                 >
                   Ask AI Advisor
                 </button>
               )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
