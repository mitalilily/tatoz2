const parsePagination = (query = {}, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const pageValue = Number.parseInt(query.page, 10);
  const limitValue = Number.parseInt(query.limit, 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, maxLimit) : defaultLimit;
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { parsePagination };
