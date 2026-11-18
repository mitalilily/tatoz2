const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Blog = require('../models/Blog');
const BlogCategory = require('../models/BlogCategory');

const createSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const createUniqueProductSlug = async (title, excludeId = null) => {
  let slug = createSlug(title);
  let counter = 0;
  let uniqueSlug = slug;

  while (true) {
    const query = { slug: uniqueSlug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Product.findOne(query);
    if (!existing) return uniqueSlug;
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
};

const createUniqueCategorySlug = async (name, excludeId = null) => {
  let slug = createSlug(name);
  let counter = 0;
  let uniqueSlug = slug;

  while (true) {
    const query = { slug: uniqueSlug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Category.findOne(query);
    if (!existing) return uniqueSlug;
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
};

const createUniqueBrandSlug = async (name, excludeId = null) => {
  let slug = createSlug(name);
  let counter = 0;
  let uniqueSlug = slug;
  while (true) {
    const query = { slug: uniqueSlug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Brand.findOne(query);
    if (!existing) return uniqueSlug;
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
};

const createUniqueBlogSlug = async (title, excludeId = null) => {
  let slug = createSlug(title);
  let counter = 0;
  let uniqueSlug = slug;

  while (true) {
    const query = { slug: uniqueSlug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Blog.findOne(query);
    if (!existing) return uniqueSlug;
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
};

const createUniqueBlogCategorySlug = async (name, excludeId = null) => {
  let slug = createSlug(name);
  let counter = 0;
  let uniqueSlug = slug;

  while (true) {
    const query = { slug: uniqueSlug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await BlogCategory.findOne(query);
    if (!existing) return uniqueSlug;
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
};

module.exports = { createSlug, createUniqueProductSlug, createUniqueCategorySlug, createUniqueBrandSlug, createUniqueBlogSlug, createUniqueBlogCategorySlug };
