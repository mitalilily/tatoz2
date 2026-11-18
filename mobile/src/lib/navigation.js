import { router } from 'expo-router';

function appPath(raw) {
  const value = String(raw || '/').trim();
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    try { path = new URL(value).pathname + new URL(value).search; } catch (_) { path = '/'; }
  }
  const [pathname, query = ''] = path.split('?');
  const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  if (normalized === '/') return '/home';
  if (normalized === '/cart') return '/cart';
  if (normalized === '/account') return '/account';
  if (normalized === '/login' || normalized === '/register') return '/login';
  if (normalized === '/search' || normalized === '/categories' || normalized === '/category' || normalized === '/brands' || normalized === '/brand') {
    return `/shop${query ? `?${query}` : ''}`;
  }
  if (normalized.startsWith('/product/')) return normalized;
  if (normalized === '/blog' || normalized.startsWith('/blog/')) return normalized;
  if (normalized.startsWith('/category/')) return `/shop?category=${encodeURIComponent(normalized.slice('/category/'.length))}`;
  if (normalized.startsWith('/brand/')) return `/shop?brand=${encodeURIComponent(normalized.slice('/brand/'.length))}`;
  if (normalized === '/orders') return '/orders';
  if (normalized === '/wishlist') return '/wishlist';
  if (['/profile', '/settings', '/wallet', '/loyalty', '/support', '/notifications'].includes(normalized)) return '/account';
  if (normalized.startsWith('/chat')) return '/chat';
  if (normalized.startsWith('/page/')) return normalized;
  return `/page${normalized}${query ? `?${query}` : ''}`;
}

export function navigateToWebUrl(url) {
  router.push(appPath(url));
}

export function appPathForWebUrl(url) {
  return appPath(url);
}
