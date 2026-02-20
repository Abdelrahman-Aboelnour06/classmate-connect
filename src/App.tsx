import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ComparePage from "./pages/ComparePage";
import TimetablePage from "./pages/TimetablePage";
import StudentsByCoursesPage from "./pages/StudentsByCoursesPage";
import FriendsPage from "./pages/FriendsPage";
import UploadPage from "./pages/UploadPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/students-by-courses" element={<StudentsByCoursesPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
