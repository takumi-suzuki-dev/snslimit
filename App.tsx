import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import * as DeviceActivity from 'react-native-device-activity';

import { loadPlansAndTasks } from './src/calendar';
import { readUsage, startWatching, stopWatching } from './src/usage';

export default function App() {
  // 変数：画面が覚えておくこと（許可状態・選んだアプリ・選択画面を出すか・ブロック中か）
  const [authStatus, setAuthStatus] = useState(DeviceActivity.getAuthorizationStatus());
  const [selection, setSelection] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [blocking, setBlocking] = useState(DeviceActivity.isShieldActive());
  // 見張りの状態を表す文と、今日の使用時間を表す文
  const [message, setMessage] = useState('');
  const [usageText, setUsageText] = useState('');

  const isAuthorized = authStatus === DeviceActivity.AuthorizationStatus.approved;

  async function requestPermission() {
    await DeviceActivity.requestAuthorization('individual');
    setAuthStatus(DeviceActivity.getAuthorizationStatus());
  }

  function block() {
    if (selection === null) {
      return;
    }
    DeviceActivity.blockSelection({ activitySelectionToken: selection });
    // blockSelection は失敗してもエラーを出さないので、iPhone に「今止めているか」を聞き直す
    const active = DeviceActivity.isShieldActive();
    setBlocking(active);
    if (!active) {
      setMessage('ブロックできなかった');
    }
  }

  function unblock() {
    DeviceActivity.resetBlocks();
    setBlocking(false);
  }

  async function start() {
    if (selection === null) {
      return;
    }
    try {
      await startWatching(selection);
      setMessage('見張り中（連続10分でブロック画面）');
    } catch (error) {
      setMessage(`始められなかった：${String(error)}`);
    }
  }

  function stop() {
    stopWatching();
    setMessage('見張りを止めた');
  }

  async function loadPlans() {
    try {
      setMessage(await loadPlansAndTasks());
    } catch (error) {
      setMessage(`予定とタスクを読めなかった：${String(error)}`);
    }
  }

  function refresh() {
    const usage = readUsage();
    setUsageText(`今日の合計 ${usage.todayMinutes}分／最後の連続 ${usage.continuousMinutes}分`);
  }

  let statusText = '未許可';
  if (isAuthorized) {
    statusText = blocking ? 'ブロック中' : '許可済み';
  }

  return (
    <View style={styles.container}>
      <Text>状態：{statusText}</Text>

      {!isAuthorized && (
        <Button title="Screen Timeを許可する" onPress={requestPermission} />
      )}

      {isAuthorized && (
        <>
          <Button title="ブロックするアプリを選ぶ" onPress={() => setPickerVisible(true)} />
          <Button title="ブロック" onPress={block} disabled={selection === null} />
          <Button title="解除" onPress={unblock} />

          <Text style={styles.heading}>使いすぎの見張り</Text>
          <Button title="見張りを始める" onPress={start} disabled={selection === null} />
          <Button title="見張りを止める" onPress={stop} />
          <Button title="使用時間を更新" onPress={refresh} />
          <Button title="予定とタスクを読み込む" onPress={loadPlans} />
          <Text>{message}</Text>
          <Text>{usageText}</Text>
        </>
      )}

      {pickerVisible && (
        <DeviceActivity.DeviceActivitySelectionSheetView
          style={styles.pickerAnchor}
          familyActivitySelection={selection}
          onSelectionChange={(event) => setSelection(event.nativeEvent.familyActivitySelection)}
          onDismissRequest={() => setPickerVisible(false)}
        />
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 60,
  },
  heading: {
    marginTop: 16,
    fontWeight: 'bold',
  },
  pickerAnchor: {
    width: 1,
    height: 1,
    position: 'absolute',
  },
});
