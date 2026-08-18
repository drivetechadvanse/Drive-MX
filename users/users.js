(function (global) {
  'use strict';

  const MODULE_NAME = 'DriveMxUsersUI';
  const STYLE_ID = 'drive-mx-users-styles';
  const DEFAULT_PAGE_SIZE = 20;

  function injectStyles() {
    if (global.document.getElementById(STYLE_ID)) return;
    const style = global.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .registered-users-card { max-height: min(72vh, 760px); display: flex; flex-direction: column; min-height: 0; }
      .registered-users-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
      @media (max-width: 640px) { .registered-users-card { max-height: calc(100vh - 7rem); } }
    `;
    global.document.head.appendChild(style);
  }

  function createUsersUI(React) {
    if (!React || !React.createElement) {
      throw new Error(`${MODULE_NAME}: React no está disponible.`);
    }

    injectStyles();
    const h = React.createElement;
    const noop = () => {};
    const EmptyIcon = () => null;
    const toArray = (value) => Array.isArray(value) ? value : [];
    const resolvePage = (page, totalPages) => Math.min(Math.max(Number(page || 1), 1), totalPages);

    function RegisteredUsersPanel(props = {}) {
      const users = toArray(props.users).filter((user) => user && user.role !== 'admin');
      const pageSize = Math.max(1, Number(props.pageSize || DEFAULT_PAGE_SIZE));
      const totalUsers = users.length;
      const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
      const currentPage = resolvePage(props.page, totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const visibleUsers = users.slice(startIndex, startIndex + pageSize);
      const visibleStart = totalUsers === 0 ? 0 : startIndex + 1;
      const visibleEnd = Math.min(startIndex + visibleUsers.length, totalUsers);
      const Icons = props.icons || {};
      const LockIcon = Icons.Lock || EmptyIcon;
      const UnlockIcon = Icons.Unlock || EmptyIcon;
      const TrashIcon = Icons.Trash || EmptyIcon;
      const ChevronLeftIcon = Icons.ChevronLeft || EmptyIcon;
      const ChevronRightIcon = Icons.ChevronRight || EmptyIcon;
      const isUserBlocked = typeof props.isUserBlocked === 'function' ? props.isUserBlocked : () => false;
      const onEditUser = typeof props.onEditUser === 'function' ? props.onEditUser : noop;
      const onToggleBlocked = typeof props.onToggleBlocked === 'function' ? props.onToggleBlocked : noop;
      const onDeleteUser = typeof props.onDeleteUser === 'function' ? props.onDeleteUser : noop;
      const onPageChange = typeof props.onPageChange === 'function' ? props.onPageChange : noop;

      return h('div', { className: 'card-glass registered-users-card overflow-hidden' },
        h('div', { className: 'bg-slate-50 border-b border-slate-100 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0' },
          h('div', { className: 'min-w-0' },
            h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Usuarios Registrados'),
            h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1 break-anywhere' }, 'Registro y control de accesos de usuarios')
          ),
          h('div', { className: 'flex flex-wrap items-center gap-2' },
            h('span', { className: 'px-3 py-2 bg-white border border-slate-100 rounded-full text-[9px] font-black text-red-500 uppercase whitespace-nowrap' }, `${totalUsers} usuarios`),
            h('span', { className: 'px-3 py-2 bg-white border border-slate-100 rounded-full text-[9px] font-black text-slate-400 uppercase whitespace-nowrap' }, `${pageSize} por página`)
          )
        ),

        h('div', { className: 'registered-users-scroll p-4 sm:p-6 space-y-3' },
          visibleUsers.map((user) => {
            const blocked = isUserBlocked(user);
            const key = user.id || user.uid || user.email;
            return h('article', { key, className: 'rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm' },
              h('div', { className: 'flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 min-w-0' },
                h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 flex-1 min-w-0' },
                  h('div', { className: 'min-w-0' },
                    h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-slate-300 mb-1' }, 'Nombre'),
                    h('p', { className: 'text-[11px] font-black text-slate-800 break-anywhere' }, user.name || '-')
                  ),
                  h('div', { className: 'min-w-0' },
                    h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-slate-300 mb-1' }, 'Correo electrónico'),
                    h('p', { className: 'text-[10px] font-mono font-bold text-slate-500 break-anywhere' }, user.email || '-')
                  ),
                  h('div', { className: 'min-w-0' },
                    h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-slate-300 mb-1' }, 'Teléfono'),
                    h('p', { className: 'text-[10px] font-mono font-bold text-slate-500 break-anywhere' }, user.phone || '-')
                  ),
                  h('div', { className: 'min-w-0' },
                    h('p', { className: 'text-[8px] font-black uppercase tracking-widest text-slate-300 mb-1' }, 'Estado'),
                    h('span', {
                      className: `inline-block max-w-full px-3 py-1 rounded-full text-[8px] font-black uppercase break-anywhere whitespace-normal ${blocked ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`
                    }, blocked ? 'Bloqueado' : (user.accountStatus || 'Activo'))
                  )
                ),

                h('div', { className: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2 w-full lg:w-48 flex-shrink-0' },
                  h('button', {
                    type: 'button',
                    onClick: () => onEditUser(user),
                    className: 'w-full px-3 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-[8px] font-black uppercase inline-flex items-center justify-center gap-1 whitespace-nowrap'
                  }, 'Editar'),
                  h('button', {
                    type: 'button',
                    onClick: () => onToggleBlocked(user),
                    title: blocked ? 'Desbloquear usuario' : 'Bloquear usuario',
                    className: `w-full px-3 py-2 rounded-xl text-[8px] font-black uppercase inline-flex items-center justify-center gap-1 whitespace-nowrap ${blocked ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600'}`
                  },
                    blocked ? h(UnlockIcon, { size: 12 }) : h(LockIcon, { size: 12 }),
                    blocked ? 'Desbloquear' : 'Bloquear'
                  ),
                  h('button', {
                    type: 'button',
                    onClick: () => onDeleteUser(user),
                    className: 'w-full px-3 py-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-[8px] font-black uppercase inline-flex items-center justify-center gap-1 whitespace-nowrap'
                  }, h(TrashIcon, { size: 11 }), ' Eliminar')
                )
              )
            );
          }),

          totalUsers === 0 ? h('div', { className: 'rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center' },
            h('p', { className: 'text-[10px] font-black text-slate-300 uppercase tracking-widest' }, 'Aún no hay usuarios registrados')
          ) : null
        ),

        h('div', { className: 'bg-slate-50 border-t border-slate-100 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0' },
          h('p', { className: 'text-[9px] font-black text-slate-400 uppercase tracking-widest' }, `Mostrando ${visibleStart}-${visibleEnd} de ${totalUsers} usuarios`),
          h('div', { className: 'grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 w-full sm:w-auto' },
            h('span', { className: 'col-span-2 sm:col-span-1 sm:order-none px-3 py-2 text-center text-[8px] font-black uppercase text-slate-400 whitespace-nowrap' }, `Página ${currentPage} de ${totalPages}`),
            h('button', {
              type: 'button',
              disabled: currentPage <= 1,
              onClick: () => onPageChange(Math.max(1, currentPage - 1)),
              className: 'w-full sm:w-auto px-3 py-2 bg-white border border-slate-100 rounded-xl text-[8px] font-black uppercase text-slate-500 inline-flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed'
            }, h(ChevronLeftIcon, { size: 12 }), ' Anterior'),
            h('button', {
              type: 'button',
              disabled: currentPage >= totalPages,
              onClick: () => onPageChange(Math.min(totalPages, currentPage + 1)),
              className: 'w-full sm:w-auto px-3 py-2 bg-white border border-slate-100 rounded-xl text-[8px] font-black uppercase text-slate-500 inline-flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed'
            }, 'Siguiente ', h(ChevronRightIcon, { size: 12 }))
          )
        )
      );
    }

    function RegisteredUserModal(props = {}) {
      if (!props.isOpen) return null;

      const userForm = props.userForm || { n: '', email: '', phone: '', p: '' };
      const setUserForm = typeof props.setUserForm === 'function' ? props.setUserForm : noop;
      const editing = Boolean(props.editingRegisteredUserId);
      const saving = Boolean(props.userRegistrationSaving || props.saving);
      const onSubmit = typeof props.onSubmit === 'function' ? props.onSubmit : noop;
      const onClose = typeof props.onClose === 'function' ? props.onClose : noop;

      return h('div', { className: 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-6' },
        h('div', { className: 'card-glass max-w-sm w-full p-6 sm:p-10 animate-slide max-h-[90vh] overflow-y-auto' },
          h('h2', { className: 'text-sm font-black text-center uppercase mb-8' }, editing ? 'Editar Usuario' : 'Nuevo Usuario'),
          h('form', { onSubmit, noValidate: true, className: 'space-y-4' },
            h('input', {
              required: true,
              className: 'input-field',
              placeholder: 'NOMBRE COMPLETO',
              value: userForm.n || '',
              onChange: (event) => setUserForm({ ...userForm, n: event.target.value })
            }),
            h('input', {
              required: true,
              type: 'email',
              readOnly: editing,
              className: `input-field ${editing ? 'opacity-70 cursor-not-allowed' : ''}`,
              placeholder: 'CORREO ELECTRÓNICO',
              value: userForm.email || '',
              onChange: (event) => setUserForm({ ...userForm, email: event.target.value })
            }),
            editing ? h('p', { className: 'text-[9px] font-bold text-slate-400 uppercase leading-relaxed' }, 'El correo de acceso no se modifica desde esta edición.') : null,
            h('input', {
              required: true,
              type: 'tel',
              className: 'input-field',
              placeholder: 'NÚMERO DE TELÉFONO',
              value: userForm.phone || '',
              onChange: (event) => setUserForm({ ...userForm, phone: event.target.value })
            }),
            !editing ? h('input', {
              required: true,
              type: 'password',
              minLength: 6,
              className: 'input-field',
              placeholder: 'CONTRASEÑA',
              value: userForm.p || '',
              onChange: (event) => setUserForm({ ...userForm, p: event.target.value })
            }) : null,
            h('button', {
              disabled: saving,
              type: 'submit',
              className: 'w-full btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
            }, saving ? 'Guardando...' : (editing ? 'Guardar Cambios' : 'Guardar Usuario')),
            h('button', {
              disabled: saving,
              type: 'button',
              onClick: onClose,
              className: 'w-full text-[9px] font-black text-slate-400 uppercase disabled:opacity-50'
            }, 'Cancelar')
          )
        )
      );
    }

    return { RegisteredUsersPanel, RegisteredUserModal };
  }

  global[MODULE_NAME] = createUsersUI(global.React);
})(window);
          
