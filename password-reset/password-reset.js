import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const PASSWORD_RESET_APP_NAME = "DriveMxPasswordReset";
const APP_NAME = "Drive MX";
const SUPPORT_EMAIL = "drivemexicotechnology@gmail.com";

const ensureStyleLoaded = () => {
    if (document.querySelector('link[data-drive-mx-password-reset]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './password-reset/password-reset.css';
    link.dataset.driveMxPasswordReset = 'true';
    document.head.appendChild(link);
};

const getPasswordResetAuth = () => {
    const config = window.firebaseConfig || {};
    const existing = getApps().find(app => app.name === PASSWORD_RESET_APP_NAME);
    const app = existing || initializeApp(config, PASSWORD_RESET_APP_NAME);
    return getAuth(app);
};

const getFirebaseErrorMessage = (code = '') => {
    const messages = {
        'auth/invalid-email': 'Ingresa un correo electrónico válido.',
        'auth/missing-email': 'Ingresa el correo electrónico registrado.',
        'auth/user-disabled': 'Esta cuenta está deshabilitada. Contacta a soporte.',
        'auth/too-many-requests': 'Se realizaron demasiados intentos. Intenta nuevamente más tarde.',
        'auth/network-request-failed': 'No se pudo conectar. Revisa tu internet e intenta otra vez.'
    };
    return messages[code] || 'No pudimos enviar el correo de recuperación. Verifica el correo e intenta nuevamente.';
};

const createModal = () => {
    const overlay = document.createElement('div');
    overlay.className = 'password-reset-overlay';
    overlay.innerHTML = `
        <div class="password-reset-modal" role="dialog" aria-modal="true" aria-labelledby="password-reset-title">
            <button type="button" class="password-reset-close" aria-label="Cerrar">×</button>
            <div class="password-reset-brand">
                <div class="password-reset-logo" aria-hidden="true">DMX</div>
                <div>
                    <h2 id="password-reset-title">Recuperar contraseña</h2>
                    <p>${APP_NAME}</p>
                </div>
            </div>
            <p class="password-reset-copy">Ingresa el correo registrado. Te enviaremos un enlace seguro de Firebase Authentication para restablecer tu contraseña.</p>
            <form class="password-reset-form">
                <input class="password-reset-input" name="email" type="email" autocomplete="email" required placeholder="CORREO ELECTRÓNICO REGISTRADO">
                <button class="password-reset-submit" type="submit">Enviar enlace de recuperación</button>
            </form>
            <p class="password-reset-status" aria-live="polite"></p>
            <p class="password-reset-note">Después de cambiar la contraseña podrás iniciar sesión normalmente.</p>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.classList.remove('is-visible');
    overlay.querySelector('.password-reset-close').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });

    const form = overlay.querySelector('.password-reset-form');
    const input = overlay.querySelector('.password-reset-input');
    const status = overlay.querySelector('.password-reset-status');
    const button = overlay.querySelector('.password-reset-submit');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = String(input.value || '').trim().toLowerCase();
        status.className = 'password-reset-status';
        status.textContent = '';
        if (!email) {
            status.classList.add('is-error');
            status.textContent = 'Ingresa el correo electrónico registrado.';
            return;
        }

        button.disabled = true;
        button.textContent = 'Enviando...';
        try {
            const auth = getPasswordResetAuth();
            await sendPasswordResetEmail(auth, email, {
                url: window.location.origin + window.location.pathname,
                handleCodeInApp: false
            });
            status.classList.add('is-success');
            status.textContent = 'Listo. Si el correo está registrado, recibirás un enlace seguro para restablecer tu contraseña.';
            input.value = '';
        } catch (error) {
            console.error('Recuperación de contraseña:', error);
            status.classList.add('is-error');
            status.textContent = getFirebaseErrorMessage(error?.code);
        } finally {
            button.disabled = false;
            button.textContent = 'Enviar enlace de recuperación';
        }
    });

    return {
        open(email = '') {
            input.value = email || '';
            status.className = 'password-reset-status';
            status.textContent = '';
            overlay.classList.add('is-visible');
            setTimeout(() => input.focus(), 60);
        }
    };
};

const findLoginForm = () => {
    const passwordInput = Array.from(document.querySelectorAll('input[type="password"]'))
        .find(input => (input.placeholder || '').toUpperCase().includes('CONTRASEÑA'));
    if (!passwordInput) return null;
    const form = passwordInput.closest('form');
    if (!form || form.dataset.passwordResetReady === 'true') return null;
    const emailInput = form.querySelector('input[type="email"]');
    const submitButton = Array.from(form.querySelectorAll('button')).find(btn => (btn.textContent || '').trim().toLowerCase() === 'entrar');
    if (!emailInput || !submitButton) return null;
    return { form, emailInput, submitButton };
};

const attachForgotPasswordLink = (modal) => {
    const target = findLoginForm();
    if (!target) return;
    const { form, emailInput, submitButton } = target;
    form.dataset.passwordResetReady = 'true';

    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'password-reset-link';
    link.textContent = '¿Olvidaste tu contraseña?';
    link.addEventListener('click', () => modal.open(String(emailInput.value || '').trim()));

    submitButton.insertAdjacentElement('afterend', link);
};

export const initPasswordReset = () => {
    ensureStyleLoaded();
    const modal = createModal();

    const run = () => attachForgotPasswordLink(modal);
    run();

    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    window.DriveMxPasswordReset = {
        open: () => modal.open(),
        attach: run
    };
};

initPasswordReset();
