function validateFaq(data = {}) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    expandFirst: !!data.expandFirst,
    items: items.map(it => ({
      question: typeof it?.question === 'string' ? it.question : '',
      answer: typeof it?.answer === 'string' ? it.answer : '',
    })),
  };
}
module.exports = { validateFaq };
