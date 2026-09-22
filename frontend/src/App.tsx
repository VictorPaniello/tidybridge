import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { CompleteProfilePage } from "./pages/CompleteProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { RecordsPage } from "./pages/RecordsPage";
import { RecordDetailPage } from "./pages/RecordDetailPage";
import { IngestionRunsPage } from "./pages/IngestionRunsPage";
import { ColumnMappingReviewPage } from "./pages/ColumnMappingReviewPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";

// The route wrapper is here (not inside ColumnMappingReviewPage itself)
// so the page component keeps taking `fingerprint` as a plain prop -
// simpler to test (see its .test.tsx) than reading useParams internally.
function ColumnMappingReviewRoute() {
  const { fingerprint } = useParams<{ fingerprint: string }>();
  if (!fingerprint) return <Navigate to="/" replace />;
  return <ColumnMappingReviewPage fingerprint={fingerprint} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<OAuthCallbackPage />} />
          {/* Public - readable before signing up, and by anyone the
              footer links reach, not gated behind ProtectedRoute. Layout
              itself already renders correctly with no signed-in user
              (its user-only header links are already conditional). */}
          <Route
            path="/privacy"
            element={
              <Layout>
                <PrivacyPage />
              </Layout>
            }
          />
          <Route
            path="/terms"
            element={
              <Layout>
                <TermsPage />
              </Layout>
            }
          />
          <Route
            path="/complete-profile"
            element={
              <ProtectedRoute>
                <CompleteProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <RecordsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <SettingsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/uploads"
            element={
              <ProtectedRoute>
                <Layout>
                  <IngestionRunsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/records/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <RecordDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/column-mappings/:fingerprint"
            element={
              <ProtectedRoute>
                <Layout>
                  <ColumnMappingReviewRoute />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
