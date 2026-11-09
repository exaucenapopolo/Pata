const INVALID_FCM_CODES = new Set(['messaging/registration-token-not-registered','messaging/invalid-registration-token']);
export function isInvalidFcmRegistration(error){return INVALID_FCM_CODES.has(String(error?.code||''));}
export function isExpiredWebPushSubscription(error){return [404,410].includes(Number(error?.statusCode||error?.status));}
export async function dispatchPushNotification({tokens=[],subscriptions=[],sendFcm,sendWebPush}){
 if(typeof sendFcm!=='function'||typeof sendWebPush!=='function')throw new TypeError('Les fonctions d’envoi FCM et Web Push sont obligatoires.');
 const uniqueTokens=[...new Set(tokens.filter(t=>typeof t==='string'&&t.length>20))];
 const [fcmResults,webPushResults]=await Promise.all([Promise.allSettled(uniqueTokens.map(t=>sendFcm(t))),Promise.allSettled(subscriptions.map(s=>sendWebPush(s)))]);
 const invalidTokens=[],expiredSubscriptions=[],errors=[];let fcmSent=0,webPushSent=0,fcmFailed=0,webPushFailed=0;
 fcmResults.forEach((x,i)=>{if(x.status==='fulfilled'){fcmSent++;return;}fcmFailed++;if(isInvalidFcmRegistration(x.reason))invalidTokens.push(uniqueTokens[i]);errors.push({channel:'fcm',code:String(x.reason?.code||'messaging/unknown-error')});});
 webPushResults.forEach((x,i)=>{if(x.status==='fulfilled'){webPushSent++;return;}webPushFailed++;if(isExpiredWebPushSubscription(x.reason))expiredSubscriptions.push(subscriptions[i]);errors.push({channel:'webpush',code:String(x.reason?.statusCode||x.reason?.code||'webpush/unknown-error')});});
 return {fcmSent,webPushSent,fcmFailed,webPushFailed,attempted:uniqueTokens.length+subscriptions.length,failed:fcmFailed+webPushFailed,invalidTokens,expiredSubscriptions,errors};
}
