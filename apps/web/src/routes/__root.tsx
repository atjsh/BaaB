import { createRootRoute, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

const RootLayout = () => (
  <>
    <HeadContent />
    <header className=" ">
      <div className="p-2">
        <h1 className="text-xl">
          <Link to="/">
            <b>🌏 BaaB</b>
          </Link>
        </h1>
        <span>Share text/images/files securely</span>
      </div>
      <hr />
      <nav className="p-2 flex gap-2">
        <Link to="/share" className="[&.active]:font-bold text-blue-500 underline md:no-underline hover:underline">
          Share
        </Link>
        <Link to="/receive" className="[&.active]:font-bold text-blue-500 underline md:no-underline hover:underline">
          Receive
        </Link>
        <a
          href="https://github.com/atjsh/baab"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-blue-500 underline md:no-underline hover:underline"
        >
          GitHub
        </a>
      </nav>
    </header>
    <hr className="mb-5" />
    <Outlet />
    <TanStackRouterDevtools />
  </>
);

export const Route = createRootRoute({ component: RootLayout });
