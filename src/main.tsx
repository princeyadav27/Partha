import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Applications from './pages/Applications';
import FindJobs from './pages/FindJobs';
import JobDetail from './pages/JobDetail';
import Landing from './pages/Landing';
import Profile from './pages/Profile';
import Saved from './pages/Saved';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/fraunces';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/jobs" element={<FindJobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/profile" element={<Profile />} />
        {/* The landing page CTAs link here; the resume upload lives on Profile. */}
        <Route path="/resume" element={<Navigate to="/profile" replace />} />
        <Route path="*" element={<Navigate to="/jobs" replace />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
