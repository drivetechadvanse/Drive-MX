const Core = require('./supermercado-core.js');

function clean(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function quantity(value) {
  const numeric = Math.floor(Number(value || 1));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function lineTotal(product = {}) {
  const productQuantity = quantity(product.quantity || product.productQuantity || 1);
  const unitPrice = Number(product.unitPrice ?? product.productUnitPrice ?? product.price ?? 0);
  return Number(product.lineTotal ?? product.totalPrice ?? product.productTotal ?? product.productCost ?? (unitPrice * productQuantity) ?? 0);
}

function optionLines(product = {}) {
  const lines = [];
  const sizes = Array.isArray(product.sizes || product.medidas)
    ? (product.sizes || product.medidas).map(clean).filter(Boolean).join(', ')
    : '';
  const colors = Array.isArray(product.colors || product.colores)
    ? (product.colors || product.colores).map(clean).filter(Boolean).join(', ')
    : '';
  if (sizes) lines.push(`Medidas: ${sizes}`);
  if (colors) lines.push(`Colores: ${colors}`);
  return lines;
}

function productsHtml(products = []) {
  return products.map((product, index) => {
    const options = optionLines(product).map((line) => `<p><b>${escapeHtml(line.split(':')[0])}:</b>${escapeHtml(line.slice(line.indexOf(':') + 1))}</p>`).join('');
    return `
      <div style="padding:12px 0; border-bottom:1px solid #e5e7eb;">
        <p><b>Producto ${index + 1}:</b> ${escapeHtml(product.name)}</p>
        <p><b>ID:</b> ${escapeHtml(product.id)}</p>
        <p><b>Cantidad:</b> ${quantity(product.quantity || product.productQuantity)}</p>
        <p><b>Precio unitario:</b> $${money(product.unitPrice ?? product.productUnitPrice ?? product.price)}</p>
        <p><b>Total:</b> $${money(lineTotal(product))}</p>
        ${options}
      </div>`;
  }).join('');
}

function productsText(products = []) {
  return products.map((product, index) => {
    const options = optionLines(product);
    return [
      `Producto ${index + 1}: ${clean(product.name)}`,
      `ID: ${clean(product.id)}`,
      `Cantidad: ${quantity(product.quantity || product.productQuantity)}`,
      `Precio unitario: $${money(product.unitPrice ?? product.productUnitPrice ?? product.price)}`,
      `Total: $${money(lineTotal(product))}`,
      ...options
    ].join('\n');
  }).join('\n\n');
}

function copyCategory(target = {}, source = {}) {
  return Core.copyCategory(target, source);
}

function buildBuyerNotification({ orderProducts = [], delivery = {}, cart = {}, transferId = '', paymentStatus = '' } = {}) {
  const supermarketProducts = Core.getSupermarketProducts(orderProducts);
  if (supermarketProducts.length === 0) return null;

  const subtotal = Number(cart.subtotal ?? orderProducts.reduce((total, product) => total + lineTotal(product), 0));
  const shippingFee = Number(cart.shippingFee ?? 0);
  const total = Number(cart.total ?? subtotal + shippingFee);
  const status = clean(paymentStatus).toLowerCase() === 'pagado' ? 'Pago confirmado' : 'Pedido recibido';
  const reference = clean(transferId);
  const address = [delivery.street, delivery.neighborhood, delivery.municipality, delivery.state, delivery.zip]
    .map(clean)
    .filter(Boolean)
    .join(', ');

  const subject = 'Compra de Supermercado confirmada - Drive MX';
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2>Compra de Supermercado confirmada</h2>
      <p>Hola ${escapeHtml(delivery.fullName || 'cliente')}, Drive MX confirmó tu compra de productos de Supermercado.</p>
      <p><b>Estado:</b> ${escapeHtml(status)}</p>
      ${reference ? `<p><b>Referencia:</b> ${escapeHtml(reference)}</p>` : ''}
      <h3>Productos de Supermercado</h3>
      ${productsHtml(supermarketProducts)}
      <p><b>Subtotal del pedido:</b> $${money(subtotal)}</p>
      <p><b>Gastos de envío:</b> $${money(shippingFee)}</p>
      <p><b>Total del pedido:</b> $${money(total)}</p>
      <hr />
      <h3>Datos de entrega</h3>
      <p><b>Nombre:</b> ${escapeHtml(delivery.fullName)}</p>
      <p><b>Dirección:</b> ${escapeHtml(address)}</p>
      <p><b>Teléfono:</b> ${escapeHtml(delivery.phone)}</p>
      <p><b>Correo:</b> ${escapeHtml(delivery.email)}</p>
      <p><b>Referencias:</b> ${escapeHtml(delivery.references)}</p>
      <p>Conserva este correo como confirmación de tu compra.</p>
    </div>`;

  const text = [
    'Compra de Supermercado confirmada - Drive MX',
    `Hola ${clean(delivery.fullName || 'cliente')}, Drive MX confirmó tu compra de productos de Supermercado.`,
    `Estado: ${status}`,
    reference ? `Referencia: ${reference}` : '',
    '',
    'Productos de Supermercado:',
    productsText(supermarketProducts),
    '',
    `Subtotal del pedido: $${money(subtotal)}`,
    `Gastos de envío: $${money(shippingFee)}`,
    `Total del pedido: $${money(total)}`,
    '',
    `Dirección de entrega: ${address}`,
    `Teléfono: ${clean(delivery.phone)}`,
    `Correo: ${clean(delivery.email)}`,
    `Referencias: ${clean(delivery.references)}`,
    '',
    'Conserva este correo como confirmación de tu compra.'
  ].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');

  return {
    to: clean(delivery.email),
    subject,
    text,
    html,
    productCount: supermarketProducts.length
  };
}

module.exports = {
  ...Core,
  copyCategory,
  buildBuyerNotification
};
