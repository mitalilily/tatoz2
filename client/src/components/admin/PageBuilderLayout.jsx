import { Outlet } from 'react-router-dom';

export default function PageBuilderLayout() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-100">
      <Outlet />
    </div>
  );
}
