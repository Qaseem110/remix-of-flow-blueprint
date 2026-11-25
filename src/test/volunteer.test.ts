import { describe, expect, it } from "vitest";
import { bookVolunteer, consultationAppointment, completeConsultation, ensureConsultation, getState, login, registerPatient, saveVolunteerSession, todayStr } from "@/lib/store";

const asDoctor = async () => { const d = getState().users.find((u) => u.role === "doctor"); if(!d)throw new Error('Doctor missing'); await login(d.email, "demo123"); };
const input = { date: todayStr(), start: "10:00", end: "12:00", mode: "clinic" as const, location: "Free camp, Main road", city: "Lahore", capacity: 2 };

describe("volunteer free checkups", () => {
  it("in-clinic sessions require an address", async () => {
    await asDoctor();
    await expect(saveVolunteerSession({ ...input, location: "" })).rejects.toThrow("clinic address");
  });
  it("patients get tokens in order and cannot exceed the free spots", async () => {
    await asDoctor();
    const v = await saveVolunteerSession(input);
    await login("patient@demo.com", "demo123");
    expect((await bookVolunteer(v.id, "Fever")).token).toBe(1);
    await expect(bookVolunteer(v.id, "Cough", "Ali")).rejects.toThrow("already booked");
    await registerPatient({name:'Second patient',email:`second-${Date.now()}@test.local`,password:'demo123',phone:'03001234567',dob:'1990-01-01',gender:'Male'});
    expect((await bookVolunteer(v.id, "Cough")).token).toBe(2);
    await registerPatient({name:'Third patient',email:`third-${Date.now()}@test.local`,password:'demo123',phone:'03001234567',dob:'1990-01-01',gender:'Male'});
    await expect(bookVolunteer(v.id, "Again")).rejects.toThrow("free spots");
  });
  it('shares a full free consultation record without adding a paid appointment',async()=>{
    await asDoctor();const v=await saveVolunteerSession({...input,capacity:3});await login('patient@demo.com','demo123');const b=await bookVolunteer(v.id,'Fever');const paid=getState().appointments.length;await asDoctor();expect(consultationAppointment(b.id)?.queueNumber).toBe(1);expect(ensureConsultation(b.id).symptoms).toBe('Fever');await completeConsultation(b.id,{diagnosis:'Fever',summary:'Rest',prescription:[{medicine:'Paracetamol',dosage:'500mg',frequency:'Daily',duration:'3 days',instructions:''}]});expect(getState().volunteerBookings.find(x=>x.id===b.id)?.status).toBe('Attended');expect(getState().consultations.find(x=>x.appointmentId===b.id)?.summary).toBe('Rest');expect(getState().appointments.length).toBe(paid);
  });
});
