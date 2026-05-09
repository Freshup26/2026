// ═══════════════════════════════════════════════════════════════════
//  فريش آب — Firebase Real-Time Sync  v2.0
//  يضمن تزامن البيانات بين الكاشير والمشرف والمدير
// ═══════════════════════════════════════════════════════════════════

// ── 1. FIREBASE CONFIG ──────────────────────────────────────────────
//  ❗ استبدل هذه القيم بإعدادات مشروعك من Firebase Console
var FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ── 2. المفاتيح المشتركة بين الأنظمة الثلاثة ──────────────────────
var SYNC_KEYS = [
  "fu_balance",    // موازنة الفروع   (cashier: KEYS.balance)
  "fu_inventory",  // الجرد           (cashier: KEYS.inventory)
  "fu_entries",    // الاكسبايري      (cashier: KEYS.expiry)
  "fu_needs",      // الاحتياجات      (cashier: KEYS.needs)
  "fu_goals",      // أهداف المبيعات
  "fu_prices",     // الأسعار والتكاليف
  "fu_nc",         // حالة توفير الاحتياجات
  "fu_employees",  // بيانات الموظفين
  "fu_recon",      // مطابقة البنك
  "fu_col_notes",  // ملاحظات التحصيل
  "fu_import_log"  // سجل الاستيراد
];
 
// مفاتيح تبقى محلية فقط (لا تُرفع لـ Firebase)
var LOCAL_ONLY = ["fu_lang", "fu_credentials", "fu_user"];
 
// ── 3. المتغيرات الداخلية ──────────────────────────────────────────
var FU_DB        = null;
var FU_READY     = false;
var FU_CACHE     = {};
var _writeTimers = {};
var _renderTimer = null;
var _badgeTimer  = null;
 
// ── FIX A: تطبيق patch على localStorage فوراً (قبل أي كود آخر) ────
// هذا يضمن أن كل قراءة تأتي من FU_CACHE إذا كان البيانات موجودة فيه
window._realLS = window.localStorage;
 
var _pLS = {
  getItem: function(key) {
    // أولاً: ابحث في FU_CACHE (بيانات Firebase)
    if (FU_CACHE.hasOwnProperty(key) && FU_CACHE[key] !== null && FU_CACHE[key] !== undefined) {
      return FU_CACHE[key];
    }
    // ثانياً: ارجع للـ localStorage المحلي
    return window._realLS.getItem(key);
  },
  setItem: function(key, value) {
    // احفظ محلياً دائماً كـ fallback
    try { window._realLS.setItem(key, value); } catch(e) {}
 
    // تجاهل المفاتيح المحلية
    if (LOCAL_ONLY.indexOf(key) >= 0) return;
 
    // هل هو مفتاح مزامنة؟
    var sync = SYNC_KEYS.some(function(k) {
      return key === k || key.startsWith(k);
    });
    if (!sync) return;
 
    // حدّث FU_CACHE فوراً (optimistic update)
    FU_CACHE[key] = value;
 
    // أرسل لـ Firebase بعد 400ms (debounce)
    if (!FU_DB) return;
    clearTimeout(_writeTimers[key]);
    _writeTimers[key] = setTimeout(function() {
      FU_DB.ref("freshup/" + key).set(value)
        .then(function() { _syncPulse(); })
        .catch(function(e) {
          _syncErr("خطأ كتابة");
          console.error("FU-Sync write error [" + key + "]:", e);
        });
    }, 400);
  },
  removeItem: function(key) {
    try { window._realLS.removeItem(key); } catch(e) {}
    delete FU_CACHE[key];
    if (FU_DB) FU_DB.ref("freshup/" + key).remove();
  },
  key:   function(n) { return window._realLS.key(n); },
  clear: function()  { /* لا نمسح Firebase */ window._realLS.clear(); }
};
 
// تطبيق الـ patch على window.localStorage
try {
  Object.defineProperty(window, "localStorage", {
    get: function() { return _pLS; },
    configurable: true
  });
} catch(e) {
  console.warn("FU-Sync: Could not override localStorage:", e);
}
 
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
    s.onerror = function() { _syncErr("فشل تحميل Firebase"); };
    document.head.appendChild(s);
  });
}
 
