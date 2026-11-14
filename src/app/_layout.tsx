import { StatusBar } from 'expo-status-bar';
import { NativeTabs } from 'expo-router/native-tabs';

export default function TabLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Read</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="wave.3.right" md="nfc" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="write">
          <NativeTabs.Trigger.Label>Write</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="diagnose">
          <NativeTabs.Trigger.Label>Diagnose</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="stethoscope" md="troubleshoot" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
