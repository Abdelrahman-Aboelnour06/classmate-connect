import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ComparePage from "./pages/ComparePage";
import TimetablePage from "./pages/TimetablePage";
import AdvancedTimetablePage from "./pages/AdvancedTimetablePage";
import StudentsByCoursesPage from "./pages/StudentsByCoursesPage";
import FriendsPage from "./pages/FriendsPage";
import UploadPage from "./pages/UploadPage";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import { AuthProvider } from "./lib/auth-context";
import RequireAdmin from "./components/RequireAdmin";
import { ThemeProvider } from "next-themes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/timetable" element={<TimetablePage />} />
              <Route path="/advanced-timetable" element={<AdvancedTimetablePage />} />
              <Route path="/students-by-courses" element={<StudentsByCoursesPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/login" element={<LoginPage />} />
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
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
