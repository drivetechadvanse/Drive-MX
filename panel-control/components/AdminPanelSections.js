import { buildPackageFromPanelForm, createEmptyPackageForm } from '../services/panelControlService.js';

const h = globalThis.React?.createElement;
const noop = () => {};
const EmptyIcon = () => null;
const toArray = (value) => Array.isArray(value) ? value : [];

function getOrderProducts(transfer = {}) {
  if (Array.isArray(transfer.order?.products) && transfer.order.products.length > 0) return transfer.order.products;
  if (transfer.order?.product) return [transfer.order.product];
  return [];
}

export function AdminHeader(props = {}) {
  if (!h) return null;
  const Icons = props.Icons || {};
  const MenuIcon = Icons.Menu || EmptyIcon;
  const setShowAdminMenu = props.setShowAdminMenu || noop;
  return h('div', { className: 'flex justify-between items-start gap-4' },
    h('div', null,
      h('h1', { className: 'text-3xl font-black' }, 'Panel ', h('span', { className: 'text-red-500' }, 'Admin')),
      h('p', { className: 'text-[10px] font-bold text-slate-400 uppercase' }, 'Gestión Central')
    ),
    h('div', { className: 'flex items-start gap-3 relative' },
      h('button', {
        type: 'button',
        onClick: () => setShowAdminMenu(!props.showAdminMenu),
        className: 'w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-red-500 shadow-sm'
      }, h(MenuIcon)),
      props.showAdminMenu ? h('div', { className: 'absolute right-0 top-14 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl p-2 z-50 animate-slide' },
        h('button', { type: 'button', onClick: props.openAdminTracking || noop, className: 'w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600' }, 'Buscador de Guías'),
        h('button', { type: 'button', onClick: props.openAdminSupport || noop, className: 'w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-red-50 hover:text-red-600' }, 'Soporte Técnico')
      ) : null
    )
  );
}

export function NewShipmentCard(props = {}) {
  if (!h) return null;
  const pkgForm = props.pkgForm || createEmptyPackageForm();
  const setPkgForm = props.setPkgForm || noop;
  const users = toArray(props.users);
  const handleSubmit = (event) => {
    event.preventDefault();
    const nextPackage = buildPackageFromPanelForm(pkgForm);
    if (!nextPackage.id) return;
    if (typeof props.saveDoc === 'function') props.saveDoc('packages', nextPackage.id, nextPackage);
    setPkgForm(createEmptyPackageForm());
  };

  return h('div', { className: 'md:col-span-1 card-glass p-6 space-y-6' },
    h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Nuevo Envío'),
    h('form', { onSubmit: handleSubmit, className: 'space-y-4' },
      h('input', { required: true, className: 'input-field uppercase', placeholder: 'NÚMERO DE GUÍA', value: pkgForm.id || '', onChange: (e) => setPkgForm({ ...pkgForm, id: e.target.value }) }),
      h('input', { required: true, className: 'input-field uppercase', placeholder: 'ORIGEN', value: pkgForm.o || '', onChange: (e) => setPkgForm({ ...pkgForm, o: e.target.value }) }),
      h('input', { required: true, className: 'input-field uppercase', placeholder: 'DESTINO', value: pkgForm.d || '', onChange: (e) => setPkgForm({ ...pkgForm, d: e.target.value }) }),
      h('select', { required: true, className: 'input-field', value: pkgForm.op || '', onChange: (e) => setPkgForm({ ...pkgForm, op: e.target.value }) },
        h('option', { value: '' }, 'ASIGNAR USUARIO'),
        users.filter((user) => user.role !== 'admin' && user.active !== false).map((user) => h('option', { key: user.id, value: user.id }, user.name))
      ),
      h('button', { type: 'submit', className: 'w-full btn-primary h-12' }, 'Crear Guía')
    )
  );
}

