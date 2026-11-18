import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl, chatApi } from '../../lib/api';
import { ScreenFrame } from '../../components/Common';
import ProductCard from '../../components/ProductCard';
import { useSite } from '../../context/SiteContext';

const fallbackCategories = [
  { key: 'shop_assistant', label: 'Shop Assistant', desc: 'Find products, store information and FAQs' },
  { key: 'order_query', label: 'Order Related', desc: 'Track orders and ask about delivery' },
  { key: 'payment_query', label: 'Payment Related', desc: 'Ask about payments and refunds' },
];

export default function ChatScreen() {
  const { site, theme } = useSite();
  const [config, setConfig] = useState(null);
  const [category, setCategory] = useState(null);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const scrollRef = useRef(null);
  const favicon = absoluteUrl(site?.favicon);

  useEffect(() => {
    let active = true;
    chatApi.config().then(result => { if (active) setConfig(result.config || result.chatbot || {}); }).catch(() => { if (active) setConfig({ enabled: false }); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const startChat = async item => {
    setCategory(item); setStarting(true);
    try {
      const result = await chatApi.start(item.key);
      setConversationId(result.conversationId || result.conversation?._id || '');
      setMessages([{ role: 'assistant', content: result.greeting || '' }]);
    } catch (error) { Alert.alert('', error.message || 'Could not start a chat.'); }
    finally { setStarting(false); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !conversationId) return;
    setInput(''); setMessages(current => [...current, { role: 'user', content: text }]); setSending(true);
    try {
      const result = await chatApi.send(conversationId, text);
      setMessages(current => [...current, { role: 'assistant', content: result.reply || '', products: config?.showProductCards === false ? [] : result.products || [] }]);
      if (result.escalated) setMessages(current => [...current, { role: 'assistant', content: result.escalationMessage || '' }]);
    } catch (error) { Alert.alert('', error.message || 'Message could not be sent.'); }
    finally { setSending(false); }
  };

  const newChat = () => { setConversationId(''); setCategory(null); setMessages([]); };
  const categories = config?.categories?.length ? config.categories : fallbackCategories;

  return <ScreenFrame backgroundColor="#f1f5f9">
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <View style={[styles.header, { backgroundColor: config?.primaryColor || theme.text }]}>
        <Pressable accessibilityLabel="Back home" onPress={() => router.replace('/home')} style={styles.headerIcon}><Ionicons name="arrow-back" size={20} color="#ffffff" /></Pressable>
        {favicon ? <Image source={{ uri: favicon }} style={styles.botLogo} /> : <View style={styles.botLogoFallback}><Ionicons name="chatbubble-ellipses" size={19} color="#ffffff" /></View>}
        <View style={styles.headerCopy}><Text numberOfLines={1} style={styles.headerTitle}>{category?.label || config?.botName || site?.settings?.siteName || ''}</Text><Text style={styles.online}>{config?.onlineLabel || 'Online'}</Text></View>
        {conversationId ? <Pressable onPress={newChat} style={styles.headerIcon}><Ionicons name="refresh" size={19} color="#ffffff" /></Pressable> : null}
      </View>
      {loading ? <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View> : config?.enabled === false ? <View style={styles.center}><Text style={styles.disabledTitle}>{config.disabledMessage || 'Chat is currently unavailable.'}</Text></View> : !conversationId ? <ScrollView contentContainerStyle={styles.categoryContent}>
        <Text style={styles.intro}>{config?.welcomeMessage || ''}</Text>
        {categories.map(item => <Pressable disabled={starting} onPress={() => startChat(item)} key={item.key} style={styles.categoryCard}><View style={[styles.categoryIcon, { backgroundColor: `${config?.primaryColor || theme.brand}16` }]}><Ionicons name="chatbubble-ellipses-outline" size={21} color={config?.primaryColor || theme.brand} /></View><View style={{ flex: 1 }}><Text style={styles.categoryTitle}>{item.label || item.title}</Text><Text style={styles.categoryDesc}>{item.desc || item.description || ''}</Text></View><Ionicons name="chevron-forward" size={18} color="#94a3b8" /></Pressable>)}
        {starting ? <Text style={styles.muted}>Starting chat…</Text> : null}
      </ScrollView> : <>
        <ScrollView ref={scrollRef} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} contentContainerStyle={styles.messages}>
          {messages.map((message, index) => <View key={`${index}-${message.role}`} style={[styles.messageRow, message.role === 'user' && styles.userRow]}>
            <View style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.botBubble]}><Text style={[styles.messageText, message.role === 'user' && styles.userText]}>{message.content}</Text></View>
            {Array.isArray(message.products) && message.products.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productList}>{message.products.map(product => <ProductCard key={product._id || product.slug} product={product} compact />)}</ScrollView> : null}
          </View>)}
          {sending ? <Text style={styles.muted}>…</Text> : null}
        </ScrollView>
        <View style={styles.inputBar}><TextInput value={input} onChangeText={setInput} onSubmitEditing={send} returnKeyType="send" placeholder={config?.inputPlaceholder || 'Type a message'} style={styles.input} /><Pressable accessibilityLabel="Send message" onPress={send} disabled={!input.trim() || sending} style={[styles.send, { backgroundColor: config?.primaryColor || theme.brand, opacity: !input.trim() || sending ? 0.55 : 1 }]}><Ionicons name="send" size={17} color="#ffffff" /></Pressable></View>
      </>}
    </KeyboardAvoidingView>
  </ScreenFrame>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { minHeight: 58, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerIcon: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  botLogo: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff' },
  botLogoFallback: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  headerCopy: { flex: 1 },
  headerTitle: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  online: { color: '#86efac', fontSize: 10, marginTop: 2 },
  categoryContent: { padding: 16, gap: 12 },
  intro: { color: '#475569', fontSize: 14, lineHeight: 21, marginBottom: 3 },
  categoryCard: { minHeight: 74, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { color: '#111827', fontSize: 13, fontWeight: '800' },
  categoryDesc: { color: '#64748b', fontSize: 11, marginTop: 3 },
  messages: { padding: 13, gap: 12, flexGrow: 1 },
  messageRow: { alignItems: 'flex-start', gap: 8 },
  userRow: { alignItems: 'flex-end' },
  bubble: { maxWidth: '88%', borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10 },
  botBubble: { backgroundColor: '#ffffff', borderTopLeftRadius: 4 },
  userBubble: { backgroundColor: '#dcfce7', borderTopRightRadius: 4 },
  messageText: { color: '#1f2937', fontSize: 13, lineHeight: 19 },
  userText: { color: '#14532d' },
  productList: { gap: 8, paddingBottom: 3 },
  inputBar: { minHeight: 58, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 92, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 21, backgroundColor: '#f1f5f9', color: '#111827' },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25 },
  muted: { color: '#64748b', fontSize: 12, padding: 8 },
  disabledTitle: { color: '#475569', fontWeight: '700', textAlign: 'center' },
});

