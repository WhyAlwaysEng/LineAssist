# คู่มือการติดตั้ง Phase 1: Database & Backend Core

คู่มือนี้จะพาคุณติดตั้งหลังบ้าน (Backend) บน **Google Sheets** และ **Google Apps Script (GAS)** โดยใช้เวลาประมาณ 3-5 นาที

---

### ขั้นตอนที่ 1: สร้าง Google Sheets
1. เปิดเบราว์เซอร์ไปที่ [Google Sheets](https://sheets.new) เพื่อสร้างสเปรดชีตใหม่
2. ตั้งชื่อไฟล์ที่มุมซ้ายบนว่า: **`LINE_Assistant_Hybrid`**

---

### ขั้นตอนที่ 2: เปิดโปรเจกต์ Google Apps Script
1. ที่เมนูด้านบนของ Google Sheets ให้คลิกที่ **Extensions (ส่วนขยาย)** $\rightarrow$ **Apps Script**
2. หน้าต่างแก้ไขโค้ด Apps Script จะเปิดขึ้นมา ตั้งชื่อโปรเจกต์ที่มุมซ้ายบนว่า **`LINE_Assistant_Backend`**

---

### ขั้นตอนที่ 3: วางโค้ด Backend
1. ในหน้าต่าง Apps Script จะมีไฟล์ชื่อ `Code.gs` ให้ **ลบโค้ดเดิมทั้งหมดทิ้ง**
2. คัดลอกโค้ดทั้งหมดจากไฟล์:
   👉 [`gas/Code.js`](file:///e:/Engprogram/LineAssist/gas/Code.js)
   แล้วนำไปวางลงใน `Code.gs`
3. กดปุ่ม **บันทึก (Save / รูปแผ่นดิสก์)**

---

### ขั้นตอนที่ 4: ตั้งค่า Timezone (ให้เป็นเวลาประเทศไทย)
1. ที่เมนูแถบซ้ายของ Apps Script ให้คลิกที่ **รูปฟันเฟือง ⚙️ (Project Settings / การตั้งค่าโครงการ)**
2. ติ๊กถูกที่ช่อง **"Show 'appsscript.json' manifest file in editor" (แสดงไฟล์ Manifest appsscript.json ในตัวแก้ไข)**
3. กลับมาที่เมนู **Editor (ตัวแก้ไข / รูป <>)** จะเห็นไฟล์ `appsscript.json` เพิ่มขึ้นมา
4. นำเนื้อหาจากไฟล์ [`gas/appsscript.json`](file:///e:/Engprogram/LineAssist/gas/appsscript.json) ไปวางทับ แล้วกดบันทึก

---

### ขั้นตอนที่ 5: สั่งรันฟังก์ชันเตรียมตารางข้อมูล (setupDatabase)
1. ในแถบเครื่องมือด้านบน เลือกฟังก์ชันเป็น **`setupDatabase`**
2. กดปุ่ม **▷ Run (เรียกใช้)**
3. Google จะขอสิทธิ์การเข้าถึง (Authorization Required):
   * คลิก **Review permissions (ตรวจสอบสิทธิ์)**
   * เลือกบัญชี Google ของคุณ
   * คลิก **Advanced (ขั้นสูง)** ที่ด้านล่างซ้าย
   * คลิก **Go to LINE_Assistant_Backend (unsafe) / ไปที่ ... (ไม่ปลอดภัย)**
   * คลิก **Allow (อนุญาต)**
4. เมื่อรันเสร็จ ให้สลับกลับไปดูที่หน้า Google Sheets จะเห็นแท็บ **`Active_Tasks`** (สีกรมท่า) และ **`Archive_Tasks`** (สีเทา) ถูกสร้างและจัดหัวตารางให้อัตโนมัติอย่างสวยงาม 🎉

---

### ขั้นตอนที่ 6: ทดสอบ Deploy เป็น Web App (ทดสอบ REST API)
1. ที่มุมขวาบนของ Apps Script คลิกปุ่มสีน้ำเงิน **Deploy (ทำให้ใช้งานได้)** $\rightarrow$ **New deployment (การทำให้ใช้งานได้ใหม่)**
2. คลิกรูปฟันเฟือง ⚙️ ด้านซ้าย เลือก **Web app**
3. ตั้งค่าดังนี้:
   * **Description:** `v1-backend-core`
   * **Execute as:** `Me (บัญชีของคุณ)`
   * **Who has access:** `Anyone (ทุกคน)` *(เพื่อให้ LIFF และ LINE Webhook ยิงเข้ามาได้)*
4. คลิก **Deploy** แล้วคัดลอก **Web app URL** เก็บไว้ (URL นี้จะนำไปใช้ใน Phase ถัดไป)

---

### ✅ ตรวจสอบความถูกต้องของ Phase 1:
ลองนำ **Web app URL** ไปเปิดในเบราว์เซอร์แล้วเติม `?action=ping` ต่อท้าย เช่น:
```
https://script.google.com/macros/s/AKfycb.../exec?action=ping
```
หากขึ้นข้อความ:
```json
{"success":true,"message":"LINE Assistant Backend is Online 🚀"}
```
แสดงว่า **Phase 1 เสร็จสมบูรณ์ 100% พร้อมเชื่อมต่อ AI และ LIFF ในก้าวต่อไปครับ!**