export function ActiveShipmentsCard(props = {}) {
  if (!h) return null;
  const Icons = props.Icons || {};
  const TrashIcon = Icons.Trash || EmptyIcon;
  const pkgs = toArray(props.pkgs);
  const findProductByTracking = props.findProductByTracking || (() => null);
  const deletePkg = props.deletePkg || noop;

  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Envíos Activos')
    ),
    h('table', { className: 'w-full text-left' },
      h('tbody', { className: 'divide-y divide-slate-50' },
        pkgs.map((pkg) => h('tr', { key: pkg.id, className: 'text-[10px] font-bold text-slate-600' },
          h('td', { className: 'px-6 py-4 text-red-600 font-black' }, `#${pkg.id}`),
          h('td', { className: 'px-6 py-4' },
            `${pkg.o} → ${pkg.d}`,
            h('br'),
            h('span', { className: 'text-[8px] text-slate-400 uppercase' }, findProductByTracking(pkg)?.name || pkg.productId || 'Sin producto')
          ),
          h('td', { className: 'px-6 py-4' }, h('span', { className: 'px-2 py-1 bg-slate-100 rounded-full text-[8px] uppercase' }, pkg.status)),
          h('td', { className: 'px-6 py-4 text-right' }, h('button', { onClick: () => deletePkg(pkg.id), className: 'text-slate-300 hover:text-red-500' }, h(TrashIcon)))
        )),
        pkgs.length === 0 ? h('tr', null, h('td', { colSpan: '4', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'No hay envíos activos')) : null
      )
    )
  );
}

export function EmailSettingsCard(props = {}) {
  if (!h) return null;
  const settings = props.emailSettings || {};
  const setEmailSettings = props.setEmailSettings || noop;
  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Configuración de Correo'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Gmail para notificaciones automáticas de pedidos')
    ),
    h('form', { onSubmit: props.saveEmailSettings || noop, className: 'p-6 grid md:grid-cols-1 gap-3' },
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Correo electrónico remitente'),
        h('input', { required: true, type: 'email', className: 'input-field', placeholder: 'correo@gmail.com', value: settings.senderEmail || '', onChange: (e) => setEmailSettings({ ...settings, senderEmail: e.target.value }) })
      ),
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Contraseña de aplicación Gmail'),
        h('input', { required: true, type: 'password', autoComplete: 'new-password', className: 'input-field', placeholder: 'Contraseña de aplicación', value: settings.appPassword || '', onChange: (e) => setEmailSettings({ ...settings, appPassword: e.target.value }) })
      ),
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Correo base receptor'),
        h('input', { required: true, type: 'email', className: 'input-field', placeholder: 'pedidos@empresa.com', value: settings.receiverEmail || '', onChange: (e) => setEmailSettings({ ...settings, receiverEmail: e.target.value }) })
      ),
      h('button', { disabled: props.emailSaving, type: 'submit', className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, props.emailSaving ? 'Guardando...' : 'Guardar Configuración de Correo')
    )
  );
}

export function PaymentSettingsCard(props = {}) {
  if (!h) return null;
  const settings = props.paymentSettings || {};
  const setPaymentSettings = props.setPaymentSettings || noop;
  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Configuración de Pagos'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Cuenta Banco Azteca para copiar y pegar')
    ),
    h('form', { onSubmit: props.savePaymentSettings || noop, className: 'p-6 grid md:grid-cols-1 gap-3' },
      h('div', null,
        h('label', { className: 'block text-[9px] font-black uppercase text-slate-400 mb-2' }, 'Número de cuenta bancaria'),
        h('input', { required: true, type: 'text', className: 'input-field', placeholder: 'Cuenta Banco Azteca', value: settings.bankAccount || '', onChange: (e) => setPaymentSettings({ ...settings, bankAccount: e.target.value }) })
      ),
      h('button', { disabled: props.paymentSaving, type: 'submit', className: 'btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, props.paymentSaving ? 'Guardando...' : 'Guardar Configuración de Pagos')
    )
  );
}

