import { lazy } from 'react';

// Section implementations and editor settings are loaded only when a page
// actually uses them. The registry remains a small metadata map for Redux.
const Hero = lazy(() => import('./Hero'));
const HeroSettings = lazy(() => import('./Hero/settings'));
const CardGrid = lazy(() => import('./CardGrid'));
const CardGridSettings = lazy(() => import('./CardGrid/settings'));
const ProductsShowcase = lazy(() => import('./ProductsShowcase'));
const ProductsShowcaseSettings = lazy(() => import('./ProductsShowcase/settings'));
const CategoriesShowcase = lazy(() => import('./CategoriesShowcase'));
const CategoriesShowcaseSettings = lazy(() => import('./CategoriesShowcase/settings'));
const ImageText = lazy(() => import('./ImageText'));
const ImageTextSettings = lazy(() => import('./ImageText/settings'));
const Spacer = lazy(() => import('./Spacer'));
const SpacerSettings = lazy(() => import('./Spacer/settings'));
const ImageBanner = lazy(() => import('./ImageBanner'));
const ImageBannerSettings = lazy(() => import('./ImageBanner/settings'));
const Mosaic = lazy(() => import('./Mosaic'));
const MosaicSettings = lazy(() => import('./Mosaic/settings'));
const RichText = lazy(() => import('./RichText'));
const RichTextSettings = lazy(() => import('./RichText/settings'));
const BrandStrip = lazy(() => import('./BrandStrip'));
const BrandStripSettings = lazy(() => import('./BrandStrip/settings'));
const UspRow = lazy(() => import('./UspRow'));
const UspRowSettings = lazy(() => import('./UspRow/settings'));
const Newsletter = lazy(() => import('./Newsletter'));
const NewsletterSettings = lazy(() => import('./Newsletter/settings'));
const Buttons = lazy(() => import('./Buttons'));
const ButtonsSettings = lazy(() => import('./Buttons/settings'));
const TrustBadges = lazy(() => import('./TrustBadges'));
const TrustBadgesSettings = lazy(() => import('./TrustBadges/settings'));
const ShippingBar = lazy(() => import('./ShippingBar'));
const ShippingBarSettings = lazy(() => import('./ShippingBar/settings'));
const ReturnPolicy = lazy(() => import('./ReturnPolicy'));
const ReturnPolicySettings = lazy(() => import('./ReturnPolicy/settings'));
const FlashSaleBanner = lazy(() => import('./FlashSaleBanner'));
const FlashSaleBannerSettings = lazy(() => import('./FlashSaleBanner/settings'));
const Testimonials = lazy(() => import('./Testimonials'));
const TestimonialsSettings = lazy(() => import('./Testimonials/settings'));
const Faq = lazy(() => import('./Faq'));
const FaqSettings = lazy(() => import('./Faq/settings'));
const Stats = lazy(() => import('./Stats'));
const StatsSettings = lazy(() => import('./Stats/settings'));
const Tabs = lazy(() => import('./Tabs'));
const TabsSettings = lazy(() => import('./Tabs/settings'));
const AnnouncementBar = lazy(() => import('./AnnouncementBar'));
const AnnouncementBarSettings = lazy(() => import('./AnnouncementBar/settings'));
const Video = lazy(() => import('./Video'));
const VideoSettings = lazy(() => import('./Video/settings'));
const Countdown = lazy(() => import('./Countdown'));
const CountdownSettings = lazy(() => import('./Countdown/settings'));
const BlogPosts = lazy(() => import('./BlogPosts'));
const BlogPostsSettings = lazy(() => import('./BlogPosts/settings'));
const CouponCta = lazy(() => import('./CouponCta'));
const CouponCtaSettings = lazy(() => import('./CouponCta/settings'));
const ImageGallery = lazy(() => import('./ImageGallery'));
const ImageGallerySettings = lazy(() => import('./ImageGallery/settings'));
const SocialEmbed = lazy(() => import('./SocialEmbed'));
const SocialEmbedSettings = lazy(() => import('./SocialEmbed/settings'));
const InstaReels = lazy(() => import('./InstaReels'));
const InstaReelsSettings = lazy(() => import('./InstaReels/settings'));
const CustomHtml = lazy(() => import('./CustomHtml'));
const CustomHtmlSettings = lazy(() => import('./CustomHtml/settings'));
const Map = lazy(() => import('./Map'));
const MapSettings = lazy(() => import('./Map/settings'));
const PaymentIcons = lazy(() => import('./PaymentIcons'));
const PaymentIconsSettings = lazy(() => import('./PaymentIcons/settings'));
const StockCounter = lazy(() => import('./StockCounter'));
const StockCounterSettings = lazy(() => import('./StockCounter/settings'));
const SizeGuide = lazy(() => import('./SizeGuide'));
const SizeGuideSettings = lazy(() => import('./SizeGuide/settings'));
const ContactCta = lazy(() => import('./ContactCta'));
const ContactCtaSettings = lazy(() => import('./ContactCta/settings'));
const BackToTop = lazy(() => import('./BackToTop'));
const BackToTopSettings = lazy(() => import('./BackToTop/settings'));

