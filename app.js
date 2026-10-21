/* =========================================================
   إعدادات اللعبة
   - ضع رابط Google Apps Script Web App في APPS_SCRIPT_URL
   - لا تعرض اللعبة رسالة نجاح قبل التأكد من النشر الفعلي
   ========================================================= */
const CONFIG = {
  // اتركه فارغًا حتى تنشر Google Apps Script وتضع الرابط هنا.
  // مثال: "https://script.google.com/macros/s/XXXXXXXXXXXX/exec"
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzOlO6FWryspAXI6su74V_M5wYRAeZkuoaf0kZNKd5KEFoiUer9XHlcrxJHcvEGMm3f7Q/exec",
  KINGDOMS: [
    { id: "nahw",      name: "مملكة النحو",     file: "questions/nahw.json" },
    { id: "sarf",      name: "مملكة الصرف",     file: "questions/sarf.json" },
    { id: "tarkeeb",   name: "مملكة التراكيب",  file: "questions/tarkeeb.json" },
    { id: "challenge", name: "مملكة التحديات",  file: "questions/challenge.json" }
  ]
};

/* ---------- الحالة ---------- */
const state = {
  learnerId: getOrCreateLearnerId(),
  sessionId: null,
  kingdom: null,
  questions: [],
  currentIndex: 0,
  correctCount: 0,
  answered: false,
  questionStartTime: 0
};

/* ---------- معرّفات ---------- */
function getOrCreateLearnerId() {
  const key = "arabic_kingdoms_learner_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "L-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(key, id);
  }
  return id;
}
function newSessionId() {
  return "S-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/* ---------- عرض الواجهات ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const el = document.getElementById(name + "-view");
  if (el) el.classList.remove("hidden");
}

/* ---------- الرئيسية ---------- */
function renderKingdoms() {
  const grid = document.getElementById("kingdoms-grid");
  grid.innerHTML = "";
  CONFIG.KINGDOMS.forEach(k => {
    const card = document.createElement("div");
    card.className = "kingdom-card";
    card.innerHTML = `
      <h3>${k.name}</h3>
      <p>5 أسئلة قصيرة</p>
      <button class="btn primary" type="button">بدء اللعب</button>
    `;
    card.querySelector("button").addEventListener("click", () => startKingdom(k));
    grid.appendChild(card);
  });
}

/* ---------- بدء المملكة ---------- */
async function startKingdom(kingdom) {
  try {
    const res = await fetch(kingdom.file, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const questions = await res.json();
    state.kingdom = kingdom;
    state.questions = questions;
    state.currentIndex = 0;
    state.correctCount = 0;
    state.sessionId = newSessionId();
    state.answered = false;
    document.getElementById("quiz-kingdom-title").textContent = kingdom.name;
    showView("quiz");
    renderQuestion();
  } catch (err) {
    alert("تعذر تحميل الأسئلة من الملف: " + kingdom.file);
    console.error(err);
  }
}

/* ---------- عرض السؤال ---------- */
function renderQuestion() {
  state.answered = false;
  state.questionStartTime = Date.now();

  const q = state.questions[state.currentIndex];
  document.getElementById("question-text").textContent = q.question;
  document.getElementById("progress").textContent =
    `السؤال ${state.currentIndex + 1} من ${state.questions.length} — النقاط: ${state.correctCount}`;

  const opts = document.getElementById("options");
  opts.innerHTML = "";
  q.options.forEach((text, i) => {
    const b = document.createElement("button");
    b.className = "option-btn";
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", () => selectAnswer(i));
    opts.appendChild(b);
  });

  const fb = document.getElementById("feedback");
  fb.className = "feedback hidden";
  fb.innerHTML = "";

  const nextBtn = document.getElementById("next-btn");
  nextBtn.classList.add("hidden");
  nextBtn.textContent =
    state.currentIndex === state.questions.length - 1 ? "عرض النتيجة" : "السؤال التالي";
}

/* ---------- اختيار إجابة ---------- */
function selectAnswer(index) {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.currentIndex];
  const isCorrect = index === q.correct;
  const responseTimeMs = Date.now() - state.questionStartTime;

  if (isCorrect) state.correctCount++;

  document.querySelectorAll("#options .option-btn").forEach((b, i) => {
    b.disabled = true;
    if (i === q.correct) b.classList.add("correct");
    if (i === index && !isCorrect) b.classList.add("wrong");
  });

  const fb = document.getElementById("feedback");
  fb.className = "feedback " + (isCorrect ? "feedback-correct" : "feedback-wrong");
  fb.innerHTML =
    `<strong>${isCorrect ? "إجابة صحيحة" : "إجابة خاطئة"}</strong><p>${q.explanation || ""}</p>`;

  document.getElementById("next-btn").classList.remove("hidden");

  const errorType = isCorrect
    ? ""
    : (q.errorTypes && q.errorTypes[String(index)]) || "غير محدد";

  sendAnswer({
    timestamp: new Date().toISOString(),
    learner_id: state.learnerId,
    session_id: state.sessionId,
    kingdom: state.kingdom.name,
    question_id: q.id,
    skill: q.skill || "",
    selected_answer: q.options[index],
    correct_answer: q.options[q.correct],
    is_correct: isCorrect,
    error_type: errorType,
    response_time_ms: responseTimeMs
  });
}

/* ---------- الإرسال إلى Google Sheets ---------- */
function sendAnswer(payload) {
  if (!CONFIG.APPS_SCRIPT_URL) {
    // لا يوجد رابط نشر — لا نزعم النجاح ولا نرسل
    console.warn(
      "[الممالك اللغوية] لم يتم إعداد APPS_SCRIPT_URL، لذلك لم تُسجَّل الإجابة في Google Sheets."
    );
    return;
  }
  fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).catch(err => {
    console.error("[الممالك اللغوية] تعذر إرسال الإجابة:", err);
  });
}

/* ---------- التالي ---------- */
function goNext() {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

/* ---------- إنهاء الاختبار ---------- */
function finishQuiz() {
  const total = state.questions.length;
  const score = state.correctCount;
  const percent = total ? Math.round((score / total) * 100) : 0;

  document.getElementById("result-text").textContent =
    `أجبت إجابة صحيحة على ${score} من ${total} سؤالًا (${percent}%).`;

  const result = {
    learnerName: getLearnerName(),
    score,
    total,
    percent,
    kingdom: state.kingdom.name,
    date: new Date().toLocaleString("ar-EG")
  };
  localStorage.setItem("arabic_kingdoms_last_result", JSON.stringify(result));

  showView("result");
}

/* ---------- اسم المتعلم ---------- */
function getLearnerName() {
  return (localStorage.getItem("arabic_kingdoms_learner_name") || "").trim();
}

/* ---------- التهيئة ---------- */
document.addEventListener("DOMContentLoaded", () => {
  renderKingdoms();

  const nameInput = document.getElementById("learner-name");
  nameInput.value = getLearnerName();
  nameInput.addEventListener("input", () => {
    localStorage.setItem("arabic_kingdoms_learner_name", nameInput.value);
  });

  document.getElementById("next-btn").addEventListener("click", goNext);
  document.getElementById("back-home-btn").addEventListener("click", () => showView("home"));
  document.getElementById("result-home-btn").addEventListener("click", () => showView("home"));
  document.getElementById("replay-btn").addEventListener("click", () => {
    if (state.kingdom) startKingdom(state.kingdom);
  });
  document.getElementById("certificate-btn").addEventListener("click", () => {
    window.location.href = "certificate.html";
  });
});
