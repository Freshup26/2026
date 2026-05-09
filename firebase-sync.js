// ═══════════════════════════════════════════════════════════════════
//  فريش آب — Firebase Real-Time Sync  v1.0
//  أضف هذا الملف قبل السكريبت الرئيسي في كل صفحة
// ═══════════════════════════════════════════════════════════════════

// ── 1. FIREBASE CONFIG ──────────────────────────────────────────────
//  ❗ استبدل هذه القيم بإعدادات مشروعك في Firebase Console
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBD0qRg-7-Ixn6PXJZiHhhmWqjEtW-eIiM",
  authDomain: "freshup-2026.firebaseapp.com",
  databaseURL: "https://freshup-2026-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "freshup-2026",
  storageBucket: "freshup-2026.firebasestorage.app",
  messagingSenderId: "987696801684",
  appId: "1:987696801684:web:c1544fa7baaddcaf341181",
  measurementId: "G-7XN0SCESD4"
};

// ── 2. المفاتيح المشتركة بين الأنظمة الثلاثة ──────────────────────
var SYNC_KEYS = [
  "fu_balance",    // موازنة الفروع
  "fu_inventory",  // الجرد
  "fu_entries",    // الاكسبايري
  "fu_needs",      // الاحتياجات
  "fu_goals",      // أهداف المبيعات
  "fu_prices",     // الأسعار والتكاليف
  "fu_nc",         // حالة توفير الاحتياجات
  "fu_employees",  // بيانات الموظفين
  "fu_recon",      // مطابقة البنك
  "fu_col_notes",  // ملاحظات التحصيل
  "fu_import_log"  // سجل الاستيراد
];

// مفاتيح تبقى محلية فقط (لا تُرفع لـ Firebase)
var LOCAL_ONLY = ["fu_lang", "fu_credentials"];

// ── 3. المتغيرات الداخلية ──────────────────────────────────────────
var FU_DB     = null;
var FU_READY  = false;
var FU_CACHE  = {};
var _writeTimers = {};
var _renderTimer = null;
var _badgeTimer  = null;

// ── 4. تحميل Firebase SDKs ─────────────────────────────────────────
function _loadFirebase(cb) {
  var loaded = 0;
  var urls = [
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"
  ];
  urls.forEach(function(src) {
    var s = document.createElement("script");
    s.src = src;
    s.onload  = function() { if (++loaded === urls.length) cb(); };
    s.onerror = function() { _syncErr("فشل تحميل Firebase SDK"); };
    document.head.appendChild(s);
  });
}

// ── 5. تهيئة Firebase والاستماع للتغييرات ─────────────────────────
function _initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    FU_DB = firebase.database();
    _syncStatus("جاري التحميل...", "#aaa");

    FU_DB.ref("freshup").once("value").then(function(snap) {
      var data = snap.val() || {};
      var count = 0;
      Object.keys(data).forEach(function(k) {
        if (data[k] !== null) { FU_CACHE[k] = data[k]; count++; }
      });
      FU_READY = true;
      _syncStatus("متصل", "#1e9e5e");
      console.log("FU-Sync: loaded " + count + " keys");

      // Real-time listener for all changes
      FU_DB.ref("freshup").on("value", function(snap) {
        var fresh = snap.val() || {};
        var changed = false;
        Object.keys(fresh).forEach(function(k) {
          if (fresh[k] !== FU_CACHE[k]) { FU_CACHE[k] = fresh[k]; changed = true; }
        });
        if (changed && FU_READY) {
          clearTimeout(_renderTimer);
          _renderTimer = setTimeout(function() {
            if (typeof rAll       === "function") rAll();
            if (typeof updBadges  === "function") updBadges();
          }, 300);
        }
      });

      // Trigger first render
      if (typeof rAll === "function") setTimeout(rAll, 150);

    }).catch(function(e) {
      FU_READY = true;
      _syncErr("خطأ في القراءة");
      console.error("FU-Sync read error:", e);
    });
  } catch(e) {
    _syncErr("خطأ في الإعداد — تحقق من FIREBASE_CONFIG");
    console.error("FU-Sync init error:", e);
  }
}

