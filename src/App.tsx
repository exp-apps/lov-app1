import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Pages
import HomePage from "@/pages/HomePage";
import UploadPage from "@/pages/UploadPage";
import DatasetLibraryPage from "@/pages/DatasetLibraryPage";
import EvaluationsLibraryPage from "@/pages/EvaluationsLibraryPage";
import EvalConfigPage from "@/pages/EvalConfigPage";
import EvalRunsPage from "@/pages/EvalRunsPage";
import ConfigureRunPage from "@/pages/ConfigureRunPage";
import RunMonitorPage from "@/pages/RunMonitorPage";
import ResultsDashboardPage from "@/pages/ResultsDashboardPage";
import AnnotationReviewPage from "@/pages/AnnotationReviewPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFoundPage from "@/pages/NotFoundPage";
import DomainLabellingPage from "@/pages/DomainLabellingPage"; // Production page

function App() {
  return (
    <ThemeProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/datasets" element={<DatasetLibraryPage />} />
          <Route path="/evals" element={<EvaluationsLibraryPage />} />
          <Route path="/evals/new" element={<EvalConfigPage />} />
          <Route path="/evals/:evalId/runs" element={<EvalRunsPage />} />
          <Route path="/evals/:evalId/configure-run" element={<ConfigureRunPage />} />
          <Route path="/evals/:evalId/run" element={<RunMonitorPage />} />
          <Route path="/runs/:runId" element={<RunMonitorPage />} />
          <Route path="/runs/:runId/results" element={<ResultsDashboardPage />} />
          <Route path="/runs/:runId/annotations" element={<AnnotationReviewPage />} />
          <Route path="/domain-labelling" element={<DomainLabellingPage />} /> {/* Main production route */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
        <Toaster position="top-center" richColors closeButton />
      </Layout>
    </ThemeProvider>
  );
}

export default App;
