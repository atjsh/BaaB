import { createRootRoute, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { Breadcrumbs } from '../components/Breadcrumbs';

const RootLayout = () => (
  <>
    <HeadContent />
    <header>
      <nav className="pt-5 px-5 flex gap-2 flex-col">
        <h1 className="text-xl">
          <Link to="/">
            <b>🌏 BaaB</b> <span className="text-xs font-normal md:text-xl">Free & Private File Share and Chat</span>
          </Link>
        </h1>
        <div className="mr-auto flex gap-4"></div>
      </nav>
    </header>
    <Breadcrumbs />
    <Outlet />
    <TanStackRouterDevtools />
  </>
);

export const Route = createRootRoute({ component: RootLayout });