export function PendingTransfersCard(props = {}) {
  if (!h) return null;
  const transfers = toArray(props.pendingSalesTransfers);
  const productOptionsLines = props.productOptionsLines || (() => []);
  const sessionUser = props.sessionUser || {};
  const transferTrackingDrafts = props.transferTrackingDrafts || {};
  const setTransferTrackingDrafts = props.setTransferTrackingDrafts || noop;

  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Transferencias Pendientes'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Solo ventas: las solicitudes pendientes no envían correo ni se procesan hasta marcar Pagado')
    ),
    h('div', { className: 'overflow-x-auto drive-mx-panel-table-wrap' },
      h('table', { className: 'w-full text-left' },
        h('thead', { className: 'bg-white border-b border-slate-50' },
          h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
            h('th', { className: 'px-6 py-3' }, 'Titular'),
            h('th', { className: 'px-6 py-3' }, 'Fecha y hora'),
            h('th', { className: 'px-6 py-3' }, 'Estado'),
            h('th', { className: 'px-6 py-3' }, 'Detalle'),
            h('th', { className: 'px-6 py-3' }, 'Guía del producto'),
            h('th', { className: 'px-6 py-3 text-right' }, 'Acciones')
          )
        ),
        h('tbody', { className: 'divide-y divide-slate-50' },
          transfers.map((transfer) => {
            const transferId = transfer.id || transfer.transferId;
            const transferProducts = getOrderProducts(transfer);
            return h('tr', { key: transferId, className: 'text-[10px] font-bold text-slate-600 align-top' },
              h('td', { className: 'px-6 py-4 font-black text-slate-800' }, transfer.holderName),
              h('td', { className: 'px-6 py-4' }, transfer.createdAt ? new Date(transfer.createdAt).toLocaleString('es-MX') : '-'),
              h('td', { className: 'px-6 py-4' }, h('span', { className: `px-2 py-1 rounded-full text-[8px] uppercase ${transfer.status === 'Pagado' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-700'}` }, transfer.status)),
              h('td', { className: 'px-6 py-4' },
                transfer.type === 'wallet_recharge'
                  ? h('div', null,
                      h('p', { className: 'font-black text-slate-800' }, 'Recarga de saldo a favor'),
                      h('p', { className: 'text-slate-400 font-mono' }, `Usuario: ${transfer.userEmail || transfer.userId || transfer.walletId || ''}`),
                      h('p', { className: 'text-red-600 font-black' }, `$${Number(transfer.amount || 0).toFixed(2)} MXN`),
                      h('p', { className: 'text-slate-400' }, transfer.userPhone || '')
                    )
                  : h(globalThis.React.Fragment, null,
                      transferProducts.map((product, index) => h('div', { key: `${transferId}_${product.id || index}`, className: index > 0 ? 'mt-2 pt-2 border-t border-slate-100' : '' },
                        h('p', { className: 'font-black' }, product.name),
                        h('p', { className: 'text-red-600 font-black' }, `$${Number(product.price || 0).toFixed(2)}`),
                        productOptionsLines(product).map((line) => h('p', { key: line, className: 'text-slate-400 uppercase' }, line))
                      )),
                      h('p', { className: 'text-slate-500 font-bold mt-2' }, `Gastos de envio: $${Number(transfer.order?.cart?.shippingFee ?? 150).toFixed(2)}`),
                      h('p', { className: 'text-slate-800 font-black' }, `Total: $${Number(transfer.order?.cart?.total || (transferProducts.reduce((total, product) => total + Number(product.price || 0), 0) + Number(transfer.order?.cart?.shippingFee ?? 150))).toFixed(2)}`),
                      h('p', { className: 'text-slate-400' }, `${transfer.order?.delivery?.phone || ''} · ${transfer.order?.delivery?.email || ''}`)
                    )
              ),
              h('td', { className: 'px-6 py-4 min-w-[210px]' },
                transfer.type === 'wallet_recharge'
                  ? h('span', { className: 'text-[8px] font-black uppercase text-slate-300' }, 'No aplica')
                  : h('div', { className: 'space-y-2' },
                      h('input', { className: 'input-field uppercase text-[10px]', placeholder: 'NÚMERO DE GUÍA', value: transferTrackingDrafts[transferId] ?? transfer.trackingNumber ?? '', onChange: (e) => setTransferTrackingDrafts((prev) => ({ ...prev, [transferId]: e.target.value })) }),
                      h('button', { type: 'button', onClick: () => props.assignTrackingToTransfer?.(transfer), className: 'px-3 py-2 bg-red-50 text-red-600 rounded-xl text-[8px] font-black uppercase' }, 'Guardar guía'),
                      transfer.trackingNumber ? h('p', { className: 'text-[8px] font-black text-green-600 uppercase' }, `Guía asociada: ${transfer.trackingNumber}`) : null
                    )
              ),
              h('td', { className: 'px-6 py-4 text-right' },
                h('div', { className: 'flex justify-end gap-2 flex-wrap' },
                  sessionUser?.role === 'admin' && transfer.status === 'Pendiente' ? h('button', { onClick: () => props.markTransferPaid?.(transfer), disabled: props.orderSending, className: 'px-3 py-2 bg-green-50 text-green-600 rounded-xl text-[8px] font-black uppercase disabled:opacity-50' }, 'Pagado') : null,
                  sessionUser?.role === 'admin' && transfer.status === 'Pagado' && transfer.emailStatus !== 'Enviado' ? h('button', { onClick: () => props.markTransferPaid?.(transfer), disabled: props.orderSending, className: 'px-3 py-2 bg-amber-50 text-amber-700 rounded-xl text-[8px] font-black uppercase disabled:opacity-50' }, 'Reintentar correo') : null,
                  sessionUser?.role === 'admin' ? h('button', { type: 'button', onClick: () => props.deleteTransfer?.(transfer), className: 'px-3 py-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[8px] font-black uppercase' }, 'Eliminar') : null
                )
              )
            );
          }),
          transfers.length === 0 ? h('tr', null, h('td', { colSpan: '6', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'No hay transferencias pendientes de ventas registradas')) : null
        )
      )
    )
  );
}

