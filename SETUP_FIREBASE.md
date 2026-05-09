# 🔥 إعداد Firebase للمزامنة بين الأنظمة

## الخطوات (10 دقائق)

### 1. إنشاء مشروع Firebase
1. اذهب إلى: https://console.firebase.google.com
2. اضغط **Add project** ← اسمه مثلاً `freshup-app`
3. أوقف Google Analytics (اختياري) ← **Create project**

### 2. إنشاء Realtime Database
1. من القائمة اليسرى ← **Build** ← **Realtime Database**
2. اضغط **Create Database**
3. اختر المنطقة: **United States** (الأقرب والمجاني)
4. اختر **Start in test mode** ← **Enable**

### 3. نسخ إعدادات المشروع
1. اضغط ⚙️ (الترس) بجوار Project Overview ← **Project settings**
2. انزل لأسفل ← قسم **Your apps** ← اضغط **</>** (Web)
3. سمّ التطبيق `freshup-web` ← **Register app**
4. **انسخ** الكود الذي يظهر (firebaseConfig)

### 4. تعديل ملف `firebase-sync.js`
افتح الملف وعدّل القسم الأول:

```javascript
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",          // ← من Firebase
  authDomain:        "freshup-app.firebaseapp.com",
  databaseURL:       "https://freshup-app-default-rtdb.firebaseio.com",
  projectId:         "freshup-app",
  storageBucket:     "freshup-app.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc..."
};
```

### 5. رفع الملفات على GitHub
ارفع **جميع** الملفات معاً:
```
├── firebase-sync.js   ← الجديد
├── cashier.html
├── supervisor.html
├── supervisor_bilingual.html
├── manager.html
└── uploader.html
```

---

## هيكل البيانات في Firebase

```
freshup/
  ├── fu_balance      → موازنة الفروع (JSON array)
  ├── fu_entries      → الاكسبايري (JSON array)
  ├── fu_inventory    → الجرد (JSON array)
  ├── fu_needs        → الاحتياجات (JSON array)
  ├── fu_goals        → أهداف المبيعات (JSON object)
  ├── fu_prices       → الأسعار (JSON object)
  ├── fu_nc           → حالة التوفير (JSON object)
  ├── fu_employees    → بيانات الموظفين (JSON object)
  ├── fu_recon        → مطابقة البنك (JSON object)
  └── fu_col_notes    → ملاحظات التحصيل (JSON object)
```

---

## الحماية (مهم!)
بعد الإعداد والاختبار، غيّر Rules في Firebase:

**Realtime Database ← Rules:**
```json
{
  "rules": {
    "freshup": {
      ".read": true,
      ".write": true
    }
  }
}
```

> للإنتاج: أضف Authentication لحماية أفضل

---

## علامة الحالة
بعد الإعداد الصحيح، ستظهر في كل صفحة:
- 🟢 **متصل** — Firebase يعمل
- ✅ **محفوظ** — تم حفظ البيانات
- ❌ **خطأ** — تحقق من الإعدادات
