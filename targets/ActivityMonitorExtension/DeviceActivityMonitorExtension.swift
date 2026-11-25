//
//  DeviceActivityMonitorExtension.swift
//  ActivityMonitorExtension
//
//  Created by Robert Herber on 2023-07-05.
//

import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings
import NotificationCenter
import os

class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    logger.log("intervalDidStart")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalDidStart",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalDidStart"
    )

    notifyAppWithName(name: "intervalDidStart")
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    logger.log("intervalDidEnd")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalDidEnd",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalDidEnd"
    )

    notifyAppWithName(name: "intervalDidEnd")
  }

  func executeActionsForEvent(
    activityName: String,
    callbackName: String,
    eventName: String?
  ) {
    let triggeredBy =
      eventName != nil
      ? "actions_for_\(activityName)_\(callbackName)_\(eventName!)"
      : "actions_for_\(activityName)_\(callbackName)"

    let placeholders = [
      "activityName": activityName,
      "callbackName": callbackName,
      "eventName": eventName
    ]

    let originalWhitelist = getCurrentWhitelist()
    let originalBlocklist = getCurrentBlocklist()

    CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)

    if let actions = userDefaults?.array(forKey: triggeredBy) {
      actions.forEach { actionRaw in
        if let action = actionRaw as? [String: Any] {
          let skipIfAlreadyTriggeredAfter = action["skipIfAlreadyTriggeredAfter"] as? Double
          let skipIfLargerEventRecordedAfter = action["skipIfLargerEventRecordedAfter"] as? Double
          let skipIfAlreadyTriggeredWithinMS = action["skipIfAlreadyTriggeredWithinMS"] as? Double
          let skipIfLargerEventRecordedWithinMS =
            action["skipIfLargerEventRecordedWithinMS"] as? Double
          let skipIfLargerEventRecordedSinceIntervalStarted =
            action["skipIfLargerEventRecordedSinceIntervalStarted"] as? Bool
          let neverTriggerBefore = action["neverTriggerBefore"] as? Double
          let skipIfAlreadyTriggeredBefore = action["skipIfAlreadyTriggeredBefore"] as? Double

          let skipIfAlreadyTriggeredBetweenFromDate =
            action["skipIfAlreadyTriggeredBetweenFromDate"] as? Double
          let skipIfAlreadyTriggeredBetweenToDate =
            action["skipIfAlreadyTriggeredBetweenToDate"] as? Double

          let skipIfWhitelistOrBlacklistIsUnchanged =
            action["skipIfWhitelistOrBlacklistIsUnchanged"] as? Bool

          if shouldExecuteAction(
            skipIfAlreadyTriggeredAfter: skipIfAlreadyTriggeredAfter,
            skipIfLargerEventRecordedAfter: skipIfLargerEventRecordedAfter,
            skipIfAlreadyTriggeredWithinMS: skipIfAlreadyTriggeredWithinMS,
            skipIfLargerEventRecordedWithinMS: skipIfLargerEventRecordedWithinMS,
            neverTriggerBefore: neverTriggerBefore,
            skipIfLargerEventRecordedSinceIntervalStarted:
              skipIfLargerEventRecordedSinceIntervalStarted,
            skipIfAlreadyTriggeredBefore: skipIfAlreadyTriggeredBefore,
            skipIfAlreadyTriggeredBetweenFromDate: skipIfAlreadyTriggeredBetweenFromDate,
            skipIfAlreadyTriggeredBetweenToDate: skipIfAlreadyTriggeredBetweenToDate,
            skipIfWhitelistOrBlacklistIsUnchanged: skipIfWhitelistOrBlacklistIsUnchanged,
            originalWhitelist: originalWhitelist,
            originalBlocklist: originalBlocklist,
            activityName: activityName,
            callbackName: callbackName,
            eventName: eventName
          ) {
            executeGenericAction(
              action: action,
              placeholders: placeholders,
              triggeredBy: triggeredBy
            )
          }
        }
      }
    }
  }

  override func eventDidReachThreshold(
    _ event: DeviceActivityEvent.Name, activity: DeviceActivityName
  ) {
    super.eventDidReachThreshold(event, activity: activity)
    logger.log("eventDidReachThreshold: \(event.rawValue, privacy: .public)")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "eventDidReachThreshold",
      eventName: event.rawValue
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "eventDidReachThreshold",
      eventName: event.rawValue
    )

    if activity.rawValue == "snsDaily" {
      handleSnsMinute(eventName: event.rawValue)
    }

    notifyAppWithName(name: "eventDidReachThreshold")
  }

  // snslimit：1分ごとの知らせで連続使用時間を数え、決めた分数になったらブロック画面を出す
  func handleSnsMinute(eventName: String) {
    guard let defaults = userDefaults else { return }
    let now = Date().timeIntervalSince1970
    let firstMinutes = defaults.integer(forKey: "snsFirstMinutes")
    let repeatMinutes = defaults.integer(forKey: "snsRepeatMinutes")
    let gapSeconds = defaults.double(forKey: "snsGapSeconds")
    let lastEventAt = defaults.double(forKey: "snsLastEventAt")
    let pausedByShield = defaults.bool(forKey: "snsPausedByShield")
    var continuous = defaults.integer(forKey: "snsContinuousMinutes")
    var lastShownMinutes = defaults.integer(forKey: "snsLastShownMinutes")

    // ブロック画面を読んでいた間は使っていないので、5分までは「空いた」に数えない
    let allowedGap = pausedByShield ? gapSeconds + 300 : gapSeconds
    if lastEventAt > 0 && now - lastEventAt <= allowedGap {
      continuous += 1
    } else {
      continuous = 1
      lastShownMinutes = 0
    }

    // 「m12」→ 今日の合計12分
    let todayMinutes = Int(eventName.dropFirst()) ?? 0

    let shouldShow =
      firstMinutes > 0 && continuous >= firstMinutes
      && (lastShownMinutes == 0 || continuous - lastShownMinutes >= repeatMinutes)

    defaults.set(now, forKey: "snsLastEventAt")
    defaults.set(continuous, forKey: "snsContinuousMinutes")
    defaults.set(todayMinutes, forKey: "snsTodayMinutes")
    defaults.set(shouldShow, forKey: "snsPausedByShield")

    if shouldShow {
      defaults.set(continuous, forKey: "snsLastShownMinutes")
      if let selection = getFamilyActivitySelectionById(id: "sns") {
        blockSelectedApps(blockSelection: selection, triggeredBy: "snsContinuous")
      }
    } else {
      defaults.set(lastShownMinutes, forKey: "snsLastShownMinutes")
    }
  }

  override func intervalWillStartWarning(for activity: DeviceActivityName) {
    super.intervalWillStartWarning(for: activity)
    logger.log("intervalWillStartWarning")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalWillStartWarning",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalWillStartWarning"
    )

    notifyAppWithName(name: "intervalWillStartWarning")
  }

  override func intervalWillEndWarning(for activity: DeviceActivityName) {
    super.intervalWillEndWarning(for: activity)
    logger.log("intervalWillEndWarning")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "intervalWillEndWarning",
      eventName: nil
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "intervalWillEndWarning"
    )

    notifyAppWithName(name: "intervalWillEndWarning")
  }

  override func eventWillReachThresholdWarning(
    _ event: DeviceActivityEvent.Name, activity: DeviceActivityName
  ) {
    super.eventWillReachThresholdWarning(event, activity: activity)
    logger.log("eventWillReachThresholdWarning: \(event.rawValue, privacy: .public)")

    self.executeActionsForEvent(
      activityName: activity.rawValue,
      callbackName: "eventWillReachThresholdWarning",
      eventName: event.rawValue
    )

    persistToUserDefaults(
      activityName: activity.rawValue,
      callbackName: "eventWillReachThresholdWarning",
      eventName: event.rawValue
    )

    notifyAppWithName(name: "eventWillReachThresholdWarning")
  }

}
