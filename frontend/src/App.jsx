import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import { Loading } from "./components/ui.jsx";
import { canDispatch } from "./constants.js";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import WorkOrderList from "./pages/WorkOrderList.jsx";
import WorkOrderForm from "./pages/WorkOrderForm.jsx";
import WorkOrderDetail from "./pages/WorkOrderDetail.jsx";

function Protected() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Loading text="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Outlet />;
}

// UX only: hides pages the role can't use. The API enforces the real rule.
function DispatcherOnly({ children }) {
  const { user } = useAuth();
  return canDispatch(user) ? children : <Navigate to="/work-orders" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="work-orders" element={<WorkOrderList />} />
          <Route path="work-orders/new" element={<DispatcherOnly><WorkOrderForm /></DispatcherOnly>} />
          <Route path="work-orders/:id" element={<WorkOrderDetail />} />
          <Route path="work-orders/:id/edit" element={<DispatcherOnly><WorkOrderForm /></DispatcherOnly>} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Route>
      </Route>
    </Routes>
  );
}
