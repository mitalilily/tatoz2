function validateTabs(data = {}) {
  const tabs = Array.isArray(data.tabs) ? data.tabs : [];
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    style: ['underline', 'pills'].includes(data.style) ? data.style : 'underline',
    tabs: tabs.map(t => ({
      label: typeof t?.label === 'string' ? t.label : '',
      bodyHtml: typeof t?.bodyHtml === 'string' ? t.bodyHtml : '',
    })),
  };
}
module.exports = { validateTabs };