// ── 6. تعديل localStorage ──────────────────────────────────────────
// حفظ المرجع الأصلي
window._realLS = window.localStorage;

var _pLS = {
  getItem: function(key) {
    if (FU_CACHE.hasOwnProperty(key)) return FU_CACHE[key];
    return window._realLS.getItem(key);
  },
  setItem: function(key, value) {
    // دائماً احفظ محلياً كـ fallback
    try { window._realLS.setItem(key, value); } catch(e) {}

    // تجاهل المفاتيح المحلية
    if (LOCAL_ONLY.indexOf(key) >= 0) return;

    // هل هو مفتاح مزامنة؟
    var sync = SYNC_KEYS.some(function(k) { return key === k || key.startsWith(k); });
    if (!sync || !FU_DB) return;

    FU_CACHE[key] = value;

    // كتابة مؤجلة لـ Firebase (debounce 400ms)
    clearTimeout(_writeTimers[key]);
    _writeTimers[key] = setTimeout(function() {
      FU_DB.ref("freshup/" + key).set(value)
        .then(function() { _syncPulse(); })
        .catch(function(e) { _syncErr("خطأ كتابة: " + key); console.error(e); });
    }, 400);
  },
  removeItem: function(key) {
    try { window._realLS.removeItem(key); } catch(e) {}
    delete FU_CACHE[key];
    if (FU_DB) FU_DB.ref("freshup/" + key).remove();
  },
  key:   function(n) { return window._realLS.key(n); },
  clear: function()  { window._realLS.clear(); }
};

// تطبيق الـ patch
try {
  Object.defineProperty(window, "localStorage", {
    get: function() { return _pLS; },
    configurable: true
  });
} catch(e) {
  console.warn("FU-Sync: Could not override localStorage", e);
}

// ── 7. مؤشر الحالة ────────────────────────────────────────────────
function _injectBadge() {
  var d = document.createElement("div");
  d.id = "fu-badge";
  d.style.cssText = "position:fixed;bottom:14px;right:14px;background:rgba(4,42,43,.88);color:#c7d78f;font-size:.68rem;font-family:'Outfit',sans-serif;font-weight:700;padding:5px 12px;border-radius:20px;z-index:9999;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(0,0,0,.25);transition:all .4s;opacity:0;pointer-events:none;";
  d.innerHTML = '<span id="fu-dot" style="width:7px;height:7px;border-radius:50%;background:#aaa;flex-shrink:0;"></span><span id="fu-txt">...</span>';
  document.body.appendChild(d);
}
function _syncStatus(msg, color) {
  var dot = document.getElementById("fu-dot");
  var txt = document.getElementById("fu-txt");
  var bdg = document.getElementById("fu-badge");
  if (!dot) return;
  dot.style.background = color;
  txt.textContent = msg;
  if (bdg) { bdg.style.opacity = "1"; bdg.style.color = "#c7d78f"; }
}
function _syncErr(msg) {
  var bdg = document.getElementById("fu-badge");
  if (bdg) bdg.style.color = "#ff8a80";
  _syncStatus("❌ " + msg, "#c0392b");
}
function _syncPulse() {
  _syncStatus("✅ محفوظ", "#1e9e5e");
  var bdg = document.getElementById("fu-badge");
  if (bdg) {
    bdg.style.opacity = "1";
    clearTimeout(_badgeTimer);
    _badgeTimer = setTimeout(function() { bdg.style.opacity = "0"; }, 2500);
  }
}

// ── 8. التشغيل ─────────────────────────────────────────────────────
function _boot() {
  _injectBadge();
  if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
    _syncErr("أضف FIREBASE_CONFIG في firebase-sync.js");
    console.warn("FU-Sync: Config not set. Edit FIREBASE_CONFIG in firebase-sync.js");
    return;
  }
  _loadFirebase(_initFirebase);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _boot);
} else {
  _boot();
}
