(function attachDriveMxSupermercadoCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DriveMxSupermercadoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDriveMxSupermercadoCore() {
  'use strict';

  const CATEGORY = 'supermercado';
  const LABEL = 'Supermercado';
  const GENERAL_CATEGORY = '';
  const CATEGORY_FIELDS = ['category', 'categoria', 'productCategory', 'product_category'];

  function clean(value) {
    return String(value ?? '').trim();
  }

  function fold(value) {
    return clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ')
      .trim();
  }

  function normalizeCategory(value) {
    const raw = clean(value);
    if (!raw) return GENERAL_CATEGORY;
    return fold(raw) === CATEGORY ? CATEGORY : raw;
  }

  function hasCategoryField(source = {}) {
    return Boolean(source && typeof source === 'object' && CATEGORY_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(source, field)));
  }

  function getProductCategory(source = {}) {
    if (!source || typeof source !== 'object') return normalizeCategory(source);
    for (const field of CATEGORY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(source, field)) return normalizeCategory(source[field]);
    }
    return GENERAL_CATEGORY;
  }

  function isSupermarketCategory(value) {
    return fold(value) === CATEGORY;
  }

  function isSupermarketProduct(product = {}) {
    return isSupermarketCategory(getProductCategory(product));
  }

  function createProductFormState(base = {}, source = {}) {
    const category = hasCategoryField(source)
      ? getProductCategory(source)
      : hasCategoryField(base)
        ? getProductCategory(base)
        : GENERAL_CATEGORY;
    return { ...base, category };
  }

  function applyCategoryToProduct(product = {}, source = {}) {
    const category = hasCategoryField(source) ? getProductCategory(source) : getProductCategory(product);
    return { ...product, category };
  }

  function copyCategory(target = {}, source = {}) {
    return applyCategoryToProduct(target, source);
  }

  function splitProducts(products = []) {
    const active = (Array.isArray(products) ? products : []).filter((product) => product && product.active !== false);
    return {
      general: active.filter((product) => !isSupermarketProduct(product)),
      supermarket: active.filter(isSupermarketProduct)
    };
  }

  function getSupermarketProducts(products = []) {
    return splitProducts(products).supermarket;
  }

  function getGeneralProducts(products = []) {
    return splitProducts(products).general;
  }

  function createTransferEmailAudit(mailResult = {}) {
    if (mailResult.supermarketBuyerNotificationRequired !== true) return {};
    const rawError = mailResult.supermarketBuyerNotificationError;
    const errorText = clean(rawError?.message || rawError?.response || rawError || '').slice(0, 500);
    return {
      emailSupermarketBuyerNotificationRequired: true,
      emailSupermarketBuyerNotificationSent: mailResult.supermarketBuyerNotificationSent === true,
      emailSupermarketBuyerNotificationCount: Math.max(0, Number(mailResult.supermarketBuyerNotificationCount || 0)),
      emailSupermarketBuyerNotificationError: errorText
    };
  }

  function createMailLogFields(mailResult = {}) {
    if (mailResult.supermarketBuyerNotificationRequired !== true) return {};
    return {
      supermarketBuyerNotificationSent: mailResult.supermarketBuyerNotificationSent === true,
      supermarketBuyerNotificationCount: Math.max(0, Number(mailResult.supermarketBuyerNotificationCount || 0))
    };
  }

  return {
    CATEGORY,
    LABEL,
    GENERAL_CATEGORY,
    normalizeCategory,
    getProductCategory,
    isSupermarketCategory,
    isSupermarketProduct,
    createProductFormState,
    applyCategoryToProduct,
    copyCategory,
    splitProducts,
    getSupermarketProducts,
    getGeneralProducts,
    createTransferEmailAudit,
    createMailLogFields
  };
});
