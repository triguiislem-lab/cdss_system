import { create } from "zustand";
import { persist } from "zustand/middleware";
import { patients as seedPatients, type Patient } from "@/lib/mock-data";

export type PatientInput = Omit<Patient, "id"> & { id?: string };

interface PatientState {
  patients: Patient[];
  addPatient: (data: PatientInput) => Patient;
  updatePatient: (id: string, patch: Partial<Patient>) => void;
  deletePatient: (id: string) => void;
  getPatient: (id: string) => Patient | undefined;
  resetSeed: () => void;
}

const nextId = (existing: Patient[]) => {
  const nums = existing
    .map((p) => parseInt(p.id.replace(/[^0-9]/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1040;
  return `P-${max + 1}`;
};

export const usePatientStore = create<PatientState>()(
  persist(
    (set, get) => ({
      patients: seedPatients,
      addPatient: (data) => {
        const id = data.id ?? nextId(get().patients);
        const patient: Patient = { ...(data as Patient), id };
        set({ patients: [patient, ...get().patients] });
        return patient;
      },
      updatePatient: (id, patch) =>
        set({
          patients: get().patients.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }),
      deletePatient: (id) =>
        set({ patients: get().patients.filter((p) => p.id !== id) }),
      getPatient: (id) => get().patients.find((p) => p.id === id),
      resetSeed: () => set({ patients: seedPatients }),
    }),
    {
      name: "medcity-connect-patients",
      version: 1,
    },
  ),
);


