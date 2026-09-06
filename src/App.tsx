import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ComparePage from "./pages/ComparePage";
import StudentsByCoursesPage from "./pages/StudentsByCoursesPage";
import FriendsPage from "./pages/FriendsPage";
import UploadPage from "./pages/UploadPage";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import UserLoginPage from "./pages/UserLoginPage";
import TermsPage from "./pages/TermsPage";
import StatisticsPage from "./pages/StatisticsPage"; // <-- Added this import
import { AuthProvider } from "./lib/auth-context";
import RequireAdmin from "./components/RequireAdmin";
import RequireUser from "./components/RequireUser";
import { UserAuthProvider } from "./lib/user-auth-context";
import { ThemeProvider } from "next-themes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <UserAuthProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/compare" element={<RequireUser><ComparePage /></RequireUser>} />
              <Route path="/students-by-courses" element={<RequireUser><StudentsByCoursesPage /></RequireUser>} />
              <Route path="/friends" element={<RequireUser><FriendsPage /></RequireUser>} />
              <Route path="/statistics" element={<RequireUser><StatisticsPage /></RequireUser>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/user-login" element={<UserLoginPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route
                path="/upload"
                element={
                  <RequireAdmin>
                    <UploadPage />
                  </RequireAdmin>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
      </UserAuthProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;