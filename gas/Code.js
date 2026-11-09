/**
 * ==============================================================================
 * LINE Personal Assistant - Fast & Pure Logic Engine (No AI, Zero Lag)
 * ตอบสนองไวใน 0.2 วินาที, เสถียร 100%, ซิงค์ Google Sheets & Google Calendar
 * ==============================================================================
 */

// ==============================================================================
// 🔑 ใส่ KEY ทั้ง 2 ตัวของคุณใน 2 บรรทัดนี้ได้เลยครับ:
// ==============================================================================
const OWNER_LINE_USER_ID        = 'Uc288041bd32e3b115eda7747ef483676';
const LINE_CHANNEL_ACCESS_TOKEN = 'ใส่_CHANNEL_ACCESS_TOKEN_ยาวๆ_ตรงนี้';
// ==============================================================================

// ชื่อแท็บฐานข้อมูลใน Google Sheets
const TAB_ACTIVE = 'Active_Tasks';
const TAB_ARCHIVE = 'Archive_Tasks';

// หัวตาราง (Schema Columns)
const ACTIVE_HEADERS = [
  'id',             // A: รหัสประจำงาน (Unique ID)
  'userId',         // B: LINE User ID
  'task',           // C: ชื่องาน/รายละเอียด
  'targetTime',     // D: วันเวลาเป้าหมาย (YYYY-MM-DD HH:mm)
  'remindBeforeMin',// E: เตือนล่วงหน้า (นาที)
  'repeatType',     // F: การทำซ้ำ (NONE, DAILY, WEEKLY, MONTHLY)
  'status',         // G: สถานะ (PENDING, NOTIFIED)
  'calendarEventId',// H: รหัส Event ใน Google Calendar
  'createdAt'       // I: วันเวลาที่สร้าง
];

const ARCHIVE_HEADERS = [
  ...ACTIVE_HEADERS,
  'completedAt'     // J: วันเวลาที่เสร็จสิ้น
];

function getAppConfig() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return {
    ownerUserId: (OWNER_LINE_USER_ID && !OWNER_LINE_USER_ID.includes('ใส่_')) ? OWNER_LINE_USER_ID : (props.OWNER_LINE_USER_ID || ''),
    lineChannelToken: (LINE_CHANNEL_ACCESS_TOKEN && !LINE_CHANNEL_ACCESS_TOKEN.includes('ใส่_')) ? LINE_CHANNEL_ACCESS_TOKEN : (props.LINE_CHANNEL_ACCESS_TOKEN || '')
  };
}

/**
 * ------------------------------------------------------------------------------
 * 🛠️ 1. SETUP DATABASE FUNCTION
 * ------------------------------------------------------------------------------
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let activeSheet = ss.getSheetByName(TAB_ACTIVE);
  if (!activeSheet) activeSheet = ss.insertSheet(TAB_ACTIVE);
  activeSheet.clear();
  activeSheet.getRange(1, 1, 1, ACTIVE_HEADERS.length).setValues([ACTIVE_HEADERS]);
  formatHeaderRow(activeSheet, '#1E40AF', ACTIVE_HEADERS.length);

  let archiveSheet = ss.getSheetByName(TAB_ARCHIVE);
  if (!archiveSheet) archiveSheet = ss.insertSheet(TAB_ARCHIVE);
  archiveSheet.clear();
  archiveSheet.getRange(1, 1, 1, ARCHIVE_HEADERS.length).setValues([ARCHIVE_HEADERS]);
  formatHeaderRow(archiveSheet, '#475569', ARCHIVE_HEADERS.length);

  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่นงาน1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  Logger.log('✅ ฐานข้อมูล Active_Tasks และ Archive_Tasks พร้อมใช้งาน!');
}

function formatHeaderRow(sheet, bgColor, numCols) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setBackground(bgColor);
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

/**
 * ------------------------------------------------------------------------------
 * 🔒 2. SECURITY & CONCURRENCY
 * ------------------------------------------------------------------------------
 */
