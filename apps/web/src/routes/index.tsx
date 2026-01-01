import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
  head: () => ({
    meta: [
      {
        name: 'description',
        content:
          'BaaB (Browser as a Backend) is a somewhat modern P2P  application that leverages web technologies to enable direct browser-to-browser communication.',
      },
      {
        title: 'Welcome - BaaB',
      },
    ],
  }),
});

function Index() {
  return (
    <main className="p-2 max-w-md">
      <h2 className="text-2xl font-bold mb-4">Welcome to BaaB</h2>
      <div className="flex flex-col gap-4">
        <p>
          <b>BaaB (Browser as a Backend)</b> is a somewhat modern P2P application that leverages web technologies to
          enable direct browser-to-browser communication.
        </p>
        <p>
          You can securely share text to someone else. We relay data directly to the recipient's browser with browser
          notifications. The data are end-to-end encrypted, ensuring that only the intended recipient can access them.
          Even the relay server cannot decrypt the data.
        </p>
        <p>
          To get started, choose to either{' '}
          <Link to="/share" className="text-blue-500 underline md:no-underline hover:underline">
            Share
          </Link>{' '}
          or{' '}
          <Link to="/receive" className="text-blue-500 underline md:no-underline hover:underline">
            Receive
          </Link>
          .
        </p>
        <p>(Note: This is an experimental project and may not be suitable for production use. Use at your own risk.)</p>
      </div>
    </main>
  );
}
