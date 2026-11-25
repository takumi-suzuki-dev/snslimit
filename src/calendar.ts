import * as Calendar from 'expo-calendar';
import * as DeviceActivity from 'react-native-device-activity';

// ブロック画面に出すタスクの数（多いと画面に入りきらない）
const MAX_TASKS = 3;

// 予定とタスクを読み、ブロック画面を作る拡張機能に渡す。結果を一言で返す
export async function loadPlansAndTasks() {
  const calendarPermission = await Calendar.requestCalendarPermissions();
  const remindersPermission = await Calendar.requestRemindersPermissions();

  // 予定：今から24時間のうちの予定を、始まる時刻の早い順に並べる
  let eventCount = 0;
  if (calendarPermission.granted) {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const events = await Calendar.listEvents(calendars, now, end);
    const plans = events
      .map((event) => ({ title: event.title, start: new Date(event.startDate).getTime() }))
      .filter((plan) => plan.start > now.getTime())
      .sort((a, b) => a.start - b.start);
    // 拡張機能は、ブロック画面が出た瞬間に、この一覧から一番近い予定を選んで「あと○分」を計算する
    DeviceActivity.userDefaultsSet('snsPlans', plans);
    eventCount = plans.length;
  }

  // タスク：リマインダーの未完了のものを、最初の3つだけ「、」でつなぐ
  let taskCount = 0;
  if (remindersPermission.granted) {
    const lists = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
    const titles: string[] = [];
    // 繰り返し：リマインダーのリストを1つずつ開き、未完了のタスクの名前を集める
    for (const list of lists) {
      const reminders = await list.listReminders(null, null, Calendar.ReminderStatus.INCOMPLETE);
      for (const reminder of reminders) {
        if (reminder.title) {
          titles.push(reminder.title);
        }
      }
    }
    const text = titles.length > 0 ? titles.slice(0, MAX_TASKS).join('、') : 'なし';
    DeviceActivity.userDefaultsSet('snsTasks', text);
    taskCount = titles.length;
  }

  return `予定 ${eventCount}件・タスク ${taskCount}件を読み込んだ`;
}
