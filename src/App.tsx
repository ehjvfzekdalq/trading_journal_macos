import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import './i18n/config';
import Dashboard from './pages/Dashboard';
import Calculator from './pages/Calculator';
import Journal from './pages/Journal';
import TradeNew from './pages/TradeNew';
import TradeDetail from './pages/TradeDetail';
import Import from './pages/Import';
import Settings from './pages/Settings';
import Help from './pages/Help';
import OpenOrders from './pages/OpenOrders';
import Layout from './pages/Layout';
import { AnonymousModeProvider } from './contexts/AnonymousModeContext';

function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <AnonymousModeProvider>
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
              <Route path="open-orders" element={<OpenOrders />} />
              <Route path="settings" element={<Settings />} />
              <Route path="help" element={<Help />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AnonymousModeProvider>
    </>
  );
}

export default App;