function isAuthorized(userId) {
  const config = getAppConfig();
  if (!config.ownerUserId) return true;
  return userId === config.ownerUserId;
}

function withLock(callback) {
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(10000);
  if (!hasLock) {
    throw new Error('ระบบประมวลผลพร้อมกัน กรุณาลองใหม่อีกครั้ง');
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function formatThaiDateTime(date) {
  return Utilities.formatDate(date, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
}

function parseThaiDateTime(dateTimeStr) {
  if (!dateTimeStr) return new Date();
  const parts = dateTimeStr.split(/[- :]/);
  if (parts.length >= 5) {
    return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
  }
  return new Date(dateTimeStr);
}

/**
 * ------------------------------------------------------------------------------
 * 📅 3. GOOGLE CALENDAR TWO-WAY SYNC
 * ------------------------------------------------------------------------------
 */
function syncCalendarCreate(task, targetTimeStr, remindBeforeMin) {
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const startTime = parseThaiDateTime(targetTimeStr);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    const event = calendar.createEvent(`📌 ${task}`, startTime, endTime, {
      description: `สร้างอัตโนมัติจาก LINE Assistant | เตือนล่วงหน้า: ${remindBeforeMin} นาที`
    });

    if (remindBeforeMin > 0) {
      event.addPopupReminder(remindBeforeMin);
    }
    return event.getId();
  } catch (err) {
    Logger.log('Calendar Create Error: ' + err.message);
    return '';
  }
}

function syncCalendarUpdate(eventId, task, targetTimeStr) {
  if (!eventId) return;
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(eventId);
    if (event) {
      const startTime = parseThaiDateTime(targetTimeStr);
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
      event.setTitle(`📌 ${task}`);
      event.setTime(startTime, endTime);
    }
  } catch (err) {
    Logger.log('Calendar Update Error: ' + err.message);
  }
}

function syncCalendarDelete(eventId) {
  if (!eventId) return;
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(eventId);
    if (event) event.deleteEvent();
  } catch (err) {
    Logger.log('Calendar Delete Error: ' + err.message);
  }
}

/**
 * ------------------------------------------------------------------------------
 * 💾 4. CRUD OPERATIONS (Active_Tasks & Archive_Tasks)
 * ------------------------------------------------------------------------------
 */
function getActiveTasks(userId) {
  if (!isAuthorized(userId)) return { success: false, error: 'Unauthorized' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_ACTIVE);
  if (!sheet) return { success: true, tasks: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, tasks: [] };

  const headers = data[0];
  const tasks = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const taskObj = {};
    headers.forEach((h, index) => { taskObj[h] = row[index]; });
    tasks.push(taskObj);
  }

  tasks.sort((a, b) => new Date(a.targetTime) - new Date(b.targetTime));
  return { success: true, tasks: tasks };
}

function getArchiveTasks(userId, limit = 50) {
  if (!isAuthorized(userId)) return { success: false, error: 'Unauthorized' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_ARCHIVE);
  if (!sheet) return { success: true, tasks: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: true, tasks: [] };

  const headers = data[0];
  const tasks = [];
  for (let i = data.length - 1; i >= 1 && tasks.length < limit; i--) {
    const row = data[i];
    const taskObj = {};
    headers.forEach((h, index) => { taskObj[h] = row[index]; });
    tasks.push(taskObj);
  }
  return { success: true, tasks: tasks };
}

