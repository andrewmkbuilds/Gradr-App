import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import ResumeEngine from "./pages/ResumeEngine";
import JobMatchingEngine from "./pages/JobMatchingEngine";
import ApplicationEngine from "./pages/ApplicationEngine";
import InterviewEngine from "./pages/InterviewEngine";
import GrowthEngine from "./pages/GrowthEngine";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/resume" element={<ResumeEngine />} />
            <Route path="/jobs" element={<JobMatchingEngine />} />
            <Route path="/apply" element={<ApplicationEngine />} />
            <Route path="/interview" element={<InterviewEngine />} />
            <Route path="/growth" element={<GrowthEngine />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DashboardLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
