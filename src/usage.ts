import * as DeviceActivity from 'react-native-device-activity';

// 選んだSNSを覚えておく名前。見張りの名前にこの文字が入っていないと、ブロック画面の文字が使われない（ライブラリの README）
export const SELECTION_ID = 'sns';
// 見張りの名前。名前に「_」を入れると getEvents の読み取りが壊れるので使わない（11/4 の実験）
const ACTIVITY = 'snsDaily';
// 1分ごとの知らせを何分まで仕掛けるか（180分＝3時間）
const MAX_MINUTES = 180;
// 何分続けたらブロック画面を出すか、そのあと何分ごとに出すか（11/5 本人合意。拡張機能が読む）
const FIRST_MINUTES = 10;
const REPEAT_MINUTES = 5;
// 前の知らせから何秒より長く空いたら「続けて使っていない」とみなすか（11/4 の実測 58〜65秒から）
const GAP_SECONDS = 90;

// 見張りを始める：1分〜180分の知らせを仕掛け、ブロック画面の文字とボタンを決めておく
export async function startWatching(selection: string) {
  DeviceActivity.setFamilyActivitySelectionId({
    id: SELECTION_ID,
    familyActivitySelection: selection,
  });
  DeviceActivity.userDefaultsSet('snsFirstMinutes', FIRST_MINUTES);
  DeviceActivity.userDefaultsSet('snsRepeatMinutes', REPEAT_MINUTES);
  DeviceActivity.userDefaultsSet('snsGapSeconds', GAP_SECONDS);
  // 前に見張ったときの数え途中の値を消す
  DeviceActivity.userDefaultsSet('snsLastEventAt', 0);
  DeviceActivity.userDefaultsSet('snsContinuousMinutes', 0);
  DeviceActivity.userDefaultsSet('snsLastShownMinutes', 0);
  DeviceActivity.userDefaultsSet('snsPausedByShield', false);

  // {…} の部分は、ブロック画面が出る瞬間に拡張機能が数字や予定に置き換える
  DeviceActivity.updateShield(
    {
      title: '{applicationOrDomainDisplayName} を {continuousMinutes}分 続けて使っています',
      subtitle: '今日の合計 {todayMinutes}分\n次の予定：{nextEvent}\nタスク：{tasks}',
      primaryButtonLabel: '続ける',
      secondaryButtonLabel: 'やめる',
    },
    {
      // 続ける：ブロックを外して、そのまま使えるようにする
      primary: {
        behavior: 'defer',
        actions: [{ type: 'unblockSelection', familyActivitySelectionId: SELECTION_ID }],
      },
      // やめる：ブロックを外してからSNSを閉じる（次に開いたときは0分から数え直す）
      secondary: {
        behavior: 'close',
        actions: [{ type: 'unblockSelection', familyActivitySelectionId: SELECTION_ID }],
      },
    },
  );

  // 繰り返し：i を 1 から 180 まで1ずつ増やし、「今日 i分使ったら知らせて」を1つずつ作る
  const events = [];
  for (let i = 1; i <= MAX_MINUTES; i++) {
    events.push({
      eventName: `m${i}`,
      familyActivitySelection: selection,
      threshold: { minute: i },
    });
  }
  DeviceActivity.cleanUpAfterActivity(ACTIVITY);
  await DeviceActivity.startMonitoring(
    ACTIVITY,
    {
      intervalStart: { hour: 0, minute: 0, second: 0 },
      intervalEnd: { hour: 23, minute: 59, second: 59 },
      repeats: true,
    },
    events,
  );
}

export function stopWatching() {
  DeviceActivity.stopMonitoring([ACTIVITY]);
}

// 今日の合計と、最後に続けて使った分数を、届いた知らせの時刻から読む
export function readUsage() {
  const today = new Date().toDateString();
  const times = DeviceActivity.getEvents(ACTIVITY)
    .filter((event) => event.callbackName === 'eventDidReachThreshold')
    .map((event) => event.lastCalledAt)
    .filter((time) => time.toDateString() === today)
    .sort((a, b) => a.getTime() - b.getTime());

  // 繰り返し：今日届いた知らせを新しいほうから1つずつさかのぼり、間が空いたところで止める
  let continuous = 0;
  for (let i = times.length - 1; i >= 0; i--) {
    continuous += 1;
    if (i === 0) {
      break;
    }
    const gapSeconds = (times[i].getTime() - times[i - 1].getTime()) / 1000;
    if (gapSeconds > GAP_SECONDS) {
      break;
    }
  }

  return { todayMinutes: times.length, continuousMinutes: continuous };
}
