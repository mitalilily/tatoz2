import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { pageApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, ErrorView } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import StorefrontFooter from '../../components/StorefrontFooter';
import PageRenderer from '../../components/PageRenderer';

export default function CmsPageScreen() {
  const params = useLocalSearchParams();
  const path = Array.isArray(params.slug) ? params.slug.join('/') : String(params.slug || '');
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await pageApi.bySlug(path);
      setPage(result.page || null);
      setError('');
      if (!result.page) setError('This page could not be found.');
    } catch (reason) {
      setPage(null);
      setError(reason.message || 'This page could not be loaded.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [path]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  if (loading) return <ScreenFrame><LoadingView /></ScreenFrame>;
  if (error || !page) return <ScreenFrame><StorefrontHeader /><ErrorView message={error || 'This page could not be found.'} onRetry={load} /></ScreenFrame>;

  const pageSettings = page.pageSettings || {};
  const layout = page.mobileLayoutMode === 'separate' && page.mobileLayout ? page.mobileLayout : page.layout;
  return <ScreenFrame backgroundColor={pageSettings.backgroundColor || '#ffffff'}>
    <ScreenScroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ paddingBottom: 16 }}>
      {pageSettings.showHeader !== false ? <StorefrontHeader /> : null}
      <PageRenderer sections={layout?.sections || []} designSystem={pageSettings.designSystem || {}} />
      {pageSettings.showFooter !== false ? <StorefrontFooter /> : null}
      <View style={{ height: 8 }} />
    </ScreenScroll>
  </ScreenFrame>;
}
