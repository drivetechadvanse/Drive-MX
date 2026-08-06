const h = globalThis.React?.createElement;
const noop = () => {};
const toArray = (value) => Array.isArray(value) ? value : [];

export function NewShipmentForm(props = {}) {
  if (!h) return null;
  const form = props.form || {};
  const setForm = props.setForm || noop;
  const users = toArray(props.users);
  const showUserSelect = props.showUserSelect === true;
  const submitting = props.submitting === true;

  return h('form', { onSubmit: props.onSubmit || noop, className: 'space-y-4' },
    h('input', {
      required: true,
      className: 'input-field uppercase',
      placeholder: 'NOMBRE COMPLETO',
      autoComplete: 'name',
      maxLength: 160,
      value: form.fullName || '',
      onChange: (event) => setForm({ ...form, fullName: event.target.value })
    }),
    h('input', {
      required: true,
      type: 'tel',
      inputMode: 'tel',
      className: 'input-field',
      placeholder: 'NÚMERO DE TELÉFONO',
      autoComplete: 'tel',
      maxLength: 60,
      value: form.phone || '',
      onChange: (event) => setForm({ ...form, phone: event.target.value })
    }),
    h('input', {
      required: true,
      className: 'input-field uppercase',
      placeholder: 'ORIGEN',
      maxLength: 240,
      value: form.o || '',
      onChange: (event) => setForm({ ...form, o: event.target.value })
    }),
    h('input', {
      required: true,
      className: 'input-field uppercase',
      placeholder: 'DESTINO',
      maxLength: 500,
      value: form.d || '',
      onChange: (event) => setForm({ ...form, d: event.target.value })
    }),
    showUserSelect ? h('select', {
      required: true,
      className: 'input-field',
      value: form.op || '',
      onChange: (event) => setForm({ ...form, op: event.target.value })
    },
      h('option', { value: '' }, 'ASIGNAR USUARIO'),
      users
        .filter((user) => user.role !== 'admin' && user.active !== false)
        .map((user) => h('option', { key: user.id || user.uid, value: user.uid || user.id }, user.name || user.email || 'Usuario'))
    ) : null,
    props.errorMessage ? h('p', { className: 'text-[9px] font-black text-red-500 uppercase tracking-widest text-center' }, props.errorMessage) : null,
    h('button', {
      type: 'submit',
      disabled: submitting,
      className: 'w-full btn-primary h-12 disabled:opacity-50 disabled:cursor-not-allowed'
    }, submitting ? 'Creando guía...' : (props.submitLabel || 'Crear Guía')),
    props.onCancel ? h('button', {
      type: 'button',
      disabled: submitting,
      onClick: props.onCancel,
      className: 'w-full text-[9px] font-black text-slate-400 uppercase hover:text-red-500 disabled:opacity-50'
    }, 'Cancelar') : null
  );
}


