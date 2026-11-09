# แผนแม่บทระบบเลขาส่วนตัวบน LINE (Hybrid LINE Personal Assistant) - ฉบับสมบูรณ์ (Production-Ready)

เอกสารฉบับนี้รวบรวมแผนงานและสถาปัตยกรรมระบบเลขาส่วนตัวแบบผสมผสาน (Hybrid) ระหว่าง **แชท LINE + พลัง AI อัจฉริยะ (สั่งงานด้วยข้อความภาษาพูด, รูปถ่ายใบนัด, และเสียงพูด)** ร่วมกับ **LINE Mini App / LIFF (บริหารจัดการงานแบบเห็นภาพ เพิ่ม-ลบ-แก้ไข สะดวก)** ขับเคลื่อนด้วย **Google Apps Script + Google Sheets + Google Calendar + Gemini 2.0 Flash** ฟรี 100%

---

## 🛠️ สถาปัตยกรรมระบบ (System Architecture)

```
       +--------------------------------------------------------------+
       |                         USER (LINE)                          |
       |  (พิมพ์ข้อความภาษาพูด / ถ่ายรูปใบนัด / ส่งข้อความเสียง)       |
       +-------------------------------+------------------------------+
                                       |
                   +-------------------+--------------------+
                   |                                        |
      (Text / Image / Voice / Postback)             (Tap Menu to Open)
                   |                                        |
                   v                                        v
       +-----------------------+                +-----------------------+
       |   LINE Official Bot   |                |   LINE Mini App/LIFF  |
       |     (Messaging API)   |                | (HTML5 + Tailwind CSS)|
       +-----------+-----------+                | (GitHub Pages/Vercel) |
                   |                            +-----------+-----------+
            (Webhook POST)                                  | (HTTPS REST API)
                   |                                        |
                   v                                        v
       +---------------------------------------------------------------+
       |             Google Apps Script Web App (Backend API)          |
       |  - Auth Guard (ตรวจเช็ก OWNER_LINE_USER_ID)                   |
       |  - Concurrency Lock (LockService ป้องกันข้อมูลชนกัน)           |
       |  - Timezone: Asia/Bangkok                                     |
       +-----------+-----------------------------------+---------------+
                   |                                   |
                   v (Multimodal Request)              v
       +-----------------------+           +-----------------------+
       |  Gemini 2.0 Flash API |           |     Google Sheets     |
       |  (Free Tier - 1500/วัน)|           |  - Active_Tasks Tab   |
       |  Text / Image / Audio |           |  - Archive_Tasks Tab  |
       |  -> Structured JSON   |           +-----------+-----------+
       +-----------------------+                       |
                                                       v (Two-Way Sync ID)
                                           +-----------------------+
                                           |    Google Calendar    |
                                           |  - Native Mobile Sync |
                                           +-----------------------+
                                                       ^
                                                       | (Scan every 5 min)
                                           +-----------+-----------+
                                           |   Time-driven Trigger |
                                           +-----------------------+
```

* **Backend & API:** Google Apps Script (GAS) ทำหน้าที่เป็น Webhook Router, REST API (`doGet`, `doPost`), และ Engine เชื่อมต่อบริการต่างๆ
* **AI Engine:** Google Gemini 2.0 Flash (Free Tier: 1,500 คำขอ/วัน) ทำหน้าที่สกัดเจตนา วัน เวลา ชื่องาน จากข้อความ ภาพ และเสียง ส่งกลับเป็น Structured JSON
* **Database:** Google Sheets แบ่งเป็น 2 แท็บ (`Active_Tasks` และ `Archive_Tasks`) เพื่อความเร็วสูงสุด
* **Frontend:** LIFF Web App โฮสต์แบบ Decoupled บน GitHub Pages หรือ Vercel (ฟรี โหลดเร็ว มี SSL อัตโนมัติ)
* **Calendar Sync:** Google Calendar API ผ่าน `CalendarApp` ของ GAS
* **Notification:** LINE Messaging API รองรับ Flex Message แบบโต้ตอบได้ (Interactive Action Buttons)

---

## 🗄️ โครงสร้างฐานข้อมูล (Database Schema)

ไฟล์ Google Sheets ชื่อ `LINE_Assistant_Hybrid` แบ่งเป็น 2 แท็บ:

### แท็บที่ 1: `Active_Tasks` (สำหรับงานที่กำลังดำเนินการ)
เก็บบันทึกเฉพาะงานที่สถานะ `PENDING` เท่านั้น เพื่อให้การสแกนทุก 5 นาทีประมวลผลได้เร็วระดับเสี้ยววินาที (< 0.5 วินาที)