export function CompletedSalesCard(props = {}) {
  if (!h) return null;
  const Icons = props.Icons || {};
  const TrashIcon = Icons.Trash || EmptyIcon;
  const sales = toArray(props.completedSales);
  const normalizeProductSizes = props.normalizeProductSizes || (() => []);
  const normalizeProductColors = props.normalizeProductColors || (() => []);

  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Ventas Realizadas'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Registro automático de ventas pagadas y datos del vendedor')
    ),
    h('div', { className: 'overflow-x-auto drive-mx-panel-table-wrap' },
      h('table', { className: 'w-full text-left' },
        h('thead', { className: 'bg-white border-b border-slate-50' },
          h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
            h('th', { className: 'px-6 py-3' }, 'Usuario vendedor'),
            h('th', { className: 'px-6 py-3' }, 'Correo electrónico'),
            h('th', { className: 'px-6 py-3' }, 'Teléfono'),
            h('th', { className: 'px-6 py-3' }, 'Costo vendido'),
            h('th', { className: 'px-6 py-3' }, 'Fecha y hora'),
            h('th', { className: 'px-6 py-3 text-right' }, 'Acciones')
          )
        ),
        h('tbody', { className: 'divide-y divide-slate-50' },
          sales.map((sale) => {
            const sizes = normalizeProductSizes(sale.productSizes);
            const colors = normalizeProductColors(sale.productColors);
            return h('tr', { key: sale.id || sale.saleId, className: 'text-[10px] font-bold text-slate-600 align-top' },
              h('td', { className: 'px-6 py-4' },
                h('p', { className: 'font-black text-slate-800' }, sale.sellerName || '-'),
                h('p', { className: 'text-[8px] text-slate-400 uppercase' }, sale.productName || sale.productId || ''),
                sizes.length > 0 ? h('p', { className: 'text-[8px] text-slate-400 uppercase' }, `Medidas: ${sizes.join(', ')}`) : null,
                colors.length > 0 ? h('p', { className: 'text-[8px] text-slate-400 uppercase' }, `Colores: ${colors.join(', ')}`) : null
              ),
              h('td', { className: 'px-6 py-4 font-mono text-slate-400' }, sale.sellerEmail || '-'),
              h('td', { className: 'px-6 py-4 font-mono text-slate-400' }, sale.sellerPhone || '-'),
              h('td', { className: 'px-6 py-4 text-red-600 font-black' }, `$${Number(sale.productCost || 0).toFixed(2)}`),
              h('td', { className: 'px-6 py-4' }, sale.soldAt ? new Date(sale.soldAt).toLocaleString('es-MX') : '-'),
              h('td', { className: 'px-6 py-4 text-right' }, h('button', { type: 'button', onClick: () => props.deleteCompletedSale?.(sale), className: 'px-3 py-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[8px] font-black uppercase inline-flex items-center gap-1' }, h(TrashIcon, { size: 11 }), ' Eliminar'))
            );
          }),
          sales.length === 0 ? h('tr', null, h('td', { colSpan: '6', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay ventas realizadas registradas')) : null
        )
      )
    )
  );
}

