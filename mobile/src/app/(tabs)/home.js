import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { pageApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, ErrorView } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import StorefrontFooter from '../../components/StorefrontFooter';
import PageRenderer from '../../components/PageRenderer';

export default function HomeScreen() {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await pageApi.homepage();
      setPage(result.page || null);
      setError('');
    } catch (reason) { setError(reason.message || 'Homepage could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const refresh = () => { setRefreshing(true); load(); };

  if (loading) return <ScreenFrame><LoadingView /></ScreenFrame>;
  if (error || !page) return <ScreenFrame><ErrorView message={error || 'Homepage is not available.'} onRetry={load} /></ScreenFrame>;
  const pageSettings = page.pageSettings || {};
  const layout = page.mobileLayoutMode === 'separate' && page.mobileLayout ? page.mobileLayout : page.layout;
  return <ScreenFrame backgroundColor={pageSettings.backgroundColor || '#ffffff'}>
    <ScreenScroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} contentContainerStyle={styles.content}>
      {pageSettings.showHeader !== false ? <StorefrontHeader /> : null}
      <PageRenderer sections={layout?.sections || []} designSystem={pageSettings.designSystem || {}} />
      {pageSettings.showFooter !== false ? <StorefrontFooter /> : null}
      <View style={{ height: 8 }} />
    </ScreenScroll>
  </ScreenFrame>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 12 } });
