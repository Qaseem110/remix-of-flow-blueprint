import { describe,it,expect } from 'vitest';
import { validateCare,stockAvailable } from '@/lib/care';
import { registerLab,loadCareItems,saveCareItem,saveMedicalSafety,loadMedicalSafety,getState } from '@/lib/store';
describe('care rules',()=>{
 it('requires names on care records',()=>expect(()=>validateCare('complaint',{})).toThrow('title'));
 it('requires dated waitlist entries',()=>expect(()=>validateCare('waitlist',{title:'Visit'})).toThrow('date'));
 it('requires positive reservation quantities',()=>expect(()=>validateCare('reservation',{title:'Medicine',quantity:0})).toThrow('quantity'));
 it('does not offer expired or empty stock',()=>{expect(stockAvailable({inStock:true,quantity:0},'2026-11-17')).toBe(false);expect(stockAvailable({inStock:true,quantity:2,expiry:'2026-11-16'},'2026-11-17')).toBe(false);expect(stockAvailable({inStock:true,quantity:2,expiry:'2026-11-18'},'2026-11-17')).toBe(true)});
 it('saves care requests through store',async()=>{await registerLab({name:'Care Lab',email:`care${Date.now()}@test.local`,phone:'03001234567',password:'testing123',labName:'Care Lab',city:'Lahore',address:'Road'});const i=await saveCareItem('package',{title:'Wellness',price:1500,details:'CBC and LFT',published:true});expect((await loadCareItems()).find(x=>x.id===i.id)?.data.price).toBe(1500)});
 it('isolates member safety details',async()=>{await saveMedicalSafety('family',{allergies:'Penicillin',conditions:'',medicines:'',emergencyName:'Family',emergencyPhone:'123',sharing:true});expect((await loadMedicalSafety(getState().sessionUserId??'','family')).allergies).toBe('Penicillin');expect((await loadMedicalSafety(getState().sessionUserId??'','')).allergies).toBe('')});
});
describe('service prices',()=>{
 it('rejects invalid clinic fees',()=>expect(()=>validateCare('branch',{title:'Clinic',price:-1})).toThrow('price'));
 it('rejects invalid lab package prices',()=>expect(()=>validateCare('package',{title:'Tests',price:NaN})).toThrow('price'));
 it('rejects invalid home collection prices',()=>expect(()=>validateCare('home_collection',{title:'Collection',price:Infinity})).toThrow('price'));
});
