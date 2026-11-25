import { describe, it, expect } from 'vitest';
import { getState, login, saveCareItem, loadCareItems, saveMedicine, setPrescriptionAlerts, searchMedicines, recordMedicineSearch, popularMedicineSearches } from '@/lib/store';
describe('uploaded Care rules',()=>{
 it('requires the requested medicine quantity and rejects duplicate reservations',async()=>{
  await login('patient@demo.com','demo123');
  await expect(saveCareItem('reservation',{title:'Medicine',quantity:0,medicineId:'qa-med',memberId:'',status:'Requested'},'qa-store')).rejects.toThrow('quantity');
  const item=await saveCareItem('reservation',{title:'Medicine',quantity:2,medicineId:'qa-med',memberId:'',status:'Requested'},'qa-store');
  expect(item.data.quantity).toBe(2);
  await expect(saveCareItem('reservation',{title:'Medicine',quantity:2,medicineId:'qa-med',memberId:'',status:'Requested'},'qa-store')).rejects.toThrow('already reserved');
 });
 it('keeps saved providers identifiable instead of creating repeated favorites',async()=>{
  await login('patient@demo.com','demo123');const data={title:'Provider',status:'Saved'};const a=await saveCareItem('favorite',data,'qa-provider');const b=await saveCareItem('favorite',data,'qa-provider');expect(b.id).toBe(a.id);expect((await loadCareItems()).filter(x=>x.kind==='favorite'&&x.recipientId==='qa-provider')).toHaveLength(1);
 });
 it('sends a stock notice at the configured threshold without repeating it below the same threshold',()=>{
  const m=saveMedicine({pharmacyId:'qa-store',name:'Stock medicine',strength:'',form:'Tablet',price:100,inStock:true,quantity:6,lowStock:5});const before=getState().notifications.filter(n=>n.userId==='qa-store'&&n.title==='Medicine running low').length;saveMedicine({...m,quantity:5});expect(getState().notifications.filter(n=>n.userId==='qa-store'&&n.title==='Medicine running low')).toHaveLength(before+1);saveMedicine({...m,quantity:4});expect(getState().notifications.filter(n=>n.userId==='qa-store'&&n.title==='Medicine running low')).toHaveLength(before+1);
 });
 it('lets the patient persist personal alert times without changing the prescription',async()=>{
  await login('patient@demo.com','demo123');const c=getState().consultations.find(c=>c.patientId===getState().sessionUserId&&c.prescription.length);if(!c)throw new Error('Prescription fixture missing');const original=JSON.stringify(c.prescription);const a=await setPrescriptionAlerts(c.appointmentId,0,['10:00','22:00']);expect(a.data.alertTimes).toBe('10:00,22:00');expect(JSON.stringify(c.prescription)).toBe(original);await expect(setPrescriptionAlerts(c.appointmentId,0,['25:00'])).rejects.toThrow('Invalid');
 });
 it('shows available medicines before searching and ranks actual recorded search terms',async()=>{
  const medicine={id:'discovery',pharmacyId:'discovery-store',name:'Panadol',strength:'500mg',form:'Tablet',price:100,inStock:true,updatedAt:''};const pharmacy={userId:'discovery-store',storeName:'Discovery store',phone:'03001234567',address:'Road',city:'Lahore'};expect(searchMedicines({medicines:[medicine],pharmacies:[pharmacy]},'').map(x=>x.m.id)).toEqual(['discovery']);await recordMedicineSearch('Panadol');expect(await popularMedicineSearches()).toContain('panadol');
 });
});