export function ProductsAdminPanel(props = {}) {
  if (!h) return null;
  const Icons = props.Icons || {};
  const TrashIcon = Icons.Trash || EmptyIcon;
  const productForm = props.productForm || {};
  const setProductForm = props.setProductForm || noop;
  const productImageFiles = toArray(props.productImageFiles);
  const controlProducts = toArray(props.controlProducts);
  const normalizeProductSizes = props.normalizeProductSizes || (() => []);
  const normalizeProductColors = props.normalizeProductColors || (() => []);
  const getProductGallery = props.getProductGallery || (() => []);

  return h('div', { className: 'card-glass overflow-hidden' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-3' },
      h('div', null,
        h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400 drive-mx-panel-section-title' }, 'Administración de Productos'),
        h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Administra únicamente publicaciones creadas desde el Panel de Control')
      ),
      props.editingProductId ? h('button', { onClick: props.resetProductForm || noop, className: 'text-[9px] font-black text-slate-400 uppercase' }, 'Cancelar edición') : null
    ),
    h('div', { className: 'p-6 border-b border-slate-50' },
      h('form', { onSubmit: props.handleProductSubmit || noop, className: 'grid md:grid-cols-5 gap-3' },
        h('label', { className: 'md:col-span-5 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 cursor-pointer hover:border-red-200 transition-all' },
          h('input', { type: 'file', accept: 'image/*', multiple: true, className: 'hidden', onChange: props.handleProductImagesSelect || noop }),
          h('div', { className: 'flex items-center justify-between gap-4 flex-wrap' },
            h('div', null,
              h('p', { className: 'text-[10px] font-black uppercase text-slate-600' }, 'Fotografías del producto'),
              h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase mt-1' }, 'Máximo 5 imágenes JPG, PNG o WebP asociadas al mismo ID')
            ),
            h('span', { className: 'px-3 py-2 bg-white rounded-xl text-[9px] font-black text-slate-400 uppercase' }, `${toArray(productForm.images).length + productImageFiles.length}/5 fotos`)
          )
        ),
        (toArray(productForm.images).length > 0 || productImageFiles.length > 0) ? h('div', { className: 'md:col-span-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3' },
          toArray(productForm.images).map((img, index) => h('div', { key: img + index, className: 'relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 group' },
            h('img', { src: img, alt: `Foto ${index + 1}`, className: 'w-full aspect-square object-cover' }),
            h('div', { className: 'absolute inset-x-2 bottom-2 flex gap-1' },
              h('label', { className: 'flex-1 text-center bg-white/90 rounded-lg px-2 py-1 text-[7px] font-black uppercase cursor-pointer' },
                'Reemplazar',
                h('input', { type: 'file', accept: 'image/*', className: 'hidden', onChange: (e) => props.replaceExistingProductImage?.(index, e) })
              ),
              h('button', { type: 'button', onClick: () => props.removeExistingProductImage?.(index), className: 'flex-1 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase' }, 'Eliminar')
            )
          )),
          productImageFiles.map((item, index) => h('div', { key: item.preview, className: 'relative rounded-2xl overflow-hidden bg-slate-100 border border-dashed border-red-200' },
            h('img', { src: item.preview, alt: `Nueva foto ${index + 1}`, className: 'w-full aspect-square object-cover' }),
            h('button', { type: 'button', onClick: () => props.removeNewProductImage?.(index), className: 'absolute inset-x-2 bottom-2 bg-red-500 text-white rounded-lg px-2 py-1 text-[7px] font-black uppercase' }, 'Quitar')
          ))
        ) : null,
        h('input', { required: true, className: 'input-field md:col-span-2', placeholder: 'NOMBRE', value: productForm.name || '', onChange: (e) => setProductForm({ ...productForm, name: e.target.value }) }),
        h('input', { required: true, type: 'number', min: '0', step: '0.01', className: 'input-field', placeholder: 'PRECIO', value: productForm.price ?? '', onChange: (e) => setProductForm({ ...productForm, price: e.target.value }) }),
        h('input', { required: true, type: 'number', min: '0', step: '1', className: 'input-field', placeholder: 'INVENTARIO', value: productForm.stock ?? '', onChange: (e) => setProductForm({ ...productForm, stock: e.target.value }) }),
        h('label', { className: 'flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 bg-slate-50 rounded-xl px-4 py-3' },
          h('input', { type: 'checkbox', checked: Boolean(productForm.active), onChange: (e) => setProductForm({ ...productForm, active: e.target.checked }) }),
          'Activo'
        ),
        h('div', { className: 'md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3' },
          h('p', { className: 'text-[10px] font-black uppercase text-slate-600' }, 'Medidas opcionales'),
          h('div', { className: 'flex flex-wrap gap-2' },
            toArray(props.PRODUCT_SIZE_OPTIONS).map((size) => {
              const selected = normalizeProductSizes(productForm.sizes).includes(size);
              return h('label', { key: size, className: `px-3 py-2 rounded-xl border text-[9px] font-black uppercase cursor-pointer ${selected ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-slate-100 text-slate-400'}` },
                h('input', { type: 'checkbox', className: 'hidden', checked: selected, onChange: (e) => setProductForm((prev) => ({ ...prev, sizes: e.target.checked ? [...normalizeProductSizes(prev.sizes), size] : normalizeProductSizes(prev.sizes).filter((item) => item !== size) })) }),
                size
              );
            })
          )
        ),
        h('div', { className: 'md:col-span-5 bg-slate-50 rounded-2xl p-4 space-y-3' },
          h('div', { className: 'flex items-center justify-between gap-3' },
            h('p', { className: 'text-[10px] font-black uppercase text-slate-600' }, 'Colores opcionales'),
            h('button', { type: 'button', onClick: () => setProductForm((prev) => ({ ...prev, colors: [...(prev.colors || ['']), ''] })), className: 'px-3 py-2 bg-white border border-slate-100 rounded-xl text-[10px] font-black text-red-500' }, '+')
          ),
          (productForm.colors || ['']).map((color, index) => h('div', { key: index, className: 'flex gap-2' },
            h('input', { className: 'input-field', placeholder: 'COLOR', value: color || '', onChange: (e) => setProductForm((prev) => { const colors = [...(prev.colors || [''])]; colors[index] = e.target.value; return { ...prev, colors }; }) }),
            h('button', { type: 'button', onClick: () => setProductForm((prev) => { const colors = (prev.colors || ['']).filter((_, i) => i !== index); return { ...prev, colors: colors.length ? colors : [''] }; }), className: 'px-3 rounded-xl bg-white border border-slate-100 text-slate-400 font-black' }, '×')
          ))
        ),
        h('textarea', { className: 'input-field md:col-span-5 min-h-[90px] resize-y', placeholder: 'DESCRIPCIÓN', value: productForm.description || '', onChange: (e) => setProductForm({ ...productForm, description: e.target.value }) }),
        h('textarea', { className: 'input-field md:col-span-5 min-h-[90px] resize-y', placeholder: 'ESPECIFICACIONES', value: productForm.specifications || '', onChange: (e) => setProductForm({ ...productForm, specifications: e.target.value }) }),
        h('button', { disabled: props.productUploading, type: 'submit', className: 'md:col-span-5 btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed' }, props.productUploading ? 'Guardando...' : (props.editingProductId ? 'Guardar Cambios' : 'Agregar Producto'))
      )
    ),
    h('div', { className: 'overflow-x-auto drive-mx-panel-table-wrap' },
      h('table', { className: 'w-full text-left' },
        h('thead', { className: 'bg-white border-b border-slate-50' },
          h('tr', { className: 'text-[8px] font-black uppercase text-slate-400' },
            h('th', { className: 'px-6 py-3' }, 'Foto'),
            h('th', { className: 'px-6 py-3' }, 'Producto'),
            h('th', { className: 'px-6 py-3' }, 'Precio'),
            h('th', { className: 'px-6 py-3' }, 'Inventario'),
            h('th', { className: 'px-6 py-3' }, 'Estado'),
            h('th', { className: 'px-6 py-3 text-right' }, 'Acciones')
          )
        ),
        h('tbody', { className: 'divide-y divide-slate-50' },
          controlProducts.map((product) => h('tr', { key: product.id, className: 'text-[10px] font-bold text-slate-600' },
            h('td', { className: 'px-6 py-4' },
              h('div', { className: 'w-12 h-12 rounded-xl bg-slate-100 overflow-hidden drive-mx-panel-product-thumb' },
                getProductGallery(product)[0] ? h('img', { src: getProductGallery(product)[0], alt: product.name, className: 'w-full h-full object-cover' }) : null
              )
            ),
            h('td', { className: 'px-6 py-4' }, h('p', { className: 'font-black text-slate-800' }, product.name), h('p', { className: 'font-mono text-[8px] text-slate-400' }, product.id)),
            h('td', { className: 'px-6 py-4 text-red-600 font-black' }, `$${Number(product.price || 0).toFixed(2)}`),
            h('td', { className: 'px-6 py-4' }, Number(product.stock || 0)),
            h('td', { className: 'px-6 py-4' }, h('span', { className: `px-2 py-1 rounded-full text-[8px] uppercase ${product.active !== false ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}` }, product.active !== false ? 'Activo' : 'Inactivo')),
            h('td', { className: 'px-6 py-4 text-right' },
              h('div', { className: 'flex justify-end gap-2 flex-wrap' },
                h('button', { onClick: () => props.editProduct?.(product), className: 'px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase' }, 'Editar'),
                h('button', { onClick: () => props.toggleProduct?.(product), className: 'px-2 py-1 bg-slate-100 rounded-lg text-[8px] font-black uppercase' }, product.active !== false ? 'Desactivar' : 'Activar'),
                h('button', { onClick: () => props.deleteProduct?.(product.id), className: 'text-slate-300 hover:text-red-500' }, h(TrashIcon))
              )
            )
          )),
          controlProducts.length === 0 ? h('tr', null, h('td', { colSpan: '6', className: 'px-6 py-8 text-center text-[10px] font-bold text-slate-300 uppercase' }, 'Aún no hay productos registrados')) : null
        )
      )
    )
  );
}