| Column | Header Name | Data Type | Description |
| :---: | :--- | :--- | :--- |
| **A** | `id` | String | Unique ID ประจำงาน (เช่น `task_1710000000_abc`) |
| **B** | `userId` | String | LINE User ID ของผู้ใช้ |
| **C** | `task` | String | ชื่องานหรือรายละเอียดนัดหมาย |
| **D** | `targetTime` | String | วันเวลาเป้าหมาย (`YYYY-MM-DD HH:mm`) |
| **E** | `remindBeforeMin` | Number | จำนวนนาทีเตือนล่วงหน้า (0, 15, 30, 60, 1440) |
| **F** | `repeatType` | String | การทำซ้ำ: `NONE`, `DAILY`, `WEEKLY`, `MONTHLY` |
| **G** | `status` | String | สถานะ: `PENDING`, `NOTIFIED` |
| **H** | `calendarEventId` | String | รหัส Event บน Google Calendar |
| **I** | `createdAt` | String | วันเวลาที่สร้าง (`YYYY-MM-DD HH:mm:ss`) |

### แท็บที่ 2: `Archive_Tasks` (สำหรับงานที่เสร็จสิ้นหรือยกเลิก)
โครงสร้างเหมือน `Active_Tasks` แต่เพิ่มคอลัมน์ **J: `completedAt`** เมื่องานเสร็จสิ้น ระบบจะย้ายแถวจาก `Active_Tasks` มายังแท็บนี้ทันที

---

## 🤖 ระบบรับคำสั่งอัจฉริยะผ่าน AI (Gemini 2.0 Flash Multimodal Engine - Free 100%)

ระบบใช้ **Gemini 2.0 Flash** แปลงข้อมูลนำเข้า 3 รูปแบบให้กลายเป็น **Structured JSON** โดยอัตโนมัติ:

```json
{
  "task": "ชื่อภารกิจหรือนัดหมาย",
  "targetTime": "YYYY-MM-DD HH:mm",
  "remindBeforeMin": 30,
  "repeatType": "NONE"
}
```

### 1. 💬 พิมพ์สั่งงานด้วยภาษาพูด (Natural Language Text Input)
* พิมพ์ภาษาพูดทั่วไปในแชทได้โดยไม่ต้องจำรูปแบบคำสั่ง เช่น:
  * *"พรุ่งนี้บ่ายสองครึ่ง นัดคุยงานกับคุณสมชาย เตือนก่อนครึ่งชั่วโมงด้วยนะ"*
  * *"อีก 45 นาทีเตือนไปรับลูกที่โรงเรียน"*
  * *"วันจันทร์หน้าสิบโมงเช้า นัดหมอฟัน"*
* AI จะคำนวณวันและเวลาเป้าหมายเทียบกับเวลาปัจจุบัน แล้วบันทึกงานให้ทันที

### 2. 📸 ถ่ายรูปใบนัด / ป้ายประกาศงาน (Snap-to-Task Image Input)
* ถ่ายรูปหรือส่งภาพเข้าห้องแชท เช่น:
  * **ใบนัดโรงพยาบาล / ใบนัดหมอฟัน**
  * **ป้ายโปสเตอร์งานสัมมนา / การ์ดแต่งงาน / บัตรเชิญ**
  * **ภาพแคปหน้าจอแชทงานหรืออีเมลที่มีวันเวลานัดหมาย**
* GAS ดึงไฟล์ภาพส่งให้ Gemini Vision อ่านข้อความ สกัดชื่องาน วัน เวลา สถานที่ แล้วตอบกลับเป็นการ์ดสรุปให้ยืนยันก่อนบันทึก

### 3. 🎙️ ส่งเสียงสั่งงาน (Voice Memo Audio Input)
* เหมาะสำหรับเวลาขับรถ เดิน หรือไม่สะดวกพิมพ์:
  * กดปุ่มบันทึกเสียงใน LINE แล้วพูด เช่น *"อย่าลืมจ่ายค่าบัตรเครดิตวันศุกร์นี้สี่โมงเย็น"*
  * GAS ดึงไฟล์เสียง `.m4a` ส่งให้ Gemini Audio ถอดเสียงและสกัดออกมาเป็นตารางงานได้ในคำขอเดียว

---

## 🚀 ฟังก์ชันการทำงานหลักอื่นๆ (Core Features)

