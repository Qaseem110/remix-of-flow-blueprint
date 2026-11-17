export const clinicKey = (id?: string) => id ?? '';
export function sameClinic(a: { clinicId?: string }, b: { clinicId?: string }) { return clinicKey(a.clinicId) === clinicKey(b.clinicId); }