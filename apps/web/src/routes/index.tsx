import { createFileRoute, Link } from '@tanstack/react-router';
import { useLocalPushCredentials } from '../hooks/useLocalPushCredentials';

export const Route = createFileRoute('/')({
  component: Index,
  head: () => ({
    meta: [
      {
        title: 'Welcome - BaaB',
      },
    ],
  }),
  staticData: {
    breadcrumb: 'Home',
  },
});

function Index() {
  const navigate = Route.useNavigate();
  const { isInitialized, credentials } = useLocalPushCredentials();

  if (!isInitialized) {
    return <></>;
  }

  if (isInitialized && !credentials) {
    navigate({ to: '/setup', replace: true });
  }

  return (
    <main className="p-5 max-w-md">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-gray-200">
            <h2 className=" text-xl font-bold mb-2">Share Files</h2>
            <ul className=" flex flex-col  p-0 m-0 ">
              <li>
                <Link to="/share" className="underline">
                  Share
                </Link>
              </li>
              <li>
                <Link to="/receive" className="underline">
                  Receive
                </Link>
              </li>
            </ul>
          </div>
          <div className="p-4 bg-gray-200">
            <h2 className=" text-xl font-bold mb-2">Chat with Friends</h2>
            <ul className=" flex flex-col  p-0 m-0 ">
              <li>
                <Link to="/chat" className="underline">
                  Start Chatting
                </Link>
              </li>
            </ul>
          </div>
          <div className="p-4 bg-gray-200">
            <h2 className=" text-xl font-bold mb-2">Advanced</h2>
            <ul className=" flex flex-col  p-0 m-0 ">
              <li>
                <Link to="/settings" className="underline">
                  Settings
                </Link>
              </li>
              <li>
                <Link to="/about" className="underline">
                  About BaaB
                </Link>
              </li>
              <li>
                <a href="https://github.com/atjsh/BaaB" target="_blank" rel="noreferrer" className="underline">
                  Source Code
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
