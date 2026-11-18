export const categoryChildren = category => category?.children || category?.subCategories || [];

export const buildCategoryTree = (categories = []) => {
  const nodes = categories.map(category => ({ ...category, children: [] }));
  const byId = new Map(nodes.map(node => [String(node._id), node]));
  const roots = [];
  nodes.forEach(node => {
    const parentId = node.parent?._id || node.parent;
    const parent = parentId ? byId.get(String(parentId)) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = list => list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name)));
  const finalize = node => {
    sortNodes(node.children);
    node.children.forEach(finalize);
    node.subCategories = node.children;
    return node;
  };
  return sortNodes(roots).map(finalize);
};

export const flattenCategoryTree = (tree = [], output = []) => {
  tree.forEach(node => {
    output.push(node);
    flattenCategoryTree(categoryChildren(node), output);
  });
  return output;
};

export const categoryPath = (categoryId, categories = []) => {
  const byId = new Map(categories.map(category => [String(category._id), category]));
  const selected = byId.get(String(categoryId));
  if (selected?.ancestors?.length) {
    const ancestorPath = selected.ancestors
      .map(id => byId.get(String(id)))
      .filter(Boolean);
    if (ancestorPath.length) return [...ancestorPath, selected];
  }
  const path = [];
  let current = selected;
  const seen = new Set();
  while (current && !seen.has(String(current._id))) {
    seen.add(String(current._id));
    path.unshift(current);
    const parentId = current.parent?._id || current.parent;
    current = parentId ? byId.get(String(parentId)) : null;
  }
  return path;
};

export const categoryPathLabel = (categoryId, categories = []) => categoryPath(categoryId, categories).map(item => item.name).join(' › ');