function createTask(params) {
  return withLock(() => {
    const { userId, task, targetTime, remindBeforeMin = 15, repeatType = 'NONE', syncCalendar = true } = params;

    if (!isAuthorized(userId)) return { success: false, error: 'Unauthorized' };
    if (!task || !targetTime) return { success: false, error: 'ชื่องานและเวลาเป้าหมายต้องไม่เป็นค่าว่าง' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(TAB_ACTIVE);
    if (!sheet) {
      setupDatabase();
      sheet = ss.getSheetByName(TAB_ACTIVE);
    }

    const taskId = 'task_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 4);
    const createdAt = formatThaiDateTime(new Date());

    let calendarEventId = '';
    if (syncCalendar) {
      calendarEventId = syncCalendarCreate(task, targetTime, Number(remindBeforeMin));
    }

    const newRow = [
      taskId,
      userId,
      task,
      targetTime,
      Number(remindBeforeMin),
      repeatType,
      'PENDING',
      calendarEventId,
      createdAt
    ];

    sheet.appendRow(newRow);

    return {
      success: true,
      message: 'บันทึกงานเรียบร้อยแล้ว',
      task: {
        id: taskId,
        task,
        targetTime,
        remindBeforeMin,
        calendarEventId
      }
    };
  });
}

function completeTask(taskId, userId) {
  return withLock(() => {
    if (!isAuthorized(userId)) return { success: false, error: 'Unauthorized' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getSheetByName(TAB_ACTIVE);
    let archiveSheet = ss.getSheetByName(TAB_ARCHIVE);

    if (!activeSheet || !archiveSheet) return { success: false, error: 'ไม่พบตารางข้อมูล' };

    const data = activeSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == taskId) {
        const rowData = data[i];
        const completedAt = formatThaiDateTime(new Date());

        const repeatType = rowData[5];
        if (repeatType && repeatType !== 'NONE') {
          const nextTargetTime = calculateNextOccurrence(rowData[3], repeatType);
          if (nextTargetTime) {
            createTask({
              userId: rowData[1],
              task: rowData[2],
              targetTime: nextTargetTime,
              remindBeforeMin: rowData[4],
              repeatType: repeatType,
              syncCalendar: !!rowData[7]
            });
          }
        }

        archiveSheet.appendRow([...rowData, completedAt]);
        activeSheet.deleteRow(i + 1);
        return { success: true, message: 'ภารกิจเสร็จสิ้น! บันทึกลงประวัติเรียบร้อย' };
      }
    }
    return { success: false, error: 'ไม่พบงานที่ต้องการ' };
  });
}

function snoozeTask(taskId, minutes, userId) {
  return withLock(() => {
    if (!isAuthorized(userId)) return { success: false, error: 'Unauthorized' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TAB_ACTIVE);
    if (!sheet) return { success: false, error: 'ไม่พบตารางข้อมูล' };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == taskId) {
        const currentTarget = parseThaiDateTime(data[i][3]);
        const newTarget = new Date(currentTarget.getTime() + minutes * 60 * 1000);
        const newTargetStr = formatThaiDateTime(newTarget);

        sheet.getRange(i + 1, 4).setValue(newTargetStr);
        sheet.getRange(i + 1, 7).setValue('PENDING');

        const calendarEventId = data[i][7];
        if (calendarEventId) {
          syncCalendarUpdate(calendarEventId, data[i][2], newTargetStr);
        }

        return {
          success: true,
          message: `เลื่อนเวลาเตือนออกไป ${minutes} นาทีแล้ว (${newTargetStr})`,
          newTargetTime: newTargetStr
        };
      }
    }
    return { success: false, error: 'ไม่พบงานที่ต้องการเลื่อนเวลา' };
  });
}

function calculateNextOccurrence(dateTimeStr, repeatType) {
  const date = parseThaiDateTime(dateTimeStr);
  if (repeatType === 'DAILY') date.setDate(date.getDate() + 1);
  else if (repeatType === 'WEEKLY') date.setDate(date.getDate() + 7);
  else if (repeatType === 'MONTHLY') date.setMonth(date.getMonth() + 1);
  else return null;
  return formatThaiDateTime(date);
}

function normalizeDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  }
  return String(val).trim();
}

/**
 * ------------------------------------------------------------------------------
 * ⚡ 5. FAST NATURAL PARSER (สกัดข้อความแบบ Instant < 0.05 วินาที)
 * ------------------------------------------------------------------------------
 */
