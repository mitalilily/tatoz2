function validateAnnouncementBar(data = {}) {
  return {
    text: typeof data.text === 'string' ? data.text : '',
    linkLabel: typeof data.linkLabel === 'string' ? data.linkLabel : '',
    linkUrl: typeof data.linkUrl === 'string' ? data.linkUrl : '',
    backgroundColor: typeof data.backgroundColor === 'string' ? data.backgroundColor : '#111827',
    textColor: typeof data.textColor === 'string' ? data.textColor : '#ffffff',
    dismissible: !!data.dismissible,
  };
}
module.exports = { validateAnnouncementBar };