import { heroLabel, heroDefaults } from './Hero/schema';
import { cardGridLabel, cardGridDefaults } from './CardGrid/schema';
import { productsShowcaseLabel, productsShowcaseDefaults } from './ProductsShowcase/schema';
import { categoriesShowcaseLabel, categoriesShowcaseDefaults } from './CategoriesShowcase/schema';
import { imageTextLabel, imageTextDefaults } from './ImageText/schema';
import { spacerLabel, spacerDefaults } from './Spacer/schema';
import { imageBannerLabel, imageBannerDefaults } from './ImageBanner/schema';
import { mosaicLabel, mosaicDefaults } from './Mosaic/schema';
import { richTextLabel, richTextDefaults } from './RichText/schema';
import { brandStripLabel, brandStripDefaults } from './BrandStrip/schema';
import { uspRowLabel, uspRowDefaults } from './UspRow/schema';
import { newsletterLabel, newsletterDefaults } from './Newsletter/schema';
import { buttonsLabel, buttonsDefaults } from './Buttons/schema';
import { trustBadgesLabel, trustBadgesDefaults } from './TrustBadges/schema';
import { shippingBarLabel, shippingBarDefaults } from './ShippingBar/schema';
import { returnPolicyLabel, returnPolicyDefaults } from './ReturnPolicy/schema';
import { testimonialsLabel, testimonialsDefaults } from './Testimonials/schema';
import { faqLabel, faqDefaults } from './Faq/schema';
import { statsLabel, statsDefaults } from './Stats/schema';
import { tabsLabel, tabsDefaults } from './Tabs/schema';
import { announcementBarLabel, announcementBarDefaults } from './AnnouncementBar/schema';
import { videoLabel, videoDefaults } from './Video/schema';
import { countdownLabel, countdownDefaults } from './Countdown/schema';
import { blogPostsLabel, blogPostsDefaults } from './BlogPosts/schema';
import { couponCtaLabel, couponCtaDefaults } from './CouponCta/schema';
import { imageGalleryLabel, imageGalleryDefaults } from './ImageGallery/schema';
import { socialEmbedLabel, socialEmbedDefaults } from './SocialEmbed/schema';
import { instaReelsLabel, instaReelsDefaults } from './InstaReels/schema';
import { customHtmlLabel, customHtmlDefaults } from './CustomHtml/schema';
import { mapLabel, mapDefaults } from './Map/schema';
import { paymentIconsLabel, paymentIconsDefaults } from './PaymentIcons/schema';
import { stockCounterLabel, stockCounterDefaults } from './StockCounter/schema';
import { sizeGuideLabel, sizeGuideDefaults } from './SizeGuide/schema';
import { contactCtaLabel, contactCtaDefaults } from './ContactCta/schema';
import { flashSaleBannerLabel, flashSaleBannerDefaults } from './FlashSaleBanner/schema';
import { backToTopLabel, backToTopDefaults } from './BackToTop/schema';

