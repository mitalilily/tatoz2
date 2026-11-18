import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, ImageBackground, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl, categoryApi, brandApi, blogApi, newsletterApi, productApi } from '../lib/api';
import { navigateToWebUrl } from '../lib/navigation';
import { useSite } from '../context/SiteContext';
import ProductCard from './ProductCard';
import { SectionHeading } from './Common';

const cleanText = value => String(value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const firstText = (...values) => values.find(value => typeof value === 'string' && value.trim()) || '';
const rowsOf = data => [data.items, data.cards, data.features, data.links, data.slides, data.images, data.faqs, data.testimonials, data.buttons, data.rows].find(Array.isArray) || [];
const isVisibleNow = settings => {
  if (settings?.visibility === 'hidden' || settings?.visibility === 'desktop') return false;
  const now = Date.now();
  const from = settings?.schedule?.from ? new Date(settings.schedule.from).getTime() : null;
  const until = settings?.schedule?.until ? new Date(settings.schedule.until).getTime() : null;
  return !((Number.isFinite(from) && now < from) || (Number.isFinite(until) && now >= until));
};

function ResponsiveSection({ section, designSystem }) {
  const { theme } = useSite();
  const [expanded, setExpanded] = useState(-1);
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const overrides = section.responsiveOverrides || {};
  const data = useMemo(() => ({ ...(section.data || {}), ...(overrides.tablet || {}), ...(overrides.mobile || {}) }), [section.data, overrides.tablet, overrides.mobile]);
  const settings = { ...(section.settings || {}), ...(overrides.tabletSettings || {}), ...(overrides.mobileSettings || {}) };
  if (!isVisibleNow(settings)) return null;

  const title = firstText(data.heading, data.title, data.headline, data.sectionTitle);
  const description = cleanText(firstText(data.description, data.subheadline, data.body, data.text, data.content, data.html));
  const items = rowsOf(data);
  const sectionBox = [styles.section, {
    backgroundColor: settings.backgroundColor || data.backgroundColor || 'transparent',
    paddingTop: Number(settings.padding?.top ?? settings.padding?.all ?? 8),
    paddingBottom: Number(settings.padding?.bottom ?? settings.padding?.all ?? 8),
    paddingLeft: Number(settings.padding?.left ?? settings.padding?.all ?? 16),
    paddingRight: Number(settings.padding?.right ?? settings.padding?.all ?? 16),
    marginTop: Number(settings.margin?.top ?? settings.margin?.all ?? 0),
    marginBottom: Number(settings.margin?.bottom ?? settings.margin?.all ?? 0),
    minHeight: settings.minHeight ? Math.min(Number(settings.minHeight?.value || settings.minHeight), height) : undefined,
  }];
  const props = { data, title, description, items, width, height, expanded, setExpanded, email, setEmail, sending, setSending, designSystem, brand: designSystem?.primaryColor || theme.brand, sectionBox };

  switch (section.type) {
    case 'announcementBar': return <AnnouncementBar {...props} />;
    case 'hero': return <HeroSection {...props} />;
    case 'productsShowcase': return <ProductsSection {...props} />;
    case 'categoriesShowcase': return <CatalogTiles kind="category" {...props} />;
    case 'brandStrip': return <CatalogTiles kind="brand" {...props} />;
    case 'imageBanner': return <ImageBanner {...props} />;
    case 'imageText': return <ImageText {...props} />;
    case 'richText': return <TextSection {...props} />;
    case 'spacer': return <View style={{ height: Math.min(Number(data.height || data.spacing || 24), height / 2) }} />;
    case 'cardGrid': case 'mosaic': case 'imageGallery': case 'instaReels': return <GenericCards {...props} />;
    case 'blogPosts': return <BlogSection {...props} />;
    case 'buttons': case 'couponCta': case 'contactCta': return <ActionSection {...props} />;
    case 'faq': case 'returnPolicy': case 'sizeGuide': return <AccordionSection {...props} />;
    case 'stats': return <StatsSection {...props} />;
    case 'testimonials': return <TestimonialsSection {...props} />;
    case 'newsletter': return <NewsletterSection {...props} />;
    case 'uspRow': case 'trustBadges': case 'shippingBar': case 'paymentIcons': return <ChipsSection {...props} />;
    case 'video': case 'socialEmbed': case 'map': return <ExternalMediaSection {...props} />;
    case 'countdown': case 'flashSaleBanner': case 'stockCounter': return <PromotionSection {...props} />;
    case 'tabs': return <TabsSection {...props} />;
    case 'customHtml': return <TextSection {...props} />;
    case 'backToTop': return null;
    default: return <GenericSection {...props} />;
  }
}

function AnnouncementBar({ data, brand }) {
  const content = <Text numberOfLines={2} style={[styles.announcementText, { color: data.textColor || '#ffffff' }]}>{cleanText(data.text || data.heading)}</Text>;
  return <Pressable disabled={!data.linkUrl} onPress={() => data.linkUrl && navigateToWebUrl(data.linkUrl)} style={[styles.announcement, { backgroundColor: data.backgroundColor || '#111827' }]}>{content}{data.linkLabel ? <Text style={[styles.announcementLink, { color: data.textColor || '#ffffff' }]}>{data.linkLabel} ›</Text> : null}</Pressable>;
}

function HeroSection({ data, width, height, brand }) {
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const [index, setIndex] = useState(0);
  const customHeight = data.customHeight?.value;
  const unit = data.customHeight?.unit || 'px';
  const heroHeight = data.aspectRatio === 'custom' && customHeight
    ? Math.min(unit === 'vh' ? height * Number(customHeight) / 100 : Number(customHeight), height * 0.9)
    : data.aspectRatio === '1/1' ? width : data.aspectRatio === '4/3' ? width * 0.75 : width * 0.48;
  useEffect(() => {
    if (!data.autoplay || slides.length < 2) return undefined;
    const timer = setInterval(() => setIndex(value => (value + 1) % slides.length), Math.max(1500, Number(data.intervalMs) || 5000));
    return () => clearInterval(timer);
  }, [data.autoplay, data.intervalMs, slides.length]);
  if (!slides.length) return null;
  const slide = slides[index] || slides[0];
  const image = absoluteUrl(slide.imageUrl || slide.image || slide.url);
  const variant = data.variant || 'classic';
  const minimal = variant === 'minimal';
  const split = variant === 'split';
  return <View style={[styles.hero, { height: Math.max(260, heroHeight), backgroundColor: slide.bgColor || '#e5e7eb' }]}>
    {image ? <Image source={{ uri: image }} resizeMode="cover" style={StyleSheet.absoluteFillObject} /> : null}
    {!minimal ? <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(0,0,0,${Math.max(0, Math.min(0.8, Number(slide.overlayOpacity ?? 0.18)))})` }]} /> : null}
    {split ? <View style={styles.splitShade} /> : null}
    <View style={[styles.heroCopy, slide.alignment === 'center' ? styles.centerCopy : slide.alignment === 'right' ? styles.rightCopy : null]}>
      {slide.headline ? <Text style={[styles.heroTitle, { color: slide.textColor || (minimal ? '#111827' : '#ffffff') }]}>{cleanText(slide.headline)}</Text> : null}
      {slide.subheadline ? <Text style={[styles.heroSubtitle, { color: slide.textColor || (minimal ? '#334155' : '#ffffff') }]}>{cleanText(slide.subheadline)}</Text> : null}
      {slide.ctaLabel ? <Pressable onPress={() => navigateToWebUrl(slide.ctaLink || '/')} style={[styles.heroCta, { backgroundColor: minimal ? slide.textColor || brand : '#ffffff' }]}><Text style={{ color: minimal ? slide.bgColor || '#ffffff' : '#111827', fontWeight: '800' }}>{slide.ctaLabel}</Text></Pressable> : null}
    </View>
    {slides.length > 1 && data.showArrows !== false ? <View style={styles.heroArrows}>
      <Pressable accessibilityLabel="Previous slide" onPress={() => setIndex(value => (value - 1 + slides.length) % slides.length)} style={styles.arrow}><Ionicons name="chevron-back" size={19} color="#111827" /></Pressable>
      <Pressable accessibilityLabel="Next slide" onPress={() => setIndex(value => (value + 1) % slides.length)} style={styles.arrow}><Ionicons name="chevron-forward" size={19} color="#111827" /></Pressable>
    </View> : null}
    {slides.length > 1 && data.showDots !== false ? <View style={styles.dots}>{slides.map((item, i) => <Pressable key={`${item.imageUrl || i}`} onPress={() => setIndex(i)} style={[styles.dot, i === index && styles.activeDot]} />)}</View> : null}
  </View>;
}

function ProductsSection({ data, title, width, brand, sectionBox }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const params = { limit: Number(data.count) || 8 };
    if (data.source === 'manual' && data.manualProductIds?.length) params.ids = data.manualProductIds.join(',');
    else if (data.collection === 'featured') params.featured = true;
    else if (data.collection === 'newest') params.sort = 'newest';
    else if (data.collection === 'bestsellers') params.sort = 'bestseller';
    else if (data.collection === 'category' && data.collectionRef) params.category = data.collectionRef;
    else if (data.collection === 'brand' && data.collectionRef) params.brand = data.collectionRef;
    productApi.list(params).then(result => { if (active) setProducts(result.products || result.items || []); }).catch(() => { if (active) setProducts([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [data.collection, data.collectionRef, data.source, data.count, data.manualProductIds]);
  return <View style={sectionBox}><SectionHeading title={title} action={data.seeAllLabel || (data.seeAllLink ? 'See all' : '')} onAction={() => data.seeAllLink && navigateToWebUrl(data.seeAllLink)} />
    {loading ? <Text style={styles.loadingInline}>Loading…</Text> : products.length ? data.layout === 'grid' ? <View style={styles.grid}>{products.map(product => <ProductCard key={product._id || product.slug} product={product} compact />)}</View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>{products.map(product => <ProductCard key={product._id || product.slug} product={product} />)}</ScrollView> : null}
  </View>;
}

function BlogSection({ data, title, sectionBox, brand }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    blogApi.list({ limit: Number(data.count) || 6, sort: data.sort || 'newest' })
      .then(result => { if (active) setPosts(result.posts || result.blogs || result.items || []); })
      .catch(() => { if (active) setPosts([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [data.count, data.sort]);
  if (!loading && !posts.length) return null;
  return <View style={sectionBox}><SectionHeading title={title || data.heading || data.title || 'From the blog'} action={data.seeAllLink ? 'See all' : ''} onAction={() => data.seeAllLink && navigateToWebUrl(data.seeAllLink)} />
    {loading ? <Text style={styles.loadingInline}>Loading…</Text> : <View style={styles.genericGrid}>{posts.map((post, index) => {
      const image = absoluteUrl(post.image || post.thumbnail || post.coverImage || post.featuredImage);
      return <Pressable key={post._id || post.slug || index} onPress={() => post.slug && navigateToWebUrl(`/blog/${post.slug}`)} style={styles.genericCard}>{image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.genericPhoto} /> : null}<Text numberOfLines={2} style={styles.cardTitle}>{post.title || post.name}</Text>{post.excerpt || post.description ? <Text numberOfLines={3} style={styles.body}>{cleanText(post.excerpt || post.description)}</Text> : null}<Text style={[styles.inlineLink, { color: brand }]}>{data.readMoreLabel || 'Read more'} ›</Text></Pressable>;
    })}</View>}
  </View>;
}

function CatalogTiles({ kind, data, title, brand, sectionBox }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let active = true;
    const loader = kind === 'category' ? categoryApi.list : brandApi.list;
    loader().then(result => { if (active) setItems(result.categories || result.brands || result.items || []); }).catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [kind]);
  const limited = items.slice(0, Number(data.count) || 10);
  return <View style={sectionBox}><SectionHeading title={title} action={data.seeAllLink ? 'See all' : ''} onAction={() => data.seeAllLink && navigateToWebUrl(data.seeAllLink)} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
    {limited.map(item => {
      const image = absoluteUrl(item.image || item.imageUrl || item.thumbnail || item.logo);
      const url = kind === 'category' ? `/category/${item.slug}` : `/brand/${item.slug}`;
      return <Pressable key={item._id || item.slug} onPress={() => navigateToWebUrl(url)} style={styles.catalogTile}>{image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.catalogImage} /> : <View style={[styles.catalogImage, { backgroundColor: '#f1f5f9' }]} />}<Text numberOfLines={2} style={styles.catalogLabel}>{item.name || item.title || item.label}</Text></Pressable>;
    })}
  </ScrollView></View>;
}

function ImageBanner({ data, title, description, sectionBox, brand }) {
  const image = absoluteUrl(data.imageUrl || data.image || data.backgroundImage);
  return <View style={[sectionBox, styles.bannerOuter]}><ImageBackground source={image ? { uri: image } : undefined} resizeMode="cover" style={[styles.banner, { backgroundColor: data.backgroundColor || '#e5e7eb' }]} imageStyle={styles.bannerImage}>
    <View style={styles.bannerShade} />
    <View style={styles.bannerCopy}>{title ? <Text style={styles.bannerTitle}>{title}</Text> : null}{description ? <Text style={styles.bannerText}>{description}</Text> : null}{data.ctaLabel ? <Pressable onPress={() => navigateToWebUrl(data.ctaLink || data.linkUrl || '/')} style={[styles.heroCta, { backgroundColor: brand }]}><Text style={styles.bannerCtaText}>{data.ctaLabel}</Text></Pressable> : null}</View>
  </ImageBackground></View>;
}

function ImageText({ data, title, description, sectionBox, brand }) {
  const image = absoluteUrl(data.imageUrl || data.image);
  return <View style={[sectionBox, styles.imageText]}>{image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.imageTextPhoto} /> : null}<View style={{ flex: 1, gap: 8 }}>{title ? <Text style={styles.cardTitle}>{title}</Text> : null}{description ? <Text style={styles.body}>{description}</Text> : null}{data.ctaLabel ? <Pressable onPress={() => navigateToWebUrl(data.ctaLink || '/')}><Text style={[styles.inlineLink, { color: brand }]}>{data.ctaLabel} ›</Text></Pressable> : null}</View></View>;
}

function TextSection({ data, title, description, sectionBox, brand }) {
  const text = description || cleanText(data.html || data.content || data.text);
  return <View style={sectionBox}>{title ? <Text style={styles.cardTitle}>{title}</Text> : null}{text ? <Text style={styles.body}>{text}</Text> : null}{data.ctaLabel ? <Pressable onPress={() => navigateToWebUrl(data.ctaLink || '/')}><Text style={[styles.inlineLink, { color: brand }]}>{data.ctaLabel} ›</Text></Pressable> : null}</View>;
}

function GenericCards({ data, title, description, items, sectionBox, brand }) {
  const rows = items.length ? items : data.images?.map(image => typeof image === 'string' ? { imageUrl: image } : image) || [];
  return <View style={sectionBox}>{title ? <SectionHeading title={title} action={data.seeAllLink ? 'See all' : ''} onAction={() => data.seeAllLink && navigateToWebUrl(data.seeAllLink)} /> : null}{description ? <Text style={[styles.body, { marginBottom: 12 }]}>{description}</Text> : null}
    <View style={styles.genericGrid}>{rows.map((item, index) => {
      const image = absoluteUrl(item.imageUrl || item.image || item.thumbnail || item.url);
      const itemTitle = firstText(item.title, item.heading, item.name, item.label, item.headline);
      const itemText = cleanText(firstText(item.description, item.text, item.subheadline, item.caption));
      const link = item.linkUrl || item.url || item.href;
      return <Pressable key={item._id || item.id || `${itemTitle}-${index}`} onPress={() => link && navigateToWebUrl(link)} style={styles.genericCard}>{image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.genericPhoto} /> : null}{itemTitle ? <Text numberOfLines={2} style={styles.cardTitle}>{itemTitle}</Text> : null}{itemText ? <Text numberOfLines={3} style={styles.body}>{itemText}</Text> : null}{item.ctaLabel ? <Text style={[styles.inlineLink, { color: brand }]}>{item.ctaLabel} ›</Text> : null}</Pressable>;
    })}</View>
  </View>;
}

function ActionSection({ data, title, description, items, sectionBox, brand }) {
  const buttons = items.length ? items : [{ label: data.ctaLabel || data.buttonLabel, url: data.ctaLink || data.linkUrl, text: data.couponCode }];
  return <View style={[sectionBox, styles.actionSection]}>{title ? <Text style={styles.cardTitle}>{title}</Text> : null}{description ? <Text style={styles.body}>{description}</Text> : null}<View style={styles.actionRow}>{buttons.filter(item => item.label || item.title || item.ctaLabel).map((item, index) => <Pressable key={item.id || index} onPress={() => navigateToWebUrl(item.url || item.linkUrl || item.ctaLink || '/')} style={[styles.actionButton, { borderColor: brand }]}><Text style={[styles.actionButtonText, { color: brand }]}>{item.label || item.title || item.ctaLabel}</Text></Pressable>)}</View></View>;
}

function AccordionSection({ data, title, description, items, expanded, setExpanded, sectionBox, brand }) {
  const rows = items.length ? items : [{ question: data.question || data.title, answer: data.answer || data.content || data.text }];
  return <View style={sectionBox}>{title ? <SectionHeading title={title} /> : null}{description ? <Text style={styles.body}>{description}</Text> : null}{rows.filter(item => item.question || item.title || item.heading).map((item, index) => <View key={item.id || index} style={styles.accordion}><Pressable onPress={() => setExpanded(expanded === index ? -1 : index)} style={styles.accordionHead}><Text style={styles.accordionQuestion}>{item.question || item.title || item.heading}</Text><Ionicons name={expanded === index ? 'chevron-up' : 'chevron-down'} color={brand} size={18} /></Pressable>{expanded === index ? <Text style={styles.body}>{cleanText(item.answer || item.description || item.text || item.content)}</Text> : null}</View>)}</View>;
}

function StatsSection({ data, title, items, sectionBox, brand }) {
  return <View style={sectionBox}>{title ? <SectionHeading title={title} /> : null}<View style={styles.statGrid}>{items.map((item, index) => <View key={item.id || index} style={styles.stat}><Text style={[styles.statValue, { color: brand }]}>{item.value || item.number || item.stat}</Text><Text style={styles.body}>{item.label || item.title || item.caption}</Text></View>)}</View></View>;
}

function TestimonialsSection({ data, title, items, sectionBox, brand }) {
  return <View style={sectionBox}>{title ? <SectionHeading title={title} /> : null}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>{items.map((item, index) => <View key={item.id || index} style={styles.quoteCard}><Text style={{ color: '#f59e0b' }}>{'★'.repeat(Math.max(0, Math.min(5, Number(item.rating || 5))))}</Text><Text style={styles.body}>{cleanText(item.text || item.quote || item.review)}</Text><Text style={[styles.quoteName, { color: brand }]}>{item.name || item.author || item.title}</Text></View>)}</ScrollView></View>;
}

function ChipsSection({ data, title, description, items, sectionBox, brand }) {
  const chips = items.length ? items : (data.badges || data.values || data.points || []).map(value => typeof value === 'string' ? { label: value } : value);
  return <View style={sectionBox}>{title ? <SectionHeading title={title} /> : null}{description ? <Text style={styles.body}>{description}</Text> : null}<View style={styles.chips}>{chips.map((item, index) => <View key={item.id || index} style={styles.chip}><Ionicons name="checkmark-circle" size={16} color={brand} /><Text style={styles.chipText}>{item.label || item.title || item.text || item.name}</Text></View>)}</View></View>;
}

function ExternalMediaSection({ data, title, description, sectionBox, brand }) {
  const url = data.url || data.videoUrl || data.embedUrl || data.mapUrl || data.linkUrl;
  return <View style={sectionBox}>{title ? <SectionHeading title={title} /> : null}{description ? <Text style={styles.body}>{description}</Text> : null}{url ? <Pressable onPress={() => Linking.openURL(url).catch(() => {})} style={[styles.externalCard, { borderColor: brand }]}><Ionicons name="open-outline" color={brand} size={20} /><Text numberOfLines={2} style={[styles.inlineLink, { color: brand }]}>{data.ctaLabel || url}</Text></Pressable> : null}</View>;
}

function PromotionSection({ data, title, description, sectionBox, brand }) {
  const endsAt = data.endAt || data.endsAt || data.expiry || data.targetDate;
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!endsAt) return undefined;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [endsAt]);
  const remaining = endsAt && now ? Math.max(0, new Date(endsAt).getTime() - now) : null;
  const hours = remaining == null ? null : Math.floor(remaining / 3600000);
  const minutes = remaining == null ? null : Math.floor((remaining % 3600000) / 60000);
  const seconds = remaining == null ? null : Math.floor((remaining % 60000) / 1000);
  return <View style={[sectionBox, styles.promotion, { backgroundColor: data.backgroundColor || '#fff7ed' }]}>{title ? <Text style={[styles.cardTitle, { color: data.textColor || '#111827' }]}>{title}</Text> : null}{description ? <Text style={styles.body}>{description}</Text> : null}{remaining != null ? <Text style={[styles.timer, { color: brand }]}>{hours}h {minutes}m {seconds}s</Text> : null}{data.ctaLabel ? <Pressable onPress={() => navigateToWebUrl(data.ctaLink || '/')}><Text style={[styles.inlineLink, { color: brand }]}>{data.ctaLabel} ›</Text></Pressable> : null}</View>;
}

function TabsSection({ data, title, items, expanded, setExpanded, sectionBox, brand }) {
  const tabs = items.length ? items : data.tabs || [];
  const active = Math.max(0, Math.min(expanded < 0 ? 0 : expanded, tabs.length - 1));
  return <View style={sectionBox}>{title ? <SectionHeading title={title} /> : null}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>{tabs.map((item, index) => <Pressable key={item.id || index} onPress={() => setExpanded(index)} style={[styles.tabChip, active === index && { backgroundColor: brand }]}><Text style={[styles.tabText, active === index && { color: '#ffffff' }]}>{item.label || item.title || item.name}</Text></Pressable>)}</ScrollView>{tabs[active] ? <Text style={[styles.body, { marginTop: 12 }]}>{cleanText(tabs[active].content || tabs[active].text || tabs[active].description)}</Text> : null}</View>;
}

function NewsletterSection({ data, title, description, sectionBox, brand, email, setEmail, sending, setSending }) {
  const subscribe = async () => {
    if (!email.trim()) return;
    setSending(true);
    try { await newsletterApi.subscribe(email.trim()); Alert.alert('', data.successMessage || 'Subscribed'); setEmail(''); }
    catch (error) { Alert.alert('', error.message || 'Could not subscribe'); }
    finally { setSending(false); }
  };
  return <View style={[sectionBox, styles.newsletter]}>{title ? <Text style={styles.cardTitle}>{title}</Text> : null}{description ? <Text style={styles.body}>{description}</Text> : null}<View style={styles.newsletterRow}><TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={data.placeholder || 'Email address'} style={styles.newsletterInput} /><Pressable onPress={subscribe} disabled={sending} style={[styles.newsletterButton, { backgroundColor: brand }]}><Text style={styles.newsletterButtonText}>{sending ? '…' : data.buttonLabel || 'Subscribe'}</Text></Pressable></View></View>;
}

function GenericSection(props) {
  return <GenericCards {...props} />;
}

export default function PageRenderer({ sections = [], designSystem = {} }) {
  const palette = designSystem || {};
  return <View style={{ backgroundColor: palette.surfaceColor || '#ffffff' }}>{sections.map((section, index) => section ? <ResponsiveSection key={section.id || `${section.type}-${index}`} section={section} designSystem={palette} /> : null)}</View>;
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 8 },
  announcement: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  announcementText: { flexShrink: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  announcementLink: { fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  hero: { width: '100%', overflow: 'hidden', justifyContent: 'center' },
  heroCopy: { maxWidth: '82%', paddingHorizontal: 24, paddingVertical: 20, gap: 10 },
  centerCopy: { alignSelf: 'center', alignItems: 'center' },
  rightCopy: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  heroTitle: { fontSize: 29, fontWeight: '900', lineHeight: 35, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 6 },
  heroSubtitle: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  heroCta: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, alignSelf: 'flex-start', marginTop: 6 },
  heroArrows: { position: 'absolute', left: 10, right: 10, top: '48%', flexDirection: 'row', justifyContent: 'space-between' },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.55)' },
  activeDot: { width: 20, backgroundColor: '#ffffff' },
  splitShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.22)' },
  loadingInline: { color: '#64748b', paddingVertical: 16 },
  horizontalCards: { gap: 12, paddingBottom: 3, paddingRight: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  catalogTile: { width: 92, alignItems: 'center', gap: 7 },
  catalogImage: { width: 76, height: 76, borderRadius: 38 },
  catalogLabel: { color: '#1f2937', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  bannerOuter: { paddingHorizontal: 0 },
  banner: { minHeight: 210, justifyContent: 'center', overflow: 'hidden' },
  bannerImage: { borderRadius: 0 },
  bannerShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  bannerCopy: { padding: 20, gap: 8 },
  bannerTitle: { color: '#ffffff', fontSize: 23, fontWeight: '900' },
  bannerText: { color: '#ffffff', fontSize: 14, lineHeight: 20 },
  bannerCtaText: { color: '#ffffff', fontWeight: '800' },
  imageText: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  imageTextPhoto: { width: '42%', height: 150, borderRadius: 14, backgroundColor: '#f1f5f9' },
  cardTitle: { color: '#111827', fontSize: 17, lineHeight: 23, fontWeight: '800' },
  body: { color: '#475569', fontSize: 13, lineHeight: 20 },
  inlineLink: { fontSize: 13, fontWeight: '800', marginTop: 5 },
  genericGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  genericCard: { width: '48%', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 10, gap: 6, overflow: 'hidden' },
  genericPhoto: { width: '100%', aspectRatio: 1.25, borderRadius: 9, backgroundColor: '#f1f5f9' },
  actionSection: { alignItems: 'flex-start', gap: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  actionButton: { borderWidth: 1, borderRadius: 22, paddingVertical: 9, paddingHorizontal: 14 },
  actionButtonText: { fontSize: 12, fontWeight: '800' },
  accordion: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 12 },
  accordionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  accordionQuestion: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '700' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { minWidth: '30%', flexGrow: 1, borderRadius: 14, backgroundColor: '#f8fafc', padding: 12 },
  statValue: { fontSize: 22, fontWeight: '900' },
  quoteCard: { width: 250, borderRadius: 15, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, gap: 8, backgroundColor: '#ffffff' },
  quoteName: { fontWeight: '800', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { minHeight: 34, borderRadius: 17, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#f8fafc', flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { color: '#334155', fontSize: 11, fontWeight: '700' },
  externalCard: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 },
  promotion: { borderRadius: 14, gap: 8 },
  timer: { fontSize: 20, fontWeight: '900' },
  tabChip: { borderRadius: 18, backgroundColor: '#f1f5f9', paddingHorizontal: 14, paddingVertical: 9 },
  tabText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  newsletter: { backgroundColor: '#f8fafc', borderRadius: 16, gap: 8 },
  newsletterRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  newsletterInput: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, backgroundColor: '#ffffff' },
  newsletterButton: { borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  newsletterButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
});
