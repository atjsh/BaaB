import { createRootRoute, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

const RootLayout = () => (
  <>
    <HeadContent />
    <header>
      <nav className="p-5 flex gap-2">
        <h1 className="text-xl">
          <Link to="/">
            <b>🌏 BaaB</b>: Free & Private File Share and Chat
          </Link>
        </h1>
        <div className="ml-auto flex gap-4">
          <Link to="/settings" className="text-blue-500 underline md:no-underline hover:underline">
            Settings
          </Link>
          <a
            href="https://github.com/atjsh/baab"
            target="_blank"
            rel="noreferrer"
            className="text-blue-500 underline md:no-underline hover:underline"
          >
            Source
          </a>
        </div>
      </nav>
    </header>
    <hr />
    <Outlet />
    <TanStackRouterDevtools />
  </>
);

export const Route = createRootRoute({ component: RootLayout });
