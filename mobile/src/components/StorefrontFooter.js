import { Pressable, StyleSheet, Text, View } from 'react-native';
import { navigateToWebUrl } from '../lib/navigation';
import { useSite } from '../context/SiteContext';

export default function StorefrontFooter() {
  const { footer = {}, settings } = useSite();
  const sections = [footer.shopLinks, footer.supportLinks].filter(Array.isArray);
  const links = sections.flat().filter(link => link?.label && link?.url);
  return <View style={[styles.wrap, { backgroundColor: footer.backgroundColor || '#111827' }]}>
    {footer.tagline ? <Text style={[styles.tagline, { color: footer.textColor || '#e2e8f0' }]}>{footer.tagline}</Text> : null}
    {links.length ? <View style={styles.links}>{links.map((link, index) => <Pressable key={`${link.url}-${index}`} onPress={() => navigateToWebUrl(link.url)}><Text style={[styles.link, { color: footer.textColor || '#e2e8f0' }]}>{link.label}</Text></Pressable>)}</View> : null}
    <Text style={[styles.copyright, { color: footer.textColor || '#94a3b8' }]}>{footer.copyright || settings.siteName || ''}</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, paddingVertical: 24, gap: 12 },
  tagline: { fontSize: 13, lineHeight: 19 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  link: { fontSize: 12, fontWeight: '700' },
  copyright: { fontSize: 10, marginTop: 4 },
});

