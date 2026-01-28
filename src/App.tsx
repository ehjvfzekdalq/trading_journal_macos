import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import './i18n/config';
import Dashboard from './pages/Dashboard';
import Calculator from './pages/Calculator';
import Journal from './pages/Journal';
import TradeNew from './pages/TradeNew';
import TradeDetail from './pages/TradeDetail';
import Import from './pages/Import';
import Settings from './pages/Settings';
import Layout from './pages/Layout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="journal" element={<Journal />} />
          <Route path="journal/new" element={<TradeNew />} />
          <Route path="journal/:id" element={<TradeDetail />} />
          <Route path="import" element={<Import />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
