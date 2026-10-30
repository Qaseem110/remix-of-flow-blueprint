import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

// [brand, formula (generic), strength/form]
const MEDS: [string, string, string][] = [
  ["Panadol", "Paracetamol", "500mg tab"], ["Calpol", "Paracetamol", "120mg/5ml syp"], ["Disprin", "Aspirin", "300mg tab"],
  ["Brufen", "Ibuprofen", "400mg tab"], ["Ponstan", "Mefenamic Acid", "250mg cap"], ["Voltral", "Diclofenac Sodium", "50mg tab"],
  ["Arinac", "Ibuprofen + Pseudoephedrine", "tab"], ["Augmentin", "Amoxicillin + Clavulanic Acid", "625mg tab"],
  ["Amoxil", "Amoxicillin", "500mg cap"], ["Velosef", "Cephradine", "500mg cap"], ["Cefspan", "Cefixime", "400mg cap"],
  ["Zithromax", "Azithromycin", "500mg tab"], ["Azomax", "Azithromycin", "250mg cap"], ["Klaricid", "Clarithromycin", "500mg tab"],
  ["Ciproxin", "Ciprofloxacin", "500mg tab"], ["Leflox", "Levofloxacin", "500mg tab"], ["Flagyl", "Metronidazole", "400mg tab"],
  ["Doxycin", "Doxycycline", "100mg cap"], ["Septran", "Co-trimoxazole", "tab"], ["Risek", "Omeprazole", "20mg cap"],
  ["Nexum", "Esomeprazole", "40mg tab"], ["Zantac", "Ranitidine", "150mg tab"], ["Motilium", "Domperidone", "10mg tab"],
  ["Gravinate", "Dimenhydrinate", "50mg tab"], ["Imodium", "Loperamide", "2mg cap"], ["ORS", "Oral Rehydration Salts", "sachet"],
  ["Buscopan", "Hyoscine Butylbromide", "10mg tab"], ["Mucaine", "Oxetacaine + Antacid", "syp"], ["Softin", "Loratadine", "10mg tab"],
  ["Zyrtec", "Cetirizine", "10mg tab"], ["Telfast", "Fexofenadine", "120mg tab"], ["Avil", "Pheniramine", "25mg tab"],
  ["Ventolin", "Salbutamol", "inhaler"], ["Seretide", "Salmeterol + Fluticasone", "inhaler"], ["Montiget", "Montelukast", "10mg tab"],
  ["Hydryllin", "Aminophylline + Diphenhydramine", "syp"], ["Glucophage", "Metformin", "500mg tab"], ["Amaryl", "Glimepiride", "2mg tab"],
  ["Januvia", "Sitagliptin", "100mg tab"], ["Galvus Met", "Vildagliptin + Metformin", "50/500mg tab"], ["Lantus", "Insulin Glargine", "inj"],
  ["Norvasc", "Amlodipine", "5mg tab"], ["Concor", "Bisoprolol", "5mg tab"], ["Tenormin", "Atenolol", "50mg tab"],
  ["Cozaar", "Losartan", "50mg tab"], ["Diovan", "Valsartan", "80mg tab"], ["Zestril", "Lisinopril", "10mg tab"],
  ["Lasix", "Furosemide", "40mg tab"], ["Lipitor", "Atorvastatin", "20mg tab"], ["Rosuvas", "Rosuvastatin", "10mg tab"],
  ["Loprin", "Aspirin", "75mg tab"], ["Plavix", "Clopidogrel", "75mg tab"], ["Thyroxin", "Levothyroxine", "50mcg tab"],
  ["Deltacortril", "Prednisolone", "5mg tab"], ["Decadron", "Dexamethasone", "0.5mg tab"], ["Xanax", "Alprazolam", "0.5mg tab"],
  ["Lexotanil", "Bromazepam", "3mg tab"], ["Cipralex", "Escitalopram", "10mg tab"], ["Lyrica", "Pregabalin", "75mg cap"],
  ["Tegral", "Carbamazepine", "200mg tab"], ["Neurobion", "Vitamin B1 + B6 + B12", "tab"], ["Surbex-Z", "Multivitamin + Zinc", "tab"],
  ["Caltrate", "Calcium + Vitamin D3", "tab"], ["Sunny D", "Cholecalciferol (Vitamin D3)", "200,000 IU cap"], ["Ferosoft", "Ferrous Sulfate", "cap"],
  ["Folic Acid", "Folic Acid", "5mg tab"], ["Fluconazole", "Fluconazole", "150mg cap"], ["Daktarin", "Miconazole", "cream"],
  ["Polyfax", "Polymyxin B + Bacitracin", "ointment"], ["Fucidin", "Fusidic Acid", "cream"], ["Betnovate", "Betamethasone", "cream"],
  ["Tramal", "Tramadol", "50mg cap"], ["Famila", "Famotidine", "20mg tab"], ["Gaviscon", "Sodium Alginate + Antacid", "syp"],
];

export function MedicineInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];
    return MEDS.filter(([b, f]) => b.toLowerCase().includes(q) || f.toLowerCase().includes(q)).slice(0, 8);
  }, [value]);
  return (
    <div className="relative">
      <Input disabled={disabled} placeholder="Medicine / formula" value={value} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-72 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {matches.map(([b, f, s]) => (
            <li key={b + s}>
              <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => { e.preventDefault(); onChange(`${b} (${f}) ${s}`); setOpen(false); }}>
                <span className="font-medium">{b}</span> <span className="text-muted-foreground">— {f}</span>
                <div className="text-xs text-muted-foreground">{s}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
