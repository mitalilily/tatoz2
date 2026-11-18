import { createContext, useCallback, useContext, useState } from 'react';

const DEFAULT_PAGE_FRAME = { showHeader: true, showFooter: true };

const PageFrameContext = createContext({
  pageFrame: DEFAULT_PAGE_FRAME,
  setPageFrame: () => {},
});

export const usePageFrame = () => useContext(PageFrameContext);

export function PageFrameProvider({ children }) {
  const [pageFrame, setPageFrameState] = useState(DEFAULT_PAGE_FRAME);
  const setPageFrame = useCallback((next = {}) => {
    setPageFrameState({
      showHeader: next.showHeader !== false,
      showFooter: next.showFooter !== false,
    });
  }, []);

  return (
    <PageFrameContext.Provider value={{ pageFrame, setPageFrame }}>
      {children}
    </PageFrameContext.Provider>
  );
}