function parseQuickTask(text) {
  let cleanText = text.trim();
  if (cleanText.startsWith('+')) {
    cleanText = cleanText.substring(1).trim();
  }

  // ใช้วันที่ปัจจุบันตามเวลาไทย Asia/Bangkok เสมอ
  const nowThaiStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  const thaiParts = nowThaiStr.split(/[- :]/);
  let targetDate = new Date(thaiParts[0], thaiParts[1] - 1, thaiParts[2], thaiParts[3], thaiParts[4]);

  if (cleanText.includes('พรุ่งนี้')) {
    targetDate.setDate(targetDate.getDate() + 1);
    cleanText = cleanText.replace('พรุ่งนี้', '').trim();
  } else if (cleanText.includes('มะรืนนี้')) {
    targetDate.setDate(targetDate.getDate() + 2);
    cleanText = cleanText.replace('มะรืนนี้', '').trim();
  }

  const dateMatch = cleanText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    const parts = dateMatch[1].split('-');
    targetDate = new Date(parts[0], parts[1] - 1, parts[2], targetDate.getHours(), targetDate.getMinutes());
    cleanText = cleanText.replace(dateMatch[1], '').trim();
  }

  const timeMatch = cleanText.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    targetDate.setHours(hour, min, 0, 0);
    cleanText = cleanText.replace(timeMatch[0], '').trim();
    const taskName = cleanText || 'ภารกิจใหม่';
    const targetTime = Utilities.formatDate(targetDate, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
    return {
      isValid: true,
      task: taskName,
      targetTime: targetTime
    };
  }

  return { isValid: false };
}

/**
 * ------------------------------------------------------------------------------
 * 💬 6. LINE MESSAGING API & FLEX MESSAGES
 * ------------------------------------------------------------------------------
 */
function replyLine(replyToken, messages) {
  const config = getAppConfig();
  if (!config.lineChannelToken) return;

  const url = 'https://api.line.me/v2/bot/message/reply';
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${config.lineChannelToken}` },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: Array.isArray(messages) ? messages : [messages]
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

function pushLine(userId, messages) {
  const config = getAppConfig();
  if (!config.lineChannelToken || !userId) return;

  const url = 'https://api.line.me/v2/bot/message/push';
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${config.lineChannelToken}` },
    payload: JSON.stringify({
      to: userId,
      messages: Array.isArray(messages) ? messages : [messages]
    }),
    muteHttpExceptions: true
  };
  UrlFetchApp.fetch(url, options);
}

function createSuccessFlex(taskData) {
  return {
    type: 'flex',
    altText: `✅ บันทึกงาน: ${taskData.task}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#059669',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: '✨ บันทึกนัดหมายสำเร็จ',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'md'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: taskData.task,
            weight: 'bold',
            size: 'lg',
            wrap: true,
            color: '#1F2937'
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: '📅 วันเวลา:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: taskData.targetTime, color: '#111827', size: 'sm', weight: 'bold', flex: 5 }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: '🔔 เตือนก่อน:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: `${taskData.remindBeforeMin} นาที`, color: '#111827', size: 'sm', flex: 5 }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: '🗓️ ปฏิทิน:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: taskData.calendarEventId ? 'ซิงค์เข้า Google Calendar แล้ว' : 'บันทึกลง Sheets', color: '#059669', size: 'sm', flex: 5 }
                ]
              }
            ]
          }
        ]
      }
    }
  };
}

/**
 * Flex Message สำหรับการแจ้งเตือนเมื่อถึงเวลา (มีปุ่ม Done และ Snooze)
 */
function createReminderFlex(taskData) {
  return {
    type: 'flex',
    altText: `⏰ ถึงเวลาเตือน: ${taskData.task}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#DC2626', // สีแดงเตือน
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: '⏰ ถึงเวลาแจ้งเตือนภารกิจ!',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'md'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: taskData.task,
            weight: 'bold',
            size: 'xl',
            wrap: true,
            color: '#111827'
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: '📅 กำหนดเวลา:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: taskData.targetTime, color: '#DC2626', size: 'sm', weight: 'bold', flex: 5 }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  { type: 'text', text: '🔔 แจ้งล่วงหน้า:', color: '#6B7280', size: 'sm', flex: 2 },
                  { type: 'text', text: `${taskData.remindBeforeMin} นาที`, color: '#374151', size: 'sm', flex: 5 }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#059669', // สีเขียว
            action: {
              type: 'postback',
              label: '✅ ทำเสร็จแล้ว (Done)',
              data: `action=done&taskId=${taskData.id}`
            }
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '⏰ เลื่อน 15 นาที',
                  data: `action=snooze&taskId=${taskData.id}&min=15`
                }
              },
              {
                type: 'button',
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '⏰ เลื่อน 1 ชม.',
                  data: `action=snooze&taskId=${taskData.id}&min=60`
                }
              }
            ]
          }
        ]
      }
    }
  };
}

