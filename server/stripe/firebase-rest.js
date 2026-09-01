'use strict';

const crypto = require('crypto');

const APP_ID = 'saxrecords-appcreat';
const PROJECT_ID = 'saxrecords-appcreat';
const FIREBASE_API_KEY = 'AIzaSyDd3WMEe3KmfHsIEMO8PEa5Cd-LMxhCBuU';
const ADMIN_EMAIL = 'admin@drivemx.com';
const CONFIG_KEY = Buffer.from('645f98d9d046e89a237f4b7f31ef5c42a84c76700c48b4a943b9ecd29d6b1c26', 'hex');

function clean(v){ return String(v ?? '').trim(); }
function lower(v){ return clean(v).replace(/\s+/g,'').toLowerCase(); }
function publicError(message,statusCode=500,code='server-error',details={}){ const e=new Error(message); e.statusCode=statusCode; e.code=code; e.details=details; return e; }
function parseBody(req){ if(!req || req.body==null || req.body==='') return {}; if(typeof req.body==='object' && !Buffer.isBuffer(req.body)) return req.body; try{return JSON.parse(Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body));}catch{throw publicError('La información enviada no es válida.',400,'invalid-json');}}
function setCommonHeaders(res,methods='POST, OPTIONS'){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Methods',methods); res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); res.setHeader('Cache-Control','no-store, max-age=0'); }
function sendError(res,error){ const s=Number(error?.statusCode||500); if(s>=500) console.error('[Stripe][API]',error); return res.status(s).json({success:false,code:clean(error?.code||'server-error'),error:clean(error?.message||'No se pudo completar la operación.'),...(error?.details?{details:error.details}:{})}); }
function getBearerToken(req){ const m=clean(req?.headers?.authorization||req?.headers?.Authorization).match(/^Bearer\s+(.+)$/i); if(!m?.[1]) throw publicError('Inicia sesión nuevamente para continuar.',401,'missing-auth-token'); return m[1].trim(); }
function decodeToken(token){ try{ const p=token.split('.')[1]; const json=Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'); const d=JSON.parse(json); if(!d?.user_id && !d?.sub) throw new Error(); return {uid:d.user_id||d.sub,email:clean(d.email),name:clean(d.name)}; }catch{ throw publicError('La sesión ya no es válida. Inicia sesión nuevamente.',401,'invalid-auth-token'); } }

function encValue(v){
  if(v===null || v===undefined) return {nullValue:null};
  if(typeof v==='string') return {stringValue:v};
  if(typeof v==='boolean') return {booleanValue:v};
  if(typeof v==='number') return Number.isInteger(v) ? {integerValue:String(v)} : {doubleValue:v};
  if(Array.isArray(v)) return {arrayValue:{values:v.map(encValue)}};
  if(typeof v==='object') return {mapValue:{fields:encodeFields(v)}};
  return {stringValue:String(v)};
}
function encodeFields(obj={}){ const fields={}; for(const [k,v] of Object.entries(obj)) if(v!==undefined) fields[k]=encValue(v); return fields; }
function decValue(v={}){
  if('nullValue' in v) return null; if('stringValue' in v) return v.stringValue; if('booleanValue' in v) return v.booleanValue;
  if('integerValue' in v) return Number(v.integerValue); if('doubleValue' in v) return Number(v.doubleValue); if('timestampValue' in v) return Date.parse(v.timestampValue);
  if('arrayValue' in v) return (v.arrayValue?.values||[]).map(decValue); if('mapValue' in v) return decodeFields(v.mapValue?.fields||{}); return null;
}
function decodeFields(fields={}){ const out={}; for(const [k,v] of Object.entries(fields)) out[k]=decValue(v); return out; }
function docName(path){ return `projects/${PROJECT_ID}/databases/(default)/documents/${path}`; }
function docUrl(path){ return `https://firestore.googleapis.com/v1/${docName(path)}`; }
async function fbFetch(url,token,options={}){ const headers={...(options.headers||{}),'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}; const r=await fetch(url,{...options,headers}); const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{};}catch{data={error:{message:text}};} if(!r.ok){ const msg=clean(data?.error?.message||'Firestore rechazó la operación.'); const code=r.status===403?'firestore-permission-denied':'firestore-request-failed'; throw publicError(msg,r.status,code); } return data; }
async function getDoc(path,token,{optional=false}={}){ try{ const d=await fbFetch(docUrl(path),token); return {exists:true,data:decodeFields(d.fields||{}),updateTime:d.updateTime||'',name:d.name||docName(path)}; }catch(e){ if(optional && e.statusCode===404) return {exists:false,data:{},updateTime:'',name:docName(path)}; throw e; } }
async function setDoc(path,data,token,{merge=false}={}){ let next=data; if(merge){ const cur=await getDoc(path,token,{optional:true}); next={...(cur.data||{}),...data}; } const d=await fbFetch(docUrl(path),token,{method:'PATCH',body:JSON.stringify({fields:encodeFields(next)})}); return {exists:true,data:decodeFields(d.fields||{}),updateTime:d.updateTime||''}; }
async function deleteDoc(path,token){ try{ await fbFetch(docUrl(path),token,{method:'DELETE'}); }catch(e){ if(e.statusCode!==404) throw e; } }
async function listDocs(collectionPath,token,{pageSize=10,orderBy='createdAt desc'}={}){ const u=new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}`); u.searchParams.set('pageSize',String(pageSize)); if(orderBy) u.searchParams.set('orderBy',orderBy); const d=await fbFetch(u.toString(),token); return (d.documents||[]).map(x=>({id:x.name.split('/').pop(),data:decodeFields(x.fields||{}),updateTime:x.updateTime||'',name:x.name})); }
async function commitWrites(writes,token){ const body={writes:writes.map(w=>{ if(w.delete) return {delete:docName(w.path)}; const x={update:{name:docName(w.path),fields:encodeFields(w.data)}}; if(w.exists===false) x.currentDocument={exists:false}; else if(w.updateTime) x.currentDocument={updateTime:w.updateTime}; return x; })}; return fbFetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,token,{method:'POST',body:JSON.stringify(body)}); }
async function refreshAdminIdToken(refreshToken){ const r=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})}); const d=await r.json(); if(!r.ok || !d.id_token) throw publicError('La autorización interna del Panel de Control expiró. Guarda nuevamente las claves de Stripe desde el Panel de Control.',401,'stripe-admin-session-refresh-failed'); return d.id_token; }
function encrypt(text){ const iv=crypto.randomBytes(12); const c=crypto.createCipheriv('aes-256-gcm',CONFIG_KEY,iv); const body=Buffer.concat([c.update(String(text),'utf8'),c.final()]); const tag=c.getAuthTag(); return Buffer.concat([iv,tag,body]).toString('base64'); }
function decrypt(payload){ try{ const b=Buffer.from(String(payload),'base64'); const iv=b.subarray(0,12),tag=b.subarray(12,28),body=b.subarray(28); const d=crypto.createDecipheriv('aes-256-gcm',CONFIG_KEY,iv); d.setAuthTag(tag); return Buffer.concat([d.update(body),d.final()]).toString('utf8'); }catch{ throw publicError('No se pudo abrir la configuración segura de Stripe. Guarda nuevamente las claves desde el Panel de Control.',500,'stripe-config-decrypt-failed'); } }

module.exports={APP_ID,PROJECT_ID,FIREBASE_API_KEY,ADMIN_EMAIL,clean,lower,publicError,parseBody,setCommonHeaders,sendError,getBearerToken,decodeToken,getDoc,setDoc,deleteDoc,listDocs,commitWrites,refreshAdminIdToken,encrypt,decrypt};
