import { useParams } from "wouter";
import NewPrescriptionScreen from "@/features/cdss/screens/NewPrescriptionScreen";

export default function DoctorPrescriptionReviewPage() {
  const params = useParams<{ rxId: string }>();
  return <NewPrescriptionScreen basePath="/doctor" prescriptionId={params.rxId} />;
}
