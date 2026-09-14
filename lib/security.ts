import { NextResponse } from 'next/server';

export function rejectUntrustedMutation(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Nguồn yêu cầu không hợp lệ.' }, { status: 403 });
  }
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return NextResponse.json({ error: 'Yêu cầu khác nguồn đã bị chặn.' }, { status: 403 });
  }
  return null;
}

type Attempt = { count:number; resetAt:number };
const attempts = new Map<string,Attempt>();

export function checkLoginRateLimit(key:string) {
  const now=Date.now(); const current=attempts.get(key);
  if(!current||current.resetAt<=now){attempts.set(key,{count:1,resetAt:now+15*60_000});return {allowed:true,retryAfter:0};}
  if(current.count>=5)return {allowed:false,retryAfter:Math.ceil((current.resetAt-now)/1000)};
  current.count+=1; return {allowed:true,retryAfter:0};
}

export function clearLoginAttempts(key:string){attempts.delete(key);}