// ── 5. تهيئة Firebase ─────────────────────────────────────────────
function _initFirebase() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    FU_DB = firebase.database();
    _syncStatus("جاري التحميل...", "#d4721f");
    console.log("FU-Sync: Firebase initialized");
 
    // ── FIX B: اقرأ كل البيانات مرة واحدة ثم استمع للتغييرات ──────
    FU_DB.ref("freshup").once("value")
      .then(function(snap) {
        var data = snap.val() || {};
        var count = 0;
 
        // أدخل كل البيانات في FU_CACHE وفي localStorage الحقيقي
        Object.keys(data).forEach(function(k) {
          if (data[k] !== null && data[k] !== undefined) {
            FU_CACHE[k] = data[k];
            try { window._realLS.setItem(k, data[k]); } catch(e) {}
            count++;
          }
        });
 
        FU_READY = true;
        _syncStatus("متصل ✅", "#1e9e5e");
        console.log("FU-Sync: Loaded " + count + " keys from Firebase");
 
        // ── FIX C: أعد تهيئة الصفحة بعد تحميل البيانات ─────────────
        // هذا يضمن أن الصفحة تُعرض ببيانات Firebase وليس localStorage الفارغ
        _triggerRerender();
 
        // استمع للتغييرات الجديدة (Real-time)
        FU_DB.ref("freshup").on("child_changed", function(snap) {
          var k  = snap.key;
          var val = snap.val();
          if (val !== null) {
            FU_CACHE[k] = val;
            try { window._realLS.setItem(k, val); } catch(e) {}
          }
          // أعد الرسم بعد 300ms
          clearTimeout(_renderTimer);
          _renderTimer = setTimeout(_triggerRerender, 300);
        });
 
        FU_DB.ref("freshup").on("child_added", function(snap) {
          if (!FU_READY) return; // تجاهل الأحداث الأولية
          var k   = snap.key;
          var val = snap.val();
          if (val !== null && FU_CACHE[k] !== val) {
            FU_CACHE[k] = val;
            try { window._realLS.setItem(k, val); } catch(e) {}
            clearTimeout(_renderTimer);
            _renderTimer = setTimeout(_triggerRerender, 300);
          }
        });
      })
      .catch(function(e) {
        FU_READY = true; // استمر بالعمل محلياً
        _syncErr("خطأ في القراءة");
        console.error("FU-Sync read error:", e);
      });
 
  } catch(e) {
    _syncErr("خطأ في الإعداد");
    console.error("FU-Sync init error:", e);
  }
}
 
// ── إعادة رسم الصفحة الحالية ──────────────────────────────────────
function _triggerRerender() {
  if (typeof rAll === "function") {
    rAll();
  } else if (typeof renderDash === "function") {
    renderDash();
  }
  if (typeof updBadges === "function") {
    setTimeout(updBadges, 150);
  }
}
 
// ── 6. مؤشر الحالة (أسفل يمين الشاشة) ────────────────────────────
function _injectBadge() {
  if (document.getElementById("fu-badge")) return;
  var d = document.createElement("div");
  d.id = "fu-badge";
  d.innerHTML = '<span id="fu-dot" style="width:8px;height:8px;border-radius:50%;background:#d4721f;flex-shrink:0;display:inline-block;"></span> <span id="fu-txt">Firebase...</span>';
  d.style.cssText = [
    "position:fixed", "bottom:14px", "right:14px",
    "background:rgba(4,42,43,.9)", "color:#c7d78f",
    "font-size:.68rem", "font-family:'Outfit',sans-serif", "font-weight:700",
    "padding:5px 13px", "border-radius:20px", "z-index:99999",
    "display:flex", "align-items:center", "gap:6px",
    "box-shadow:0 2px 12px rgba(0,0,0,.3)",
    "transition:opacity .5s", "pointer-events:none"
  ].join(";");
  document.body.appendChild(d);
}
 
function _syncStatus(msg, color) {
  var dot = document.getElementById("fu-dot");
  var txt = document.getElementById("fu-txt");
  var bdg = document.getElementById("fu-badge");
  if (!dot) return;
  dot.style.background = color || "#aaa";
  txt.textContent = msg;
  if (bdg) bdg.style.opacity = "1";
}
 
function _syncErr(msg) {
  _syncStatus("❌ " + msg, "#c0392b");
  var bdg = document.getElementById("fu-badge");
  if (bdg) bdg.style.color = "#ff8a80";
}
 
function _syncPulse() {
  _syncStatus("✅ تم الحفظ", "#1e9e5e");
  clearTimeout(_badgeTimer);
  _badgeTimer = setTimeout(function() {
    var bdg = document.getElementById("fu-badge");
    if (bdg) bdg.style.opacity = "0";
  }, 3000);
}
 
// ── 7. API عام للاستخدام من باقي الملفات ─────────────────────────
window.FU_SYNC = {
  isReady:    function() { return FU_READY; },
  getCache:   function() { return FU_CACHE; },
  forceWrite: function(key, value) { _pLS.setItem(key, value); },
  reload:     function() { _triggerRerender(); }
};
 
// ── 8. التشغيل ─────────────────────────────────────────────────────
(function() {
  function _boot() {
    _injectBadge();
    if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
      _syncErr("أضف FIREBASE_CONFIG في firebase-sync.js");
      console.warn("FU-Sync: FIREBASE_CONFIG not configured.");
      return;
    }
    _loadFirebase(_initFirebase);
  }
 
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _boot);
  } else {
    _boot();
  }
})();
 
