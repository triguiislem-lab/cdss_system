import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/atoms/toaster";
import { TooltipProvider } from "@/components/atoms/tooltip";
import NotFound from "@/pages/not-found";

import { Navbar } from "@/components/organisms/Navbar";
import { Footer } from "@/components/organisms/Footer";
import { AdminLayout } from "@/components/templates/AdminLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { CmsProvider } from "@/contexts/CmsContext";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ProtectedRoute } from "@/routing/ProtectedRoute";

import Home from "@/pages/home";
import SearchResults from "@/pages/search";
import ArticleDetail from "@/pages/article";
import Blog from "@/pages/blog";
import Contact from "@/pages/contact";
import Doctors from "@/pages/doctors";
import Login from "@/pages/login";

import AdminDoctors from "@/pages/admin/doctors";
import AdminDashboard from "@/pages/admin/index";
import AdminCMS from "@/pages/admin/cms";
import AdminCdssDashboard from "@/pages/admin/cdss/index";
import CdssPatients from "@/pages/admin/cdss/patients";
import AdminInteractionChecker from "@/pages/admin/cdss/interactions";
import AdminNewPrescription from "@/pages/admin/cdss/prescription.new";
import AdminReviewPrescriptions from "@/pages/admin/cdss/prescription.review";
import AdminAuditPage from "@/pages/admin/cdss/audit";
import AdminCdssSettings from "@/pages/admin/cdss/settings";
import AdminConsultations from "@/pages/admin/cdss/consultations.index";
import AdminConsultationDetail from "@/pages/admin/cdss/consultations.$consultationId";
import AdminPharmacy from "@/pages/admin/cdss/pharmacy";
import AdminMedicines from "@/pages/admin/cdss/medicines";
import AdminMedicineContributions from "@/pages/admin/cdss/medicine-contributions";
import AdminOrdonnance from "@/pages/admin/cdss/prescription.ordonnance";

import DoctorDashboard from "@/pages/doctor/index";
import DoctorPatients from "@/pages/doctor/patients";
import PatientDetail from "@/pages/doctor/patients.$patientId";
import ConsultationDetail from "@/pages/doctor/consultations.$consultationId";
import Consultations from "@/pages/doctor/consultations.index";
import DoctorPrescriptions from "@/pages/doctor/prescriptions";
import DoctorAgenda from "@/pages/doctor/agenda";
import NewPrescription from "@/pages/doctor/prescription.new";
import ReviewPrescriptions from "@/pages/doctor/prescription.review";
import Ordonnance from "@/pages/doctor/prescription.$rxId.ordonnance";
import Medicines from "@/pages/doctor/medicines";
import MedicineContributions from "@/pages/doctor/medicine-contributions";
import InteractionChecker from "@/pages/doctor/interactions";
import DoctorContactAdmin from "@/pages/doctor/contact-admin";
import CdssSettings from "@/pages/doctor/settings";
import { DoctorLayout } from "@/components/templates/DoctorLayout";
import PatientChartScreen from "@/features/cdss/screens/PatientChartScreen";

const queryClient = new QueryClient();

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-foreground">
      <Navbar />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      <Route path="/admin">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/patients">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><CdssPatients /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/patients/:id">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><PatientChartScreen basePath="/admin" /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/doctors">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminDoctors /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cms">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminCMS /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminCdssDashboard /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/patients">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><CdssPatients /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/consultations">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminConsultations /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/consultations/:consultationId">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminConsultationDetail /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/interactions">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminInteractionChecker /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/prescription/new">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminNewPrescription /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/prescription/review">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminReviewPrescriptions /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/prescription/:rxId/ordonnance">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminOrdonnance /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/pharmacy">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminPharmacy /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/medicines">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminMedicines /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/medicine-contributions">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminMedicineContributions /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/audit">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminAuditPage /></AdminLayout></ProtectedRoute>}
      </Route>
      <Route path="/admin/cdss/settings">
        {() => <ProtectedRoute requiredRole="admin"><AdminLayout><AdminCdssSettings /></AdminLayout></ProtectedRoute>}
      </Route>

      <Route path="/doctor">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><DoctorDashboard /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/patients">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><DoctorPatients /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/patients/:patientId">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><PatientChartScreen basePath="/doctor" /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/consultations">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><Consultations /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/consultations/:consultationId">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><ConsultationDetail /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/prescription/:rxId/ordonnance">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><Ordonnance /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/medicine-contributions">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><MedicineContributions /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/prescriptions">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><DoctorPrescriptions /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/prescription/new">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><NewPrescription /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/prescription/review">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><ReviewPrescriptions /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/medicines">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><Medicines /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/agenda">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><DoctorAgenda /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/interactions">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><InteractionChecker /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/contact-admin">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><DoctorContactAdmin /></DoctorLayout></ProtectedRoute>}
      </Route>
      <Route path="/doctor/settings">
        {() => <ProtectedRoute requiredRole="doctor"><DoctorLayout><CdssSettings /></DoctorLayout></ProtectedRoute>}
      </Route>

      <Route path="/">
        {() => <PublicLayout><Home /></PublicLayout>}
      </Route>
      <Route path="/search">
        {() => <PublicLayout><SearchResults /></PublicLayout>}
      </Route>
      <Route path="/article/:id">
        {() => <PublicLayout><ArticleDetail /></PublicLayout>}
      </Route>
      <Route path="/doctors">
        {() => <PublicLayout><Doctors /></PublicLayout>}
      </Route>
      <Route path="/blog">
        {() => <PublicLayout><Blog /></PublicLayout>}
      </Route>
      <Route path="/contact">
        {() => <PublicLayout><Contact /></PublicLayout>}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CmsProvider>
            <I18nProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </I18nProvider>
          </CmsProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