### 1. ระบบแจ้งเตือนอัจฉริยะแบบโต้ตอบได้ (Interactive Reminder & Snooze)
* Time-driven Trigger รันทุก **5 นาที** ตรวจสอบงานที่ถึงเวลาแจ้งเตือน
* ส่ง **LINE Flex Message** แจ้งเตือนพร้อมปุ่มโต้ตอบด่วน:
  * **[ เสร็จสิ้น (Done) ]** $\rightarrow$ ส่ง Postback ย้ายงานไปยัง Archive และอัปเดต Google Calendar
  * **[ เลื่อน 15 นาที (Snooze 15m) ]** $\rightarrow$ เลื่อนเวลาเตือนออกไป 15 นาที
  * **[ เลื่อน 1 ชม. (Snooze 1h) ]** $\rightarrow$ เลื่อนเวลาเตือนออกไป 1 ชั่วโมง
* **Morning Briefing:** ทุกวันเวลา 08:00 น. บอทยิงสรุปงานประจำวันใน 1 Flex Message (ช่วยคุมโควตา Push Message ไม่เกิน 30 ข้อความ/เดือน)

### 2. การดูตารางงานด่วนผ่านแชท (Chat Quick View)
* พิมพ์ `ตารางวันนี้` $\rightarrow$ ส่ง Flex Message สรุปงานวันนี้เรียงตามเวลา (ฟรี ไม่หักโควตา Push)
* พิมพ์ `งานที่ค้าง` $\rightarrow$ สรุปงานค้างทั้งหมดที่ยังไม่ได้ทำ

### 3. ระบบจัดการงานผ่าน LINE Mini App / LIFF (Full Management UI)
* หน้า Dashboard สวยงามเปิดผ่าน Rich Menu ใน LINE
* แยกแท็บ: **งานวันนี้ (Today)**, **เร็วๆ นี้ (Upcoming)**, และ **ประวัติงาน (History)**
* ฟอร์ม Add / Edit งานแบบสัมผัส มี Date & Time Picker ใช้งานง่าย

### 4. ซิงค์ปฏิทินสองทาง (Google Calendar Integration)
* สร้าง แก้ไข และลบงาน ซิงค์ตรงกับ Google Calendar อัตโนมัติแบบ Real-time ผ่าน `calendarEventId`

---

## 🛡️ มาตรการความปลอดภัยและความเสถียร (Security & Reliability)

1. **Owner Authentication:** ตรวจสอบ `OWNER_LINE_USER_ID` ทุก Request เพื่อป้องกันคนอื่นส่งคำสั่งป่วน
2. **Concurrency Lock:** ใช้ `LockService` จัดคิวการเขียน Sheets ป้องกันข้อมูลชนกันระหว่าง Trigger และ LIFF
3. **Timezone:** กำหนด `"timeZone": "Asia/Bangkok"` ใน `appsscript.json` และคำนวณด้วย `Utilities.formatDate()` เสมอ

---

## 📅 แผนการพัฒนาตามลำดับ (Step-by-Step Implementation Roadmap)

```
[ Phase 1: Database & Backend Core ]
  ├── สร้าง Google Sheets (Active_Tasks + Archive_Tasks)
  ├── ตั้งค่า GAS Project + Timezone Asia/Bangkok + เก็บ Gemini API Key
  └── เขียน Code.gs: Auth Guard, LockService, CRUD API, CalendarApp Sync
               │
               ▼
[ Phase 2: AI Engine Integration (Gemini 2.0 Flash) ]
  ├── ฟังก์ชันรับและวิเคราะห์ข้อความภาษาพูด (Natural Language Text Parser)
  ├── ฟังก์ชันรับรูปภาพใบนัด/ป้ายงานจาก LINE Message -> Gemini Vision
  └── ฟังก์ชันรับไฟล์เสียง Voice Message -> Gemini Audio
               │
               ▼
[ Phase 3: Automation & Interactive Messaging ]
  ├── พัฒนา Flex Message Templates (Card แจ้งเตือน + ปุ่ม Done / Snooze)
  ├── ติดตั้ง Time-driven Trigger (ตรวจทุก 5 นาที + Morning Briefing 08:00)
  └── จัดการ LINE Webhook Postback
               │
               ▼
[ Phase 4: Frontend LIFF Application ]
  ├── พัฒนาหน้าเว็บ Responsive (HTML5 + Tailwind CSS)
  ├── ผูก LIFF SDK (@line/liff) จัดการ Login ดึง userId
  └── Deploy บน GitHub Pages หรือ Vercel และนำ URL ไปผูกกับ LIFF
               │
               ▼
[ Phase 5: LINE Integration & Rich Menu ]
  ├── เชื่อมต่อ Webhook URL เต็มระบบ
  └── ออกแบบและติดตั้ง Rich Menu 3 ช่อง (เปิดแอป, ตารางวันนี้, งานค้าง)
```
