import { normalizeGuideCode } from '../../new-shipment/services/newShipmentService.js';
import { claimGuideForAuthenticatedUser } from '../services/guideNumberEntryService.js';

const h = globalThis.React?.createElement;
const useState = globalThis.React?.useState;

export function EnterGuideNumberCard(props = {}) {
  if (!h || !useState || props.authorized !== true) return null;

  const [guideCode, setGuideCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || props.ensureAccountAllowed?.() === false) return;

    const code = normalizeGuideCode(guideCode);
    if (!code) {
      setSuccessMessage('');
      setErrorMessage('Ingresa el número de guía.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const shipment = await claimGuideForAuthenticatedUser({
        fbase: props.fbase,
        appId: props.appId,
        guideCode: code,
        currentUser: props.currentUser
      });
      setGuideCode('');
      setSuccessMessage(`La guía ${shipment.id} fue enviada a tu Ruta Activa.`);
      props.onAssigned?.(shipment);
    } catch (error) {
      console.error('Ingresar número de guía:', error);
      setErrorMessage(error?.message || 'No se pudo asignar la guía.');
    } finally {
      setSubmitting(false);
    }
  };

  return h('section', { className: 'card-glass p-6 space-y-5' },
    h('div', null,
      h('h2', { className: 'text-[10px] font-black uppercase tracking-widest text-slate-400' }, 'Ingresar Número de Guía'),
      h('p', { className: 'text-[8px] font-bold text-slate-300 uppercase mt-1' }, 'La guía se asignará automáticamente a tu Ruta Activa')
    ),
    h('form', { onSubmit: handleSubmit, className: 'flex flex-col sm:flex-row gap-3' },
      h('input', {
        required: true,
        className: 'input-field uppercase flex-1',
        placeholder: 'NÚMERO DE GUÍA',
        maxLength: 20,
        value: guideCode,
        onChange: (event) => {
          setGuideCode(event.target.value.toUpperCase());
          setErrorMessage('');
          setSuccessMessage('');
        }
      }),
      h('button', {
        type: 'submit',
        disabled: submitting,
        className: 'btn-primary h-12 sm:min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed'
      }, submitting ? 'Enviando...' : 'Enviar')
    ),
    errorMessage ? h('p', { className: 'text-[9px] font-black text-red-500 uppercase tracking-widest text-center' }, errorMessage) : null,
    successMessage ? h('p', { className: 'text-[9px] font-black text-green-600 uppercase tracking-widest text-center' }, successMessage) : null
  );
}
