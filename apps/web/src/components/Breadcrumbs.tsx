import { Link, useMatches } from '@tanstack/react-router';

// Easy to replace separator - change this constant to update all breadcrumbs
const BREADCRUMB_SEPARATOR = '›';

interface BreadcrumbItem {
  label: string;
  path: string;
}

export function Breadcrumbs() {
  const matches = useMatches();

  // Build breadcrumb items from matched routes that have breadcrumb metadata
  // Exclude the home route ("/") as we'll always prepend it manually
  const routeBreadcrumbs: BreadcrumbItem[] = matches
    .filter((match) => {
      const staticData = match.staticData as { breadcrumb?: string } | undefined;
      return staticData?.breadcrumb && match.pathname !== '/';
    })
    .map((match) => {
      const staticData = match.staticData as { breadcrumb: string };
      return {
        label: staticData.breadcrumb,
        path: match.pathname,
      };
    });

  // Always start with Home
  const breadcrumbs: BreadcrumbItem[] = [{ label: 'Home', path: '/' }, ...routeBreadcrumbs];

  return (
    <nav aria-label="Breadcrumb" className="px-5 pb-2 text-sm flex items-center gap-1 flex-wrap border-b ">
      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <span key={item.path} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-gray-400 mx-1" aria-hidden="true">
                {BREADCRUMB_SEPARATOR}
              </span>
            )}
            {isLast ? (
              <span className="font-medium" aria-current="page">
                {item.label}
              </span>
            ) : (
              <Link to={item.path} className="hover:text-blue-500 hover:underline transition-colors">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
