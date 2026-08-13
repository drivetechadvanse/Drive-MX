import { claimUserShipmentGuide } from '../services/conductoresService.js';

const h = globalThis.React?.createElement;
const useState = globalThis.React?.useState;

export function ConductoresPanel(props = {}) {
  if (!h || !useState) return null;

  const [guideCode, setGuideCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (submitting || props.ensureAccountAllowed?.() === false) return;

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const shipment = await claimUserShipmentGuide({
        fbase: props.fbase,
        appId: props.appId,
        guideCode,
        currentUser: props.currentUser
      });
      setGuideCode('');
      setSuccessMessage(`La guía ${shipment.id} fue agregada a tu Ruta Activa.`);
      props.onClaimed?.(shipment);
    } catch (error) {
      console.error('Ingresar guía de conductor:', error);
      setErrorMessage(error?.message || 'No se pudo ingresar la guía.');
    } finally {
      setSubmitting(false);
    }
  };

  return h('section', { id: 'user-drivers-section', className: 'card-glass overflow-hidden scroll-mt-24' },
    h('div', { className: 'bg-slate-50 border-b border-slate-100 px-6 py-4' },
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Conductores'),
      h('p', { className: 'text-[9px] font-bold text-slate-300 uppercase mt-1' }, 'Ingresa una guía creada en Asignación de Guías')
    ),
    h('form', { onSubmit: handleSubmit, className: 'p-6 space-y-4' },
      h('label', { className: 'block text-[9px] font-black uppercase text-slate-400' }, 'Ingresa tu número de guía'),
      h('div', { className: 'flex flex-col sm:flex-row gap-3' },
        h('input', {
          required: true,
          className: 'input-field uppercase flex-1',
          placeholder: 'INGRESA TU NÚMERO DE GUÍA',
          value: guideCode,
          maxLength: 8,
          onChange: (event) => {
            setGuideCode(event.target.value.toUpperCase());
            setErrorMessage('');
            setSuccessMessage('');
          }
        }),
        h('button', {
          type: 'submit',
          disabled: submitting,
          className: 'btn-primary h-12 sm:min-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed'
        }, submitting ? 'Ingresando...' : 'Ingresar')
      ),
      errorMessage ? h('p', { className: 'text-[10px] font-black text-red-500 uppercase tracking-widest' }, errorMessage) : null,
      successMessage ? h('p', { className: 'text-[10px] font-black text-green-600 uppercase tracking-widest' }, successMessage) : null
    )
  );
}