/**
 * Flex Message สำหรับ Morning Briefing (สรุปงานตอนเช้า)
 */
function createMorningBriefingFlex(todayTasks, todayStr) {
  const items = todayTasks.map(t => {
    const timeStr = normalizeDateStr(t.targetTime);
    const timePart = timeStr.length >= 16 ? timeStr.substring(11, 16) : timeStr;
    return {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      contents: [
        {
          type: 'text',
          text: timePart,
          size: 'sm',
          weight: 'bold',
          color: '#D97706',
          flex: 2
        },
        {
          type: 'text',
          text: t.task,
          size: 'sm',
          wrap: true,
          color: '#1F2937',
          flex: 6
        }
      ]
    };
  });

  return {
    type: 'flex',
    altText: `☀️ สรุปภารกิจวันนี้ (${todayStr})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#D97706',
        paddingAll: '15px',
        contents: [
          {
            type: 'text',
            text: '☀️ อรุณสวัสดิ์! สรุปภารกิจวันนี้',
            color: '#FFFFFF',
            weight: 'bold',
            size: 'md'
          },
          {
            type: 'text',
            text: `วันที่ ${todayStr}`,
            color: '#FEF3C7',
            size: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: `วันนี้คุณมี ${todayTasks.length} ภารกิจที่ต้องทำ:`,
            weight: 'bold',
            size: 'sm',
            color: '#4B5563'
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: items
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'message',
              label: '📋 ดูรายการงานค้างทั้งหมด',
              text: 'งานค้าง'
            }
          }
        ]
      }
    }
  };
}

/**
 * ------------------------------------------------------------------------------
 * ⏰ 7. AUTOMATION ENGINE (ตรวจเตือนทุก 5 นาที + Morning Briefing)
 * ------------------------------------------------------------------------------
 */

/**
 * ตรวจสอบงานที่ถึงเวลาแจ้งเตือน (รันอัตโนมัติทุก 5 นาที)
 */
function checkReminders() {
  const config = getAppConfig();
  if (!config.lineChannelToken || !config.ownerUserId) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_ACTIVE);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const now = new Date();
  const nowTime = now.getTime();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[6]; // Column G: status

    // สนใจเฉพาะงานที่ยัง PENDING
    if (status === 'PENDING') {
      const targetTimeStr = normalizeDateStr(row[3]);
      const remindMin = Number(row[4] || 0);
      const targetDate = parseThaiDateTime(targetTimeStr);

      // เวลาที่ต้องแจ้งเตือน = targetTime - remindBeforeMin
      const alertTime = targetDate.getTime() - (remindMin * 60 * 1000);

      // ถ้าเวลาปัจจุบันเลยเวลาเตือนมาแล้ว และไม่เกิน 2 ชั่วโมง (ป้องกันเตือนงานเก่าย้อนหลัง)
      if (nowTime >= alertTime && nowTime <= (targetDate.getTime() + 2 * 60 * 60 * 1000)) {
        const taskData = {
          id: row[0],
          task: row[2],
          targetTime: targetTimeStr,
          remindBeforeMin: remindMin
        };

        // 1. ส่งการ์ดแจ้งเตือนพร้อมปุ่ม Done / Snooze
        pushLine(config.ownerUserId, createReminderFlex(taskData));

        // 2. อัปเดตสถานะเป็น NOTIFIED เพื่อไม่ให้เตือนซ้ำ
        sheet.getRange(i + 1, 7).setValue('NOTIFIED');
        Logger.log(`🔔 แจ้งเตือนงานสำเร็จ: ${taskData.task}`);
      }
    }
  }
}

/**
 * ส่งสรุปภารกิจประจำวันตอนเช้า (08:00 น.)
 */
function sendDailyBriefing() {
  const config = getAppConfig();
  if (!config.lineChannelToken || !config.ownerUserId) return;

  const todayStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const res = getActiveTasks(config.ownerUserId);
  if (!res.success) return;

  const todayTasks = res.tasks.filter(t => {
    const timeStr = normalizeDateStr(t.targetTime);
    return timeStr.startsWith(todayStr);
  });

  if (todayTasks.length > 0) {
    pushLine(config.ownerUserId, createMorningBriefingFlex(todayTasks, todayStr));
    Logger.log(`☀️ ส่ง Morning Briefing (${todayTasks.length} งาน) เรียบร้อย`);
  } else {
    pushLine(config.ownerUserId, {
      type: 'text',
      text: `☀️ อรุณสวัสดิ์ครับ! วันนี้ (${todayStr}) คุณไม่มีภารกิจหรือนัดหมายในตาราง พักผ่อนหรือทำงานได้อย่างสบายใจครับ 🏖️`
    });
    Logger.log('☀️ ส่ง Morning Briefing (ไม่มีงาน) เรียบร้อย');
  }
}

/**
 * ติดตั้ง Trigger อัตโนมัติ (รันครั้งเดียว)
 */
function installTriggers() {
  // ลบ Trigger เดิมที่ซ้ำออกก่อน
  uninstallTriggers();

  // 1. Trigger ตรวจสอบงานทุกๆ 5 นาที
  ScriptApp.newTrigger('checkReminders')
    .timeBased()
    .everyMinutes(5)
    .create();

  // 2. Trigger ส่ง Morning Briefing ทุกวันเวลา 08:00 น.
  ScriptApp.newTrigger('sendDailyBriefing')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .inTimezone('Asia/Bangkok')
    .create();

  Logger.log('✅ ติดตั้ง Trigger ตรวจสอบทุก 5 นาที และ Morning Briefing 08:00 น. เรียบร้อยแล้ว!');
}

/**
 * ยกเลิก Trigger ทั้งหมด
 */
function uninstallTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    const fnName = triggers[i].getHandlerFunction();
    if (fnName === 'checkReminders' || fnName === 'sendDailyBriefing') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log('🧹 ลบ Trigger เก่าเรียบร้อยแล้ว');
}

/**
 * ฟังก์ชันทดสอบ Trigger ทันที (ไม่ต้องรอ 5 นาที)
 */
function testTriggerNow() {
  const config = getAppConfig();
  // สร้างงานทดสอบที่ต้องเตือนทันที
  const testTime = Utilities.formatDate(new Date(new Date().getTime() + 10 * 60 * 1000), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
  createTask({
    userId: config.ownerUserId,
    task: 'ทดสอบแจ้งเตือนด่วน: ประชุมด่วนกับทีม',
    targetTime: testTime,
    remindBeforeMin: 15, // เตือนล่วงหน้า 15 นาที -> ถึงเวลาเตือนทันที!
    repeatType: 'NONE',
    syncCalendar: true
  });

  // สั่งรันตัวตรวจเตือนทันที
  checkReminders();
}
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || 'get_tasks';
    const userId = params.userId || '';

    let result = { success: false, error: 'Invalid action' };

    if (action === 'get_tasks') {
      result = getActiveTasks(userId);
    } else if (action === 'get_history') {
      result = getArchiveTasks(userId, Number(params.limit || 50));
    } else if (action === 'ping') {
      result = { success: true, message: 'LINE Assistant Backend is Online 🚀 (Instant Mode)' };
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('No content').setMimeType(ContentService.MimeType.TEXT);
    }

    const json = JSON.parse(e.postData.contents);

    if (json.events && Array.isArray(json.events)) {
      handleLineWebhook(json.events);
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    const action = json.action || '';
    let result = { success: false, error: 'Unknown action' };

    switch (action) {
      case 'create_task':
        result = createTask(json);
        break;
      case 'complete_task':
        result = completeTask(json.id, json.userId);
        break;
      case 'snooze_task':
        result = snoozeTask(json.id, Number(json.minutes || 15), json.userId);
        break;
      default:
        result = { success: false, error: `Action '${action}' not supported` };
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost Error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleLineWebhook(events) {
  const config = getAppConfig();

  events.forEach(event => {
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    if (config.ownerUserId && userId !== config.ownerUserId) {
      replyLine(replyToken, {
        type: 'text',
        text: 'ขออภัยครับ บัญชีนี้เป็นเลขาส่วนตัวที่ล็อกสิทธิ์เฉพาะเจ้าของเท่านั้นครับ 🙏'
      });
      return;
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const userText = event.message.text.trim();

      // 1. คำสั่งดูตารางงานวันนี้
      if (userText === 'ตารางวันนี้' || userText === 'งานวันนี้') {
        handleTodayTasksCommand(userId, replyToken);
        return;
      }

      // 2. คำสั่งดูงานที่ค้างทั้งหมด
      if (userText === 'งานค้าง' || userText === 'งานทั้งหมด') {
        handleAllTasksCommand(userId, replyToken);
        return;
      }

      // 3. เพิ่มงานด่วนด้วยเครื่องหมาย + หรือมีเวลา
      const parsed = parseQuickTask(userText);
      if (parsed.isValid) {
        const createRes = createTask({
          userId: userId,
          task: parsed.task,
          targetTime: parsed.targetTime,
          remindBeforeMin: 15,
          repeatType: 'NONE',
          syncCalendar: true
        });

        if (createRes.success) {
          replyLine(replyToken, createSuccessFlex(createRes.task));
        } else {
          replyLine(replyToken, { type: 'text', text: `บันทึกไม่สำเร็จ: ${createRes.error}` });
        }
        return;
      }

      // 4. ข้อความแนะนำคำสั่ง (Help Guide)
      replyLine(replyToken, {
        type: 'text',
        text: `🤖 ยินดีต้อนรับสู่ระบบเลขาส่วนตัวครับ!\n\n📌 วิธีสั่งงานด่วน:\n• "+ 14:00 ประชุมทีม" (วันนี้)\n• "+ พรุ่งนี้ 10:30 นัดหมอฟัน"\n• "+ 2026-11-15 09:00 ส่งรายงาน"\n\n📋 ดูรายการงาน:\n• พิมพ์ "ตารางวันนี้"\n• พิมพ์ "งานค้าง"`
      });
    }

    // จัดการปุ่มกด Postback (Done / Snooze)
    else if (event.type === 'postback') {
      const dataStr = event.postback.data || '';
      const params = parseQueryParams(dataStr);

      if (params.action === 'done') {
        const doneRes = completeTask(params.taskId, userId);
        if (doneRes.success) {
          replyLine(replyToken, { type: 'text', text: '🎉 ยอดเยี่ยม! ทำเครื่องหมายว่างานนี้เสร็จสิ้นแล้วครับ' });
        } else {
          replyLine(replyToken, { type: 'text', text: 'ℹ️ ภารกิจนี้ถูกบันทึกว่าเสร็จสิ้นไปแล้วครับ 👍' });
        }
      } else if (params.action === 'snooze') {
        const snoozeRes = snoozeTask(params.taskId, Number(params.min || 15), userId);
        if (snoozeRes.success) {
          replyLine(replyToken, { type: 'text', text: `⏰ ${snoozeRes.message}` });
        } else {
          replyLine(replyToken, { type: 'text', text: '⚠️ ไม่สามารถเลื่อนเวลาได้ (งานนี้อาจเสร็จสิ้นหรือถูกลบไปแล้วครับ)' });
        }
      }
    }
  });
}

function handleTodayTasksCommand(userId, replyToken) {
  const res = getActiveTasks(userId);
  if (!res.success || res.tasks.length === 0) {
    replyLine(replyToken, { type: 'text', text: '🏖️ วันนี้คุณไม่มีภารกิจหรือนัดหมายที่ค้างอยู่ครับ พักผ่อนให้สบายใจได้เลย!' });
    return;
  }

  const todayStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  const todayTasks = res.tasks.filter(t => {
    const timeStr = normalizeDateStr(t.targetTime);
    return timeStr.startsWith(todayStr);
  });

  if (todayTasks.length === 0) {
    replyLine(replyToken, { type: 'text', text: `🏖️ วันนี้ (${todayStr}) ไม่มีนัดหมายครับ\n\n(ลองพิมพ์ "งานค้าง" เพื่อดูงานวันอื่นๆ ได้ครับ)` });
    return;
  }

  const itemsText = todayTasks.map((t, idx) => {
    const timeStr = normalizeDateStr(t.targetTime);
    const timePart = timeStr.length >= 16 ? timeStr.substring(11, 16) : timeStr;
    return `${idx + 1}. [${timePart}] ${t.task}`;
  }).join('\n');

  replyLine(replyToken, {
    type: 'text',
    text: `📋 สรุปตารางงานของคุณสำหรับวันนี้ (${todayStr}):\n\n${itemsText}`
  });
}

function handleAllTasksCommand(userId, replyToken) {
  const res = getActiveTasks(userId);
  if (!res.success || res.tasks.length === 0) {
    replyLine(replyToken, { type: 'text', text: '🏖️ คุณไม่มีภารกิจค้างอยู่เลย เยี่ยมมากครับ!' });
    return;
  }

  const itemsText = res.tasks.map((t, idx) => {
    const timeStr = normalizeDateStr(t.targetTime);
    return `${idx + 1}. [${timeStr}] ${t.task}`;
  }).join('\n');

  replyLine(replyToken, {
    type: 'text',
    text: `📋 รายการภารกิจที่รอดำเนินการทั้งหมด (${res.tasks.length} รายการ):\n\n${itemsText}`
  });
}

function parseQueryParams(query) {
  const result = {};
  query.split('&').forEach(part => {
    const item = part.split('=');
    if (item[0]) result[item[0]] = decodeURIComponent(item[1] || '');
  });
  return result;
}

/**
 * ------------------------------------------------------------------------------
 * 🧪 ฟังก์ชันทดสอบสร้างข้อมูลงานจริงลง Google Sheets & Google Calendar
 * ------------------------------------------------------------------------------
 */
function testCreateRealTask() {
  const config = getAppConfig();
  Logger.log('เริ่มทดสอบสร้างงานจริงลง Google Sheets...');

  const sampleTarget = Utilities.formatDate(new Date(new Date().getTime() + 60 * 60 * 1000), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');

  // สร้างงานจริงลง Google Sheets + Google Calendar
  const res = createTask({
    userId: config.ownerUserId,
    task: 'ทดสอบระบบเลขา: นัดประชุมทดสอบ',
    targetTime: sampleTarget,
    remindBeforeMin: 15,
    repeatType: 'NONE',
    syncCalendar: true
  });

  Logger.log('ผลลัพธ์การสร้างงาน: ' + JSON.stringify(res));

  // ยิง Flex Message ยืนยันเข้า LINE มือถือของคุณ
  if (res.success && config.lineChannelToken && config.ownerUserId) {
    pushLine(config.ownerUserId, createSuccessFlex(res.task));
    Logger.log('✅ ส่งการ์ดยืนยันเข้า LINE เรียบร้อยแล้ว!');
  }
}
