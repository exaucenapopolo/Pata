'use client';
import {cn} from '@/lib/utils';
export function Input({label,error,className,id,...rest}){
 const inputId=id||rest.name;
 return <div className="w-full min-w-0">
  {label&&<label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</label>}
  <input id={inputId} className={cn('h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm shadow-slate-950/[0.02] outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',error&&'border-red-500 focus:border-red-500 focus:ring-red-100',className)} {...rest}/>
  {error&&<p className="mt-1 text-xs text-red-600">{error}</p>}
 </div>;
}
