'use strict';

const crypto = require('crypto');
const Stripe = require('stripe');
const {
  APP_ID, clean, lower, publicError,
  getDoc, setDoc, deleteDoc, listDocs, commitWrites,
  refreshAdminIdToken, encrypt, decrypt, decodeToken
} = require('./firebase-rest');

const CURRENCY='mxn';
const DISPLAY_CURRENCY='MXN';
const MIN_FIRST_RECHARGE=100;
const MIN_RECHARGE_AFTER_THREE_PRODUCTS=500;
const PRODUCT_RECHARGE_THRESHOLD=3;
const MAX_RECHARGE=1000000;
const PURPOSE='drive_mx_wallet_recharge';
const CONFIG_PATH=`artifacts/${APP_ID}/public/data/stripe_wallet_config/config`;
const ATTEMPTS=`artifacts/${APP_ID}/public/data/stripe_wallet_attempts`;
const PENDING=`artifacts/${APP_ID}/public/data/stripe_wallet_pending`;
const ROOT=`artifacts/${APP_ID}/public/data`;

function roundMoney(v){ return Math.round((Number(v||0)+Number.EPSILON)*100)/100; }
function safeDocId(v=''){ return clean(v).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,500); }
function hashId(v=''){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function normalizeKey(v){ return clean(v).replace(/\s+/g,''); }
function getKeyMode(v=''){ const k=normalizeKey(v); if(k.startsWith('pk_live_')||k.startsWith('sk_live_')) return 'live'; if(k.startsWith('pk_test_')||k.startsWith('sk_test_')) return 'test'; return ''; }
function validatePublishableKey(v){ const k=normalizeKey(v); if(!/^pk_(test|live)_[A-Za-z0-9_]{12,}$/.test(k)) throw publicError('La clave publicable de Stripe no es válida.',400,'invalid-stripe-publishable-key'); return k; }
function validateSecretKey(v){ const k=normalizeKey(v); if(!/^sk_(test|live)_[A-Za-z0-9_]{12,}$/.test(k)) throw publicError('La clave secreta de Stripe no es válida.',400,'invalid-stripe-secret-key'); return k; }
function maskKey(v=''){ const k=normalizeKey(v); if(!k) return ''; return `${k.slice(0,12)}••••••••${k.slice(-4)}`; }
function publicConfig(c={}){ return {configured:c.configured===true,mode:c.mode||'',updatedAt:Number(c.updatedAt||0),updatedBy:clean(c.updatedBy||''),publishableKeyMasked:c.publishableKeyMasked||'',secretKeyMasked:c.secretKeyMasked||''}; }

async function loadStripeConfig(userToken,{requireComplete=true}={}){
  const snap=await getDoc(CONFIG_PATH,userToken,{optional:true});
  const s=snap.exists?snap.data:{};
  const configured=Boolean(s.publishableKey && s.secretKeyEncrypted && s.adminRefreshTokenEncrypted && s.mode);
  if(requireComplete&&!configured) throw publicError('Stripe todavía no está configurado en el Panel de Control.',503,'stripe-not-configured');
  return {
    configured,
    mode:clean(s.mode),
    publishableKey:clean(s.publishableKey),
    secretKey:configured?decrypt(s.secretKeyEncrypted):'',
    adminRefreshToken:configured?decrypt(s.adminRefreshTokenEncrypted):'',
    updatedAt:Number(s.updatedAt||0),updatedBy:clean(s.updatedBy||''),
    publishableKeyMasked:clean(s.publishableKeyMasked||''),secretKeyMasked:clean(s.secretKeyMasked||'')
  };
}

async function saveStripeConfig(userToken,{publishableKey,secretKey,adminRefreshToken,actor=''}){
  const existing=await loadStripeConfig(userToken,{requireComplete:false});
  const pk=clean(publishableKey)?validatePublishableKey(publishableKey):existing.publishableKey;
  const sk=clean(secretKey)?validateSecretKey(secretKey):existing.secretKey;
  const rt=clean(adminRefreshToken)||existing.adminRefreshToken;
  if(!pk||!sk||!rt) throw publicError('Ingresa la clave publicable y la clave secreta de Stripe.',400,'stripe-keys-required');
  const pm=getKeyMode(pk), sm=getKeyMode(sk);
  if(!pm||pm!==sm) throw publicError('La clave publicable y la clave secreta deben pertenecer al mismo modo de Stripe: prueba o producción.',400,'stripe-key-mode-mismatch');
  try{ await new Stripe(sk).balance.retrieve(); }catch(error){ console.error('[Stripe][Config]',error); throw publicError('Stripe rechazó la clave secreta. Verifica que esté completa y activa.',400,'stripe-secret-key-rejected'); }
  // Confirma que el refresh token guardado sigue perteneciendo al administrador.
  const adminToken=await refreshAdminIdToken(rt);
  const decoded=decodeToken(adminToken);
  const adminProfile=await getDoc(`${ROOT}/operators/${safeDocId(decoded.uid)}`,adminToken,{optional:true});
  if(lower(decoded.email)!=='admin@drivemx.com' && adminProfile.data?.role!=='admin') throw publicError('Solo el administrador puede configurar Stripe.',403,'admin-required');
  const now=Date.now();
  await setDoc(CONFIG_PATH,{
    publishableKey:pk,
    secretKeyEncrypted:encrypt(sk),
    adminRefreshTokenEncrypted:encrypt(rt),
    mode:sm,
    configured:true,
    publishableKeyMasked:maskKey(pk),secretKeyMasked:maskKey(sk),
    updatedAt:now,updatedBy:clean(actor).slice(0,254)
  },userToken,{merge:false});
  return publicConfig({configured:true,mode:sm,updatedAt:now,updatedBy:actor,publishableKeyMasked:maskKey(pk),secretKeyMasked:maskKey(sk)});
}

function createStripeClient(c){ if(!c?.secretKey) throw publicError('Stripe todavía no está configurado.',503,'stripe-not-configured'); return new Stripe(c.secretKey); }
function isWalletActivated(w={}){ return Boolean(w.activated===true||w.firstRechargeCompleted===true||Number(w.rechargeCount||0)>0||Number(w.totalRecharged||0)>=MIN_FIRST_RECHARGE); }
function getMinimumRecharge(s={},productCount=0){ const x=Number(s.minimumFirstRecharge||s.minimumRecharge||MIN_FIRST_RECHARGE); const base=Number.isFinite(x)&&x>0?roundMoney(x):MIN_FIRST_RECHARGE; return Number(productCount||0)>=PRODUCT_RECHARGE_THRESHOLD?Math.max(base,MIN_RECHARGE_AFTER_THREE_PRODUCTS):base; }
function validateAmount(raw,w={},s={},productCount=0){ const amount=roundMoney(raw); if(!Number.isFinite(amount)||amount<=0||amount>MAX_RECHARGE) throw publicError(`La recarga debe ser mayor a $0.00 y no puede superar $${MAX_RECHARGE.toLocaleString('es-MX')} MXN.`,400,'invalid-recharge-amount'); const amountCents=Math.round(amount*100); const minimum=getMinimumRecharge(s,productCount); if(!isWalletActivated(w)&&amount<minimum) throw publicError(`La primera recarga debe ser de al menos $${minimum.toFixed(2)} MXN.`,400,'minimum-recharge-required',{minimum}); return {amount,amountCents,minimum}; }
function buildInitialWallet(uid,p={},t=Date.now()){ return {id:uid,uid,userId:uid,userName:p.name||p.email||'Usuario',userEmail:p.email||'',userPhone:p.phone||'',currency:'MXN',balance:0,activated:false,firstRechargeCompleted:false,firstRechargeAt:null,rechargeCount:0,totalRecharged:0,totalCommissions:0,totalPurchases:0,totalCashback:0,createdAt:t,updatedAt:t,createdBy:p.email||'stripe',updatedBy:p.email||'stripe',status:'Pendiente de activación'}; }
function normalizeProfile(s,decoded={}){ const p=s.exists?s.data:{}; return {...p,id:decoded.uid,uid:decoded.uid,email:lower(decoded.email||p.email||p.emailNormalized||''),name:clean(p.name||decoded.name||decoded.email||'Usuario'),phone:clean(p.phone||'')}; }
function assertActiveUserProfile(p={}){ if(!p.uid||!p.email) throw publicError('No se encontró el perfil del usuario.',403,'user-profile-not-found'); if(p.role==='admin') throw publicError('La recarga con Stripe es para carteras de usuarios.',403,'user-wallet-required'); const st=lower(p.accountStatus||''); if(p.active===false||p.blocked===true||st.includes('bloqueado')||st.includes('inactivo')) throw publicError('La cuenta del usuario está bloqueada o inactiva.',403,'user-account-blocked'); }

async function getCheckoutContext(adminToken,decoded){
  const uid=safeDocId(decoded.uid); if(!uid||uid!==decoded.uid) throw publicError('El identificador del usuario no es válido.',400,'invalid-user-id');
  const [ps,ws,ss,products]=await Promise.all([
    getDoc(`${ROOT}/operators/${uid}`,adminToken,{optional:true}),
    getDoc(`${ROOT}/wallets/${uid}`,adminToken,{optional:true}),
    getDoc(`${ROOT}/wallet_settings/config`,adminToken,{optional:true}),
    listDocs(`${ROOT}/user_products/${uid}/items`,adminToken,{pageSize:500,orderBy:''})
  ]);
  const profile=normalizeProfile(ps,decoded); assertActiveUserProfile(profile);
  const wallet=ws.exists?{id:uid,...ws.data}:buildInitialWallet(uid,profile);
  const settings=ss.exists?ss.data:{}; const activeProductCount=products.filter(x=>x.data.active!==false).length;
  if(!ws.exists) await setDoc(`${ROOT}/wallets/${uid}`,wallet,adminToken);
  return {userId:uid,profile,wallet,settings,activeProductCount};
}
function normalizeRequestId(v,uid){ const x=clean(v).slice(0,180); if(x&&/^[A-Za-z0-9_-]{12,180}$/.test(x)) return x; return `SWR-${safeDocId(uid)}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`; }
async function retrieveSession(stripe,id){ try{return await stripe.checkout.sessions.retrieve(id);}catch(e){console.error('[Stripe][Checkout retrieve]',e);throw publicError('No se pudo consultar el estado del pago en Stripe.',502,'stripe-session-retrieve-failed');} }

async function createWalletCheckout({userToken,decoded,rawAmount,requestId}){
  const config=await loadStripeConfig(userToken); const adminToken=await refreshAdminIdToken(config.adminRefreshToken); const stripe=createStripeClient(config);
  const ctx=await getCheckoutContext(adminToken,decoded); const val=validateAmount(rawAmount,ctx.wallet,ctx.settings,ctx.activeProductCount);
  const rid=normalizeRequestId(requestId,ctx.userId); const hash=hashId(`${ctx.userId}:${rid}`); const attemptPath=`${ATTEMPTS}/${hash}`; const old=await getDoc(attemptPath,adminToken,{optional:true});
  if(old.exists){ const e=old.data; if(e.userId!==ctx.userId||Number(e.amountCents||0)!==val.amountCents) throw publicError('La referencia de esta recarga ya fue utilizada con otro monto.',409,'stripe-attempt-conflict'); if(e.checkoutSessionId){ const s=await retrieveSession(stripe,e.checkoutSessionId); if(s.payment_status==='paid'){ const r=await finalizePaidCheckout({adminToken,session:s,source:'embedded-checkout'}); return {...r,checkoutSessionId:s.id,rechargeId:e.rechargeId,amount:val.amount,currency:'MXN',reused:true}; } if(s.status==='open'&&s.client_secret) return {credited:false,publishableKey:config.publishableKey,clientSecret:s.client_secret,checkoutSessionId:s.id,rechargeId:e.rechargeId,amount:val.amount,currency:'MXN',reused:true}; }}
  const rechargeId=`SWR_${hash.slice(0,40)}`; const metadata={purpose:PURPOSE,appId:APP_ID,userId:ctx.userId,walletId:ctx.userId,rechargeId,amountCents:String(val.amountCents),requestId:rid.slice(0,180)};
  let session; try{ session=await stripe.checkout.sessions.create({ui_mode:'embedded_page',mode:'payment',redirect_on_completion:'never',payment_method_types:['card'],customer_email:ctx.profile.email,client_reference_id:ctx.userId,locale:'es',line_items:[{quantity:1,price_data:{currency:CURRENCY,unit_amount:val.amountCents,product_data:{name:'Recarga de cartera Drive MX',description:`Saldo para la cartera de ${ctx.profile.name||ctx.profile.email}`.slice(0,250)}}}],metadata,payment_intent_data:{metadata}},{idempotencyKey:`drive-mx-wallet-${hash}`}); }catch(e){console.error('[Stripe][Checkout create]',e);throw publicError(e?.raw?.message||e?.message||'Stripe no pudo iniciar el pago con tarjeta.',502,'stripe-checkout-create-failed');}
  if(!session?.id||!session?.client_secret) throw publicError('Stripe no devolvió una sesión de pago válida.',502,'stripe-checkout-invalid-response');
  const now=Date.now(); const attempt={id:hash,requestId:rid,rechargeId,purpose:PURPOSE,userId:ctx.userId,walletId:ctx.userId,userName:ctx.profile.name,userEmail:ctx.profile.email,userPhone:ctx.profile.phone,amount:val.amount,amountCents:val.amountCents,currency:'MXN',checkoutSessionId:session.id,paymentIntentId:clean(session.payment_intent||''),status:'Pendiente',livemode:session.livemode===true,createdAt:now,updatedAt:now};
  await Promise.all([setDoc(attemptPath,attempt,adminToken),setDoc(`${PENDING}/${ctx.userId}/items/${hash}`,{...attempt,attemptHash:hash},adminToken)]);
  return {credited:false,publishableKey:config.publishableKey,clientSecret:session.client_secret,checkoutSessionId:session.id,rechargeId,amount:val.amount,currency:'MXN',reused:false};
}
function sessionPaymentIntentId(s={}){ return typeof s.payment_intent==='string'?s.payment_intent:clean(s.payment_intent?.id||''); }
function validateStripeSession(s={}){ const m=s.metadata||{}; if(m.purpose!==PURPOSE||m.appId!==APP_ID) throw publicError('La sesión de Stripe no pertenece a una recarga de Drive MX.',400,'invalid-stripe-session-purpose'); const uid=safeDocId(m.userId||m.walletId||s.client_reference_id||''),rechargeId=safeDocId(m.rechargeId||''),amountCents=Number(s.amount_total||0),meta=Number(m.amountCents||0); if(!uid||!rechargeId||!Number.isInteger(amountCents)||amountCents<=0||amountCents!==meta) throw publicError('La información de la recarga de Stripe no es válida.',400,'invalid-stripe-session-data'); if(lower(s.currency)!==CURRENCY) throw publicError('La moneda de la recarga de Stripe no es válida.',400,'invalid-stripe-session-currency'); return {metadata:m,userId:uid,rechargeId,amountCents,amount:roundMoney(amountCents/100)}; }

async function finalizePaidCheckout({adminToken,session,source='embedded-checkout'}){
  const v=validateStripeSession(session); if(session.payment_status!=='paid') return {credited:false,status:session.payment_status||session.status||'processing',sessionStatus:session.status||'',userId:v.userId,rechargeId:v.rechargeId,amount:v.amount};
  const walletPath=`${ROOT}/wallets/${v.userId}`, profilePath=`${ROOT}/operators/${v.userId}`, movementId=safeDocId(`mov_recharge_stripe_${session.id}`), movementPath=`${walletPath}/movements/${movementId}`, rechargePath=`${ROOT}/wallet_recharges/${v.rechargeId}`;
  const hash=hashId(`${v.userId}:${v.metadata.requestId||''}`), attemptPath=`${ATTEMPTS}/${hash}`, pendingPath=`${PENDING}/${v.userId}/items/${hash}`;
  for(let tryNo=0;tryNo<3;tryNo++){
    const [ps,ws,ms,rs,as]=await Promise.all([getDoc(profilePath,adminToken,{optional:true}),getDoc(walletPath,adminToken,{optional:true}),getDoc(movementPath,adminToken,{optional:true}),getDoc(rechargePath,adminToken,{optional:true}),getDoc(attemptPath,adminToken,{optional:true})]);
    const profile=normalizeProfile(ps,{uid:v.userId}); const existingRecharge=rs.data||{}, existingAttempt=as.data||{};
    if(ms.exists){ await deleteDoc(pendingPath,adminToken); return {credited:true,idempotent:true,status:'paid',userId:v.userId,rechargeId:v.rechargeId,amount:v.amount,balanceAfter:roundMoney(ms.data.balanceAfter||0)}; }
    const now=Date.now(), current=ws.exists?{id:v.userId,...ws.data}:buildInitialWallet(v.userId,profile,now), before=roundMoney(current.balance||0), after=roundMoney(before+v.amount), actor='stripe';
    const nextWallet={...current,id:v.userId,uid:v.userId,userId:v.userId,userName:current.userName||profile.name||profile.email||'Usuario',userEmail:current.userEmail||profile.email||'',userPhone:current.userPhone||profile.phone||'',currency:'MXN',balance:after,activated:true,firstRechargeCompleted:true,firstRechargeAt:current.firstRechargeAt||now,rechargeCount:Number(current.rechargeCount||0)+1,totalRecharged:roundMoney(Number(current.totalRecharged||0)+v.amount),lastRechargeAt:now,lastStripeRechargeId:v.rechargeId,lastStripeCheckoutSessionId:session.id,lastStripePaymentIntentId:sessionPaymentIntentId(session),updatedAt:now,updatedBy:actor,status:after>0?'Activa':'Sin saldo'};
    const movement={id:movementId,movementId,walletId:v.userId,userId:v.userId,userName:nextWallet.userName,userEmail:nextWallet.userEmail,type:'recharge',direction:'credit',concept:'Recarga de saldo con tarjeta Stripe',amount:v.amount,balanceBefore:before,balanceAfter:after,currency:'MXN',referenceId:session.id,paymentMethod:'Tarjeta Stripe',paymentProvider:'stripe',stripeCheckoutSessionId:session.id,stripePaymentIntentId:sessionPaymentIntentId(session),createdAt:now,createdBy:actor};
    const recharge={...existingRecharge,...movement,id:v.rechargeId,rechargeId:v.rechargeId,status:'Completada',paymentStatus:session.payment_status,livemode:session.livemode===true,approvedAt:now,approvedBy:actor,updatedAt:now,confirmationSource:source};
    const attempt={...existingAttempt,userId:v.userId,walletId:v.userId,rechargeId:v.rechargeId,checkoutSessionId:session.id,paymentIntentId:sessionPaymentIntentId(session),amount:v.amount,amountCents:v.amountCents,currency:'MXN',status:'Completada',creditedAt:now,updatedAt:now,confirmationSource:source};
    const writes=[{path:walletPath,data:nextWallet,...(ws.exists?{updateTime:ws.updateTime}:{exists:false})},{path:movementPath,data:movement,exists:false},{path:rechargePath,data:recharge,...(rs.exists?{updateTime:rs.updateTime}:{exists:false})},{path:attemptPath,data:attempt,...(as.exists?{updateTime:as.updateTime}:{exists:false})},{path:pendingPath,delete:true}];
    try{ await commitWrites(writes,adminToken); return {credited:true,idempotent:false,status:'paid',userId:v.userId,rechargeId:v.rechargeId,amount:v.amount,balanceBefore:before,balanceAfter:after}; }catch(e){ if((e.statusCode===409||e.statusCode===400)&&tryNo<2) continue; throw e; }
  }
  throw publicError('No se pudo acreditar la recarga después de confirmar el pago.',409,'stripe-credit-conflict');
}
async function markCheckoutStatus({adminToken,session,status,source='embedded-checkout'}){ const v=validateStripeSession(session),hash=hashId(`${v.userId}:${v.metadata.requestId||''}`),attemptPath=`${ATTEMPTS}/${hash}`,pendingPath=`${PENDING}/${v.userId}/items/${hash}`,now=Date.now(); await setDoc(attemptPath,{status,paymentStatus:session.payment_status||'',checkoutSessionId:session.id,paymentIntentId:sessionPaymentIntentId(session),updatedAt:now,confirmationSource:source},adminToken,{merge:true}); if(String(status).toLowerCase()==='expirada') await deleteDoc(pendingPath,adminToken); return {credited:false,status,sessionStatus:session.status||'',userId:v.userId,rechargeId:v.rechargeId,amount:v.amount}; }
async function recoverPaidCheckouts({userToken,decoded,maxAttempts=5}){ const config=await loadStripeConfig(userToken),adminToken=await refreshAdminIdToken(config.adminRefreshToken),stripe=createStripeClient(config),uid=safeDocId(decoded.uid); const docs=await listDocs(`${PENDING}/${uid}/items`,adminToken,{pageSize:Math.max(1,Math.min(10,Number(maxAttempts||5))),orderBy:'createdAt desc'}); let checkedCount=0,recoveredCount=0,recoveredAmount=0,balanceAfter=null; for(const d of docs){ const sid=clean(d.data.checkoutSessionId||''); if(!sid) continue; checkedCount++; try{ const s=await retrieveSession(stripe,sid),v=validateStripeSession(s); if(v.userId!==uid) continue; if(s.payment_status==='paid'){ const r=await finalizePaidCheckout({adminToken,session:s,source:'automatic-recovery'}); if(r.credited&&!r.idempotent){recoveredCount++;recoveredAmount=roundMoney(recoveredAmount+Number(r.amount||0));balanceAfter=r.balanceAfter??balanceAfter;} }else if(s.status==='expired') await markCheckoutStatus({adminToken,session:s,status:'Expirada',source:'automatic-recovery'}); }catch(e){console.error('[Stripe][Recovery]',e);} } return {credited:recoveredCount>0,checkedCount,recoveredCount,recoveredAmount,balanceAfter}; }

module.exports={CURRENCY,DISPLAY_CURRENCY,PURPOSE,MAX_RECHARGE,roundMoney,publicConfig,loadStripeConfig,saveStripeConfig,createStripeClient,createWalletCheckout,retrieveSession,validateStripeSession,finalizePaidCheckout,markCheckoutStatus,recoverPaidCheckouts};