export const SECTION_REGISTRY = {
  announcementBar:     { component: AnnouncementBar,     settings: AnnouncementBarSettings,     label: announcementBarLabel,     defaults: announcementBarDefaults,     category: 'Hero' },
  hero:                { component: Hero,                settings: HeroSettings,                label: heroLabel,                defaults: heroDefaults,                category: 'Hero' },
  imageBanner:         { component: ImageBanner,         settings: ImageBannerSettings,         label: imageBannerLabel,         defaults: imageBannerDefaults,         category: 'Hero' },
  cardGrid:            { component: CardGrid,            settings: CardGridSettings,            label: cardGridLabel,            defaults: cardGridDefaults,            category: 'Layout' },
  mosaic:              { component: Mosaic,              settings: MosaicSettings,              label: mosaicLabel,              defaults: mosaicDefaults,              category: 'Layout' },
  tabs:                { component: Tabs,                settings: TabsSettings,                label: tabsLabel,                defaults: tabsDefaults,                category: 'Layout' },
  spacer:              { component: Spacer,              settings: SpacerSettings,              label: spacerLabel,              defaults: spacerDefaults,              category: 'Layout' },
  productsShowcase:    { component: ProductsShowcase,    settings: ProductsShowcaseSettings,    label: productsShowcaseLabel,    defaults: productsShowcaseDefaults,    category: 'Commerce' },
  categoriesShowcase:  { component: CategoriesShowcase,  settings: CategoriesShowcaseSettings,  label: categoriesShowcaseLabel,  defaults: categoriesShowcaseDefaults,  category: 'Commerce' },
  brandStrip:          { component: BrandStrip,          settings: BrandStripSettings,          label: brandStripLabel,          defaults: brandStripDefaults,          category: 'Commerce' },
  imageText:           { component: ImageText,           settings: ImageTextSettings,           label: imageTextLabel,           defaults: imageTextDefaults,           category: 'Content' },
  richText:            { component: RichText,            settings: RichTextSettings,            label: richTextLabel,            defaults: richTextDefaults,            category: 'Content' },
  uspRow:              { component: UspRow,              settings: UspRowSettings,              label: uspRowLabel,              defaults: uspRowDefaults,              category: 'Content' },
  buttons:             { component: Buttons,             settings: ButtonsSettings,             label: buttonsLabel,             defaults: buttonsDefaults,             category: 'Content' },
  faq:                 { component: Faq,                 settings: FaqSettings,                 label: faqLabel,                 defaults: faqDefaults,                 category: 'Content' },
  stats:               { component: Stats,               settings: StatsSettings,               label: statsLabel,               defaults: statsDefaults,               category: 'Content' },
  testimonials:        { component: Testimonials,        settings: TestimonialsSettings,        label: testimonialsLabel,        defaults: testimonialsDefaults,        category: 'Social Proof' },
  newsletter:          { component: Newsletter,          settings: NewsletterSettings,          label: newsletterLabel,          defaults: newsletterDefaults,          category: 'Conversion' },
  trustBadges:         { component: TrustBadges,         settings: TrustBadgesSettings,         label: trustBadgesLabel,         defaults: trustBadgesDefaults,         category: 'Conversion' },
  shippingBar:         { component: ShippingBar,         settings: ShippingBarSettings,         label: shippingBarLabel,         defaults: shippingBarDefaults,         category: 'Conversion' },
  countdown:           { component: Countdown,           settings: CountdownSettings,           label: countdownLabel,           defaults: countdownDefaults,           category: 'Conversion' },
  couponCta:           { component: CouponCta,           settings: CouponCtaSettings,           label: couponCtaLabel,           defaults: couponCtaDefaults,           category: 'Conversion' },
  video:               { component: Video,               settings: VideoSettings,               label: videoLabel,               defaults: videoDefaults,               category: 'Media' },
  imageGallery:        { component: ImageGallery,        settings: ImageGallerySettings,        label: imageGalleryLabel,        defaults: imageGalleryDefaults,        category: 'Media' },
  socialEmbed:         { component: SocialEmbed,         settings: SocialEmbedSettings,         label: socialEmbedLabel,         defaults: socialEmbedDefaults,         category: 'Media' },
  instaReels:          { component: InstaReels,          settings: InstaReelsSettings,          label: instaReelsLabel,          defaults: instaReelsDefaults,          category: 'Media' },
  blogPosts:           { component: BlogPosts,           settings: BlogPostsSettings,           label: blogPostsLabel,           defaults: blogPostsDefaults,           category: 'Content' },
  map:                 { component: Map,                 settings: MapSettings,                 label: mapLabel,                 defaults: mapDefaults,                 category: 'Other' },
  paymentIcons:        { component: PaymentIcons,        settings: PaymentIconsSettings,        label: paymentIconsLabel,        defaults: paymentIconsDefaults,        category: 'Commerce' },
  stockCounter:         { component: StockCounter,         settings: StockCounterSettings,         label: stockCounterLabel,         defaults: stockCounterDefaults,         category: 'Commerce' },
  sizeGuide:            { component: SizeGuide,            settings: SizeGuideSettings,            label: sizeGuideLabel,            defaults: sizeGuideDefaults,            category: 'Commerce' },
  returnPolicy:         { component: ReturnPolicy,         settings: ReturnPolicySettings,         label: returnPolicyLabel,         defaults: returnPolicyDefaults,         category: 'Commerce' },
  contactCta:           { component: ContactCta,           settings: ContactCtaSettings,           label: contactCtaLabel,           defaults: contactCtaDefaults,           category: 'Conversion' },
  flashSaleBanner:     { component: FlashSaleBanner,     settings: FlashSaleBannerSettings,     label: flashSaleBannerLabel,     defaults: flashSaleBannerDefaults,     category: 'Conversion' },
  customHtml:          { component: CustomHtml,          settings: CustomHtmlSettings,          label: customHtmlLabel,          defaults: customHtmlDefaults,          category: 'Other' },
  backToTop:           { component: BackToTop,           settings: BackToTopSettings,           label: backToTopLabel,           defaults: backToTopDefaults,           category: 'Other' },
};
