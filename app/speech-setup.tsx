import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable, Text, SafeAreaView, Ionicons } from '../src/localized-ui';
import { Header } from '../src/components';
import { router } from '../src/navigation';
import { useLiveCaptions } from '../src/use-live-captions';
import { colors, radius, space } from '../src/theme';

export default function SpeechSetup() {
  const voice = useLiveCaptions();
  const leave = () => {
    voice.cancel();
    if (router.canGoBack()) router.back(); else router.replace('/settings');
  };
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Header back onBack={leave} title="Speech setup" subtitle="Connect once for this demo session"/>
      <View style={s.card}>
        <View style={s.statusRow}><View style={s.icon}><Ionicons name={voice.connected ? 'checkmark-circle-outline' : 'link-outline'} size={25} color={colors.primaryDark} accessible={false}/></View>
          <View style={s.flex}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.title}>{voice.connected ? 'Speech features ready' : voice.message ? 'Speech features need attention' : 'Connecting speech features…'}</Text><Text style={s.help}>This demo connects automatically. No pairing code, API key, or terminal setup is required.</Text></View>
        </View>
        {!voice.connected && voice.message && <Text accessibilityRole="alert" style={s.error}>{voice.message}</Text>}
        {!voice.connected && <Pressable accessibilityRole="button" onPress={() => { void voice.reconnect(); }} style={s.primary}><Text style={s.primaryText}>Retry automatic connection</Text></Pressable>}
        {voice.connected && <Text style={s.help}>Speech, Vision, and Sign Assistant are ready. The temporary connection stays in this open app.</Text>}
      </View>
      <View style={s.privacy}><Ionicons name="shield-checkmark-outline" size={21} color={colors.primaryDark} accessible={false}/><View style={s.flex}><Text style={s.title}>This page does not start the microphone.</Text><Text style={s.help}>Starting sends audio to OpenAI (or Deepgram if the operator selects rollback), and finalized text to OpenAI for both translations. Check important details; AI can make mistakes.</Text></View></View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const s = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.cream }, content: { padding: space.lg, paddingBottom: space.xl, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { padding: space.md, gap: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  statusRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, icon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: '700' }, help: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 4 },
  label: { color: colors.ink, fontWeight: '600', fontSize: 14 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.primaryDark, borderRadius: radius.sm, padding: 12, color: colors.ink, backgroundColor: colors.cream, fontSize: 16, textAlign: 'left', writingDirection: 'ltr' },
  primary: { minHeight: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primaryDark, borderRadius: radius.sm, padding: 12 }, primaryText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 52, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryText: { color: colors.primaryDark, fontSize: 14, fontWeight: '600' },
  privacy: { paddingVertical: space.lg, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, error: { color: '#8A2637', fontSize: 13, lineHeight: 21, padding: 12, backgroundColor: colors.redSoft, borderRadius: radius.sm }, dim: { opacity: 0.5 },
});
